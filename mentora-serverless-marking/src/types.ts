export interface SubpartGrade {
  part_label: string;
  question_number?: string;
  marks_awarded: number;
  max_marks: number;
  status: 'correct' | 'partially_correct' | 'incorrect';
  feedback: string;
  examiner_note?: string;
  deductions?: string;
}

export interface QuestionSummary {
  question_number: string;
  topic: string;
  score: number;
  max_score: number;
  percentage: number;
  subparts: SubpartGrade[];
  overall_comment?: string;
}

export interface PaperAssessmentResult {
  total_score: number;
  max_score: number;
  percentage: number;
  overall_feedback: string;
  identified_question_number?: string;
  identified_topic?: string;
  subparts?: SubpartGrade[];
  question_summaries?: QuestionSummary[];
  pages?: {
    original_image_url: string;
    marked_image_url?: string;
    page_index: number;
  }[];
}

export interface ServerlessMarkingRequest {
  originalImageUrl: string;
  pageIndex: number;
  assessmentResult: PaperAssessmentResult;
  provider?: 'fal' | 'replicate';
  denoiseStrength?: number;
}

export interface ServerlessMarkingResponse {
  markedImageUrl: string;
  providerUsed: string;
  inferenceTimeMs: number;
  estimatedCostUsd: number;
}
