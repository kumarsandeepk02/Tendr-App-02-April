// ===================== Chat Types =====================

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
  isLoading?: boolean;
  isError?: boolean;
  isOutline?: boolean;
}

export interface OutlineSection {
  id: string;
  title: string;
  description: string;
  included: boolean;
  order: number;
}

export type UnifiedFlowPhase = 'questions' | 'upload_prompt' | 'outline_review' | 'generating' | 'done';

export type GuidedStep =
  | 'doc_type'
  | 'project_title'
  | 'project_description'
  | 'upload_scope'
  | 'requirements'
  | 'evaluation_criteria'
  | 'deadline'
  | 'additional_sections'
  | 'review';

export interface ChatState {
  messages: ChatMessage[];
  guidedStep: GuidedStep | null;
  phase: UnifiedFlowPhase;
  isTyping: boolean;
  error: string | null;
}

// ===================== Document Types =====================

export interface DocumentSection {
  id: string;
  title: string;
  content: string;
  order: number;
  isEditing?: boolean;
}

export type DocumentType = 'RFI' | 'RFP';

export interface DocumentMeta {
  type: DocumentType;
  projectTitle: string;
  projectDescription: string;
  industry: string;
  issuingOrganization: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocumentState {
  meta: DocumentMeta;
  sections: DocumentSection[];
}

// ===================== API Types =====================

export interface ChatApiRequest {
  messages: { role: ChatRole; content: string }[];
  systemPrompt?: string;
}

export interface ChatApiResponse {
  content: string;
  sections?: DocumentSection[];
}

export interface UploadApiResponse {
  text: string;
  suggestions: SectionSuggestion[];
}

export interface SectionSuggestion {
  id: string;
  title: string;
  content: string;
  accepted?: boolean;
}

// ===================== Draft / Storage Types =====================

export interface Draft {
  chatState: {
    messages: ChatMessage[];
    guidedStep: GuidedStep | null;
    phase: UnifiedFlowPhase;
    gatheredAnswers?: Record<string, string>;
    uploadedFileText?: string;
    outlineSections?: OutlineSection[];
  };
  documentState: DocumentState;
  savedAt: number;
}

export interface FeedbackEntry {
  timestamp: number;
  rating: 'positive' | 'negative';
}

// ===================== Project / Multi-Draft Types =====================

export type ProjectStatus = 'draft' | 'completed';

export interface ProjectMeta {
  id: string;
  title: string;
  status: ProjectStatus;
  documentType: DocumentType;
  phase: UnifiedFlowPhase;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectIndex {
  version: number;
  activeProjectId: string | null;
  projects: ProjectMeta[];
}

// ===================== Pipeline Types =====================

export type PipelineEventType = 'section_start' | 'text' | 'section_done' | 'done' | 'review' | 'error';

export interface PipelineEvent {
  type: PipelineEventType;
  content?: string;
  title?: string;
  index?: number;
  total?: number;
}

export interface ReviewIssue {
  section: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

export interface QualityReview {
  score: number;
  issues: ReviewIssue[];
  consistencyNotes: string[];
  missingElements: string[];
}

export interface SectionProgress {
  title: string;
  index: number;
  total: number;
}

// ===================== Onboarding =====================

export type OnboardingStep = 1 | 2 | 3;
