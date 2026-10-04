import React, { useState, useRef } from 'react';
import { X, UploadCloud, FileText, ExternalLink, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MarkingSchemeModalProps {
  paper: {
    id: string;
    subject: string;
    curriculum: string;
    grade_level?: string;
    paper_number?: number | string;
    variant?: string | null;
    year?: number | string;
    session?: string;
    mark_scheme_url?: string | null;
  };
  onClose: () => void;
  onSuccess: () => void;
}

export default function MarkingSchemeModal({ paper, onClose, onSuccess }: MarkingSchemeModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [msFile, setMsFile] = useState<File | null>(null);
  const [customUrl, setCustomUrl] = useState(paper.mark_scheme_url || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        setErrorMessage('Please select a valid PDF document.');
        return;
      }
      setMsFile(file);
      setErrorMessage(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setErrorMessage(null);

    try {
      let finalMsUrl = paper.mark_scheme_url;

      if (activeTab === 'upload') {
        if (!msFile) {
          throw new Error('Please select a PDF file to upload.');
        }

        const randomId = Math.random().toString(36).substring(7);
        const fileExt = msFile.name.split('.').pop() || 'pdf';
        const fileName = `MS_${paper.id.substring(0, 8)}_${randomId}.${fileExt}`;
        const filePath = `marking_schemes/${fileName}`;

        // 1. Upload to Supabase Storage
        const { error: uploadError } = await supabase.storage
          .from('past_papers')
          .upload(filePath, msFile, { upsert: true });

        if (uploadError) {
          throw new Error(`Upload failed: ${uploadError.message}`);
        }

        // 2. Get Public URL
        const { data: publicUrlData } = supabase.storage
          .from('past_papers')
          .getPublicUrl(filePath);

        finalMsUrl = publicUrlData.publicUrl;
      } else {
        if (!customUrl.trim()) {
          throw new Error('Please enter a valid URL for the marking scheme.');
        }
        finalMsUrl = customUrl.trim();
      }

      // 3. Update Database Record
      const { error: dbError } = await supabase
        .from('papers')
        .update({ mark_scheme_url: finalMsUrl })
        .eq('id', paper.id);

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // 4. Also sync with ingestion_jobs if present
      await supabase
        .from('ingestion_jobs')
        .update({ mark_scheme_url: finalMsUrl })
        .eq('paper_id', paper.id);

      // 5. Trigger serverless Edge Function marking scheme extraction agent
      supabase.functions.invoke('process-marking-scheme', {
        body: { paper_id: paper.id, mark_scheme_url: finalMsUrl }
      }).catch(err => console.error('Marking scheme extraction error:', err));

      onSuccess();
    } catch (err: any) {
      console.error('Error saving marking scheme:', err);
      setErrorMessage(err.message || 'An error occurred while saving.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteScheme = async () => {
    if (!window.confirm('Are you sure you want to remove the marking scheme for this paper?')) {
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      const { error: dbError } = await supabase
        .from('papers')
        .update({ mark_scheme_url: null })
        .eq('id', paper.id);

      if (dbError) throw dbError;

      await supabase
        .from('ingestion_jobs')
        .update({ mark_scheme_url: null })
        .eq('paper_id', paper.id);

      onSuccess();
    } catch (err: any) {
      console.error('Error deleting marking scheme:', err);
      setErrorMessage(err.message || 'Failed to remove marking scheme.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-background rounded-3xl w-full max-w-xl flex flex-col overflow-hidden shadow-2xl border border-border">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border bg-surface">
          <div>
            <h2 className="text-xl font-semibold text-text">Marking Scheme Management</h2>
            <p className="text-sm text-textMuted mt-1">
              {paper.subject} • Paper {paper.paper_number} {paper.variant ? `v${paper.variant}` : ''} ({paper.curriculum} {paper.year} {paper.session || ''})
            </p>
          </div>
          <button 
            onClick={onClose} 
            disabled={isProcessing}
            className="p-2 text-textMuted hover:text-text hover:bg-background rounded-xl transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Current Status Badge */}
          <div className="p-4 rounded-2xl border border-border bg-surface/50">
            <span className="text-xs font-medium text-textMuted uppercase tracking-wider block mb-2">Current Status</span>
            {paper.mark_scheme_url ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-text block">Marking Scheme Attached</span>
                    <a 
                      href={paper.mark_scheme_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5 truncate"
                    >
                      <span className="truncate">{paper.mark_scheme_url}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeleteScheme}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-xl border border-error/30 text-error hover:bg-error/10 text-xs font-medium flex items-center gap-1.5 shrink-0 transition-colors disabled:opacity-50"
                  title="Remove this marking scheme"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-textMuted text-sm">
                <AlertCircle className="w-4 h-4 text-warning shrink-0" />
                <span>No marking scheme attached to this question paper yet.</span>
              </div>
            )}
          </div>

          {/* Form Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'upload' 
                  ? 'border-primary text-text' 
                  : 'border-transparent text-textMuted hover:text-text'
              }`}
            >
              Upload PDF
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'url' 
                  ? 'border-primary text-text' 
                  : 'border-transparent text-textMuted hover:text-text'
              }`}
            >
              Paste Direct URL
            </button>
          </div>

          {errorMessage && (
            <div className="p-3 bg-error/10 border border-error/20 rounded-xl text-error text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSave} className="space-y-4">
            {activeTab === 'upload' ? (
              <div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".pdf,application/pdf" 
                  className="hidden" 
                />
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                    msFile 
                      ? 'border-primary/50 bg-primary/5' 
                      : 'border-border hover:border-primary/40 bg-surface/30'
                  }`}
                >
                  {msFile ? (
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-primary" />
                      <div className="text-left">
                        <span className="text-sm font-medium text-text block truncate max-w-[280px]">
                          {msFile.name}
                        </span>
                        <span className="text-xs text-textMuted">
                          {(msFile.size / (1024 * 1024)).toFixed(2)} MB • Click to change
                        </span>
                      </div>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 text-primary mb-2" />
                      <span className="text-sm font-medium text-text mb-1">
                        {paper.mark_scheme_url ? 'Upload New Marking Scheme PDF' : 'Select Marking Scheme PDF'}
                      </span>
                      <span className="text-xs text-textMuted">Click to browse (.pdf)</span>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-xs font-medium text-textMuted mb-2">
                  Public PDF URL
                </label>
                <input 
                  type="url"
                  placeholder="https://.../marking_scheme.pdf"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl px-4 py-2.5 text-text text-sm focus:outline-none focus:border-primary"
                />
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end items-center gap-3 pt-4 border-t border-border">
              <button
                type="button"
                onClick={onClose}
                disabled={isProcessing}
                className="px-4 py-2 text-sm font-medium text-textMuted hover:text-text transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessing || (activeTab === 'upload' && !msFile) || (activeTab === 'url' && !customUrl.trim())}
                className="px-5 py-2 bg-primary hover:bg-primaryHover text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{paper.mark_scheme_url ? 'Update Scheme' : 'Save Scheme'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
