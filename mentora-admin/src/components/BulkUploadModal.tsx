import React, { useState, useRef } from 'react';
import { X, UploadCloud, File, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface BulkUploadModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

import { extractFirstPageText } from '../lib/pdf-parser';

interface ParsedFile {
  file: File;
  name: string;
  curriculum: string;
  subject: string;
  grade_level: string;
  year: string;
  session: string;
  paper_number: string;
  variant: string;
  type: string;
  status: 'analyzing' | 'pending' | 'uploading' | 'success' | 'error';
  errorMessage?: string;
}

export default function BulkUploadModal({ onClose, onSuccess }: BulkUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseFilename = (filename: string): Partial<ParsedFile> => {
    // Example format: ZIMSEC_Physics_O-Level_2023_Nov_P1_V2_qp.pdf
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, "");
    const parts = nameWithoutExt.split('_');
    
    let curriculum = 'ZIMSEC';
    let subject = 'Unknown';
    let grade_level = 'O-Level';
    let year = new Date().getFullYear().toString();
    let session = 'Nov';
    let paper_number = '1';
    let variant = '';
    let type = 'qp';

    const lowerName = filename.toLowerCase();
    if (lowerName.includes('ms') || lowerName.includes('mark')) {
      type = 'ms';
    }

    if (parts.length >= 1) curriculum = parts[0];
    if (parts.length >= 2) subject = parts[1];
    if (parts.length >= 3) grade_level = parts[2];
    if (parts.length >= 4) year = parts[3];
    if (parts.length >= 5) session = parts[4];
    
    if (parts.length >= 6) {
      const pMatch = parts[5].match(/\d+/);
      if (pMatch) paper_number = pMatch[0];
    }
    
    if (parts.length >= 7) {
      const vMatch = parts[6].match(/\d+/);
      if (vMatch) variant = vMatch[0];
    }

    return { curriculum, subject, grade_level, year, session, paper_number, variant };
  };

  const handleFiles = async (newFiles: FileList | File[]) => {
    const validFiles = Array.from(newFiles).filter(f => f.type === 'application/pdf');
    
    const initialFiles: ParsedFile[] = validFiles.map(file => ({
      file,
      name: file.name,
      curriculum: 'ZIMSEC',
      subject: 'Unknown',
      grade_level: 'O-Level',
      year: new Date().getFullYear().toString(),
      session: 'November',
      paper_number: '1',
      variant: '',
      type: 'qp',
      status: 'analyzing'
    }));
    
    setFiles(prev => [...prev, ...initialFiles]);

    // Process files sequentially to avoid rate limits
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const text = await extractFirstPageText(file);
        const { data, error } = await supabase.functions.invoke('extract_pdf_metadata', {
          body: { filename: file.name, text }
        });
        
        if (!error && data) {
          setFiles(prev => prev.map(p => {
             if (p.file === file) {
               return {
                 ...p,
                 curriculum: data.curriculum && data.curriculum !== 'Unknown' ? data.curriculum : p.curriculum,
                 subject: data.subject || p.subject,
                 grade_level: data.grade_level && data.grade_level !== 'Unknown' ? data.grade_level : p.grade_level,
                 year: data.year || p.year,
                 session: data.session && data.session !== 'Unknown' ? data.session : p.session,
                 paper_number: data.paper_number || p.paper_number,
                 variant: data.variant || p.variant,
                 type: data.type || p.type,
                 status: 'pending'
               }
             }
             return p;
          }));
        } else {
          // fallback
          const parsed = parseFilename(file.name);
          setFiles(prev => prev.map(p => p.file === file ? { ...p, ...parsed, status: 'pending' } : p));
        }
      } catch (err) {
        // fallback
        const parsed = parseFilename(file.name);
        setFiles(prev => prev.map(p => p.file === file ? { ...p, ...parsed, status: 'pending' } : p));
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const updateFileField = (index: number, field: keyof ParsedFile, value: string) => {
    const newFiles = [...files];
    newFiles[index] = { ...newFiles[index], [field]: value };
    setFiles(newFiles);
  };

  const uploadFiles = async () => {
    setIsUploading(true);
    let allSuccess = true;

    const newFiles = [...files];

    for (let i = 0; i < newFiles.length; i++) {
      const fileObj = newFiles[i];
      if (fileObj.status === 'success') continue;

      newFiles[i].status = 'uploading';
      setFiles([...newFiles]);

      try {
        // 1. Upload to Supabase Storage
        const fileExt = fileObj.name.split('.').pop();
        const constructedName = `${fileObj.curriculum}_${fileObj.subject}_${fileObj.year}_P${fileObj.paper_number}_${fileObj.type}.${fileExt}`;
        const filePath = `${fileObj.curriculum}/${fileObj.subject}/${fileObj.year}/${constructedName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
        
        const { error: uploadError } = await supabase.storage
          .from('past_papers')
          .upload(filePath, fileObj.file, { upsert: true });

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: { publicUrl } } = supabase.storage
          .from('past_papers')
          .getPublicUrl(filePath);

        // 2. Insert Database Record
        const { error: dbError } = await supabase.from('papers').insert({
          curriculum: fileObj.curriculum,
          subject: fileObj.subject,
          grade_level: fileObj.grade_level,
          year: parseInt(fileObj.year),
          session: fileObj.session,
          paper_number: parseInt(fileObj.paper_number),
          variant: fileObj.variant || null,
          type: fileObj.type,
          pdf_url: publicUrl
        });

        if (dbError) throw dbError;

        newFiles[i].status = 'success';
      } catch (err: any) {
        newFiles[i].status = 'error';
        newFiles[i].errorMessage = err.message || 'Upload failed';
        allSuccess = false;
      }
      
      setFiles([...newFiles]);
    }

    setIsUploading(false);
    if (allSuccess) {
      setTimeout(() => {
        onSuccess();
      }, 1000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-background rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl border border-border">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-border bg-surface">
          <div>
            <h2 className="text-xl font-bold text-text">Bulk Upload Papers</h2>
            <p className="text-sm text-textMuted mt-1">Drag and drop PDFs. We'll extract details from filenames (e.g. ZIMSEC_Physics_A-Level_2023_Nov_P1_V2.pdf)</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-border/50 rounded-full transition-colors" disabled={isUploading}>
            <X className="w-5 h-5 text-textMuted" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Dropzone */}
          <div 
            className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${isDragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-surface'}`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input 
              type="file" 
              multiple 
              accept=".pdf" 
              className="hidden" 
              ref={fileInputRef}
              onChange={(e) => {
                if (e.target.files) handleFiles(e.target.files);
              }}
            />
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <UploadCloud className="w-8 h-8 text-primary" />
            </div>
            <p className="text-lg font-medium text-text">Click or drag PDF files here</p>
            <p className="text-sm text-textMuted mt-2">Maximum file size 50MB per file.</p>
          </div>

          {/* Files List */}
          {files.length > 0 && (
            <div className="space-y-4">
              <h3 className="font-semibold text-text">Parsed Files ({files.length})</h3>
              <div className="border border-border rounded-2xl overflow-hidden overflow-x-auto bg-surface">
                <table className="w-full text-sm text-left">
                  <thead className="bg-background text-textMuted border-b border-border">
                    <tr>
                      <th className="p-3 font-medium">Filename</th>
                      <th className="p-3 font-medium w-28">Curriculum</th>
                      <th className="p-3 font-medium w-32">Subject</th>
                      <th className="p-3 font-medium w-24">Year</th>
                      <th className="p-3 font-medium w-24">Session</th>
                      <th className="p-3 font-medium w-24">Paper</th>
                      <th className="p-3 font-medium w-24">Variant</th>
                      <th className="p-3 font-medium w-24">Type</th>
                      <th className="p-3 font-medium text-center w-16">Status</th>
                      <th className="p-3 font-medium text-center w-16">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {files.map((file, idx) => (
                      <tr key={idx} className="hover:bg-background/50">
                        <td className="p-3">
                          <div className="flex items-center gap-2 truncate max-w-[150px]" title={file.name}>
                            <File className="w-4 h-4 text-primary shrink-0" />
                            <span className="truncate">{file.name}</span>
                          </div>
                          {file.status === 'error' && <p className="text-xs text-error mt-1">{file.errorMessage}</p>}
                        </td>
                        <td className="p-2">
                          <select 
                            value={file.curriculum} 
                            onChange={(e) => updateFileField(idx, 'curriculum', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            disabled={isUploading}
                          >
                            <option>ZIMSEC</option>
                            <option>Cambridge</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input 
                            value={file.subject} 
                            onChange={(e) => updateFileField(idx, 'subject', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            disabled={isUploading}
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            value={file.year} 
                            onChange={(e) => updateFileField(idx, 'year', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            disabled={isUploading}
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            value={file.session} 
                            onChange={(e) => updateFileField(idx, 'session', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            disabled={isUploading}
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            value={file.paper_number} 
                            onChange={(e) => updateFileField(idx, 'paper_number', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            disabled={isUploading}
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="text" 
                            value={file.variant} 
                            onChange={(e) => updateFileField(idx, 'variant', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            placeholder="e.g. 41"
                            disabled={isUploading}
                          />
                        </td>
                        <td className="p-2">
                          <select 
                            value={file.type} 
                            onChange={(e) => updateFileField(idx, 'type', e.target.value)}
                            className="w-full bg-background border border-border rounded p-1 text-xs"
                            disabled={isUploading}
                          >
                            <option value="qp">QP</option>
                            <option value="ms">MS</option>
                          </select>
                        </td>
                        <td className="p-3 text-center">
                          {file.status === 'analyzing' && <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" title="AI is reading PDF..."></span>}
                          {file.status === 'pending' && <span className="w-2 h-2 rounded-full bg-textMuted inline-block" title="Ready to upload"></span>}
                          {file.status === 'uploading' && <span className="w-4 h-4 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" title="Uploading..."></span>}
                          {file.status === 'success' && <CheckCircle2 className="w-5 h-5 text-success inline-block" />}
                          {file.status === 'error' && <AlertCircle className="w-5 h-5 text-error inline-block" />}
                        </td>
                        <td className="p-3 text-center">
                          <button 
                            onClick={() => removeFile(idx)} 
                            className="text-textMuted hover:text-error transition-colors"
                            disabled={isUploading}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-border bg-surface flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-6 py-2 rounded-2xl font-medium border border-border text-text hover:bg-border/50 transition-colors"
            disabled={isUploading}
          >
            Cancel
          </button>
          <button 
            onClick={uploadFiles}
            disabled={files.length === 0 || isUploading}
            className="px-6 py-2 rounded-2xl font-medium bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin inline-block"></span>
                Uploading...
              </>
            ) : (
              'Upload Papers'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
