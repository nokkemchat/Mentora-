import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  ArrowLeft, BookOpen, UploadCloud, ChevronDown, ChevronUp,
  Plus, X, FileText, Video, Monitor, FileArchive, PenLine, Home,
  HelpCircle, ClipboardList, ExternalLink, Trash2, Loader2,
  ChevronUp as MoveUp, ChevronDown as MoveDown, Clock
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

interface WorkspaceTemplate {
  extracted_context: Record<string, string[]>;
  content: ContentFile[]; // Single ordered array
  placeholders?: Record<string, ContentFile[]>; // legacy
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

  // ── Upload modal multi-step state ─────────────────────────────────────────
  type ModalStep = 'type' | 'name' | 'uploading';
  const [modalStep, setModalStep] = useState<ModalStep>('type');
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [uploadModalSubtopicId, setUploadModalSubtopicId] = useState<string | null>(null);
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

  const openUploadModal = (subtopicId: string) => {
    setUploadModalSubtopicId(subtopicId);
    setSelectedContentType(null);
    setPendingFile(null);
    setContentDisplayName('');
    setContentEstimatedMinutes('15');
    setModalStep('type');
    setUploadModalOpen(true);
  };

  const closeUploadModal = () => {
    setUploadModalOpen(false);
    setUploadModalSubtopicId(null);
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
    if (!pendingFile || !selectedContentType || !uploadModalSubtopicId || !contentDisplayName.trim()) return;
    setModalStep('uploading');
    try {
      const path = `${uploadModalSubtopicId}/${selectedContentType.key}/${Date.now()}-${pendingFile.name.replace(/\s+/g, '_')}`;
      const { error: storageErr } = await supabase.storage
        .from(selectedContentType.bucket)
        .upload(path, pendingFile, { contentType: pendingFile.type, upsert: false });
      if (storageErr) throw storageErr;

      const { data: urlData } = supabase.storage.from(selectedContentType.bucket).getPublicUrl(path);
      const fileUrl = urlData.publicUrl;

      // Fetch fresh template from DB to avoid stale data
      const { data: subData, error: fetchErr } = await supabase
        .from('subtopics').select('workspace_template').eq('id', uploadModalSubtopicId).single();
      if (fetchErr) throw fetchErr;

      let rawTmpl = subData.workspace_template;
      if (typeof rawTmpl === 'string') {
        try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
      }

      // Deep clone to ensure new references
      const template: WorkspaceTemplate = JSON.parse(JSON.stringify(rawTmpl || {
        extracted_context: {},
        content: [],
      }));
      
      // Ensure content array exists
      if (!template.content) {
        template.content = [];
      }
      
      // If there are legacy placeholders but no content yet, migrate them before pushing
      if (template.content.length === 0 && template.placeholders) {
        Object.keys(template.placeholders).forEach(key => {
          const files = template.placeholders![key];
          if (Array.isArray(files)) {
            files.forEach(f => {
              template.content.push({ ...f, type: key });
            });
          }
        });
      }

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
      
      // Use array spread to ensure React detects the change
      template.content = [...template.content, newFile];

      const { error: updateErr } = await supabase.from('subtopics')
        .update({ workspace_template: template }).eq('id', uploadModalSubtopicId);
      if (updateErr) throw updateErr;

      // Also insert into subtopic_materials for mobile app table synchronization
      let matType = selectedContentType.key;
      if (matType === 'lesson_notes' || matType === 'teacher_notes' || matType === 'pdf_resources') matType = 'notes_pdf';
      if (matType === 'videos') matType = 'video';
      if (matType === 'exercises' || matType === 'homework') matType = 'past_paper';

      await supabase.from('subtopic_materials').insert({
        subtopic_id: uploadModalSubtopicId,
        type: matType,
        title: contentDisplayName.trim(),
        content_url: fileUrl,
        estimated_minutes: estimatedMins,
      });

      // Optimistic local update
      updateSubtopicTemplate(uploadModalSubtopicId, template);
      closeUploadModal();
    } catch (err: any) {
      console.error(err);
      alert(`Upload failed: ${err.message}`);
      setModalStep('name');
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDeleteFile = async (subtopicId: string, fileUrl: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    setDeletingFile(fileUrl);
    try {
      const { data: subData, error: fetchErr } = await supabase
        .from('subtopics').select('workspace_template').eq('id', subtopicId).single();
      if (fetchErr) throw fetchErr;

      let rawTmpl = subData.workspace_template;
      if (typeof rawTmpl === 'string') {
        try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
      }

      const template: WorkspaceTemplate = rawTmpl;
      template.content = (template.content || []).filter((f: ContentFile) => f.url !== fileUrl);

      const { error: updateErr } = await supabase.from('subtopics')
        .update({ workspace_template: template }).eq('id', subtopicId);
      if (updateErr) throw updateErr;

      updateSubtopicTemplate(subtopicId, template);
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setDeletingFile(null);
    }
  };

  // ── Reorder ───────────────────────────────────────────────────────────────

  const moveFile = async (subtopicId: string, fromIdx: number, toIdx: number) => {
    setReordering(true);
    try {
      const { data: subData, error: fetchErr } = await supabase
        .from('subtopics').select('workspace_template').eq('id', subtopicId).single();
      if (fetchErr) throw fetchErr;

      let rawTmpl = subData.workspace_template;
      if (typeof rawTmpl === 'string') {
        try { rawTmpl = JSON.parse(rawTmpl); } catch(e) { rawTmpl = {}; }
      }

      const template: WorkspaceTemplate = rawTmpl;
      const arr = [...(template.content || [])];
      if (toIdx < 0 || toIdx >= arr.length) return;
      const [moved] = arr.splice(fromIdx, 1);
      arr.splice(toIdx, 0, moved);
      template.content = arr;

      const { error: updateErr } = await supabase.from('subtopics')
        .update({ workspace_template: template }).eq('id', subtopicId);
      if (updateErr) throw updateErr;

      updateSubtopicTemplate(subtopicId, template);
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
        <h2 className="text-2xl font-bold text-text mb-6">Course Structure</h2>
        {!course.topics || course.topics.length === 0 ? (
          <div className="text-center p-12 border-2 border-dashed border-border rounded-3xl bg-surface">
            <BookOpen className="w-12 h-12 text-textMuted mx-auto mb-4" />
            <p className="text-textMuted text-lg mb-2">No topics found.</p>
            <p className="text-textMuted text-sm">Upload a syllabus PDF above to automatically generate topics using AI.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {[...course.topics]
              .sort((a: any, b: any) => a.title.localeCompare(b.title, undefined, { numeric: true }))
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
                        <span className="text-lg font-semibold text-text">{topic.title}</span>
                      </div>
                      {isExpanded ? <ChevronUp className="w-5 h-5 text-textMuted" /> : <ChevronDown className="w-5 h-5 text-textMuted" />}
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border bg-background p-5 pl-14">
                        {!topic.subtopics || topic.subtopics.length === 0 ? (
                          <p className="text-textMuted text-sm">No subtopics.</p>
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
                                          { key: 'core_learning_outcomes', label: 'Core Learning Outcomes' },
                                          { key: 'supplement_learning_outcomes', label: 'Supplement Outcomes' },
                                          { key: 'practicals', label: 'Practical Work' },
                                          { key: 'suggested_activities', label: 'Suggested Activities' },
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
                                          onClick={() => openUploadModal(sub.id)}
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
                                                    onClick={() => moveFile(sub.id, fileIdx, fileIdx - 1)}
                                                    disabled={fileIdx === 0 || reordering}
                                                    className="p-1 rounded-lg hover:bg-surface text-textMuted hover:text-text transition-colors disabled:opacity-20"
                                                    title="Move up"
                                                  >
                                                    <MoveUp className="w-4 h-4" />
                                                  </button>
                                                  {/* Move down */}
                                                  <button
                                                    onClick={() => moveFile(sub.id, fileIdx, fileIdx + 1)}
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
                                                    onClick={() => handleDeleteFile(sub.id, f.url)}
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
                {modalStep === 'type' && <h3 className="text-lg font-bold text-text">Upload Content</h3>}
                {modalStep === 'name' && <h3 className="text-lg font-bold text-text">Name Your Content</h3>}
                {modalStep === 'uploading' && <h3 className="text-lg font-bold text-text">Uploading...</h3>}
                <p className="text-sm text-textMuted mt-0.5">
                  {modalStep === 'type' && 'Select the type of content to upload'}
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
                    placeholder="e.g. Newton's Laws - Lesson Notes Part 1"
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
