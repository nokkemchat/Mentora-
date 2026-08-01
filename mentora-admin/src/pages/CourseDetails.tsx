import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, BookOpen, UploadCloud, ChevronDown, ChevronUp } from 'lucide-react';

export default function CourseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchCourseData = async () => {
    if (!course) setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select(`
        *,
        topics (
          *,
          subtopics (*)
        )
      `)
      .eq('id', id)
      .single();

    if (!error && data) {
      setCourse(data);
      if (data.topics && data.topics.length > 0 && !expandedTopicId) {
        setExpandedTopicId(data.topics[0].id);
      }
    } else {
      console.error(error);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCourseData();
  }, [id]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadingSyllabus(true);
    try {
      const fileExt = file.name.split('.').pop() || 'pdf';
      const fileName = `${id}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('syllabuses')
        .upload(fileName, file, {
          contentType: file.type || 'application/pdf',
          upsert: true
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('syllabuses').getPublicUrl(fileName);
      const fileUrl = publicUrlData.publicUrl;

      const { error: dbError } = await supabase
        .from('courses')
        .update({ syllabus_url: fileUrl })
        .eq('id', id);

      if (dbError) throw dbError;

      alert('Upload successful! The AI is extracting topics from your PDF. This might take a minute...');

      const { data: processData, error: processError } = await supabase.functions.invoke('process-syllabus', {
        body: { course_id: id, file_url: fileUrl }
      });

      if (processError) {
        let errorMessage = processError.message;
        try {
          if (processError.context && typeof processError.context.json === 'function') {
             const errJson = await processError.context.json();
             if (errJson && errJson.error) {
               errorMessage = errJson.error;
             }
          }
        } catch (e) {
          // fallback
        }
        throw new Error(`AI Processing Failed: ${errorMessage}`);
      }

      alert('Success! Syllabus processed and topics updated successfully!');
      fetchCourseData();

    } catch (error: any) {
      console.error(error);
      alert(error.message || 'An error occurred during upload.');
    } finally {
      setUploadingSyllabus(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  if (loading) return <div className="p-8 text-center text-textMuted">Loading course details...</div>;
  if (!course) return <div className="p-8 text-center text-error">Course not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
      <button onClick={() => navigate('/courses')} className="flex items-center space-x-2 text-textMuted hover:text-text transition-colors">
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Courses</span>
      </button>

      <div className="bg-surface border border-border rounded-3xl p-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-text mb-2">{course.title}</h1>
            <p className="text-textMuted">{course.board} • {course.level}</p>
          </div>
          <div>
            <input 
              type="file" 
              accept="application/pdf" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload}
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingSyllabus}
              className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white px-5 py-3 rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-5 h-5" />
              <span>{uploadingSyllabus ? 'Processing...' : course.syllabus_url ? 'Replace Syllabus PDF' : 'Upload Syllabus PDF'}</span>
            </button>
            {course.syllabus_url && (
              <a href={course.syllabus_url} target="_blank" rel="noreferrer" className="block text-center mt-3 text-sm text-primary hover:underline">
                View Current Syllabus
              </a>
            )}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-2xl font-bold text-text mb-6">Course Structure</h2>
        {!course.topics || course.topics.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed border-border rounded-3xl bg-surface">
            <BookOpen className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="text-textMuted text-lg mb-2">No topics found.</p>
            <p className="text-textMuted text-sm">Upload a syllabus PDF above to automatically generate topics using AI.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {course.topics.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((topic: any, index: number) => {
              const isExpanded = expandedTopicId === topic.id;
              return (
                <div key={topic.id} className="bg-surface border border-border rounded-2xl overflow-hidden">
                  <button 
                    onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                    className="w-full flex items-center justify-between p-5 hover:bg-background transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <span className="text-xl font-bold text-primary">{index + 1}</span>
                      <span className="text-lg font-semibold text-text">{topic.title}</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-textMuted" /> : <ChevronDown className="w-5 h-5 text-textMuted" />}
                  </button>
                  
                  {isExpanded && (
                    <div className="border-t border-border bg-background p-5 pl-14">
                      {!topic.subtopics || topic.subtopics.length === 0 ? (
                        <p className="text-textMuted text-sm">No subtopics.</p>
                      ) : (
                        <ul className="space-y-3">
                          {topic.subtopics.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).map((sub: any) => (
                            <li key={sub.id} className="flex items-start">
                              <span className="w-2 h-2 rounded-full bg-border mt-2 mr-3 shrink-0"></span>
                              <div>
                                <p className="text-text font-medium">{sub.title}</p>
                                <p className="text-textMuted text-sm">{sub.difficulty} • {sub.estimated_time}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
