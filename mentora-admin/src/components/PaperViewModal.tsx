import React, { useState, useEffect } from 'react';
import { X, BookOpen, Layers, Target, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface PaperViewModalProps {
  paperId: string;
  onClose: () => void;
}

const RecursivePart = ({ part, allParts, allAssets }: { part: any, allParts: any[], allAssets: any[] }) => {
  const children = allParts
    .filter(p => p.parent_part_id === part.id)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
  return (
    <div className="pt-2">
      <div className="flex items-start">
        <span className="font-medium text-text mr-3 mt-0.5 shrink-0">({part.part_label})</span>
        <div className="flex-1">
          <p className="text-text text-sm leading-relaxed whitespace-pre-wrap">{part.content_text}</p>
          
          {/* Part Assets */}
          {allAssets?.filter((a: any) => a.part_id === part.id).map((asset: any) => (
            <div key={asset.id} className="mt-3 mb-2 rounded-lg overflow-hidden border border-border bg-background p-2">
              <span className="text-xs text-textMuted uppercase font-medium ml-2 mb-2 block">{asset.asset_type}</span>
              
              {asset.storage_path ? (
                <div className="bg-white rounded-lg p-2 mb-2">
                  <img src={asset.storage_path} alt={asset.ai_description || 'Question Asset'} className="max-w-full h-auto object-contain rounded-md" />
                </div>
              ) : null}

              <div className="bg-surface p-3 rounded-lg text-sm text-text italic">
                [Asset Description: {asset.ai_description}]
              </div>
            </div>
          ))}

          {/* Recursive Children */}
          {children.length > 0 && (
            <div className="space-y-4 mt-3 pl-2 sm:pl-4 border-l-2 border-border/50">
              {children.map(child => (
                <RecursivePart key={child.id} part={child} allParts={allParts} allAssets={allAssets} />
              ))}
            </div>
          )}
        </div>
        {part.marks && (
          <span className="text-sm font-medium text-textMuted ml-4 shrink-0">
            [{part.marks}]
          </span>
        )}
      </div>
    </div>
  );
};

export default function PaperViewModal({ paperId, onClose }: PaperViewModalProps) {
  const [loading, setLoading] = useState(true);
  const [paper, setPaper] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);

  useEffect(() => {
    fetchPaperData();
  }, [paperId]);

  const fetchPaperData = async () => {
    setLoading(true);
    
    // Fetch paper metadata
    const { data: paperData } = await supabase
      .from('papers')
      .select('*')
      .eq('id', paperId)
      .single();
      
    if (paperData) {
      setPaper(paperData);
    }

    // Fetch questions and nested parts
    const { data: questionsData } = await supabase
      .from('past_paper_questions')
      .select(`
        *,
        question_parts (
          id, part_label, content_text, marks, parent_part_id, created_at
        ),
        question_assets (
          id, asset_type, storage_path, ai_description, part_id
        )
      `)
      .eq('paper_id', paperId)
      .order('question_number', { ascending: true });

    if (questionsData) {
      setQuestions(questionsData);
    }
    
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-4xl h-[85vh] rounded-[2rem] shadow-2xl border border-border flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-border flex items-center justify-between shrink-0 bg-surface/50">
          <div>
            <h2 className="text-2xl font-bold text-text">Paper Viewer</h2>
            <p className="text-sm text-textMuted mt-1">
              {paper ? `${paper.subject} • ${paper.curriculum} • ${paper.year} • P${paper.paper_number}` : 'Loading...'}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-3 hover:bg-border/50 rounded-2xl transition-colors text-textMuted hover:text-text"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-background">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="flex flex-col items-center space-y-4 text-textMuted">
                <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                <p>Loading extracted contents...</p>
              </div>
            </div>
          ) : questions.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-textMuted">No questions have been extracted for this paper yet.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {questions.map((q) => (
                <div key={q.id} className="bg-surface border border-border rounded-2xl p-6 shadow-sm">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="font-bold text-primary text-lg">{q.question_number}</span>
                      </div>
                      <div>
                        <div className="flex items-center space-x-2 text-xs font-medium mb-1">
                          {q.topic && (
                            <span className="px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-lg flex items-center">
                              <Layers className="w-3 h-3 mr-1" />
                              {q.topic}
                            </span>
                          )}
                          {q.difficulty && (
                            <span className="px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded-lg flex items-center">
                              <Target className="w-3 h-3 mr-1" />
                              {q.difficulty}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {q.marks && (
                      <span className="font-medium text-textMuted bg-background px-3 py-1 rounded-xl border border-border">
                        [{q.marks} marks]
                      </span>
                    )}
                  </div>

                  <p className="text-text text-base leading-relaxed mb-6 whitespace-pre-wrap">
                    {q.content_text}
                  </p>

                  {/* Question Assets linked directly to Question */}
                  {q.question_assets?.filter((a: any) => !a.part_id).map((asset: any) => (
                    <div key={asset.id} className="mb-6 rounded-xl overflow-hidden border border-border bg-background p-2">
                       <span className="text-xs text-textMuted uppercase font-medium ml-2 mb-2 block">{asset.asset_type}</span>
                       
                       {asset.storage_path ? (
                         <div className="bg-white rounded-lg p-4 mb-2">
                           <img src={asset.storage_path} alt={asset.ai_description || 'Question Asset'} className="max-w-full h-auto object-contain rounded-md" />
                         </div>
                       ) : null}

                       <div className="bg-surface p-4 rounded-lg text-sm text-text italic">
                         [Asset Description: {asset.ai_description || 'No description provided'}]
                       </div>
                    </div>
                  ))}

                  {/* Sub parts recursively rendered */}
                  {q.question_parts && q.question_parts.length > 0 && (
                    <div className="space-y-4 pl-0 sm:pl-4">
                      {q.question_parts
                        .filter((p: any) => !p.parent_part_id)
                        .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                        .map((part: any) => (
                        <RecursivePart key={part.id} part={part} allParts={q.question_parts} allAssets={q.question_assets || []} />
                      ))}
                    </div>
                  )}

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

