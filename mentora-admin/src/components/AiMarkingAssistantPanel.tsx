import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Send,
  RotateCcw,
  Target,
  CheckCircle2,
  ArrowRight,
  Loader2,
  X,
  Wand2,
  RefreshCw,
} from 'lucide-react';
import {
  type SubpartTargetOption,
  type AssistantChatMessage,
  extractSubpartTargets,
  invokeAiMarkingRevision,
  applyMarkingPatchToAssessment,
} from '../lib/aiMarkingAssistant';

interface AiMarkingAssistantPanelProps {
  viewingPaper: any;
  paperMeta: any;
  currentPageIdx: number;
  allPageImageUrls: string[];
  focusedTargetKey: string | null;
  onSelectTargetKey: (key: string | null) => void;
  onJumpToPage: (pageIdx: number) => void;
  getOfficialQuestionsContext: () => Promise<{
    manifestOverview: string;
    submissionQuestionsContext: string;
  }>;
  onApplyAssessmentUpdate: (payload: {
    total_score: number;
    max_score: number;
    percentage: number;
    assessment_result: any;
    affectedPages?: number[];
  }) => Promise<void>;
  onRegeneratePagePhoto?: (pageIdx: number) => void;
  generatingPages?: Record<number, boolean>;
}

export default function AiMarkingAssistantPanel({
  viewingPaper,
  paperMeta,
  currentPageIdx,
  allPageImageUrls,
  focusedTargetKey,
  onSelectTargetKey,
  onJumpToPage,
  getOfficialQuestionsContext,
  onApplyAssessmentUpdate,
  onRegeneratePagePhoto,
  generatingPages = {},
}: AiMarkingAssistantPanelProps) {
  const [promptInput, setPromptInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [messagesByPaperId, setMessagesByPaperId] = useState<Record<string, AssistantChatMessage[]>>({});

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const paperRecordId = viewingPaper?.id || 'default';
  const messages = messagesByPaperId[paperRecordId] || [];

  const allTargets: SubpartTargetOption[] = extractSubpartTargets(
    viewingPaper?.assessment_result,
    viewingPaper?.total_score ?? 0,
    viewingPaper?.max_score ?? 10
  );

  const selectedTarget =
    allTargets.find((t) => t.key === focusedTargetKey) || null;

  // Focus input when teacher clicks "Tweak" on a specific question/subpart
  useEffect(() => {
    if (focusedTargetKey) {
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [focusedTargetKey]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSubmitting]);

  const appendMessage = (msg: AssistantChatMessage) => {
    setMessagesByPaperId((prev) => ({
      ...prev,
      [paperRecordId]: [...(prev[paperRecordId] || []), msg],
    }));
  };

  const handleSendPrompt = async (customText?: string) => {
    const text = (customText ?? promptInput).trim();
    if (!text || isSubmitting || !viewingPaper) return;

    setErrorMsg(null);
    if (!customText) setPromptInput('');
    setIsSubmitting(true);

    const snapshotBefore = {
      total_score: Number(viewingPaper.total_score ?? 0),
      max_score: Number(viewingPaper.max_score ?? 10),
      percentage: Number(viewingPaper.percentage ?? 0),
      assessment_result: JSON.parse(JSON.stringify(viewingPaper.assessment_result || {})),
    };

    const userMsg: AssistantChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      targetLabel: selectedTarget?.displayLabel,
    };
    appendMessage(userMsg);

    try {
      const { submissionQuestionsContext } = await getOfficialQuestionsContext();
      const historyForApi = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const { replyText, updates } = await invokeAiMarkingRevision({
        teacherPrompt: text,
        selectedTarget,
        allTargets,
        assessmentResult: viewingPaper.assessment_result,
        paperMeta,
        officialQuestionsContext: submissionQuestionsContext,
        currentPageImageUrl: allPageImageUrls[currentPageIdx] || '',
        allPageImageUrls,
        chatHistory: historyForApi,
      });

      if (updates.length > 0) {
        const {
          updatedAssessment,
          newTotalScore,
          newMaxScore,
          newPercentage,
          appliedDiffs,
          affectedPages,
        } = applyMarkingPatchToAssessment(
          viewingPaper.assessment_result,
          updates,
          Number(viewingPaper.total_score ?? 0),
          Number(viewingPaper.max_score ?? 10)
        );

        if (appliedDiffs.length > 0) {
          // Jump viewer to the first modified page so teacher immediately sees updated red ink
          if (affectedPages.length > 0 && affectedPages[0] !== currentPageIdx) {
            onJumpToPage(affectedPages[0]);
          }

          await onApplyAssessmentUpdate({
            total_score: newTotalScore,
            max_score: newMaxScore,
            percentage: newPercentage,
            assessment_result: updatedAssessment,
            affectedPages,
          });
        }

        appendMessage({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          diffs: appliedDiffs,
          oldTotal: snapshotBefore.total_score,
          newTotal: newTotalScore,
          maxTotal: newMaxScore,
          affectedPages,
          snapshotBefore: appliedDiffs.length > 0 ? snapshotBefore : undefined,
        });
      } else {
        appendMessage({
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: replyText,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    } catch (err: any) {
      console.error('AI Marking Assistant error:', err);
      setErrorMsg(err?.message || 'Could not apply marking adjustment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndo = async (msgId: string) => {
    const targetMsg = messages.find((m) => m.id === msgId);
    if (!targetMsg?.snapshotBefore || targetMsg.undone || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onApplyAssessmentUpdate({
        ...targetMsg.snapshotBefore,
        affectedPages: targetMsg.affectedPages,
      });
      setMessagesByPaperId((prev) => ({
        ...prev,
        [paperRecordId]: (prev[paperRecordId] || []).map((m) =>
          m.id === msgId ? { ...m, undone: true } : m
        ),
      }));
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to undo revision.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const quickPrompts = selectedTarget
    ? [
        `In ${selectedTarget.displayLabel}, award full marks (${selectedTarget.maxScore}/${selectedTarget.maxScore}) — the student's method and answer are valid.`,
        `Re-mark ${selectedTarget.displayLabel} generously: award method marks (ECF) for valid working steps even if the final value slipped.`,
        `In ${selectedTarget.displayLabel}, accept the student's alternative approach and re-evaluate the score fairly.`,
        `Mark ${selectedTarget.displayLabel} strictly: deduct 1 mark for missing key reasoning or units, and add a concise red-ink note.`,
      ]
    : [
        'Check the current page and award method marks (ECF) where valid steps were shown.',
        'Give full marks on Part (a) of this page — accept their alternative working.',
        'Deduct 1 mark on the final answer for missing units and update the red-ink note.',
      ];

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      {/* Target Question / Subpart Selector Strip */}
      <div className="pb-3 mb-3 border-b border-slate-200/80 dark:border-white/10 space-y-2 shrink-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-300 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-indigo-500 dark:text-sky-300" />
            <span>Target Question / Part</span>
          </span>
          {selectedTarget && (
            <button
              type="button"
              onClick={() => onSelectTargetKey(null)}
              className="text-[11px] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3 h-3" />
              <span>Auto-detect</span>
            </button>
          )}
        </div>

        {/* Scrollable Subpart Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            type="button"
            onClick={() => onSelectTargetKey(null)}
            className={`shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
              !selectedTarget
                ? 'bg-indigo-500 text-white border-indigo-400 shadow-xs'
                : 'bg-slate-100/90 dark:bg-white/[0.06] text-slate-600 dark:text-slate-300 border-slate-200/90 dark:border-white/12 hover:border-indigo-400/50'
            }`}
          >
            Auto-detect
          </button>
          {allTargets.map((t) => {
            const isSelected = selectedTarget?.key === t.key;
            const isFull = t.score >= t.maxScore && t.maxScore > 0;
            const isZero = t.score === 0;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => {
                  onSelectTargetKey(t.key);
                  onJumpToPage(t.pageIndex);
                }}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-500 text-white border-indigo-400 shadow-sm ring-2 ring-indigo-400/30'
                    : isFull
                    ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:bg-emerald-400/12 dark:text-emerald-200 dark:border-emerald-300/25 hover:border-emerald-400/50'
                    : isZero
                    ? 'bg-rose-500/10 text-rose-700 border-rose-500/25 dark:bg-rose-400/12 dark:text-rose-200 dark:border-rose-300/25 hover:border-rose-400/50'
                    : 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:bg-amber-400/12 dark:text-amber-200 dark:border-amber-300/25 hover:border-amber-400/50'
                }`}
                title={`Jump to Page ${t.pageIndex + 1} and target ${t.displayLabel}`}
              >
                <span>{t.displayLabel}</span>
                <span className={`text-[10px] px-1 py-0.2 rounded font-bold tabular-nums ${
                  isSelected ? 'bg-white/20 text-white' : 'bg-black/5 dark:bg-white/10'
                }`}>
                  {t.score}/{t.maxScore}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Target Context Mini-Card */}
        {selectedTarget && (
          <div className="rounded-xl p-2.5 bg-indigo-500/[0.08] dark:bg-indigo-400/[0.12] border border-indigo-500/20 dark:border-indigo-300/25 text-xs flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-900 dark:text-indigo-100">
                <Wand2 className="w-3.5 h-3.5 text-indigo-500 dark:text-sky-300 shrink-0" />
                <span>Editing {selectedTarget.displayLabel}</span>
                <span className="text-[10px] text-slate-500 dark:text-slate-300 font-normal">
                  • Page {selectedTarget.pageIndex + 1}
                </span>
              </div>
              {selectedTarget.teacherNote && (
                <p className="text-[11px] text-slate-600 dark:text-slate-300 truncate mt-0.5">
                  Note: “{selectedTarget.teacherNote}”
                </p>
              )}
            </div>
            <span className="shrink-0 px-2 py-0.5 rounded-md text-xs font-bold bg-white/80 dark:bg-slate-900/70 text-slate-900 dark:text-white border border-slate-200/80 dark:border-white/15 tabular-nums">
              {selectedTarget.score} / {selectedTarget.maxScore}
            </span>
          </div>
        )}
      </div>

      {/* Chat & Revision History Feed */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.length === 0 ? (
          <div className="space-y-3 py-2">
            <div className="rounded-2xl p-3.5 bg-slate-100/80 dark:bg-white/[0.05] border border-slate-200/80 dark:border-white/10 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Sparkles className="w-4 h-4 text-indigo-500 dark:text-sky-300 shrink-0" />
                <span>AI Co-Examiner Assistant</span>
              </div>
              <p className="text-[11.5px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Spot a question that was graded too harshly or too loosely? Pick a part above (like{' '}
                <strong className="text-slate-900 dark:text-white">Q2 (a)</strong>) or just describe how you want a specific question marked—I’ll inspect the student’s handwriting, update the ticks, red-ink notes, and total score immediately.
              </p>
            </div>

            <div className="space-y-1.5">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-400 px-1">
                Quick Marking Instructions
              </span>
              <div className="space-y-1.5">
                {quickPrompts.map((qp, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setPromptInput(qp)}
                    className="w-full text-left px-3 py-2 rounded-xl text-[11.5px] bg-white/80 hover:bg-white dark:bg-white/[0.05] dark:hover:bg-white/[0.10] text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/10 hover:border-indigo-400/40 transition-all cursor-pointer leading-snug"
                  >
                    “{qp}”
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[94%] rounded-2xl px-3.5 py-2.5 text-xs space-y-2 ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-b from-indigo-500 to-indigo-600 text-white shadow-sm'
                    : 'bg-slate-100/90 dark:bg-white/[0.07] text-slate-800 dark:text-slate-100 border border-slate-200/90 dark:border-white/12'
                }`}
              >
                {msg.role === 'user' && msg.targetLabel && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/20 text-[10px] font-bold text-white">
                    <Target className="w-2.5 h-2.5" />
                    <span>{msg.targetLabel}</span>
                  </span>
                )}

                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>

                {/* Applied Score Diff Card */}
                {msg.diffs && msg.diffs.length > 0 && (
                  <div
                    className={`rounded-xl p-2.5 border space-y-2 ${
                      msg.undone
                        ? 'bg-slate-200/50 dark:bg-white/[0.03] border-slate-300/60 dark:border-white/10 opacity-65'
                        : 'bg-emerald-500/10 dark:bg-emerald-400/12 border-emerald-500/25 dark:border-emerald-300/30'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>{msg.undone ? 'Revision Reverted' : 'Marks & Red Ink Updated'}</span>
                      </span>

                      {msg.snapshotBefore && !msg.undone && (
                        <button
                          type="button"
                          onClick={() => handleUndo(msg.id)}
                          disabled={isSubmitting}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-white/80 hover:bg-white dark:bg-slate-900/70 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-white/15 cursor-pointer transition-all"
                          title="Revert this marking adjustment"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>

                    <div className="space-y-1">
                      {msg.diffs.map((d, i) => {
                        const delta = d.newScore - d.oldScore;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => onJumpToPage(d.pageIndex)}
                            className="w-full flex items-center justify-between gap-2 text-[11px] bg-white/70 dark:bg-slate-950/45 px-2.5 py-1.5 rounded-lg border border-slate-200/70 dark:border-white/10 hover:border-indigo-400/40 cursor-pointer text-left"
                          >
                            <span className="font-semibold text-slate-900 dark:text-white">
                              Q{d.questionNumber} {d.partLabel}{' '}
                              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-normal">
                                (Page {d.pageIndex + 1})
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1 font-bold tabular-nums">
                              <span className="text-slate-500 dark:text-slate-400">
                                {d.oldScore}/{d.maxScore}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="text-emerald-700 dark:text-emerald-300">
                                {d.newScore}/{d.maxScore}
                              </span>
                              {delta !== 0 && (
                                <span
                                  className={`text-[10px] px-1 rounded ${
                                    delta > 0
                                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
                                  }`}
                                >
                                  {delta > 0 ? `+${delta}` : delta}
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {typeof msg.oldTotal === 'number' && typeof msg.newTotal === 'number' && (
                      <div className="flex items-center justify-between pt-1 border-t border-emerald-500/20 text-[11px] text-slate-600 dark:text-slate-300">
                        <span>Paper Total:</span>
                        <strong className="text-slate-900 dark:text-white tabular-nums">
                          {msg.oldTotal}/{msg.maxTotal} → {msg.newTotal}/{msg.maxTotal}
                        </strong>
                      </div>
                    )}

                    {/* Live AI Photo re-render status / manual re-trigger */}
                    {!msg.undone &&
                      onRegeneratePagePhoto &&
                      msg.affectedPages &&
                      msg.affectedPages.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-1.5">
                          {msg.affectedPages.map((pIdx) => (
                            <button
                              key={pIdx}
                              type="button"
                              onClick={() => onRegeneratePagePhoto(pIdx)}
                              disabled={generatingPages[pIdx]}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10.5px] font-semibold bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-700 dark:text-indigo-200 border border-indigo-400/30 cursor-pointer disabled:opacity-75"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${generatingPages[pIdx] ? 'animate-spin' : ''}`}
                              />
                              <span>
                                {generatingPages[pIdx]
                                  ? `Re-rendering Page ${pIdx + 1} Red Ink...`
                                  : `Re-render AI Photo (Page ${pIdx + 1})`}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                  </div>
                )}

                <span
                  className={`block text-[9.5px] ${
                    msg.role === 'user' ? 'text-indigo-100/80 text-right' : 'text-slate-400'
                  }`}
                >
                  {msg.timestamp}
                </span>
              </div>
            </div>
          ))
        )}

        {isSubmitting && (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300 bg-slate-100/80 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 rounded-2xl px-3.5 py-2.5 w-fit">
            <Loader2 className="w-3.5 h-3.5 text-indigo-500 dark:text-sky-300 animate-spin shrink-0" />
            <span>Inspecting handwriting & updating marks...</span>
          </div>
        )}

        {errorMsg && (
          <div className="rounded-xl p-2.5 bg-rose-500/10 border border-rose-500/25 text-rose-700 dark:text-rose-200 text-[11.5px]">
            {errorMsg}
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Prompt Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSendPrompt();
        }}
        className="pt-3 mt-2 border-t border-slate-200/80 dark:border-white/10 shrink-0 space-y-2"
      >
        <div className="relative">
          <textarea
            ref={inputRef}
            rows={3}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendPrompt();
              }
            }}
            placeholder={
              selectedTarget
                ? `Tell AI how to mark ${selectedTarget.displayLabel} (e.g. "Award 2/3 marks — accept their exterior angle step, only deduct 1 for arithmetic")...`
                : `Write how a question should be marked (e.g. "In 2(a), award 2/3 marks — accept their exterior angle method")...`
            }
            disabled={isSubmitting}
            className="w-full px-3 py-2.5 pr-11 rounded-xl text-xs bg-white/90 dark:bg-slate-950/65 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-400 border border-slate-200/90 dark:border-white/15 focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/15 resize-none leading-relaxed"
          />
          <button
            type="submit"
            disabled={!promptInput.trim() || isSubmitting}
            className="absolute right-2 bottom-2.5 w-8 h-8 rounded-lg bg-gradient-to-b from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 disabled:opacity-40 disabled:pointer-events-none text-white flex items-center justify-center shadow-sm cursor-pointer transition-all active:scale-95"
            title="Apply AI Marking Instruction (Enter)"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 dark:text-slate-400 flex items-center justify-between px-0.5">
          <span>Press Enter to apply • Shift+Enter for new line</span>
          <span className="text-indigo-500 dark:text-sky-300 font-medium">Auto-saves to cloud</span>
        </p>
      </form>
    </div>
  );
}
