import os

filepath = '../mentora-admin/src/components/TeacherBulkMarkingModal.tsx'
with open(filepath, 'r') as f:
    text = f.read()

# 1. Helper function uploadBase64ToStorage
helper_code = '''/**
 * Helper to safely upload a base64 image data string or large image URL to Supabase Storage.
 * Returns publicUrl or null.
 */
async function uploadBase64ToStorage(
  b64String: string,
  paperId: string,
  pageIdx?: number
): Promise<string | null> {
  if (!b64String || typeof b64String !== 'string') return null;
  if (!b64String.startsWith('data:image') && b64String.length <= 500) {
    return b64String;
  }
  try {
    const b64Data = b64String.includes(',') ? b64String.split(',')[1] : b64String;
    const byteCharacters = atob(b64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let b = 0; b < byteCharacters.length; b++) {
      byteNumbers[b] = byteCharacters.charCodeAt(b);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: 'image/png' });
    const suffix = typeof pageIdx === 'number' ? `page_${pageIdx + 1}` : 'primary';
    const storagePath = `bulk_markings/${paperId}/${Date.now()}_${suffix}_${Math.random().toString(36).substring(7)}.png`;
    const { error: upErr } = await supabase.storage
      .from('student_attempts')
      .upload(storagePath, blob, { contentType: 'image/png', upsert: true });
    if (!upErr) {
      const { data: pubData } = supabase.storage.from('student_attempts').getPublicUrl(storagePath);
      return pubData.publicUrl;
    }
    console.warn('uploadBase64ToStorage storage error:', upErr);
    return null;
  } catch (err) {
    console.warn('uploadBase64ToStorage error:', err);
    return null;
  }
}

'''

target_export = 'export default function TeacherBulkMarkingModal'
assert target_export in text, 'export default not found'
text = text.replace(target_export, helper_code + target_export, 1)

# 2. Update eager useEffect (lines ~280-315) to use uploadBase64ToStorage
old_eager_block = '''      supabase.functions.invoke('tutor-chat', {
        body: {
          action: 'generate_marked_image',
          assessment: viewingPaper.assessment_result,
          image_url: origImg,
          page_index: viewerPageIdx
        }
      }).then(async ({ data }) => {
        if (data?.image_url) {
          const updated = { ...viewingPaper };
          if (!updated.assessment_result.pages) {
            updated.assessment_result.pages = [];
          }
          if (!updated.assessment_result.pages[viewerPageIdx]) {
            updated.assessment_result.pages[viewerPageIdx] = { original_image_url: origImg };
          }
          updated.assessment_result.pages[viewerPageIdx].marked_image_url = data.image_url;
          if (viewerPageIdx === 0) {
            updated.marked_image_url = data.image_url;
          }
          setViewingPaper(updated);

          await supabase
            .from('marked_student_papers')
            .update({
              marked_image_url: updated.marked_image_url,
              assessment_result: updated.assessment_result
            })
            .eq('id', viewingPaper.id);
        }
      }).catch(err => {
        console.warn('generate_marked_image error:', err);
      }).finally(() => {
        setGeneratingPages(prev => ({ ...prev, [viewerPageIdx]: false }));
      });'''

new_eager_block = '''      supabase.functions.invoke('tutor-chat', {
        body: {
          action: 'generate_marked_image',
          assessment: viewingPaper.assessment_result,
          image_url: origImg,
          page_index: viewerPageIdx
        }
      }).then(async ({ data }) => {
        if (data?.image_url) {
          let cleanUrl = data.image_url;
          if (cleanUrl.startsWith('data:image') || cleanUrl.length > 500) {
            const uploaded = await uploadBase64ToStorage(cleanUrl, paper.id, viewerPageIdx);
            if (uploaded) cleanUrl = uploaded;
          }
          const updated = { ...viewingPaper };
          if (!updated.assessment_result.pages) {
            updated.assessment_result.pages = [];
          }
          if (!updated.assessment_result.pages[viewerPageIdx]) {
            updated.assessment_result.pages[viewerPageIdx] = { original_image_url: origImg };
          }
          updated.assessment_result.pages[viewerPageIdx].marked_image_url = cleanUrl;
          if (viewerPageIdx === 0) {
            updated.marked_image_url = cleanUrl;
          }
          setViewingPaper(updated);

          await supabase
            .from('marked_student_papers')
            .update({
              marked_image_url: updated.marked_image_url,
              assessment_result: updated.assessment_result
            })
            .eq('id', viewingPaper.id);
        }
      }).catch(err => {
        console.warn('generate_marked_image error:', err);
      }).finally(() => {
        setGeneratingPages(prev => ({ ...prev, [viewerPageIdx]: false }));
      });'''

assert old_eager_block in text, 'old_eager_block not found'
text = text.replace(old_eager_block, new_eager_block, 1)

# 3. Update handleRegeneratePageMarking
old_regen_block = '''      if (data?.image_url) {
        const updated = { ...viewingPaper };
        if (!updated.assessment_result.pages) {
          updated.assessment_result.pages = [];
        }
        if (!updated.assessment_result.pages[pageIdx]) {
          updated.assessment_result.pages[pageIdx] = { original_image_url: origImg };
        }
        updated.assessment_result.pages[pageIdx].marked_image_url = data.image_url;
        if (pageIdx === 0) {
          updated.marked_image_url = data.image_url;
        }
        setViewingPaper(updated);

        await supabase
          .from('marked_student_papers')
          .update({
            marked_image_url: updated.marked_image_url,
            assessment_result: updated.assessment_result
          })
          .eq('id', viewingPaper.id);

        await fetchMarkedPapers();
      }'''

new_regen_block = '''      if (data?.image_url) {
        let cleanUrl = data.image_url;
        if (cleanUrl.startsWith('data:image') || cleanUrl.length > 500) {
          const uploaded = await uploadBase64ToStorage(cleanUrl, paper.id, pageIdx);
          if (uploaded) cleanUrl = uploaded;
        }
        const updated = { ...viewingPaper };
        if (!updated.assessment_result.pages) {
          updated.assessment_result.pages = [];
        }
        if (!updated.assessment_result.pages[pageIdx]) {
          updated.assessment_result.pages[pageIdx] = { original_image_url: origImg };
        }
        updated.assessment_result.pages[pageIdx].marked_image_url = cleanUrl;
        if (pageIdx === 0) {
          updated.marked_image_url = cleanUrl;
        }
        setViewingPaper(updated);

        await supabase
          .from('marked_student_papers')
          .update({
            marked_image_url: updated.marked_image_url,
            assessment_result: updated.assessment_result
          })
          .eq('id', viewingPaper.id);

        await fetchMarkedPapers();
      }'''

assert old_regen_block in text, 'old_regen_block not found'
text = text.replace(old_regen_block, new_regen_block, 1)

# 4. Update processQueueItem saving logic (lines 966-1016)
old_save_block = '''      // Reconcile primary marked image and ensure it is uploaded to storage if base64
      let primaryMarkedUrl = data?.marked_image_url || assessment.pages?.[0]?.marked_image_url || null;
      if (primaryMarkedUrl && typeof primaryMarkedUrl === 'string' && (primaryMarkedUrl.startsWith('data:image') || primaryMarkedUrl.length > 500)) {
        try {
          const b64Data = primaryMarkedUrl.includes(',') ? primaryMarkedUrl.split(',')[1] : primaryMarkedUrl;
          const byteCharacters = atob(b64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let b = 0; b < byteCharacters.length; b++) {
            byteNumbers[b] = byteCharacters.charCodeAt(b);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'image/png' });
          const storagePath = `bulk_markings/${paper.id}/${Date.now()}_marked_${Math.random().toString(36).substring(7)}.png`;
          const { error: upErr } = await supabase.storage
            .from('student_attempts')
            .upload(storagePath, blob, { contentType: 'image/png', upsert: true });
          if (!upErr) {
            const { data: pubData } = supabase.storage.from('student_attempts').getPublicUrl(storagePath);
            primaryMarkedUrl = pubData.publicUrl;
            if (assessment.pages?.[0]?.marked_image_url) {
              assessment.pages[0].marked_image_url = pubData.publicUrl;
            }
          } else {
            console.warn('Could not upload marked image to storage:', upErr);
            primaryMarkedUrl = null;
            if (assessment.pages?.[0]?.marked_image_url) {
              assessment.pages[0].marked_image_url = null;
            }
          }
        } catch (e) {
          console.warn('Could not upload marked image to storage:', e);
          primaryMarkedUrl = null;
          if (assessment.pages?.[0]?.marked_image_url) {
            assessment.pages[0].marked_image_url = null;
          }
        }
      }

      // Sanitize assessment pages so no huge base64 strings get saved into JSON
      if (Array.isArray(assessment.pages)) {
        for (const p of assessment.pages) {
          if (p.marked_image_url && typeof p.marked_image_url === 'string' && (p.marked_image_url.startsWith('data:image') || p.marked_image_url.length > 500)) {
            if (primaryMarkedUrl && !primaryMarkedUrl.startsWith('data:image')) {
              p.marked_image_url = primaryMarkedUrl;
            } else {
              p.marked_image_url = null;
            }
          }
        }
      }'''

new_save_block = '''      // Process and upload each page\\'s marked image if returned as base64
      let primaryMarkedUrl = data?.marked_image_url || assessment.pages?.[0]?.marked_image_url || null;

      if (Array.isArray(assessment.pages) && assessment.pages.length > 0) {
        for (let pIdx = 0; pIdx < assessment.pages.length; pIdx++) {
          const pageObj = assessment.pages[pIdx];
          const rawMarked = pageObj.marked_image_url || (pIdx === 0 ? primaryMarkedUrl : null);
          if (rawMarked && typeof rawMarked === 'string') {
            if (rawMarked.startsWith('data:image') || rawMarked.length > 500) {
              const uploadedUrl = await uploadBase64ToStorage(rawMarked, paper.id, pIdx);
              pageObj.marked_image_url = uploadedUrl;
              if (pIdx === 0 && uploadedUrl) {
                primaryMarkedUrl = uploadedUrl;
              }
            } else {
              pageObj.marked_image_url = rawMarked;
              if (pIdx === 0) {
                primaryMarkedUrl = rawMarked;
              }
            }
          } else {
            pageObj.marked_image_url = null;
          }
        }
      } else if (primaryMarkedUrl && typeof primaryMarkedUrl === 'string' && (primaryMarkedUrl.startsWith('data:image') || primaryMarkedUrl.length > 500)) {
        primaryMarkedUrl = await uploadBase64ToStorage(primaryMarkedUrl, paper.id, 0);
      }'''

assert old_save_block in text, 'old_save_block not found'
text = text.replace(old_save_block, new_save_block, 1)

# 5. Update viewer toolbar and student switcher
old_viewer_nav = '''              const pagesList: any[] = (viewingPaper.assessment_result?.pages && viewingPaper.assessment_result.pages.length > 0)
                ? viewingPaper.assessment_result.pages
                : (viewingPaper.page_images || []).map((url: string, idx: number) => ({
                    page_index: idx,
                    original_image_url: url,
                    marked_image_url: idx === 0 ? viewingPaper.marked_image_url : undefined
                  }));
              const totalPages = Math.max(pagesList.length, 1);
              const currentPage = pagesList[viewerPageIdx] || pagesList[0];
              const pageOriginalUrl = currentPage?.original_image_url || viewingPaper.page_images?.[viewerPageIdx] || '';
              const pageMarkedUrl = currentPage?.marked_image_url || (viewerPageIdx === 0 ? viewingPaper.marked_image_url : null);
              const displayUrl = (viewerMode === 'marked' && pageMarkedUrl) ? pageMarkedUrl : pageOriginalUrl;
              const isPageGenerating = generatingPages[viewerPageIdx];'''

new_viewer_nav = '''              const currentPaperIndex = filteredPapers.findIndex(p => p.id === viewingPaper.id);
              const hasPrevPaper = currentPaperIndex > 0;
              const hasNextPaper = currentPaperIndex >= 0 && currentPaperIndex < filteredPapers.length - 1;

              const rawPageImages: string[] = Array.isArray(viewingPaper.page_images) ? viewingPaper.page_images : [];
              const assessmentPages: any[] = Array.isArray(viewingPaper.assessment_result?.pages) ? viewingPaper.assessment_result.pages : [];
              const maxPageCount = Math.max(rawPageImages.length, assessmentPages.length, 1);

              const pagesList: any[] = Array.from({ length: maxPageCount }).map((_, idx) => {
                const foundAssPage = assessmentPages.find((ap: any) => ap.page_index === idx) || assessmentPages[idx];
                const origImg = foundAssPage?.original_image_url || rawPageImages[idx] || '';
                const markedImg = foundAssPage?.marked_image_url || (idx === 0 ? viewingPaper.marked_image_url : null);
                return {
                  page_index: idx,
                  ...(foundAssPage || {}),
                  original_image_url: origImg,
                  marked_image_url: markedImg
                };
              });

              const totalPages = pagesList.length;
              const currentPage = pagesList[viewerPageIdx] || pagesList[0];
              const pageOriginalUrl = currentPage?.original_image_url || rawPageImages[viewerPageIdx] || '';
              const pageMarkedUrl = currentPage?.marked_image_url || (viewerPageIdx === 0 ? viewingPaper.marked_image_url : null);
              const displayUrl = (viewerMode === 'marked' && pageMarkedUrl) ? pageMarkedUrl : pageOriginalUrl;
              const isPageGenerating = generatingPages[viewerPageIdx];'''

assert old_viewer_nav in text, 'old_viewer_nav not found'
text = text.replace(old_viewer_nav, new_viewer_nav, 1)

# 6. Add student navigation in viewer top bar
old_top_bar_title = '''                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-text">
                      {viewingPaper.student_name}
                    </h3>
                    {viewingPaper.student_id_number && (
                      <span className="text-xs text-textMuted font-mono">
                        ({viewingPaper.student_id_number})
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      viewingPaper.percentage >= 75 
                        ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                        : viewingPaper.percentage >= 50
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        : 'bg-error/15 text-error border-error/30'
                    }`}>
                      Score: {viewingPaper.total_score} / {viewingPaper.max_score} ({viewingPaper.percentage}%)
                    </span>
                  </div>'''

new_top_bar_title = '''                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-text">
                      {viewingPaper.student_name}
                    </h3>
                    {viewingPaper.student_id_number && (
                      <span className="text-xs text-textMuted font-mono">
                        ({viewingPaper.student_id_number})
                      </span>
                    )}
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      viewingPaper.percentage >= 75 
                        ? 'bg-[#10b981]/15 text-[#10b981] border-[#10b981]/30'
                        : viewingPaper.percentage >= 50
                        ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                        : 'bg-error/15 text-error border-error/30'
                    }`}>
                      Score: {viewingPaper.total_score} / {viewingPaper.max_score} ({viewingPaper.percentage}%)
                    </span>
                    {filteredPapers.length > 1 && (
                      <div className="flex items-center gap-1 bg-surface border border-border rounded-xl px-1.5 py-0.5 text-xs text-textMuted">
                        <button
                          onClick={() => {
                            const curIdx = filteredPapers.findIndex(p => p.id === viewingPaper.id);
                            if (curIdx > 0) handleOpenViewer(filteredPapers[curIdx - 1]);
                          }}
                          disabled={filteredPapers.findIndex(p => p.id === viewingPaper.id) <= 0}
                          className="p-1 hover:text-text disabled:opacity-30 cursor-pointer"
                          title="Previous Student Paper"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <span className="font-semibold px-1 text-[11px] text-text">
                          Student {filteredPapers.findIndex(p => p.id === viewingPaper.id) + 1} of {filteredPapers.length}
                        </span>
                        <button
                          onClick={() => {
                            const curIdx = filteredPapers.findIndex(p => p.id === viewingPaper.id);
                            if (curIdx >= 0 && curIdx < filteredPapers.length - 1) handleOpenViewer(filteredPapers[curIdx + 1]);
                          }}
                          disabled={filteredPapers.findIndex(p => p.id === viewingPaper.id) >= filteredPapers.length - 1}
                          className="p-1 hover:text-text disabled:opacity-30 cursor-pointer"
                          title="Next Student Paper"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>'''

assert old_top_bar_title in text, 'old_top_bar_title not found'
text = text.replace(old_top_bar_title, new_top_bar_title, 1)

# 7. Update script toolbar to also include Student switcher & Page switcher clearly
old_script_switcher = '''                    {/* Page Switcher */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setViewerPageIdx(prev => Math.max(0, prev - 1))}
                        disabled={viewerPageIdx === 0}
                        className="p-1.5 hover:bg-border/60 rounded-lg text-text disabled:opacity-30 cursor-pointer"
                        title="Previous Page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="text-xs font-semibold text-text">
                        Page {viewerPageIdx + 1} of {totalPages}
                      </span>
                      <button
                        onClick={() => setViewerPageIdx(prev => Math.min(totalPages - 1, prev + 1))}
                        disabled={viewerPageIdx === totalPages - 1}
                        className="p-1.5 hover:bg-border/60 rounded-lg text-text disabled:opacity-30 cursor-pointer"
                        title="Next Page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>'''

new_script_switcher = '''                    {/* Page Switcher & Student Paper Switcher */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2 py-1 shadow-xs">
                        <button
                          onClick={() => setViewerPageIdx(prev => Math.max(0, prev - 1))}
                          disabled={viewerPageIdx === 0}
                          className="p-1 hover:bg-surface rounded-lg text-text disabled:opacity-30 cursor-pointer transition-colors"
                          title="Previous Page of Booklet"
                        >
                          <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-bold text-text px-1">
                          Page {viewerPageIdx + 1} of {totalPages}
                        </span>
                        <button
                          onClick={() => setViewerPageIdx(prev => Math.min(totalPages - 1, prev + 1))}
                          disabled={viewerPageIdx === totalPages - 1}
                          className="p-1 hover:bg-surface rounded-lg text-text disabled:opacity-30 cursor-pointer transition-colors"
                          title="Next Page of Booklet"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {filteredPapers.length > 1 && (
                        <div className="flex items-center gap-1.5 bg-background border border-border rounded-xl px-2.5 py-1 text-xs shadow-xs">
                          <button
                            onClick={() => {
                              if (hasPrevPaper) handleOpenViewer(filteredPapers[currentPaperIndex - 1]);
                            }}
                            disabled={!hasPrevPaper}
                            className="p-0.5 hover:text-primary disabled:opacity-30 cursor-pointer transition-colors"
                            title="Previous Student Paper"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-textMuted font-medium text-[11px]">
                            Student <strong className="text-text">{currentPaperIndex + 1}/{filteredPapers.length}</strong>
                          </span>
                          <button
                            onClick={() => {
                              if (hasNextPaper) handleOpenViewer(filteredPapers[currentPaperIndex + 1]);
                            }}
                            disabled={!hasNextPaper}
                            className="p-0.5 hover:text-primary disabled:opacity-30 cursor-pointer transition-colors"
                            title="Next Student Paper"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>'''

assert old_script_switcher in text, 'old_script_switcher not found'
text = text.replace(old_script_switcher, new_script_switcher, 1)

# 8. Update viewer fallback rendering when in marked mode and page has no AI photo yet:
# Show the authentic MarkedPaperOverlay seamlessly so the student script is ALWAYS 100% visibly marked!
old_viewer_fallback = '''                      ) : viewerMode === 'marked' ? (
                        pageMarkedUrl ? (
                          <img
                            src={pageMarkedUrl}
                            alt={`Student submission marked page ${viewerPageIdx + 1}`}
                            className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-2xl bg-white select-none border border-gray-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-6 text-center max-w-md bg-surface/90 border border-border rounded-2xl shadow-xl">
                            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary mb-3">
                              <Sparkles className="w-6 h-6" />
                            </div>
                            <h4 className="text-sm font-bold text-text mb-1">No AI Photo Generated Yet</h4>
                            <p className="text-xs text-textMuted mb-4 leading-relaxed">
                              This submission was marked in <span className="text-primary font-semibold">Annotations Mode</span> (saving image tokens). You can render the photorealistic ballpoint pen photo now if needed.
                            </p>
                            <button
                              onClick={() => handleRegeneratePageMarking(viewerPageIdx)}
                              disabled={isPageGenerating}
                              className="flex items-center gap-2 bg-primary hover:bg-primaryHover text-white px-4 py-2 rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50"
                            >
                              {isPageGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                              <span>{isPageGenerating ? 'Rendering Teacher Ink...' : 'Generate AI Photo (Uses Tokens)'}</span>
                            </button>
                          </div>
                        )
                      ) : ('''

new_viewer_fallback = '''                      ) : viewerMode === 'marked' ? (
                        pageMarkedUrl ? (
                          <img
                            src={pageMarkedUrl}
                            alt={`Student submission marked page ${viewerPageIdx + 1}`}
                            className="max-h-full max-w-full w-auto h-auto object-contain rounded-xl shadow-2xl bg-white select-none border border-gray-300"
                          />
                        ) : (
                          <div className="relative w-full h-full flex flex-col items-center justify-center">
                            {/* Seamless interactive marked annotations overlay fallback */}
                            <div className="flex-1 w-full h-full flex items-center justify-center">
                              <MarkedPaperOverlay
                                imageUrl={pageOriginalUrl}
                                annotations={ensureAssessmentAnnotations(viewingPaper.assessment_result, viewerPageIdx)}
                                showAnnotations={true}
                                showComments={showAnnotationsComments}
                                altText={`Student submission marked page ${viewerPageIdx + 1}`}
                              />
                            </div>
                            {/* Floating Generate Photorealistic Red Ink Action Bar */}
                            <div className="absolute bottom-4 z-30 bg-surface/95 backdrop-blur-md border border-border/80 px-4 py-2 rounded-2xl shadow-2xl flex items-center gap-3">
                              <div className="flex items-center gap-2 text-xs text-textMuted">
                                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                                <span>Showing Marked Vector Annotations</span>
                              </div>
                              <button
                                onClick={() => handleRegeneratePageMarking(viewerPageIdx)}
                                disabled={isPageGenerating}
                                className="flex items-center gap-1.5 bg-primary hover:bg-primaryHover text-white px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shadow-md cursor-pointer disabled:opacity-50"
                              >
                                {isPageGenerating ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                <span>{isPageGenerating ? 'Rendering Teacher Ink...' : 'Render AI Red-Ink Photo'}</span>
                              </button>
                            </div>
                          </div>
                        )
                      ) : ('''

assert old_viewer_fallback in text, 'old_viewer_fallback not found'
text = text.replace(old_viewer_fallback, new_viewer_fallback, 1)

with open(filepath, 'w') as f:
    f.write(text)

print('Successfully applied all patches to TeacherBulkMarkingModal.tsx!')
