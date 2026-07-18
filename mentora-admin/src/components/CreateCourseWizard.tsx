import React, { useState } from 'react';
import { X, ChevronRight, ChevronLeft, Check, BookOpen, Users, Layout } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CreateCourseWizardProps {
  onClose: () => void;
  onSuccess?: () => void;
}

export default function CreateCourseWizard({ onClose, onSuccess }: CreateCourseWizardProps) {
  const [step, setStep] = useState(1);
  const totalSteps = 2; // Reduced from 3 because Teacher assignment is removed

  // Form State
  const [formData, setFormData] = useState({
    title: '',
    syllabus_code: '',
    board: 'ZIMSEC',
    level: 'O-Level',
    subject: '',
    color: 'bg-blue-500',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleNext = () => {
    if (step < totalSteps) setStep(step + 1);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Insert into Supabase
    const { error } = await supabase.from('courses').insert({
      id: crypto.randomUUID(),
      title: formData.title,
      syllabus_code: formData.syllabus_code,
      board: formData.board,
      level: formData.level,
      subject_category: formData.subject,
      icon: 'book-open-variant',
      color: formData.color,
    });

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
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-textMuted mb-2">Course Title</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-text focus:border-primary focus:outline-none"
                    placeholder="e.g. Mechanics"
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-textMuted mb-2">Syllabus Code</label>
                  <input 
                    type="text" 
                    className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-text focus:border-primary focus:outline-none"
                    placeholder="e.g. 4004"
                    value={formData.syllabus_code}
                    onChange={e => setFormData({...formData, syllabus_code: e.target.value})}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-textMuted mb-2">Board</label>
                  <select 
                    className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-text focus:border-primary focus:outline-none"
                    value={formData.board}
                    onChange={e => setFormData({...formData, board: e.target.value})}
                  >
                    <option>ZIMSEC</option>
                    <option>Cambridge</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-textMuted mb-2">Level</label>
                  <select 
                    className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-text focus:border-primary focus:outline-none"
                    value={formData.level}
                    onChange={e => setFormData({...formData, level: e.target.value})}
                  >
                    <option>O-Level</option>
                    <option>A-Level</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-textMuted mb-2">Subject Category</label>
                <select 
                  className="w-full bg-background border border-border rounded-2xl px-4 py-3 text-text focus:border-primary focus:outline-none"
                  value={formData.subject}
                  onChange={e => setFormData({...formData, subject: e.target.value})}
                >
                  <option value="">Select a category...</option>
                  <option>Sciences</option>
                  <option>Arts</option>
                  <option>Commercials</option>
                </select>
              </div>
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
                  <span className="text-textMuted">Course Title & Code</span>
                  <span className="font-bold text-text">{formData.title || 'Untitled'} {formData.syllabus_code ? `(${formData.syllabus_code})` : ''}</span>
                </div>
                <div className="flex justify-between items-center border-b border-border pb-4">
                  <span className="text-textMuted">Board & Level</span>
                  <span className="font-medium text-text">{formData.board} • {formData.level}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-textMuted">Category</span>
                  <span className="font-medium text-text">{formData.subject || 'Not set'}</span>
                </div>
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
