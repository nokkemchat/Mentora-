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
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [msFile, setMsFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const msInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isMs: boolean = false) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (isMs) {
        setMsFile(file);
      } else {
        setPdfFile(file);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsUploading(true);

    try {
      let pdf_url = null;
      let ms_url = null;

      const randomId = Math.random().toString(36).substring(7);

      // Upload QP PDF
      if (pdfFile) {
        const fileExt = pdfFile.name.split('.').pop();
        const fileName = `Pending_${randomId}_qp.${fileExt}`;
        const filePath = `pending/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('past_papers')
          .upload(filePath, pdfFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('past_papers').getPublicUrl(filePath);
        pdf_url = data.publicUrl;
      }

      // Upload MS PDF
      if (msFile) {
        const fileExt = msFile.name.split('.').pop();
        const fileName = `Pending_${randomId}_ms.${fileExt}`;
        const filePath = `pending/${fileName}`;
        
        const { error: uploadError } = await supabase.storage
          .from('past_papers')
          .upload(filePath, msFile, { upsert: true });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from('past_papers').getPublicUrl(filePath);
        ms_url = data.publicUrl;
      }

      // Insert Database Record with placeholder data
      const { data: insertedPaper, error: dbError } = await supabase.from('papers').insert({
        curriculum: 'ZIMSEC', // Placeholder to satisfy DB constraint
        subject: 'Extracting...',
        grade_level: 'Pending',
        year: new Date().getFullYear(),
        session: 'Pending',
        paper_number: 0,
        variant: null,
        type: 'qp',
        pdf_url,
        mark_scheme_url: ms_url
      }).select().single();

      if (dbError) throw dbError;

      // Create Ingestion Job and trigger Edge Function extraction
      if (pdf_url && insertedPaper) {
        await supabase.from('ingestion_jobs').insert({
          paper_id: insertedPaper.id,
          mark_scheme_url: ms_url,
          status: 'uploaded'
        });

        // Trigger extraction: Try local visual agent first, fallback to Supabase Edge Function
        (async () => {
          let triggered = false;
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            const res = await fetch('http://localhost:3005/process', { method: 'POST', signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) triggered = true;
          } catch (e) {}

          if (!triggered) {
            console.log('Triggering cloud edge function extraction for paper', insertedPaper.id);
            supabase.functions.invoke('process-paper', {
              body: { paper_id: insertedPaper.id, mark_scheme_url: ms_url || undefined }
            }).catch(err => console.error('Cloud auto-extraction error:', err));

            if (ms_url) {
              supabase.functions.invoke('process-marking-scheme', {
                body: { paper_id: insertedPaper.id, mark_scheme_url: ms_url }
              }).catch(err => console.warn('Cloud MS extraction error:', err));
            }
          }
        })();
      }

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
            
            <div className="space-y-2">
              <label className="text-sm font-medium text-text">Question Paper Document (PDF)</label>
              <div 
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer relative border-border hover:border-primary hover:bg-primary/5`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={(e) => handleFileChange(e, false)}
                />
                {pdfFile ? (
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
                    <p className="text-sm font-medium text-text">Click to upload Question Paper</p>
                    <p className="text-xs text-textMuted mt-1">PDF format only (Max 50MB)</p>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-text">Marking Scheme (Optional PDF)</label>
              <div 
                className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center transition-colors cursor-pointer relative border-border hover:border-primary hover:bg-primary/5`}
                onClick={() => msInputRef.current?.click()}
              >
                <input 
                  type="file" 
                  accept=".pdf" 
                  className="hidden" 
                  ref={msInputRef}
                  onChange={(e) => handleFileChange(e, true)}
                />
                {msFile ? (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <FileIcon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 truncate max-w-[200px]">
                      <p className="text-sm font-medium text-text truncate">{msFile.name}</p>
                      <p className="text-xs text-textMuted">{(msFile.size / 1024 / 1024).toFixed(2)} MB</p>
                    </div>
                  </div>
                ) : (
                  <>
                    <UploadCloud className="w-8 h-8 text-textMuted mb-2" />
                    <p className="text-sm font-medium text-text">Click to upload Marking Scheme</p>
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
