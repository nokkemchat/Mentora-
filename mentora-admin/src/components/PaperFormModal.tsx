import React, { useState, useRef } from 'react';
import { X, UploadCloud, File as FileIcon } from 'lucide-react';
import { supabase } from '../lib/supabase';

import { extractFirstPageText } from '../lib/pdf-parser';

interface PaperFormModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function PaperFormModal({ onClose, onSuccess }: PaperFormModalProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    curriculum: 'ZIMSEC',
    subject: '',
    grade_level: 'O-Level',
    year: new Date().getFullYear().toString(),
    session: 'November',
    paper_number: '1',
    variant: '',
    type: 'qp'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setPdfFile(file);

      setIsAnalyzing(true);
      try {
        const text = await extractFirstPageText(file);
        const { data, error } = await supabase.functions.invoke('extract_pdf_metadata', {
          body: { filename: file.name, text }
        });
        
        if (error) throw error;
        
        if (data) {
          setFormData(prev => ({
            ...prev,
            curriculum: data.curriculum && data.curriculum !== 'Unknown' ? data.curriculum : prev.curriculum,
            subject: data.subject || prev.subject,
            grade_level: data.grade_level && data.grade_level !== 'Unknown' ? data.grade_level : prev.grade_level,
            year: data.year || prev.year,
            session: data.session && data.session !== 'Unknown' ? data.session : prev.session,
            paper_number: data.paper_number || prev.paper_number,
            variant: data.variant || prev.variant,
            type: data.type || prev.type,
          }));
        }
      } catch (err) {
        console.error("AI Analysis failed:", err);
      } finally {
        setIsAnalyzing(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let pdf_url = null;

      // Upload PDF if present
      if (pdfFile) {
        const fileExt = pdfFile.name.split('.').pop();
        const fileName = `${formData.curriculum}_${formData.subject}_${formData.year}_P${formData.paper_number}_${formData.type}.${fileExt}`;
        const filePath = `${formData.curriculum}/${formData.subject}/${formData.year}/${fileName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const { error: uploadError } = await supabase.storage
          .from('past_papers')
          .upload(filePath, pdfFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('past_papers').getPublicUrl(filePath);
        pdf_url = data.publicUrl;
      }

      // Insert Database Record
      const { error: dbError } = await supabase.from('papers').insert({
        curriculum: formData.curriculum,
        subject: formData.subject,
        grade_level: formData.grade_level,
        year: parseInt(formData.year),
        session: formData.session,
        paper_number: parseInt(formData.paper_number),
        variant: formData.variant || null,
        type: formData.type,
        pdf_url
      });

      if (dbError) throw dbError;

      onSuccess();
    } catch (error: any) {
      console.error('Error adding paper:', error);
      alert(error.message || 'Failed to add paper');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-3xl w-full max-w-2xl flex flex-col overflow-hidden shadow-xl border border-border">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border bg-surface">
          <div>
            <h2 className="text-xl font-bold text-text">Add Single Past Paper</h2>
            <p className="text-sm text-textMuted mt-1">Manually enter details for a new paper.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-full transition-colors" disabled={isUploading}>
            <X className="w-5 h-5 text-textMuted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <form id="paperForm" onSubmit={handleSubmit} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">Curriculum</label>
                <select name="curriculum" value={formData.curriculum} onChange={handleChange} className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary">
                  <option value="ZIMSEC">ZIMSEC</option>
                  <option value="Cambridge">Cambridge</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">Grade Level</label>
                <select name="grade_level" value={formData.grade_level} onChange={handleChange} className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary">
                  <option value="O-Level">O-Level</option>
                  <option value="A-Level">A-Level</option>
                  <option value="IGCSE">IGCSE</option>
                  <option value="AS-Level">AS-Level</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">Subject Name</label>
              <input 
                type="text" 
                name="subject" 
                required 
                value={formData.subject} 
                onChange={handleChange} 
                placeholder="e.g. Physics, Mathematics"
                className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary"
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">Year</label>
                <input 
                  type="number" 
                  name="year" 
                  required 
                  value={formData.year} 
                  onChange={handleChange} 
                  className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">Session</label>
                <input 
                  type="text" 
                  name="session" 
                  value={formData.session} 
                  onChange={handleChange} 
                  placeholder="e.g. June, November"
                  className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">Paper Number</label>
                <input 
                  type="number" 
                  name="paper_number" 
                  required 
                  value={formData.paper_number} 
                  onChange={handleChange} 
                  className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-text">Variant (Optional)</label>
                <input 
                  type="text" 
                  name="variant" 
                  value={formData.variant} 
                  onChange={handleChange} 
                  placeholder="e.g. 2, 41"
                  className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">Type</label>
              <select 
                name="type" 
                value={formData.type} 
                onChange={handleChange} 
                className="w-full bg-surface border border-border text-text rounded-2xl px-4 py-3 focus:outline-none focus:border-primary"
              >
                <option value="qp">Question Paper (QP)</option>
                <option value="ms">Marking Scheme (MS)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">PDF Document (Optional)</label>
              <div 
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer relative ${
                  isAnalyzing ? 'border-primary bg-primary/5' : 'border-border hover:border-primary hover:bg-primary/5'
                }`}
                onClick={() => !isAnalyzing && fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  disabled={isAnalyzing}
                />
                {isAnalyzing ? (
                  <div className="flex flex-col items-center justify-center space-y-3 py-2">
                     <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                     <p className="text-sm font-medium text-text">AI is reading document...</p>
                  </div>
                ) : pdfFile ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 truncate max-w-[200px]">
                      <p className="text-sm font-medium text-text truncate">{pdfFile.name}</p>
                      <p className="text-xs text-textMuted">{(pdfFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-textMuted mb-2" />
                    <p className="text-sm font-medium text-text">Click to upload PDF</p>
                    <p className="text-xs text-textMuted mt-1">PDF format only (Max 50MB)</p>
                  </>
                )}
              </div>
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-surface flex justify-end gap-3">
          <button 
            type="button"
            onClick={onClose}
            className="px-6 py-2 rounded-2xl font-medium border border-border text-text hover:bg-border/50 transition-colors"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button 
            type="submit"
            form="paperForm"
            disabled={isUploading}
            className="px-6 py-2 rounded-2xl font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isUploading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            Save Paper
          </button>
        </div>
      </div>
    </div>
  );
}
