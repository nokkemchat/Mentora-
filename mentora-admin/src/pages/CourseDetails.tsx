import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, BookOpen, UploadCloud, ChevronDown, ChevronUp,
  Plus, X, FileText, Video, Monitor, FileArchive, PenLine, Home,
  HelpCircle, ClipboardList, ExternalLink, Trash2, Loader2,
  ChevronUp as MoveUp, ChevronDown as MoveDown, Clock, FolderKanban, Layers, Sparkles
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ContentFile {
  display_name: string;   // custom name the teacher gives it
  file_name: string;      // original file name
  url: string;
  uploaded_at: string;
  size?: number;
  type: string;           // key of CONTENT_TYPES (e.g. 'lesson_notes')
  estimated_minutes?: number;
}

interface UploadTarget {
  type: 'chapter' | 'subtopic';
  id: string; // topic.id or subtopic.id
  title: string;
}

interface WorkspaceTemplate {
  extracted_context?: Record<string, string[]>;
  content?: ContentFile[]; // Single ordered array
  placeholders?: Record<string, ContentFile[]>; // legacy
  chapter_pdf_url?: string;
  chapter_pdf_name?: string;
  chapter_notes_text?: string;
  form?: string;
  available_forms?: string[];
  order_index?: number;
}

// ─── Content type config ──────────────────────────────────────────────────────

const CONTENT_TYPES = [
  { key: 'lesson_notes',  label: 'Lesson Notes',  icon: FileText,     color: 'text-blue-400',   bg: 'bg-blue-400/10',   bucket: 'materials', accept: '.pdf,.doc,.docx,.txt' },
  { key: 'videos',        label: 'Videos',         icon: Video,        color: 'text-red-400',    bg: 'bg-red-400/10',    bucket: 'videos',    accept: 'video/*' },
  { key: 'presentations', label: 'Presentations',  icon: Monitor,      color: 'text-purple-400', bg: 'bg-purple-400/10', bucket: 'materials', accept: '.pdf,.ppt,.pptx' },
  { key: 'pdf_resources', label: 'PDFs',           icon: FileArchive,  color: 'text-orange-400', bg: 'bg-orange-400/10', bucket: 'materials', accept: '.pdf' },
  { key: 'exercises',     label: 'Exercises',      icon: PenLine,      color: 'text-green-400',  bg: 'bg-green-400/10',  bucket: 'materials', accept: '.pdf,.doc,.docx' },
  { key: 'homework',      label: 'Homework',       icon: Home,         color: 'text-yellow-400', bg: 'bg-yellow-400/10', bucket: 'materials', accept: '.pdf,.doc,.docx' },
  { key: 'quiz',          label: 'Quiz',           icon: HelpCircle,   color: 'text-pink-400',   bg: 'bg-pink-400/10',   bucket: 'materials', accept: '.pdf,.doc,.docx' },
  { key: 'teacher_notes', label: 'Teacher Notes',  icon: ClipboardList,color: 'text-teal-400',   bg: 'bg-teal-400/10',   bucket: 'materials', accept: '.pdf,.doc,.docx,.txt' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFileSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getContentTypeMeta(key: string) {
  return CONTENT_TYPES.find(ct => ct.key === key) || CONTENT_TYPES[0];
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CourseDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingSyllabus, setUploadingSyllabus] = useState(false);
  const [expandedTopicId, setExpandedTopicId] = useState<string | null>(null);
  const [selectedForm, setSelectedForm] = useState<string>('All');

  const getTopicForm = (topic: any): string | null => {
    if (topic.form) return topic.form;
    if (topic.workspace_template?.form) return topic.workspace_template.form;
    const title = (topic.title || '').trim();
    if (/forms*3/i.test(title)) return 'Form 3';
    if (/forms*4/i.test(title)) return 'Form 4';
    if (/forms*1/i.test(title)) return 'Form 1';
    if (/forms*2/i.test(title)) return 'Form 2';
    if (/forms*5/i.test(title)) return 'Form 5';
    if (/forms*6/i.test(title)) return 'Form 6';
    return null;
  };

  const availableForms: string[] = useMemo(() => {
    const forms = new Set<string>();

    if (course?.available_forms && Array.isArray(course.available_forms) && course.available_forms.length > 0) {
      course.available_forms.forEach((f: string) => forms.add(f));
    }
    if (course?.workspace_template?.available_forms && Array.isArray(course.workspace_template.available_forms)) {
      course.workspace_template.available_forms.forEach((f: string) => forms.add(f));
    }
    if (course?.topics) {
      course.topics.forEach((t: any) => {
        const f = getTopicForm(t);
        if (f) forms.add(f);
      });
    }

    // Default fallback for ZIMSEC syllabuses so forms are always accessible
    if (forms.size === 0 && course?.board === 'ZIMSEC') {
      return ['Form 3', 'Form 4'];
    }

    return Array.from(forms).sort();
  }, [course]);

  const filteredTopics = useMemo(() => {
    if (!course?.topics) return [];
    if (selectedForm === 'All') return course.topics;

    return course.topics.filter((t: any) => {
      const topicForm = getTopicForm(t);
      if (topicForm) return topicForm === selectedForm;
      // If a topic has no form yet, don't hide it when filtered if all topics are untagged
      return false;
    });
  }, [course?.topics, selectedForm]);

  
  const saveTopicTemplate = async (topicId: string, template: any) => {
    try {
      const { error } = await supabase.from("topics").update({ workspace_template: template }).eq("id", topicId);
      if (!error) return { success: true };
      console.warn("Direct topic update returned error, trying edge function:", error);
    } catch (e) {
      console.warn("Direct topic update threw, trying edge function:", e);
    }

    const edgeUrl = "https://akjbejexhdawelrfygub.supabase.co/functions/v1/tutor-chat";
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const resp = await fetch(edgeUrl, {
      method: "POST",
      headers: {
        "apikey": anonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        action: "update_topic",
        topic_id: topicId,
        workspace_template: template
      })
    });
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Failed to update topic (${resp.status}): ${txt}`);
    }
    return await resp.json();
  };

  const handleUpdateTopicForm = async (topicId: string, newForm: string | null) => {
    try {
      const targetTopic = course?.topics?.find((t: any) => t.id === topicId);
      if (!targetTopic) return;

      const updatedTemplate = {
        ...(targetTopic.workspace_template || {}),
        form: newForm || undefined
      };

      // Try update with direct column, fallback to workspace_template
      let { error } = await supabase
        .from('topics')
        .update({
          form: newForm || null,
          workspace_template: updatedTemplate
        })
        .eq('id', topicId);

      if (error) {
        const res = await supabase
          .from('topics')
          .update({ workspace_template: updatedTemplate })
          .eq('id', topicId);
        if (res.error) throw res.error;
      }

      setCourse((prev: any) => {
        if (!prev) return prev;
        const newTopics = prev.topics.map((t: any) => {
          if (t.id === topicId) {
            return {
              ...t,
              form: newForm || null,
              workspace_template: updatedTemplate
            };
          }
          return t;
        });
        return { ...prev, topics: newTopics };
      });
    } catch (err: any) {
      alert('Failed to update form tag: ' + err.message);
    }
  };

  // ── Upload modal multi-step state ─────────────────────────────────────────
  type ModalStep = 'type' | 'name' | 'uploading';
  const [modalStep, setModalStep] = useState<ModalStep>('type');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [selectedContentType, setSelectedContentType] = useState<typeof CONTENT_TYPES[0] | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [contentDisplayName, setContentDisplayName] = useState('');
  const [contentEstimatedMinutes, setContentEstimatedMinutes] = useState('15');

  const [deletingFile, setDeletingFile] = useState<string | null>(null);
  const [reordering, setReordering] = useState(false);

  const syllabusInputRef = useRef<HTMLInputElement>(null);
  const contentFileInputRef = useRef<HTMLInputElement>(null);
  // Store content type key in a ref so it is always fresh when file input fires
  const pendingContentTypeRef = useRef<typeof CONTENT_TYPES[0] | null>(null);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const fetchCourseData = async () => {
    if (!course) setLoading(true);
    const { data, error } = await supabase
      .from('courses')
      .select(`*, topics (*, subtopics (*))`)
      .eq('id', id)
      .single();

    if (!error && data) {
      // Migrate legacy placeholders to unified content array in memory
      data.topics = data.topics.map((t: any) => {
        let topicTmpl = t.workspace_template;
        if (typeof topicTmpl === 'string') {
          try { topicTmpl = JSON.parse(topicTmpl); } catch(e) { topicTmpl = {}; }
        }
        if (!topicTmpl || typeof topicTmpl !== 'object') {
          topicTmpl = {};
        }
        if (!topicTmpl.content) {
          topicTmpl.content = [];
        }
        if (topicTmpl.chapter_pdf_url && !topicTmpl.content.some((f: any) => f.url === topicTmpl.chapter_pdf_url)) {
          topicTmpl.content.unshift({
            display_name: topicTmpl.chapter_pdf_name || 'Chapter Summary Notes',
            file_name: topicTmpl.chapter_pdf_name || 'Chapter Summary Notes.pdf',
            url: topicTmpl.chapter_pdf_url,
            uploaded_at: t.created_at || new Date().toISOString(),
            type: 'pdf_resources',
            estimated_minutes: 20
          });
        }
        t.workspace_template = topicTmpl;

        if (t.subtopics) {
          t.subtopics = t.subtopics.map((s: any) => {
            let tmpl = s.workspace_template;
            if (typeof tmpl === 'string') {
              try { tmpl = JSON.parse(tmpl); } catch(e) { tmpl = {}; }
            }
            if (tmpl && tmpl.placeholders && (!tmpl.content || tmpl.content.length === 0)) {
              const flatContent: ContentFile[] = [];
              Object.keys(tmpl.placeholders).forEach(key => {
                const files = tmpl.placeholders[key];
                if (Array.isArray(files)) {
                  files.forEach(f => {
                    flatContent.push({ ...f, type: key });
                  });
                }
              });
              tmpl.content = flatContent;
            }
            s.workspace_template = tmpl;
            return s;
          });
        }
        return t;
      });

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
    if (!id) return;

    const channel = supabase.channel(`course-${id}-updates`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'courses', filter: `id=eq.${id}` },
        (payload) => {
          const u = payload.new;
          setCourse((prev: any) => prev ? { ...prev, sync_status: u.sync_status, sync_progress: u.sync_progress, is_syncing: u.is_syncing } : prev);
          if (u.sync_progress === 100 && !u.is_syncing) fetchCourseData();
        }
      ).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [id]);

  // ── Syllabus upload ───────────────────────────────────────────────────────

  const handleSyllabusUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingSyllabus(true);
    try {
      const fileName = `${id}-${Date.now()}.${file.name.split('.').pop() || 'pdf'}`;
      const { error: uploadError } = await supabase.storage
        .from('syllabuses').upload(fileName, file, { contentType: file.type || 'application/pdf', upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('syllabuses').getPublicUrl(fileName);
      const fileUrl = urlData.publicUrl;

      const { error: dbError } = await supabase.from('courses')
        .update({ syllabus_url: fileUrl, is_syncing: true, sync_status: 'Starting AI analysis...', sync_progress: 5 })
        .eq('id', id);
      if (dbError) throw dbError;

      setCourse((prev: any) => ({ ...prev, syllabus_url: fileUrl, is_syncing: true, sync_status: 'Starting AI analysis...', sync_progress: 5 }));
      supabase.functions.invoke('process-syllabus', { body: { course_id: id, file_url: fileUrl } }).catch(console.error);
    } catch (err: any) {
      alert(err.message || 'Upload failed.');
    } finally {
      setUploadingSyllabus(false);
      if (syllabusInputRef.current) syllabusInputRef.current.value = '';
    }
  };

  // ── Modal helpers ─────────────────────────────────────────────────────────

  const openUploadModal = (target: UploadTarget) => {
    setUploadTarget(target);
    setSelectedContentType(null);
    setPendingFile(null);
    setContentDisplayName('');
    setContentEstimatedMinutes('15');
    setModalStep('type');
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadTarget(null);
    setSelectedContentType(null);
    setPendingFile(null);
    setContentDisplayName('');
    setContentEstimatedMinutes('15');
    setModalStep('type');
    if (contentFileInputRef.current) contentFileInputRef.current.value = '';
  };

  // Step 1: user picks a content type → open OS file picker
  const handleContentTypeSelect = (ct: typeof CONTENT_TYPES[0]) => {
    setSelectedContentType(ct);
    pendingContentTypeRef.current = ct;
    if (contentFileInputRef.current) {
      contentFileInputRef.current.accept = ct.accept;
      contentFileInputRef.current.click();
    }
  };

  // Step 2: OS file picker returned a file → move to name step
  const handleFilePickerChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    // Use ref to get fresh content type (avoids stale closure)
    const ct = pendingContentTypeRef.current;
    if (!ct) return;
    setSelectedContentType(ct);
    setPendingFile(file);
    // Pre-fill display name with file name (minus extension)
    const nameSansExt = file.name.replace(/\.[^/.]+$/, '');
    setContentDisplayName(nameSansExt);
    setModalStep('name');
  };

  // Step 3: user clicks Confirm → do the actual upload
  const handleConfirmUpload = async () => {
    if (!pendingFile || !selectedContentType || !uploadTarget || !contentDisplayName.trim()) return;
    setModalStep('uploading');
    try {
      const storagePrefix = uploadTarget.type === 'chapter' ? 'chapters' : 'subtopics';
      const storagePath = `${storagePrefix}/${uploadTarget.id}/${selectedContentType.key}/${Date.now()}-${pendingFile.name.replace(/\s+/g, '_')}`;
      const { error: storageErr } = await supabase.storage
        .from(selectedContentType.bucket)
        .upload(storagePath, pendingFile, { contentType: pendingFile.type, upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = supabase.storage.from(selectedContentType.bucket).getPublicUrl(storagePath);
      const fileUrl = urlData.publicUrl;
      const estimatedMins = parseInt(contentEstimatedMinutes, 10) || 15;

      const newFile: ContentFile = {
        display_name: contentDisplayName.trim(),
        file_name: pendingFile.name,
        url: fileUrl,
        uploaded_at: new Date().toISOString(),
        size: pendingFile.size,
        type: selectedContentType.key,
        estimated_minutes: estimatedMins,
      };

      if (uploadTarget.type === 'chapter') {
        // ── Chapter Level Content Upload ──
        const { data: topicData, error: fetchErr } = await supabase
          .from('topics').select('workspace_template').eq('id', uploadTarget.id).single();
        if (fetchErr) throw fetchErr;

        let rawTmpl = topicData?.workspace_template;
        if (typeof rawTmpl === 'string') {
          try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
        }
        const template: WorkspaceTemplate = JSON.parse(JSON.stringify(rawTmpl || { content: [] }));
        if (!template.content) {
          template.content = [];
        }

        template.content = [...template.content, newFile];

        if (selectedContentType.key === 'lesson_notes' || selectedContentType.key === 'pdf_resources' || !template.chapter_pdf_url) {
          template.chapter_pdf_url = fileUrl;
          template.chapter_pdf_name = contentDisplayName.trim();
        }

        await saveTopicTemplate(uploadTarget.id, template);

        setCourse((prev: any) => ({
          ...prev,
          topics: prev.topics.map((t: any) =>
            t.id === uploadTarget.id ? { ...t, workspace_template: template } : t
          )
        }));
      } else {
        // ── Subtopic Level Content Upload ──
        const { data: subData, error: fetchErr } = await supabase
          .from('subtopics').select('workspace_template').eq('id', uploadTarget.id).single();
        if (fetchErr) throw fetchErr;

        let rawTmpl = subData.workspace_template;
        if (typeof rawTmpl === 'string') {
          try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
        }

        const template: WorkspaceTemplate = JSON.parse(JSON.stringify(rawTmpl || {
          extracted_context: {},
          content: [],
        }));
        
        if (!template.content) {
          template.content = [];
        }
        
        if (template.content.length === 0 && template.placeholders) {
          Object.keys(template.placeholders).forEach(key => {
            const files = template.placeholders![key];
            if (Array.isArray(files)) {
              files.forEach(f => {
                template.content!.push({ ...f, type: key });
              });
            }
          });
        }

        template.content = [...template.content, newFile];

        const { error: updateErr } = await supabase.from('subtopics')
          .update({ workspace_template: template }).eq('id', uploadTarget.id);
        if (updateErr) throw updateErr;

        let matType = selectedContentType.key;
        if (matType === 'lesson_notes' || matType === 'teacher_notes' || matType === 'pdf_resources') matType = 'notes_pdf';
        if (matType === 'videos') matType = 'video';
        if (matType === 'exercises' || matType === 'homework') matType = 'past_paper';

        await supabase.from('subtopic_materials').insert({
          subtopic_id: uploadTarget.id,
          type: matType,
          title: contentDisplayName.trim(),
          content_url: fileUrl,
          estimated_minutes: estimatedMins,
        });

        updateSubtopicTemplate(uploadTarget.id, template);
      }

      closeUploadModal();
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
      setModalStep('name');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDeleteFile = async (targetType: 'chapter' | 'subtopic', targetId: string, fileUrl: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    setDeletingFile(fileUrl);
    try {
      const table = targetType === 'chapter' ? 'topics' : 'subtopics';
      const { data: resData, error: fetchErr } = await supabase
        .from(table).select('workspace_template').eq('id', targetId).single();
      if (fetchErr) throw fetchErr;

      let rawTmpl = resData?.workspace_template;
      if (typeof rawTmpl === 'string') {
        try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
      }

      const template: WorkspaceTemplate = rawTmpl || { content: [] };
      template.content = (template.content || []).filter((f: ContentFile) => f.url !== fileUrl);

      if (targetType === 'chapter' && template.chapter_pdf_url === fileUrl) {
        const nextPdf = template.content.find((f: ContentFile) => f.type === 'pdf_resources' || f.type === 'lesson_notes');
        template.chapter_pdf_url = nextPdf?.url || undefined;
        template.chapter_pdf_name = nextPdf?.display_name || undefined;
      }

      if (targetType === 'chapter') {
        await saveTopicTemplate(targetId, template);
      } else {
        const { error: updateErr } = await supabase.from('subtopics')
          .update({ workspace_template: template }).eq('id', targetId);
        if (updateErr) throw updateErr;
      }

      if (targetType === 'chapter') {
        setCourse((prev: any) => ({
          ...prev,
          topics: prev.topics.map((t: any) =>
            t.id === targetId ? { ...t, workspace_template: template } : t
          )
        }));
      } else {
        updateSubtopicTemplate(targetId, template);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingFile(null);
    }
  };

  // ── Reorder ───────────────────────────────────────────────────────────────

  const moveFile = async (targetType: 'chapter' | 'subtopic', targetId: string, fromIdx: number, toIdx: number) => {
    setReordering(true);
    try {
      const table = targetType === 'chapter' ? 'topics' : 'subtopics';
      const { data: resData, error: fetchErr } = await supabase
        .from(table).select('workspace_template').eq('id', targetId).single();
      if (fetchErr) throw fetchErr;

      let rawTmpl = resData?.workspace_template;
      if (typeof rawTmpl === 'string') {
        try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
      }

      const template: WorkspaceTemplate = rawTmpl || { content: [] };
      const arr = [...(template.content || [])];
      if (toIdx < 0 || toIdx >= arr.length) return;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      template.content = arr;

      if (targetType === 'chapter') {
        await saveTopicTemplate(targetId, template);
      } else {
        const { error: updateErr } = await supabase.from('subtopics')
          .update({ workspace_template: template }).eq('id', targetId);
        if (updateErr) throw updateErr;
      }

      if (targetType === 'chapter') {
        setCourse((prev: any) => ({
          ...prev,
          topics: prev.topics.map((t: any) =>
            t.id === targetId ? { ...t, workspace_template: template } : t
          )
        }));
      } else {
        updateSubtopicTemplate(targetId, template);
      }
    } catch (err: any) {
      alert(`Reorder failed: ${err.message}`);
    } finally {
      setReordering(false);
    }
  };

  // ── Shared state updater ──────────────────────────────────────────────────

  const updateSubtopicTemplate = (subtopicId: string, template: WorkspaceTemplate) => {
    setCourse((prev: any) => {
      if (!prev) return prev;
      return {
        ...prev,
        topics: prev.topics.map((t: any) => ({
          ...t,
          subtopics: t.subtopics.map((s: any) =>
            s.id === subtopicId ? { ...s, workspace_template: template } : s
          ),
        })),
      };
    });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div className="p-8 text-center text-textMuted">Loading course details...</div>;
  if (!course) return <div className="p-8 text-center text-error">Course not found.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">

      {/* Hidden inputs */}
      <input type="file" accept="application/pdf" className="hidden" ref={syllabusInputRef} onChange={handleSyllabusUpload} />
      <input type="file" className="hidden" ref={contentFileInputRef} onChange={handleFilePickerChange} />

      {/* Back */}
      <button onClick={() => navigate('/courses')} className="flex items-center space-x-2 text-textMuted hover:text-text transition-colors">
        <ArrowLeft className="w-5 h-5" /><span>Back to Courses</span>
      </button>

      {/* Course Header */}
      <div className="bg-surface border border-border rounded-3xl p-8">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold text-text mb-2">{course.title}</h1>
            <p className="text-textMuted">{course.board} • {course.level}</p>
          </div>
          <div>
            <button
              onClick={() => syllabusInputRef.current?.click()}
              disabled={uploadingSyllabus || course?.is_syncing}
              className="flex items-center space-x-2 bg-primary hover:bg-primary-hover text-white px-5 py-3 rounded-2xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <UploadCloud className="w-5 h-5" />
              <span>{uploadingSyllabus ? 'Uploading PDF...' : course?.is_syncing ? 'Processing...' : (course.syllabus_url || (course.topics && course.topics.length > 0)) ? 'Replace Syllabus' : 'Upload Syllabus'}</span>
            </button>
            {course.syllabus_url && (
              <a href={course.syllabus_url} target="_blank" rel="noreferrer" className="block text-center mt-3 text-sm text-primary hover:underline">
                View Current Syllabus
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {course.is_syncing && (
        <div className="bg-primary/10 border border-primary/20 rounded-3xl p-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-primary font-bold text-sm uppercase tracking-wider flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
              </span>
              AI Processing
            </span>
            <span className="text-primary font-medium text-sm">{course.sync_progress || 0}%</span>
          </div>
          <p className="text-text mb-4 text-sm font-medium">{course.sync_status || 'Working...'}</p>
          <div className="w-full bg-primary/20 h-2 rounded-full overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all duration-500 ease-out" style={{ width: `${course.sync_progress || 0}%` }} />
          </div>
        </div>
      )}

      {/* Course Structure */}
      <div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-2xl font-bold text-text">Course Structure</h2>
            {availableForms.length > 0 && (
              <p className="text-sm text-textMuted mt-0.5">
                Syllabus forms: <span className="font-medium text-text">{availableForms.join(', ')}</span>
              </p>
            )}
          </div>

          {availableForms.length > 0 && (
            <div className="flex items-center gap-1.5 p-1 bg-surface border border-border rounded-2xl self-start sm:self-auto overflow-x-auto max-w-full">
              <button
                onClick={() => setSelectedForm('All')}
                className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                  selectedForm === 'All'
                    ? 'bg-primary text-white shadow-sm'
                    : 'text-textMuted hover:text-text hover:bg-background'
                }`}
              >
                All Forms ({course.topics?.length || 0})
              </button>
              {availableForms.map((formName) => {
                const count = (course.topics || []).filter((t: any) => getTopicForm(t) === formName).length;
                const isActive = selectedForm === formName;
                return (
                  <button
                    key={formName}
                    onClick={() => setSelectedForm(formName)}
                    className={`px-3.5 py-1.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                      isActive
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-textMuted hover:text-text hover:bg-background'
                    }`}
                  >
                    {formName} ({count})
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!course.topics || course.topics.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed border-border rounded-3xl bg-surface">
            <BookOpen className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="text-textMuted text-lg mb-2">No topics found.</p>
            <p className="text-textMuted text-sm">Upload a syllabus PDF above to automatically generate topics using AI.</p>
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed border-border rounded-3xl bg-surface">
            <BookOpen className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="text-textMuted text-lg mb-2">No topics in {selectedForm}.</p>
            <button
              onClick={() => setSelectedForm('All')}
              className="mt-2 text-sm text-primary font-semibold hover:underline"
            >
              View all topics
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {[...filteredTopics]
              .sort((a: any, b: any) => {
                if (a.order_index != null && b.order_index != null && a.order_index !== b.order_index) {
                  return a.order_index - b.order_index;
                }
                return a.title.localeCompare(b.title, undefined, { numeric: true });
              })
              .map((topic: any, index: number) => {
                const isExpanded = expandedTopicId === topic.id;
                return (
                  <div key={topic.id} className="bg-surface border border-border rounded-2xl overflow-hidden">
                    <button
                      onClick={() => setExpandedTopicId(isExpanded ? null : topic.id)}
                      className="w-full flex items-center justify-between p-5 hover:bg-background transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <span className="text-xl font-bold text-primary">{index + 1}</span>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-lg font-semibold text-text">{topic.title}</span>
                          {getTopicForm(topic) ? (
                            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {getTopicForm(topic)}
                            </span>
                          ) : availableForms.length > 0 ? (
                            <select
                              onClick={(e) => e.stopPropagation()}
                              value={getTopicForm(topic) || ''}
                              onChange={(e) => handleUpdateTopicForm(topic.id, e.target.value || null)}
                              className="text-xs font-medium px-2 py-0.5 rounded-lg bg-surface border border-border text-textMuted hover:text-text focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                            >
                              <option value="">Assign Form...</option>
                              {availableForms.map((f) => (
                                <option key={f} value={f}>{f}</option>
                              ))}
                            </select>
                          ) : null}
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-textMuted" /> : <ChevronDown className="w-5 h-5 text-textMuted" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border bg-background p-5 pl-14 space-y-6">
                        {/* ── 1. Chapter-Level Resources (Outside Generated Topics) ── */}
                        <div className="bg-surface border border-primary/20 rounded-2xl p-5 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5">
                                  <FolderKanban className="w-3.5 h-3.5" />
                                  Chapter Overview Content
                                </span>
                                <h4 className="text-base font-bold text-text">Chapter Materials & Resources</h4>
                              </div>
                              <p className="text-xs text-textMuted mt-1">
                                Upload content for this chapter as a whole (e.g. Chapter Revision Notes, Overview Videos, Past Paper Packs) outside generated subtopics.
                              </p>
                            </div>
                            <button
                              onClick={() => openUploadModal({ type: 'chapter', id: topic.id, title: topic.title })}
                              className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-sm flex-shrink-0 self-start"
                            >
                              <Plus className="w-4 h-4" />
                              <span>Upload Chapter Content</span>
                            </button>
                          </div>

                          {(!topic.workspace_template?.content || topic.workspace_template.content.length === 0) ? (
                            <div className="border border-dashed border-border rounded-xl p-5 text-center bg-background/50">
                              <FileText className="w-7 h-7 text-textMuted mx-auto mb-2 opacity-50" />
                              <p className="text-xs font-medium text-text">No general chapter resources uploaded yet.</p>
                              <p className="text-[11px] text-textMuted mt-1 max-w-md mx-auto">
                                Click <strong className="text-primary">"Upload Chapter Content"</strong> to add chapter-wide summary notes, overview slides, formula sheets, or review videos that apply to the whole chapter.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {topic.workspace_template.content.map((f: ContentFile, fileIdx: number) => {
                                const ct = getContentTypeMeta(f.type);
                                const Icon = ct.icon;
                                const isFirst = fileIdx === 0;
                                const isLast = fileIdx === topic.workspace_template.content.length - 1;

                                return (
                                  <div
                                    key={f.url || fileIdx}
                                    className="flex items-center justify-between bg-background border border-border rounded-xl px-3.5 py-3 group hover:border-primary/30 transition-all"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      <span className="text-xs text-textMuted font-bold w-5 flex-shrink-0 text-center">{fileIdx + 1}.</span>
                                      <div className={`p-2 rounded-xl ${ct.bg} flex-shrink-0`} title={ct.label}>
                                        <Icon className={`w-4 h-4 ${ct.color}`} />
                                      </div>
                                      <div className="min-w-0 ml-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="text-sm font-semibold text-text truncate">{f.display_name}</p>
                                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface border border-border text-textMuted">
                                            {ct.label}
                                          </span>
                                          {f.estimated_minutes && (
                                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-primary/5 text-primary border border-primary/10 flex items-center gap-1">
                                              <Clock className="w-2.5 h-2.5" />
                                              {f.estimated_minutes} mins
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-textMuted mt-0.5 truncate">
                                          {f.file_name} {f.size ? `· ${formatFileSize(f.size)}` : ''}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                                      <button
                                        onClick={() => moveFile('chapter', topic.id, fileIdx, fileIdx - 1)}
                                        disabled={isFirst || reordering}
                                        className="p-1.5 rounded-lg hover:bg-surface text-textMuted hover:text-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                        title="Move up"
                                      >
                                        <MoveUp className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => moveFile('chapter', topic.id, fileIdx, fileIdx + 1)}
                                        disabled={isLast || reordering}
                                        className="p-1.5 rounded-lg hover:bg-surface text-textMuted hover:text-text disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                        title="Move down"
                                      >
                                        <MoveDown className="w-3.5 h-3.5" />
                                      </button>
                                      <a
                                        href={f.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1.5 rounded-lg hover:bg-surface text-textMuted hover:text-primary transition-colors"
                                        title="Open file in new tab"
                                      >
                                        <ExternalLink className="w-3.5 h-3.5" />
                                      </a>
                                      <button
                                        onClick={() => handleDeleteFile('chapter', topic.id, f.url)}
                                        disabled={deletingFile === f.url}
                                        className="p-1.5 rounded-lg hover:bg-red-500/10 text-textMuted hover:text-red-400 transition-colors"
                                        title="Delete file"
                                      >
                                        {deletingFile === f.url ? <Loader2 className="w-3.5 h-3.5 animate-spin text-red-400" /> : <Trash2 className="w-3.5 h-3.5" />}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>

                        {/* ── 2. Generated Topics & Subtopics Section ── */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-text uppercase tracking-wider flex items-center gap-2">
                              <Layers className="w-4 h-4 text-primary" />
                              <span>Generated Topics / Subtopics</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-textMuted font-medium normal-case tracking-normal">
                                {(topic.subtopics || []).length} topic{(topic.subtopics || []).length !== 1 ? 's' : ''}
                              </span>
                            </h4>
                          </div>

                          {!topic.subtopics || topic.subtopics.length === 0 ? (
                            <div className="bg-surface border border-border rounded-xl p-4 text-center">
                              <p className="text-textMuted text-sm italic">No subtopics generated for this chapter.</p>
                            </div>
                          ) : (
                            <ul className="space-y-4">
                            {[...topic.subtopics]
                              .sort((a: any, b: any) => a.title.localeCompare(b.title, undefined, { numeric: true }))
                              .map((sub: any) => {
                                const files: ContentFile[] = sub.workspace_template?.content || [];
                                const totalFiles = files.length;

                                return (
                                  <li key={sub.id} className="bg-surface border border-border p-4 rounded-xl">

                                    {/* Subtopic header */}
                                    <div className="mb-3">
                                      <p className="text-text font-bold text-lg">{sub.title}</p>
                                      <p className="text-textMuted text-sm">
                                        {sub.difficulty || 'Uncategorized'} • {sub.estimated_time || 'Duration unknown'}
                                      </p>
                                    </div>

                                    {/* Extracted context */}
                                    {sub.workspace_template?.extracted_context && (
                                      <div className="space-y-4 mt-4 pt-4 border-t border-border/50">
                                        {[
                                          { key: 'core_learning_outcomes', label: 'Learning Outcomes / Objectives' },
                                          { key: 'supplement_learning_outcomes', label: 'Supplement Outcomes' },
                                          { key: 'content_knowledge', label: 'Content (Attitudes, Skills & Knowledge)' },
                                          { key: 'suggested_activities', label: 'Suggested Activities & Notes' },
                                          { key: 'suggested_resources', label: 'Suggested Resources' },
                                          { key: 'practicals', label: 'Practical Work' },
                                          { key: 'assessments', label: 'Assessments' },
                                        ].map(({ key, label }) =>
                                          sub.workspace_template.extracted_context[key]?.length > 0 && (
                                            <div key={key}>
                                              <h4 className="text-xs font-semibold text-primary uppercase tracking-wider mb-2">{label}</h4>
                                              <ul className="space-y-1">
                                                {sub.workspace_template.extracted_context[key].map((item: string, i: number) => (
                                                  <li key={i} className="flex items-start text-sm text-text">
                                                    <span className="text-primary mr-2">•</span><span>{item}</span>
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )
                                        )}
                                      </div>
                                    )}

                                    {/* Teacher Workspace */}
                                    <div className="mt-4 pt-4 border-t border-border/50">
                                      <div className="flex items-center justify-between mb-4">
                                        <div>
                                          <h4 className="text-sm font-semibold text-text">Teacher Workspace</h4>
                                          {totalFiles > 0 && (
                                            <p className="text-xs text-textMuted mt-0.5">{totalFiles} file{totalFiles !== 1 ? 's' : ''}</p>
                                          )}
                                        </div>
                                        <button
                                          onClick={() => openUploadModal({ type: 'subtopic', id: sub.id, title: sub.title })}
                                          className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold px-4 py-2 rounded-xl transition-colors"
                                        >
                                          <Plus className="w-3.5 h-3.5" />
                                          Upload Content
                                        </button>
                                      </div>

                                      {totalFiles === 0 ? (
                                        <p className="text-xs text-textMuted">No content uploaded yet. Click "Upload Content" to add files.</p>
                                      ) : (
                                        <div className="space-y-2">
                                          {files.map((f: ContentFile, fileIdx: number) => {
                                            const ct = getContentTypeMeta(f.type);
                                            const Icon = ct.icon;

                                            return (
                                              <div
                                                key={f.url}
                                                className="flex items-center justify-between bg-background border border-border rounded-xl px-3 py-2.5 group"
                                              >
                                                {/* Order indicator + name + icon */}
                                                <div className="flex items-center gap-3 min-w-0">
                                                  <span className="text-xs text-textMuted font-bold w-5 flex-shrink-0 text-center">{fileIdx + 1}.</span>
                                                  <div className={`p-1.5 rounded-lg ${ct.bg} flex-shrink-0`} title={ct.label}>
                                                    <Icon className={`w-3.5 h-3.5 ${ct.color}`} />
                                                  </div>
                                                  <div className="min-w-0 ml-1">
                                                    <p className="text-sm font-medium text-text truncate">{f.display_name}</p>
                                                    <p className="text-xs text-textMuted truncate">
                                                      {f.file_name}{f.size ? ` · ${formatFileSize(f.size)}` : ''}{f.estimated_minutes ? ` · ⏱️ ${f.estimated_minutes} mins` : ''}
                                                    </p>
                                                  </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                                                  {/* Move up */}
                                                  <button
                                                    onClick={() => moveFile('subtopic', sub.id, fileIdx, fileIdx - 1)}
                                                    disabled={fileIdx === 0 || reordering}
                                                    className="p-1 rounded-lg hover:bg-surface text-textMuted hover:text-text transition-colors disabled:opacity-20"
                                                    title="Move up"
                                                  >
                                                    <MoveUp className="w-4 h-4" />
                                                  </button>
                                                  {/* Move down */}
                                                  <button
                                                    onClick={() => moveFile('subtopic', sub.id, fileIdx, fileIdx + 1)}
                                                    disabled={fileIdx === files.length - 1 || reordering}
                                                    className="p-1 rounded-lg hover:bg-surface text-textMuted hover:text-text transition-colors disabled:opacity-20"
                                                    title="Move down"
                                                  >
                                                    <MoveDown className="w-4 h-4" />
                                                  </button>
                                                  {/* Open */}
                                                  <a
                                                    href={f.url}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="p-1.5 rounded-lg hover:bg-surface text-textMuted hover:text-primary transition-colors ml-1"
                                                    title="Open file"
                                                  >
                                                    <ExternalLink className="w-4 h-4" />
                                                  </a>
                                                  {/* Delete */}
                                                  <button
                                                    onClick={() => handleDeleteFile('subtopic', sub.id, f.url)}
                                                    disabled={deletingFile === f.url}
                                                    className="p-1.5 rounded-lg hover:bg-surface text-textMuted hover:text-red-400 transition-colors disabled:opacity-50 ml-1"
                                                    title="Delete"
                                                  >
                                                    {deletingFile === f.url
                                                      ? <Loader2 className="w-4 h-4 animate-spin" />
                                                      : <Trash2 className="w-4 h-4" />
                                                    }
                                                  </button>
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </li>
                                );
                              })}
                          </ul>
                        )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ─── Upload Content Modal ─────────────────────────────────────────── */}
      {uploadModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
          onClick={modalStep !== 'uploading' ? closeUploadModal : undefined}
        >
          <div
            className="bg-surface border border-border rounded-3xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between mb-6">
              <div>
                {modalStep === 'type' && (
                  <h3 className="text-lg font-bold text-text">
                    Upload {uploadTarget?.type === 'chapter' ? 'Chapter Content' : 'Topic Content'}
                  </h3>
                )}
                {modalStep === 'name' && <h3 className="text-lg font-bold text-text">Name Your Content</h3>}
                {modalStep === 'uploading' && <h3 className="text-lg font-bold text-text">Uploading...</h3>}
                <p className="text-sm text-textMuted mt-0.5">
                  {modalStep === 'type' && (
                    <span>
                      Target: <strong className="text-text font-semibold">{uploadTarget?.title}</strong> ({uploadTarget?.type === 'chapter' ? 'Chapter Level' : 'Topic Level'})
                    </span>
                  )}
                  {modalStep === 'name' && `${selectedContentType?.label} · ${pendingFile?.name}`}
                  {modalStep === 'uploading' && `Saving ${contentDisplayName}...`}
                </p>
              </div>
              {modalStep !== 'uploading' && (
                <button onClick={closeUploadModal} className="p-2 rounded-xl hover:bg-background text-textMuted hover:text-text transition-colors">
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {/* Step 1: content type grid */}
            {modalStep === 'type' && (
              <div className="grid grid-cols-2 gap-3">
                {CONTENT_TYPES.map(ct => {
                  const Icon = ct.icon;
                  return (
                    <button
                      key={ct.key}
                      onClick={() => handleContentTypeSelect(ct)}
                      className="flex items-center gap-3 p-4 bg-background border border-border rounded-2xl hover:border-primary/40 hover:bg-primary/5 transition-all group text-left"
                    >
                      <div className={`p-2 rounded-xl ${ct.bg} flex-shrink-0`}>
                        <Icon className={`w-4 h-4 ${ct.color}`} />
                      </div>
                      <span className="text-sm font-medium text-text group-hover:text-primary transition-colors">{ct.label}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2: name the content */}
            {modalStep === 'name' && (
              <div className="space-y-4">
                {/* Selected file info */}
                {selectedContentType && (
                  <div className={`flex items-center gap-3 p-3 rounded-2xl ${selectedContentType.bg} border border-border`}>
                    {React.createElement(selectedContentType.icon, { className: `w-5 h-5 ${selectedContentType.color} flex-shrink-0` })}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-text truncate">{pendingFile?.name}</p>
                      <p className="text-xs text-textMuted">{formatFileSize(pendingFile?.size)}</p>
                    </div>
                  </div>
                )}

                {/* Display name input */}
                <div>
                  <label className="block text-sm font-semibold text-text mb-2">
                    Display Name <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={contentDisplayName}
                    onChange={e => setContentDisplayName(e.target.value)}
                    placeholder={uploadTarget?.type === 'chapter' ? "e.g. Chapter Summary & Revision Guide" : "e.g. Newton's Laws - Lesson Notes Part 1"}
                    className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-primary transition-colors"
                    autoFocus
                  />
                  <p className="text-xs text-textMuted mt-1.5">This is the name students will see. Make it descriptive.</p>
                </div>

                {/* Allocated Study Time Input */}
                <div>
                  <label className="block text-sm font-semibold text-text mb-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-primary" />
                    Allocated Study Time (Minutes) <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      value={contentEstimatedMinutes}
                      onChange={e => setContentEstimatedMinutes(e.target.value)}
                      placeholder="e.g. 30"
                      className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm text-text placeholder:text-textMuted focus:outline-none focus:border-primary transition-colors pr-16 font-semibold"
                      onKeyDown={e => { if (e.key === 'Enter' && contentDisplayName.trim() && contentEstimatedMinutes) handleConfirmUpload(); }}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-semibold text-textMuted pointer-events-none">
                      mins
                    </span>
                  </div>
                  <p className="text-xs text-textMuted mt-1.5">Type the number of study minutes allocated for this content.</p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setModalStep('type')}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-textMuted hover:text-text hover:bg-background transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleConfirmUpload}
                    disabled={!contentDisplayName.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Upload
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: uploading */}
            {modalStep === 'uploading' && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-textMuted">Uploading <span className="text-text font-medium">{contentDisplayName}</span>...</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
