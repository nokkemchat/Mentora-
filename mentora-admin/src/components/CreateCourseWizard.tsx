import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Check, BookOpen, Users, Layout, Copy, UploadCloud, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

interface CreateCourseWizardProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateCourseWizard({ onClose, onSuccess }: CreateCourseWizardProps) {
  const { user, isAdmin } = useAuth();
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  // Form State
  const [creationMode, setCreationMode] = useState<'clone' | 'upload'>('clone');
  const [formData, setFormData] = useState({
    title: '',
    syllabus_code: '',
    board: '',
    level: '',
    subject: '',
    color: 'bg-blue-500',
  });

  const [existingCourses, setExistingCourses] = useState<any[]>([]);
  const [templateCourseId, setTemplateCourseId] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const syllabusInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchCourses = async () => {
      const { data } = await supabase.from('courses').select('id, title, board, level, syllabus_code, subject_category').order('title');
      if (data) setExistingCourses(data);
    };
    fetchCourses();
  }, []);

  const handleCourseSelect = (course: any) => {
    setFormData({
      ...formData,
      title: course.title,
      board: course.board,
      level: course.level,
      syllabus_code: course.syllabus_code || '',
      subject: course.subject_category || '',
    });
    setTemplateCourseId(course.id);
    setSyllabusFile(null); // Clear file if they select an existing course
    setShowDropdown(false);
    setTitleError('');
  };

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [titleError, setTitleError] = useState('');

  const handleNext = () => {
    if (step === 1) {
      if (creationMode === 'clone' && !templateCourseId) {
        setTitleError('Please select a syllabus course to clone.');
        return;
      }
      if (creationMode === 'upload' && !syllabusFile) {
        setTitleError('Please select a Syllabus PDF to upload.');
        return;
      }
      if (creationMode === 'upload' && !formData.subject) {
        setTitleError('Please select a Subject Category.');
        return;
      }
      setTitleError('');
    }
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Format teacher name if logged in as a teacher
    const teacherName = user ? `${user.user_metadata?.first_name || ''} ${user.user_metadata?.last_name || ''}`.trim() : '';
    
    // Insert into Supabase
    const newCourseId = crypto.randomUUID();
    const { error } = await supabase.from('courses').insert({
      id: newCourseId,
      title: creationMode === 'upload' ? 'Extracting Syllabus...' : formData.title,
      syllabus_code: formData.syllabus_code,
      board: formData.board,
      level: formData.level,
      subject_category: formData.subject,
      icon: 'book-open-variant',
      color: formData.color,
      teacher_name: !isAdmin && teacherName ? teacherName : 'TBD',
    });

    if (!error) {
      if (templateCourseId) {
        // Clone syllabus topics
        const { data: topics } = await supabase.from('topics').select('*').eq('course_id', templateCourseId);
        if (topics && topics.length > 0) {
          const newTopics = [];
          const topicIdMap = new Map();
          
          for (const topic of topics) {
            const newTopicId = crypto.randomUUID();
            topicIdMap.set(topic.id, newTopicId);
            newTopics.push({
              id: newTopicId,
              course_id: newCourseId,
              title: topic.title,
              workspace_template: topic.workspace_template,
            });
          }
          await supabase.from('topics').insert(newTopics);

          // Clone subtopics
          const { data: subtopics } = await supabase.from('subtopics').select('*').in('topic_id', topics.map(t => t.id));
          if (subtopics && subtopics.length > 0) {
            const newSubtopics = subtopics.map(sub => ({
              id: crypto.randomUUID(),
              topic_id: topicIdMap.get(sub.topic_id),
              title: sub.title,
              difficulty: sub.difficulty,
              estimated_time: sub.estimated_time,
              video_url: sub.video_url,
              notes_content: sub.notes_content,
              past_papers_count: sub.past_papers_count,
              estimated_quiz_minutes: sub.estimated_quiz_minutes,
              workspace_template: sub.workspace_template,
            }));
            await supabase.from('subtopics').insert(newSubtopics);
          }
        }
      } else if (syllabusFile) {
        // Upload syllabus PDF if no template was selected
        const fileName = `${newCourseId}-${Date.now()}.${syllabusFile.name.split('.').pop() || 'pdf'}`;
        const { error: uploadError } = await supabase.storage
          .from('syllabuses').upload(fileName, syllabusFile, { contentType: syllabusFile.type || 'application/pdf', upsert: true });
        
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from('syllabuses').getPublicUrl(fileName);
          const fileUrl = urlData.publicUrl;
          
          await supabase.from('courses')
            .update({ syllabus_url: fileUrl, is_syncing: true, sync_status: 'Starting AI analysis...', sync_progress: 5 })
            .eq('id', newCourseId);
            
          supabase.functions.invoke('process-syllabus', { body: { course_id: newCourseId, file_url: fileUrl } }).catch(console.error);
        } else {
          console.error('Error uploading syllabus:', uploadError);
        }
      }
    }

    setIsSubmitting(false);

    if (error) {
      console.error('Error creating course:', error);
      alert('Failed to create course');
    } else {
      if (onSuccess) onSuccess();
      else onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-background/80  z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-surface border border-border w-full max-w-2xl rounded-2xl  overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-text">Create New Course</h2>
            <p className="text-sm text-textMuted mt-1">Step {step} of {totalSteps}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-background rounded-full transition-colors text-textMuted hover:text-text">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-background h-1.5 flex">
          <div className="bg-primary h-full transition-all duration-300" style={{ width: `${(step / totalSteps) * 100}%` }} />
        </div>

        {/* Body */}
        <div className="p-8 flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="flex items-center space-x-3 text-text mb-6">
                <BookOpen className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-medium">Basic Information</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <button 
                  onClick={() => {
                    setCreationMode('clone');
                    setTitleError('');
                  }}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    creationMode === 'clone' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border bg-background hover:border-textMuted'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <div className={`p-2 rounded-xl transition-colors ${creationMode === 'clone' ? 'bg-primary text-white' : 'bg-surface text-textMuted'}`}>
                      <Copy className="w-5 h-5" />
                    </div>
                    <span className={`font-bold transition-colors ${creationMode === 'clone' ? 'text-primary' : 'text-text'}`}>Clone Syllabus</span>
                  </div>
                  <p className="text-xs text-textMuted leading-relaxed">
                    Copy an existing course structure from the database.
                  </p>
                </button>

                <button 
                  onClick={() => {
                    setCreationMode('upload');
                    setTemplateCourseId('');
                    setTitleError('');
                  }}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    creationMode === 'upload' 
                      ? 'border-primary bg-primary/10' 
                      : 'border-border bg-background hover:border-textMuted'
                  }`}
                >
                  <div className="flex items-center space-x-3 mb-2">
                    <div className={`p-2 rounded-xl transition-colors ${creationMode === 'upload' ? 'bg-primary text-white' : 'bg-surface text-textMuted'}`}>
                      <UploadCloud className="w-5 h-5" />
                    </div>
                    <span className={`font-bold transition-colors ${creationMode === 'upload' ? 'text-primary' : 'text-text'}`}>Upload PDF</span>
                  </div>
                  <p className="text-xs text-textMuted leading-relaxed">
                    Let AI extract the topics and structure from a document.
                  </p>
                </button>
              </div>
              
              {creationMode === 'clone' ? (
                <div className="space-y-6 animate-in fade-in">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="relative">
                      <label className="block text-sm font-medium text-textMuted mb-2">
                        Select Syllabus Course <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <select 
                          className={`w-full bg-background border rounded-2xl px-4 py-3 text-text focus:outline-none transition-colors appearance-none pr-10 ${
                            titleError ? 'border-red-500 focus:border-red-500' : 'border-border focus:border-primary'
                          }`}
                          value={templateCourseId}
                          onChange={e => {
                            const course = existingCourses.find(c => c.id === e.target.value);
                            if (course) {
                              handleCourseSelect(course);
                            } else {
                              setTemplateCourseId('');
                            }
                          }}
                        >
                          <option value="">Choose a syllabus from the database...</option>
                          {existingCourses.map(c => (
                            <option key={c.id} value={c.id}>
                              {c.title} • {c.board} {c.level} {c.syllabus_code ? `[${c.syllabus_code}]` : ''}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-5 h-5 text-textMuted absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                      
                      {titleError && (
                        <p className="mt-1.5 text-xs text-red-500 flex items-center gap-1">
                          <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          {titleError}
                        </p>
                      )}
                    </div>
                  </div>

                  {templateCourseId && (
                    <div className="bg-primary/10 border border-primary/20 p-4 rounded-3xl flex items-start space-x-3">
                      <BookOpen className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-text">Syllabus Selected</p>
                        <p className="text-sm text-textMuted">The entire syllabus structure will be cloned from this course.</p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-6 animate-in fade-in">
                  <div>
                    <label className="block text-sm font-medium text-textMuted mb-2">Subject Category <span className="text-red-500">*</span></label>
                    <div className="relative">
                      <select 
                        className={`w-full bg-background border rounded-2xl px-4 py-3 text-text focus:outline-none transition-colors appearance-none pr-10 ${
                          titleError && !formData.subject ? 'border-red-500 focus:border-red-500' : 'border-border focus:border-primary'
                        }`}
                        value={formData.subject}
                        onChange={e => {
                          setFormData({...formData, subject: e.target.value});
                          setTitleError('');
                        }}
                      >
                        <option value="">Select a category...</option>
                        <option>Sciences</option>
                        <option>Arts</option>
                        <option>Commercials</option>
                      </select>
                      <ChevronDown className="w-5 h-5 text-textMuted absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className={`border p-6 rounded-3xl bg-background transition-colors ${titleError && !syllabusFile ? 'border-red-500 bg-red-500/5' : 'border-border'}`}>
                    <label className="block text-sm font-bold text-text mb-2">Upload Syllabus PDF <span className="text-red-500">*</span></label>
                    <p className="text-sm text-textMuted mb-4">Our AI will automatically extract the course structure, topics, board, level, and syllabus code from the document.</p>
                    <div className="flex items-center space-x-4">
                      <button 
                        onClick={() => {
                          setTitleError('');
                          syllabusInputRef.current?.click();
                        }}
                        className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-xl text-sm font-bold transition-colors"
                      >
                        Select PDF File
                      </button>
                      <span className="text-sm text-textMuted max-w-[200px] truncate" title={syllabusFile?.name || ''}>
                        {syllabusFile ? syllabusFile.name : 'No file selected.'}
                      </span>
                    </div>
                    {titleError && !syllabusFile && (
                      <p className="mt-3 text-xs text-red-500 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        {titleError}
                      </p>
                    )}
                    <input 
                      type="file" 
                      accept=".pdf" 
                      className="hidden" 
                      ref={syllabusInputRef} 
                      onChange={e => {
                        setSyllabusFile(e.target.files?.[0] || null);
                        if (e.target.files?.[0]) setTitleError('');
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in slide-in-from-right-4">
              <div className="flex items-center space-x-3 text-text mb-6">
                <Check className="w-6 h-6 text-primary" />
                <h3 className="text-lg font-medium">Review & Publish</h3>
              </div>

              <div className="bg-background border border-border rounded-3xl p-6 space-y-4">
                <div className="flex justify-between items-center border-b border-border pb-4">
                  <span className="text-textMuted">Course Title</span>
                  <span className="font-bold text-text">{creationMode === 'upload' ? 'Extracting Syllabus...' : (formData.title || 'Untitled')} {formData.syllabus_code ? `(${formData.syllabus_code})` : ''}</span>
                </div>
                {(formData.board || formData.level) && (
                  <div className="flex justify-between items-center border-b border-border pb-4">
                    <span className="text-textMuted">Board & Level</span>
                    <span className="font-medium text-text">{formData.board} {formData.level ? `• ${formData.level}` : ''}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-textMuted">Category</span>
                  <span className="font-medium text-text">{formData.subject || 'Not set'}</span>
                </div>
                {syllabusFile && !templateCourseId && (
                  <div className="flex justify-between items-center border-t border-border pt-4 mt-4">
                    <span className="text-textMuted">Syllabus PDF</span>
                    <span className="font-medium text-text">{syllabusFile.name}</span>
                  </div>
                )}
              </div>
              
              <div className="bg-primary/10 border border-primary/20 p-4 rounded-3xl flex items-start space-x-3 mt-4">
                <Layout className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <p className="text-sm text-text">Once published, teachers will be able to claim this course on the marketplace and start uploading their own localized content for it.</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-background flex justify-between items-center">
          <button 
            onClick={handleBack}
            disabled={step === 1}
            className="px-6 py-2 rounded-2xl font-medium text-textMuted hover:text-text disabled:opacity-30 transition-colors"
          >
            Back
          </button>
          
          {step < totalSteps ? (
            <button 
              onClick={handleNext}
              className="px-6 py-2 bg-primary hover:bg-primary-hover text-white rounded-2xl font-medium flex items-center space-x-2 transition-colors"
            >
              <span>Next Step</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-8 py-2 bg-success hover:bg-success/90 text-white rounded-2xl font-bold flex items-center space-x-2  -success/20 transition-all disabled:opacity-50"
            >
              <Check className="w-5 h-5 mr-1" />
              <span>{isSubmitting ? 'Creating...' : 'Create Course'}</span>
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
