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
import { AssessmentResult, VisualAnnotation, TutorAgentTools } from '@/lib/tutorAgent';
import { reconcileAssessment } from '@/lib/annotationUtils';

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
  const [showMarkings, setShowMarkings] = useState(true);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [containerWidth, setContainerWidth] = useState<number>(Dimensions.get('window').width - 32);
  const [containerHeight, setContainerHeight] = useState<number>(460);
  const [aspectRatio, setAspectRatio] = useState<number>(3 / 4);

  // Multi-page booklet state
  const pages = assessment.pages || [];
  const isMultiPage = pages.length > 1;
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  const safePageIndex = isMultiPage ? Math.min(Math.max(0, currentPageIndex), pages.length - 1) : 0;
  const activePage = isMultiPage ? pages[safePageIndex] : null;

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

  // Concurrently generate authentic AI teacher marked photos for ALL pages in parallel!
  useEffect(() => {
    // 1. Single page or active page immediate generation
    if (currentImageUri) {
      const pageMarked = activePage?.marked_image_url || (safePageIndex === 0 ? assessment.generated_marked_image_url : null);
      if (!pageMarked && !autoTriggeredRef.current[safePageIndex]) {
        autoTriggeredRef.current[safePageIndex] = true;
        setIsGeneratingMarkings(true);

        TutorAgentTools.generate_ai_marked_exam_photo(reconciled, currentImageUri, isMultiPage ? safePageIndex : undefined)
          .then((aiUrl) => {
            if (aiUrl && !aiUrl.startsWith('ERROR:')) {
              setAiMarkedImageUrl(aiUrl);
              if (activePage) {
                activePage.marked_image_url = aiUrl;
              }
              if (safePageIndex === 0) {
                assessment.generated_marked_image_url = aiUrl;
              }
              if (onUpdateAssessment) {
                onUpdateAssessment({ ...reconciled });
              }
            } else {
              autoTriggeredRef.current[safePageIndex] = false;
            }
          })
          .catch((err) => {
            console.warn(`generate_ai_marked_exam_photo error for active page ${safePageIndex}:`, err);
            autoTriggeredRef.current[safePageIndex] = false;
          })
          .finally(() => {
            setIsGeneratingMarkings(false);
          });
      }
    }

    // 2. Pre-generate all OTHER pages concurrently in parallel in the background!
    if (isMultiPage && pages.length > 1) {
      pages.forEach((page, pIdx) => {
        if (pIdx === safePageIndex) return; // Active page is handled above
        const pageImageUri = page.original_image_url || (imageUris && imageUris[pIdx]);
        if (!pageImageUri) return;
        if (page.marked_image_url) return;
        if (autoTriggeredRef.current[pIdx]) return;
        autoTriggeredRef.current[pIdx] = true;

        TutorAgentTools.generate_ai_marked_exam_photo(reconciled, pageImageUri, pIdx)
          .then((aiUrl) => {
            if (aiUrl && !aiUrl.startsWith('ERROR:')) {
              page.marked_image_url = aiUrl;
              if (onUpdateAssessment) {
                onUpdateAssessment({ ...reconciled });
              }
            } else {
              autoTriggeredRef.current[pIdx] = false;
            }
          })
          .catch((err) => {
            console.warn(`generate_ai_marked_exam_photo background error for page ${pIdx}:`, err);
            autoTriggeredRef.current[pIdx] = false;
          });
      });
    }
  }, [safePageIndex, currentImageUri, reconciled, isMultiPage, pages, imageUris]);

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

  const activeImageSourceUri = showMarkings ? (aiMarkedImageUrl || currentImageUri) : currentImageUri;

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

        {/* Clear Inking Overlay — Informs student that marks are being rendered onto this page */}
        {showMarkings && !aiMarkedImageUrl && (
          <View pointerEvents="none" style={styles.markingOverlayContainer}>
            <View style={styles.markingOverlayCard}>
              <ActivityIndicator size="small" color="#DC2626" />
              <Text style={styles.markingOverlayTitle}>✍️ Applying Teacher Red Markings</Text>
              <Text style={styles.markingOverlayScore}>
                Page Score: {pageScore}/{pageMax} Marks Verified
              </Text>
              <Text style={styles.markingOverlaySubtitle}>
                Drawing authentic examiner ticks, crosses & handwritten corrections on Page {safePageIndex + 1}...
              </Text>
            </View>
          </View>
        )}

        {/* Floating controls at top right of the marked photo */}
        <View style={styles.floatingControls}>
          <TouchableOpacity
            style={styles.floatingBtn}
            onPress={() => setShowMarkings(!showMarkings)}
            accessibilityLabel="Toggle Markings"
          >
            <Ionicons
              name={showMarkings ? 'eye' : 'eye-off'}
              size={13}
              color="#FFFFFF"
            />
            <Text style={styles.floatingBtnText}>
              {showMarkings ? 'Marked' : 'Original'}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity
                style={styles.modalToggleBtn}
                onPress={() => setShowMarkings(!showMarkings)}
              >
                <Ionicons
                  name={showMarkings ? 'eye' : 'eye-off'}
                  size={15}
                  color="#0F172A"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.modalToggleBtnText}>
                  {showMarkings ? 'Marked' : 'Original'}
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
              {showMarkings && !aiMarkedImageUrl && isGeneratingMarkings && (
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
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  floatingBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
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
  underlineOverlayBox: {
    position: 'absolute',
    maxWidth: '85%',
  },
  redWavyLine: {
    height: 2,
    backgroundColor: '#DC2626',
    borderRadius: 1,
    marginBottom: 2,
    width: '100%',
    opacity: 0.85,
  },
  correctionNotePill: {
    backgroundColor: 'rgba(254, 242, 242, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.45)',
    alignSelf: 'flex-start',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  redPenCorrectionNote: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    fontStyle: 'italic',
  },
  totalStampBox: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#DC2626',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(254, 242, 242, 0.95)',
    transform: [{ rotate: '-3deg' }],
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  totalStampText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#DC2626',
    letterSpacing: 0.3,
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
  modalToggleBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
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

