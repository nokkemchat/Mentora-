import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Extractor, ExtractedQuestionPart } from './extractor';
import { Cropper } from './cropper';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const openAiKey = process.env.OPENAI_API_KEY || '';

if (!supabaseUrl || !supabaseKey || !openAiKey) {
    console.error('Missing required environment variables.');
    process.exit(1);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);
const extractor = new Extractor(openAiKey);
const cropper = new Cropper();

const POLL_INTERVAL = 10000;

async function checkJobs() {
    try {
        const { data: jobs, error } = await supabase
            .from('ingestion_jobs')
            .select('*, papers(*)')
            .eq('status', 'uploaded')
            .order('created_at', { ascending: true })
            .limit(1);

        if (error) {
            console.error('Error fetching jobs:', error);
            return;
        }

        if (jobs && jobs.length > 0) {
            const job = jobs[0];
            await processJob(job);
        }
    } catch (err) {
        console.error('Unexpected error checking jobs:', err);
    }
}

async function processJob(job: any) {
    console.log(`Processing job ${job.id} for paper ${job.paper_id}`);
    
    await supabase.from('ingestion_jobs').update({ status: 'processing' }).eq('id', job.id);

    let pdfPath = '';
    try {
        const paper = job.papers;
        if (!paper || !paper.pdf_url) {
            throw new Error("Paper does not have a valid PDF URL.");
        }

        pdfPath = await downloadPdf(paper.pdf_url, job.id);
        
        await supabase.from('ingestion_jobs').update({ status: 'extracting' }).eq('id', job.id);
        console.log(`Rendering PDF pages to images for ${job.id}...`);
        
        const pageImages = await cropper.renderAllPages(pdfPath, job.id);

        console.log(`Phase 1: Extracting structure via OpenAI for ${job.id}...`);
        const slicedPaper = await extractor.extractPaperStructureSlices(pageImages);
        
        // Update paper metadata
        if (slicedPaper.metadata) {
            console.log("Metadata extracted by Phase 1:", slicedPaper.metadata);
            const { error: updateError } = await supabase.from('papers').update({
                curriculum: slicedPaper.metadata.curriculum || 'Unknown',
                subject: slicedPaper.metadata.subject || 'Unknown',
                grade_level: slicedPaper.metadata.grade_level || 'Unknown',
                year: slicedPaper.metadata.year || new Date().getFullYear(),
                session: slicedPaper.metadata.session || 'Unknown',
                paper_number: slicedPaper.metadata.paper_number || 1,
                variant: slicedPaper.metadata.variant || null
            }).eq('id', job.paper_id);

            if (updateError) {
                console.error("Failed to update paper metadata in database:", updateError);
            } else {
                console.log("Successfully updated paper metadata in database.");
            }
        } else {
            console.warn("Phase 1 did not return metadata!");
        }

        let syllabusHierarchy: Record<string, string[]> | null = null;
        if (slicedPaper.metadata) {
            console.log("Cross-referencing syllabus for:", slicedPaper.metadata);
            const subjectQuery = (slicedPaper.metadata.subject || '').trim();
            const boardQuery = (slicedPaper.metadata.curriculum || '').trim();
            const levelQuery = (slicedPaper.metadata.grade_level || '').trim();
            
            const { data: matchedCourses, error: courseError } = await supabase
                .from('courses')
                .select('id, title, board, level')
                .ilike('title', `%${subjectQuery}%`)
                .ilike('board', `%${boardQuery}%`)
                .ilike('level', `%${levelQuery}%`)
                .limit(1);

            if (courseError) {
                console.error("Error querying courses:", courseError);
            } else if (matchedCourses && matchedCourses.length > 0) {
                const courseId = matchedCourses[0].id;
                console.log(`Found matching syllabus (ID: ${courseId}). Fetching topics and subtopics...`);
                
                const { data: topicsData, error: topicsError } = await supabase
                    .from('topics')
                    .select('id, title')
                    .eq('course_id', courseId);
                    
                if (topicsError) {
                    console.error("Error fetching topics:", topicsError);
                } else if (topicsData && topicsData.length > 0) {
                    const topicIds = topicsData.map(t => t.id);
                    const { data: subtopicsData } = await supabase
                        .from('subtopics')
                        .select('topic_id, title')
                        .in('topic_id', topicIds);
                    
                    syllabusHierarchy = {};
                    for (const topic of topicsData) {
                        const subs = subtopicsData?.filter(s => s.topic_id === topic.id).map(s => s.title) || [];
                        syllabusHierarchy[topic.title] = subs;
                    }
                    console.log(`Successfully loaded ${Object.keys(syllabusHierarchy).length} syllabus topics with their subtopics!`);
                } else {
                    console.log("No topics found for the matched syllabus.");
                }
            } else {
                console.log("No matching syllabus found for this paper.");
            }
        }

        console.log(`Phase 2: Extracting detailed nested questions...`);
        let qIndex = 1;
        for (const slicedQ of slicedPaper.questions) {
            try {
                const qNumberStr = slicedQ.number || String(qIndex);
                
                // MULTI-SLICE CROP
                const croppedImagesBase64: string[] = [];
                const slicePaths: string[] = [];
                // It's possible Phase 1 returned 'page_slices' or older schema? We handle if it missed it.
                const slices = slicedQ.page_slices || []; 
                if (slices.length === 0) {
                    console.log(`Question ${qNumberStr} has no page slices, skipping.`);
                    continue;
                }

                // If question spans across 2 pages, we crop 2 images.
                let gridSlicePaths: string[] = [];
                for (let s = 0; s < slices.length; s++) {
                    const slice = slices[s];
                    const qImagePath = await cropper.cropAsset(pdfPath, slice.page_number, slice.bounding_box, `q_${job.id}_${qNumberStr}_slice_${s}`);
                    slicePaths.push(qImagePath);

                    // Add grid for the LLM
                    const gridPath = await cropper.addGridToImage(qImagePath, qImagePath.replace('.png', '_grid.png'));
                    gridSlicePaths.push(gridPath);

                    const qImageBuffer = await fs.readFile(gridPath);
                    croppedImagesBase64.push(qImageBuffer.toString('base64'));
                }

                // Detail extraction using ALL cropped pieces
                console.log(`Extracting details for Question ${qNumberStr} (${slices.length} parts)...`);
                const detailedQ = await extractor.extractQuestionDetail(croppedImagesBase64, syllabusHierarchy);

                // Save structured data to DB
                const { data: qData, error: qError } = await supabase.from('past_paper_questions').insert({
                    paper_id: job.paper_id,
                    question_number: detailedQ.number || qNumberStr,
                    content_text: detailedQ.text || "No text provided",
                    marks: detailedQ.marks || null,
                    difficulty: detailedQ.difficulty || "Medium",
                    skills: detailedQ.skills || [],
                    topic: detailedQ.topics?.[0] || null,
                    subtopic: detailedQ.subtopics?.[0] || null
                }).select('id').single();

                if (qError) throw new Error(`Failed to insert question: ${qError.message}`);
                
                const questionId = qData.id;

                // Process parts recursively
                await insertParts(detailedQ.parts, questionId, null, slicePaths, job.paper_id, qNumberStr);

                // Process visual assets for question
                if (detailedQ.visual_assets && detailedQ.visual_assets.length > 0) {
                    for (let i = 0; i < detailedQ.visual_assets.length; i++) {
                        const asset = detailedQ.visual_assets[i];
                        const targetImagePath = slicePaths[(asset.page_number || 1) - 1] || slicePaths[0];
                        await processSubAsset(targetImagePath, job.paper_id, questionId, null, asset, `${qNumberStr}_img${i}`);
                    }
                }
            } catch (e) {
                console.error(`Error processing question ${slicedQ.number}:`, e);
            }
            qIndex++;
        }

        await supabase.from('ingestion_jobs').update({ status: 'completed' }).eq('id', job.id);
        console.log(`Job ${job.id} completed successfully.`);

    } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error);
        await supabase.from('ingestion_jobs').update({ 
            status: 'failed', 
            error_details: { message: error.message, stack: error.stack } 
        }).eq('id', job.id);
    } finally {
        if (pdfPath) {
            try {
                const tempDir = path.join(__dirname, '..', 'temp');
                const files = await fs.readdir(tempDir);
                for (const file of files) {
                    if (file.includes(job.id)) {
                        await fs.unlink(path.join(tempDir, file));
                    }
                }
            } catch(e) {}
        }
    }
}

async function insertParts(parts: ExtractedQuestionPart[], questionId: string, parentPartId: string | null, slicePaths: string[], paperId: string, qNumberStr: string) {
    if (!parts) return;
    for (const part of parts) {
        const { data: pData, error: pError } = await supabase.from('question_parts').insert({
            question_id: questionId,
            parent_part_id: parentPartId,
            part_label: part.label,
            content_text: part.text,
            marks: part.marks
        }).select('id').single();
        
        if (pError) throw new Error(`Failed to insert question part: ${pError.message}`);

        const partId = pData.id;

        // Process part visual assets
        if (part.visual_assets && part.visual_assets.length > 0) {
            for (let i = 0; i < part.visual_assets.length; i++) {
                const asset = part.visual_assets[i];
                const targetImagePath = slicePaths[(asset.page_number || 1) - 1] || slicePaths[0];
                await processSubAsset(targetImagePath, paperId, questionId, partId, asset, `${qNumberStr}_part_${part.label}_img${i}`);
            }
        }

        // Recursive call to insert sub_parts (and sub_sub_parts!)
        if (part.sub_parts && part.sub_parts.length > 0) {
            await insertParts(part.sub_parts, questionId, partId, slicePaths, paperId, qNumberStr);
        }
    }
}

async function processSubAsset(
    sourceImagePath: string, 
    paperId: string, 
    questionId: string | null, 
    partId: string | null, 
    asset: any, 
    assetSuffix: string
) {
    if (!asset.bounding_box) return;
    try {
        const croppedPath = await cropper.cropAssetFromImage(sourceImagePath, asset.bounding_box, assetSuffix);
        
        const fileData = await fs.readFile(croppedPath);
        
        const fileName = `${paperId}/${questionId}/${Date.now()}_${assetSuffix}.png`;
        const { data: uploadData, error: uploadError } = await supabase.storage.from('papers').upload(`assets/${fileName}`, fileData, { contentType: 'image/png' });
        
        if (uploadError) {
            console.error('Failed to upload asset:', uploadError.message);
            return;
        }

        const { data: publicUrlData } = supabase.storage.from('papers').getPublicUrl(`assets/${fileName}`);

        await supabase.from('question_assets').insert({
            question_id: questionId,
            part_id: partId,
            asset_type: asset.type,
            storage_path: publicUrlData.publicUrl,
            ai_description: asset.description,
            original_page_number: asset.page_number
        });

        await fs.unlink(croppedPath);
    } catch (e) {
        console.error("Failed to process sub-asset", e);
    }
}

async function downloadPdf(url: string, jobId: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    const tempDir = path.join(__dirname, '..', 'temp');
    await fs.mkdir(tempDir, { recursive: true });
    
    const pdfPath = path.join(tempDir, `${jobId}.pdf`);
    await fs.writeFile(pdfPath, buffer);
    return pdfPath;
}

console.log('Mentora Content Ingestion Agent started.');
let isProcessing = false;
setInterval(async () => {
    if (!isProcessing) {
        isProcessing = true;
        await checkJobs();
        isProcessing = false;
    }
}, POLL_INTERVAL);
checkJobs().then(() => isProcessing = false);
