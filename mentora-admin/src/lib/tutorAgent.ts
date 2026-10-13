export type LearningMode = 'similar_example' | 'hints' | 'attempt' | 'solution';

export type LearningStage = 
  | 'START'
  | 'QUESTION_IDENTIFICATION'
  | 'LEARNING_MODE_SELECTION'
  | 'SIMILAR_EXAMPLE'
  | 'HINT_MODE'
  | 'WAITING_FOR_ATTEMPT'
  | 'ASSESSING_ATTEMPT'
  | 'PROVIDING_FEEDBACK'
  | 'RETURNING_TO_ORIGINAL'
  | 'FINAL_ATTEMPT'
  | 'COMPLETED';

export interface MarkingPointItem {
  point_number: number;
  criterion: string;
  mark_code?: 'B1' | 'M1' | 'A1' | 'C1' | '1 mark' | string;
  is_earned: boolean;
  student_phrase?: string;
  inline_location?: string;
  box_2d?: [number, number, number, number];
  tick_or_cross?: 'tick' | 'cross';
  constructive_correction?: string;
  page_index?: number;
}

export interface AssessmentSubpart {
  part_label: string;
  part_title?: string;
  official_mark_scheme_criteria?: string;
  line_y?: number;
  exact_location?: string;
  teacher_correction?: string;
  teacher_correction_note?: string;
  constructive_correction?: string;
  mistake_details?: string;
  red_pen_action?: string;
  score: number;
  max_score: number;
  student_answer_detected?: string;
  misconception_analysis?: string;
  how_to_improve?: string;
  marking_points?: MarkingPointItem[];
  marks_awarded: string[];
  deductions: string[];
  feedback: string;
  page_index?: number;
}

export interface MarkingAction {
  target_subpart?: string;
  type: 'tick' | 'cross' | 'inline_tick' | 'underline_correction' | 'margin_mark';
  location_on_page: string;
  mark_text?: string;
  correction_note?: string;
  red_pen_action?: string;
  page_index?: number;
}

export interface VisualAnnotation {
  type: 'tick' | 'cross' | 'inline_tick' | 'underline' | 'mark_badge' | 'total_header' | 'comment';
  text?: string;
  comment?: string;
  teacher_correction?: string;
  box_2d: [number, number, number, number];
  subpart_label?: string;
  page_index?: number;
  bbox?: { x: number; y: number; width: number; height: number };
  target_id?: string;
  connector?: { from: { x: number; y: number }; to: { x: number; y: number } } | null;
  confidence?: number;
  is_flagged_for_review?: boolean;
}

export interface ScriptPageEvaluation {
  page_index: number;
  original_image_url: string;
  marked_image_url?: string;
  is_generating_image?: boolean;
  page_score: number;
  page_max_score: number;
  questions_present: string[];
  annotations: VisualAnnotation[];
  subparts?: AssessmentSubpart[];
}

export interface QuestionSummary {
  question_number: string;
  topic?: string;
  score: number;
  max_score: number;
  percentage: number;
  spanned_pages: number[];
  subparts: AssessmentSubpart[];
}

export interface AssessmentResult {
  score: number;
  max_score: number;
  percentage: number;
  identified_question_number?: string;
  identified_topic?: string;
  total_score?: number;
  total_max_score?: number;
  subparts?: AssessmentSubpart[];
  marking_actions?: MarkingAction[];
  marking_instructions_for_image_editor?: string;
  annotations?: VisualAnnotation[];
  pages?: ScriptPageEvaluation[];
  question_summaries?: QuestionSummary[];
  generated_marked_image_url?: string;
  is_generating_image?: boolean;
  model_used?: string;
  overall_feedback?: string;
  examiner_model_solution?: string;
  correct_points?: string[];
  incorrect_points?: string[];
  missing_points?: string[];
  mistakes?: string[];
  feedback?: string;
}
