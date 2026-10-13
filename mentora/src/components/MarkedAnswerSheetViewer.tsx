import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Dimensions,
  LayoutChangeEvent,
  Share,
  Platform,
  DimensionValue,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Line, Circle, G } from 'react-native-svg';
import { AssessmentResult, VisualAnnotation, TutorAgentTools } from '@/lib/tutorAgent';
import { reconcileAssessment, ensureAssessmentAnnotations } from '@/lib/annotationUtils';

interface MarkedAnswerSheetViewerProps {
  imageUri: string;
  imageUris?: string[];
  assessment: AssessmentResult;
  onReevaluateWithGpt4o?: () => void;
  isReevaluating?: boolean;
  onUpdateAssessment?: (updated: AssessmentResult) => void;
}

export function MarkedAnswerSheetViewer({
  imageUri,
  imageUris,
  assessment,
  onReevaluateWithGpt4o,
  isReevaluating = false,
  onUpdateAssessment,
}: MarkedAnswerSheetViewerProps) {
  // Multi-page booklet state
  const pages = assessment.pages || [];
  const isMultiPage = pages.length > 1;
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const safePageIndex = isMultiPage ? Math.min(Math.max(0, currentPageIndex), pages.length - 1) : 0;
  const activePage = isMultiPage ? pages[safePageIndex] : null;

  type ViewerDisplayMode = 'annotations' | 'ai_photo' | 'original';
  const hasExistingMarked = !!(activePage?.marked_image_url || assessment.generated_marked_image_url);
  const [displayMode, setDisplayMode] = useState<ViewerDisplayMode>(hasExistingMarked ? 'ai_photo' : 'annotations');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get('window').width - 32);
  const [containerHeight, setContainerHeight] = useState<number>(460);
  const [aspectRatio, setAspectRatio] = useState<number>(3 / 4);
  const [imageNaturalDimensions, setImageNaturalDimensions] = useState<{ width: number; height: number } | null>(null);

  const currentImageUri = activePage?.original_image_url || (imageUris && imageUris[safePageIndex]) || imageUri;

  // Local flattened marked image file state (OpenAI ImageGen / Skia)
  const [aiMarkedImageUrl, setAiMarkedImageUrl] = useState<string | null>(
    activePage?.marked_image_url || assessment.generated_marked_image_url || null
  );
  const autoTriggeredRef = React.useRef<Record<number, boolean>>({});

  useEffect(() => {
    if (currentImageUri) {
      Image.getSize(
        currentImageUri,
        (w, h) => {
          if (w > 0 && h > 0) {
            setImageNaturalDimensions({ width: w, height: h });
            setAspectRatio(w / h);
          }
        },
        () => {
          setAspectRatio(3 / 4);
        }
      );
    }
  }, [currentImageUri]);

  useEffect(() => {
    if (containerWidth > 0 && aspectRatio > 0) {
      setContainerHeight(Math.round(containerWidth / aspectRatio));
    }
  }, [aspectRatio, containerWidth]);

  const reconciled = useMemo(() => {
    const copy = { ...assessment };
    return reconcileAssessment(copy);
  }, [assessment]);

  const grandScore = reconciled.total_score !== undefined ? reconciled.total_score : reconciled.score;
  const grandMax = reconciled.total_max_score !== undefined ? reconciled.total_max_score : reconciled.max_score;
  const pageScore = activePage?.page_score ?? grandScore;
  const pageMax = activePage?.page_max_score ?? grandMax;

  const [isGeneratingMarkings, setIsGeneratingMarkings] = useState(false);

  // Sync marked image state when active page changes
  useEffect(() => {
    const pageMarked = activePage?.marked_image_url || (safePageIndex === 0 ? assessment.generated_marked_image_url : null);
    if (pageMarked) {
      setAiMarkedImageUrl(pageMarked);
      setIsGeneratingMarkings(false);
    } else {
      setAiMarkedImageUrl(null);
    }
  }, [safePageIndex, activePage?.marked_image_url, assessment.generated_marked_image_url]);

  // On-demand generator: Synthesize photorealistic AI marked image only when user triggers AI Photo mode
  const triggerAiPhotoGeneration = (pageIdx: number = safePageIndex) => {
    const targetUri = (isMultiPage && pages[pageIdx]?.original_image_url)
      ? pages[pageIdx].original_image_url
      : (imageUris && imageUris[pageIdx]) || currentImageUri;

    if (!targetUri || isGeneratingMarkings) return;
    setIsGeneratingMarkings(true);

    TutorAgentTools.generate_ai_marked_exam_photo(reconciled, targetUri, isMultiPage ? pageIdx : undefined)
      .then((aiUrl) => {
        if (aiUrl && !aiUrl.startsWith('ERROR:')) {
          if (pageIdx === safePageIndex) {
            setAiMarkedImageUrl(aiUrl);
          }
          if (pages[pageIdx]) {
            pages[pageIdx].marked_image_url = aiUrl;
          }
          if (pageIdx === 0) {
            assessment.generated_marked_image_url = aiUrl;
          }
          if (onUpdateAssessment) {
            onUpdateAssessment({ ...reconciled });
          }
        } else {
          autoTriggeredRef.current[pageIdx] = false;
        }
      })
      .catch((err) => {
        console.warn(`generate_ai_marked_exam_photo error for page ${pageIdx}:`, err);
        autoTriggeredRef.current[pageIdx] = false;
      })
      .finally(() => {
        setIsGeneratingMarkings(false);
      });
  };

  // Only auto-trigger AI photo generation if user explicitly selected 'ai_photo' mode!
  // When in 'annotations' mode, ZERO image generation tokens are consumed!
  useEffect(() => {
    if (displayMode !== 'ai_photo') return;
    if (currentImageUri) {
      const pageMarked = activePage?.marked_image_url || (safePageIndex === 0 ? assessment.generated_marked_image_url : null);
      if (!pageMarked && !autoTriggeredRef.current[safePageIndex]) {
        autoTriggeredRef.current[safePageIndex] = true;
        triggerAiPhotoGeneration(safePageIndex);
      }
    }
  }, [displayMode, safePageIndex, currentImageUri]);

  /**
   * Calculates the exact letterboxed/pillarboxed inner rectangle of an image
   * rendered with resizeMode="contain" inside a container of width/height.
   * This guarantees that (0,0) is the physical top-left of the paper and
   * (width, height) is the physical bottom-right of the paper.
   */
  const getImageLayoutRect = (cWidth: number, cHeight: number) => {
    if (!aspectRatio || aspectRatio <= 0 || cWidth <= 0 || cHeight <= 0) {
      return { left: 0, top: 0, width: Math.max(cWidth, 1), height: Math.max(cHeight, 1) };
    }
    const containerRatio = cWidth / cHeight;
    let renderedW = cWidth;
    let renderedH = cHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (containerRatio > aspectRatio) {
      // Container is wider than image => pillarbox (empty space on left and right)
      renderedW = cHeight * aspectRatio;
      renderedH = cHeight;
      offsetX = (cWidth - renderedW) / 2;
      offsetY = 0;
    } else {
      // Container is taller than image => letterbox (empty space on top and bottom)
      renderedW = cWidth;
      renderedH = cWidth / aspectRatio;
      offsetX = 0;
      offsetY = (cHeight - renderedH) / 2;
    }

    return {
      left: Math.round(offsetX),
      top: Math.round(offsetY),
      width: Math.round(renderedW),
      height: Math.round(renderedH),
    };
  };

  // Vector annotation overlay renderer (Zero Image Tokens - Native React Native vector ink layer)
  // Implements OpenAI Normalized Page Coordinates [0.0, 1.0] converted to pixels strictly at render time.
  const renderAnnotationOverlay = (containerW: number, containerH: number) => {
    const currentAnnotations = ensureAssessmentAnnotations(reconciled, safePageIndex);
    if (!currentAnnotations || currentAnnotations.length === 0) return null;

    const rect = getImageLayoutRect(containerW, containerH);
    const overlayW = rect.width;
    const overlayH = rect.height;

    return (
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: rect.left,
          top: rect.top,
          width: overlayW,
          height: overlayH,
        }}
      >
        {/* Connector lines removed to prevent artificial dashed lines across student script */}

        {currentAnnotations.map((ann, idx) => {
          // 1. Pixel conversion strictly at render time from normalized coordinates [0.0, 1.0]
          const normX = ann.bbox ? ann.bbox.x : (ann.box_2d ? ann.box_2d[1] / 1000 : 0.85);
          const normY = ann.bbox ? ann.bbox.y : (ann.box_2d ? ann.box_2d[0] / 1000 : 0.2);
          const normW = ann.bbox ? ann.bbox.width : (ann.box_2d ? Math.max(0.04, (ann.box_2d[3] - ann.box_2d[1]) / 1000) : 0.08);

          const pixelLeft = Math.round(normX * overlayW);
          const pixelTop = Math.round(normY * overlayH);
          const pixelWidth = Math.round(normW * overlayW);

          const rawType = ((ann as any).type || '').toLowerCase();
          const key = `ann_${idx}_${rawType}`;

          // Strictly clamp within page borders so annotations NEVER spill outside the image
          const safeLeft = (rawType === 'comment' || rawType === 'teacher_note')
            ? Math.max(8, Math.min(pixelLeft, Math.round(overlayW * 0.22)))
            : (rawType === 'tick' || rawType === 'inline_tick')
              ? Math.max(8, Math.min(pixelLeft, Math.round(overlayW * 0.76)))
              : Math.max(8, Math.min(pixelLeft, overlayW - Math.min(pixelWidth, 180) - 8));
          const safeTop = Math.max(8, Math.min(pixelTop, overlayH - 28));

          // Detect if this is a right-margin mark badge (e.g. "✗ 0/3", "✓ 3/3", "(0/3)")
          const isScorePill =
            rawType === 'mark_badge' ||
            (ann.text && (ann.text.includes('/') || ann.text.includes('Total')) && normX >= 0.70) ||
            normX >= 0.82;

          // 1. Right Margin Score Badges (Authentic Teacher Red Pen: (2/2), (3/4), (0/3))
          if (isScorePill && rawType !== 'total_header') {
            const match = (ann.text || '').match(/(\d+\s*(?:\/\s*\d+)?)/);
            const scoreText = match ? match[1].replace(/\s+/g, '') : (ann.text || '').replace(/[^0-9/]/g, '');

            return (
              <View
                key={key}
                style={[
                  styles.marginBadgeBox,
                  {
                    top: Math.max(6, Math.round(safeTop - 22)),
                    right: 10,
                  },
                ]}
              >
                <Text style={styles.marginBadgeRedText}>
                  ({scoreText || '0'})
                </Text>
              </View>
            );
          }

          // 2. Total Senior Examiner Header Stamp (Always at Top Right Header to prevent bottom collisions)
          if (rawType === 'total_header') {
            const stampText = ann.text || `Total: ${pageScore}/${pageMax}`;
            const fullStamp = stampText.includes('|')
              ? stampText
              : (stampText.toLowerCase().includes('booklet')
                  ? stampText
                  : `${stampText} | Booklet Total: ${stampText.replace(/.*?Total:\s*/i, '')}`);

            return (
              <View
                key={key}
                style={[
                  styles.totalStampBox,
                  { top: 10, right: 12 },
                ]}
              >
                <Text style={styles.totalStampText}>{fullStamp}</Text>
              </View>
            );
          }

          // 3. Teacher Cross (Authentic Teacher Red Pen: ✗)
          if (rawType === 'cross' || ann.text === '✗') {
            return (
              <View key={key} style={[styles.crossOverlayBox, { top: Math.round(safeTop - 6), left: safeLeft }]}>
                <Text style={styles.redPenCross}>✗</Text>
              </View>
            );
          }

          // 4. Inline Tick placed directly after student formula/expression
          if (rawType === 'tick' || rawType === 'inline_tick') {
            const textStr = typeof ann.text === 'string' ? ann.text.trim() : '';
            const isStrictMarkCode = /^[A-Z]\d{1,2}$/i.test(textStr) && textStr.length <= 4;
            const markCode = isStrictMarkCode ? textStr.toUpperCase() : null;

            return (
              <View key={key} style={[styles.inlineTickOverlayBox, { top: Math.round(safeTop - 6), left: safeLeft }]}>
                <Text style={styles.redPenInlineTick}>✓</Text>
                {markCode && (
                  <View style={styles.markCodeBadge}>
                    <Text style={styles.redPenInlineLabel}>{markCode}</Text>
                  </View>
                )}
              </View>
            );
          }

          // 5. Underline / Standalone Teacher Note with caret ^
          if (rawType === 'underline' || rawType === 'comment' || rawType === 'teacher_note') {
            const w = Math.min(overlayW * 0.72, Math.max(pixelWidth || 180, 160));
            const noteText = (ann.teacher_correction || ann.text || ann.comment || '')
              .replace(/^✍️\s*/, '')
              .replace(/^\^\s*/, '')
              .trim();

            return (
              <View key={key} style={[styles.underlineOverlayBox, { top: Math.round(safeTop), left: safeLeft, width: w }]}>
                {rawType === 'underline' && <View style={styles.redWavyLine} />}
                {noteText ? (
                  <View style={styles.correctionNotePill}>
                    <Text style={styles.redPenCorrectionNote} numberOfLines={2}>
                      ^ {noteText}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }

          return null;
        })}
      </View>
    );
  };

  const handleShare = async () => {
    const targetUri = aiMarkedImageUrl || currentImageUri;
    try {
      await Share.share({
        title: 'Marked Answer Script',
        message: `Here is my graded Cambridge/ZIMSEC exam script: Page ${safePageIndex + 1} (${pageScore}/${pageMax} marks, Total: ${grandScore}/${grandMax})!`,
        url: targetUri,
      });
    } catch (err) {
      console.warn('Share error:', err);
    }
  };

  const onLayoutContainer = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    if (width > 0) {
      setContainerWidth(width);
      if (aspectRatio > 0) {
        setContainerHeight(Math.round(width / aspectRatio));
      }
    }
  };

  const activeImageSourceUri = (displayMode === 'ai_photo' && aiMarkedImageUrl)
    ? aiMarkedImageUrl
    : currentImageUri;

  return (
    <View style={styles.imageCardWrapper}>
      {/* Multi-Page Booklet Bar */}
      {isMultiPage && (
        <View style={styles.bookletNavBar}>
          <TouchableOpacity
            style={[styles.bookletNavBtn, safePageIndex === 0 && styles.bookletNavBtnDisabled]}
            disabled={safePageIndex === 0}
            onPress={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
            accessibilityLabel="Previous Page"
          >
            <Ionicons name="chevron-back" size={18} color={safePageIndex === 0 ? '#94A3B8' : '#0F172A'} />
          </TouchableOpacity>

          <View style={styles.bookletPageInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.bookletPageTitle}>
                Page {safePageIndex + 1} of {pages.length}
              </Text>
              {activePage?.marked_image_url ? (
                <View style={styles.pageMarkedPill}>
                  <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                  <Text style={styles.pageMarkedPillText}>Marked</Text>
                </View>
              ) : (
                <View style={styles.pageInkingPill}>
                  <ActivityIndicator size="small" color="#DC2626" style={{ transform: [{ scale: 0.65 }] }} />
                  <Text style={styles.pageInkingPillText}>Applying ink...</Text>
                </View>
              )}
            </View>
            <Text style={styles.bookletPageSubtitle}>
              Page Score: {pageScore}/{pageMax} marks • Total: {grandScore}/{grandMax}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.bookletNavBtn, safePageIndex === pages.length - 1 && styles.bookletNavBtnDisabled]}
            disabled={safePageIndex === pages.length - 1}
            onPress={() => setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1))}
            accessibilityLabel="Next Page"
          >
            <Ionicons name="chevron-forward" size={18} color={safePageIndex === pages.length - 1 ? '#94A3B8' : '#0F172A'} />
          </TouchableOpacity>
        </View>
      )}

      {/* Question Jump Pills */}
      {isMultiPage && assessment.question_summaries && assessment.question_summaries.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.questionJumpBar}>
          {assessment.question_summaries.map((qs, qIdx) => {
            const isActive = qs.spanned_pages.includes(safePageIndex);
            const pRange = qs.spanned_pages.length > 1
              ? `P${qs.spanned_pages[0] + 1}-${qs.spanned_pages[qs.spanned_pages.length - 1] + 1}`
              : `P${qs.spanned_pages[0] + 1}`;

            return (
              <TouchableOpacity
                key={`q_jump_${qIdx}`}
                style={[styles.questionJumpPill, isActive && styles.questionJumpPillActive]}
                onPress={() => setCurrentPageIndex(qs.spanned_pages[0])}
              >
                <Text style={[styles.questionJumpPillText, isActive && styles.questionJumpPillTextActive]}>
                  Q{qs.question_number}: {qs.score}/{qs.max_score} ({pRange})
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {/* Marked Paper Photo */}
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={() => setIsFullScreen(true)}
        style={[styles.sheetContainer, { height: containerHeight }]}
        onLayout={onLayoutContainer}
      >
        <Image
          source={{ uri: activeImageSourceUri }}
          style={[styles.sheetImage, { height: containerHeight }]}
          resizeMode="contain"
        />

        {/* Vector Red Ink Teacher Annotation Layer (0 Image Tokens) */}
        {displayMode === 'annotations' && renderAnnotationOverlay(containerWidth, containerHeight)}

        {/* AI Inpainting Loading / Call-to-action Card */}
        {displayMode === 'ai_photo' && !aiMarkedImageUrl && (
          <View pointerEvents="auto" style={styles.markingOverlayContainer}>
            <View style={styles.markingOverlayCard}>
              <Ionicons name="sparkles" size={24} color="#DC2626" />
              <Text style={styles.markingOverlayTitle}>
                {isGeneratingMarkings ? '✍️ Applying Teacher Red Markings' : '🤖 AI Inpainted Photo'}
              </Text>
              <Text style={styles.markingOverlayScore}>
                Page Score: {pageScore}/{pageMax} Marks
              </Text>
              <Text style={styles.markingOverlaySubtitle}>
                {isGeneratingMarkings
                  ? `Rendering authentic examiner ticks & handwritten corrections on Page ${safePageIndex + 1}...`
                  : 'You are viewing this script in Token-Saver mode. Tap below to synthesize an AI-edited photo with authentic red ballpoint pen.'}
              </Text>
              {!isGeneratingMarkings ? (
                <TouchableOpacity
                  style={styles.generateAiPhotoBtn}
                  onPress={() => triggerAiPhotoGeneration(safePageIndex)}
                >
                  <Ionicons name="color-wand-outline" size={14} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.generateAiPhotoBtnText}>Generate AI Photo (Uses Tokens)</Text>
                </TouchableOpacity>
              ) : (
                <ActivityIndicator size="small" color="#DC2626" style={{ marginTop: 8 }} />
              )}
            </View>
          </View>
        )}

        {/* Floating controls at top right of the marked photo */}
        <View style={styles.floatingControls}>
          <TouchableOpacity
            style={[styles.floatingBtn, displayMode === 'annotations' && styles.floatingBtnActive]}
            onPress={() => setDisplayMode('annotations')}
            accessibilityLabel="Vector Annotations"
          >
            <Ionicons
              name="pencil"
              size={12}
              color={displayMode === 'annotations' ? '#FCA5A5' : '#FFFFFF'}
            />
            <Text style={[styles.floatingBtnText, displayMode === 'annotations' && styles.floatingBtnTextActive]}>
              Annotations
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.floatingBtn, displayMode === 'ai_photo' && styles.floatingBtnActive]}
            onPress={() => {
              setDisplayMode('ai_photo');
              if (!aiMarkedImageUrl && !isGeneratingMarkings) {
                triggerAiPhotoGeneration(safePageIndex);
              }
            }}
            accessibilityLabel="AI Photo Inpainting"
          >
            <Ionicons
              name="sparkles"
              size={12}
              color={displayMode === 'ai_photo' ? '#FCA5A5' : '#FFFFFF'}
            />
            <Text style={[styles.floatingBtnText, displayMode === 'ai_photo' && styles.floatingBtnTextActive]}>
              AI Photo
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.floatingBtn, displayMode === 'original' && styles.floatingBtnActive]}
            onPress={() => setDisplayMode('original')}
            accessibilityLabel="Original Script"
          >
            <Ionicons
              name="document-text-outline"
              size={12}
              color={displayMode === 'original' ? '#FCA5A5' : '#FFFFFF'}
            />
            <Text style={[styles.floatingBtnText, displayMode === 'original' && styles.floatingBtnTextActive]}>
              Original
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.floatingIconBtn}
            onPress={handleShare}
            accessibilityLabel="Share Marked Script"
          >
            <Ionicons name="share-outline" size={14} color="#FFFFFF" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.floatingIconBtn}
            onPress={() => setIsFullScreen(true)}
            accessibilityLabel="View Fullscreen"
          >
            <Ionicons name="expand-outline" size={14} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>

      {/* Full-Screen Zoom Modal */}
      <Modal visible={isFullScreen} transparent={false} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalTitle}>
                {isMultiPage ? `Booklet Page ${safePageIndex + 1} of ${pages.length}` : 'Marked Answer Script'}
              </Text>
              <Text style={styles.modalSubtitle}>
                {isMultiPage ? `Page: ${pageScore}/${pageMax} marks • Total: ${grandScore}/${grandMax}` : `Total Score: ${grandScore} / ${grandMax} marks`}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                style={[styles.modalToggleBtn, displayMode === 'annotations' && styles.modalToggleBtnActive]}
                onPress={() => setDisplayMode('annotations')}
              >
                <Text style={[styles.modalToggleBtnText, displayMode === 'annotations' && styles.modalToggleBtnTextActive]}>
                  ✏️ Annotations
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalToggleBtn, displayMode === 'ai_photo' && styles.modalToggleBtnActive]}
                onPress={() => {
                  setDisplayMode('ai_photo');
                  if (!aiMarkedImageUrl && !isGeneratingMarkings) {
                    triggerAiPhotoGeneration(safePageIndex);
                  }
                }}
              >
                <Text style={[styles.modalToggleBtnText, displayMode === 'ai_photo' && styles.modalToggleBtnTextActive]}>
                  🤖 AI Photo
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalToggleBtn, displayMode === 'original' && styles.modalToggleBtnActive]}
                onPress={() => setDisplayMode('original')}
              >
                <Text style={[styles.modalToggleBtnText, displayMode === 'original' && styles.modalToggleBtnTextActive]}>
                  📄 Original
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.shareModalBtn}
                onPress={handleShare}
              >
                <Ionicons name="share-outline" size={18} color="#0F172A" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsFullScreen(false)}
              >
                <Ionicons name="close" size={22} color="#0F172A" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Fullscreen booklet page navigation */}
          {isMultiPage && (
            <View style={[styles.bookletNavBar, { backgroundColor: '#1E293B', borderBottomColor: '#334155' }]}>
              <TouchableOpacity
                style={[styles.bookletNavBtn, safePageIndex === 0 && { opacity: 0.4 }]}
                disabled={safePageIndex === 0}
                onPress={() => setCurrentPageIndex(prev => Math.max(0, prev - 1))}
              >
                <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
              </TouchableOpacity>

              <Text style={[styles.bookletPageTitle, { color: '#FFFFFF' }]}>
                Page {safePageIndex + 1} of {pages.length} ({pageScore}/{pageMax} marks)
              </Text>

              <TouchableOpacity
                style={[styles.bookletNavBtn, safePageIndex === pages.length - 1 && { opacity: 0.4 }]}
                disabled={safePageIndex === pages.length - 1}
                onPress={() => setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1))}
              >
                <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            maximumZoomScale={4.0}
            minimumZoomScale={1.0}
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={{ width: Dimensions.get('window').width, height: Dimensions.get('window').height * 0.85 }}>
              <Image
                source={{ uri: activeImageSourceUri }}
                style={StyleSheet.absoluteFill}
                resizeMode="contain"
              />
              {displayMode === 'annotations' && renderAnnotationOverlay(Dimensions.get('window').width, Dimensions.get('window').height * 0.85)}
              {displayMode === 'ai_photo' && !aiMarkedImageUrl && isGeneratingMarkings && (
                <View pointerEvents="none" style={styles.generatingBadge}>
                  <ActivityIndicator size="small" color="#C82333" />
                  <Text style={styles.generatingBadgeText}>Applying teacher markings...</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  imageCardWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    marginVertical: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  sheetContainer: {
    width: '100%',
    position: 'relative',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheetImage: {
    width: '100%',
    backgroundColor: '#FFFFFF',
  },
  floatingControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.76)',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 20,
    zIndex: 10,
  },
  floatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 14,
  },
  floatingBtnActive: {
    backgroundColor: 'rgba(220, 38, 38, 0.45)',
  },
  floatingBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  floatingBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  floatingIconBtn: {
    padding: 3,
    marginLeft: 2,
  },
  // Teacher's Authentic Red-Ink Markings Styles
  tickOverlayBox: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    transform: [{ rotate: '-4deg' }],
  },
  inlineTickOverlayBox: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    zIndex: 15,
  },
  redPenInlineTick: {
    fontSize: 16,
    fontWeight: '900',
    color: '#DC2626',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  redPenInlineLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    fontStyle: 'italic',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  redPenTick: {
    fontSize: 20,
    fontWeight: '900',
    color: '#DC2626',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  crossOverlayBox: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    transform: [{ rotate: '2deg' }],
  },
  redPenCross: {
    fontSize: 18,
    fontWeight: '900',
    color: '#DC2626',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  redPenScore: {
    fontSize: 13,
    fontWeight: '800',
    color: '#DC2626',
    fontStyle: 'italic',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  marginBadgeBox: {
    position: 'absolute',
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 20,
  },
  marginBadgeRedText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  marginBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  marginBadgePillZero: {
    backgroundColor: 'transparent',
  },
  marginBadgePillEarned: {
    backgroundColor: 'transparent',
  },
  marginBadgeTextZero: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  marginBadgeTextEarned: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  crossCircleBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 3,
  },
  crossCommentContainer: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  crossCommentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    lineHeight: 14,
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  crossCorrectionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    marginTop: 2,
    lineHeight: 14,
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  markCodeBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 3,
  },
  underlineOverlayBox: {
    position: 'absolute',
    maxWidth: '72%',
  },
  redWavyLine: {
    height: 1.5,
    backgroundColor: '#DC2626',
    borderRadius: 1,
    marginBottom: 2,
    width: '100%',
    opacity: 0.85,
  },
  correctionNotePill: {
    backgroundColor: 'transparent',
    paddingHorizontal: 0,
    paddingVertical: 0,
    borderWidth: 0,
    alignSelf: 'flex-start',
  },
  redPenCorrectionNote: {
    fontSize: 9.5,
    lineHeight: 12.5,
    fontWeight: '800',
    color: '#DC2626',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1.5,
  },
  totalStampBox: {
    position: 'absolute',
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  totalStampText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#DC2626',
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(255, 255, 255, 0.95)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 54,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 2,
  },
  shareModalBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
  },
  modalToggleBtnActive: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  modalToggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
  },
  modalToggleBtnTextActive: {
    color: '#B91C1C',
    fontWeight: '700',
  },
  generateAiPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 10,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  generateAiPhotoBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalScrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookletNavBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  bookletNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  bookletNavBtnDisabled: {
    opacity: 0.4,
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  bookletPageInfo: {
    alignItems: 'center',
  },
  bookletPageTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  bookletPageSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  questionJumpBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  questionJumpPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  questionJumpPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  questionJumpPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  questionJumpPillTextActive: {
    color: '#FFFFFF',
  },
  generatingBadge: {
    position: 'absolute',
    bottom: 52,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
    zIndex: 10,
  },
  generatingBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#C82333',
    letterSpacing: 0.2,
  },
  pageMarkedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  pageMarkedPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#16A34A',
  },
  pageInkingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  pageInkingPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#DC2626',
  },
  markingOverlayContainer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    zIndex: 20,
  },
  markingOverlayCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
    maxWidth: 320,
  },
  markingOverlayTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 8,
    textAlign: 'center',
  },
  markingOverlayScore: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 4,
    textAlign: 'center',
  },
  markingOverlaySubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
    textAlign: 'center',
    lineHeight: 15,
  },
});

