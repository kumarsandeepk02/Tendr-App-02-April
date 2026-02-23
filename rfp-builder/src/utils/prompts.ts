import { GuidedStep } from '../types';

export const WELCOME_MESSAGE =
  "👋 Welcome to **RFP Builder**! I'll help you create a professional procurement document in just a few minutes.\n\nLet's get started — you can answer each question or **skip** any you'd like to come back to.";

export const GUIDED_QUESTIONS: Record<GuidedStep, string> = {
  doc_type:
    "First up — are you creating an **RFI** (Request for Information) or an **RFP** (Request for Proposal)?",
  project_title: "Great! What's the **title** of your project?",
  project_description:
    'Can you give me a **brief description** of the project? A couple of sentences is perfect.',
  upload_scope:
    "📎 Do you have any **existing scope documents**, SOWs, project briefs, or previous RFPs that could help? Upload one below and I'll use it to craft better questions and sections.\n\nYou can also **skip** this and continue answering questions manually.",
  requirements:
    'What are your **key requirements** for suppliers? List as many as you need — I\'ll organize them into proper sections.',
  evaluation_criteria:
    'How will you **evaluate** the responses? For example: cost, experience, timeline, technical capability, references.',
  deadline:
    'What is the **submission deadline** for vendors? (e.g., "March 30, 2026" or "2 weeks from now")',
  additional_sections:
    'Are there any **additional sections** you\'d like to include? For example: security requirements, compliance, insurance, references. Type "none" if you\'re all set.',
  review:
    "Perfect! I have all the information I need. Click **Generate Document** below to create your complete procurement document, or upload a reference file first.",
};

export const GUIDED_STEP_ORDER: GuidedStep[] = [
  'doc_type',
  'project_title',
  'project_description',
  'upload_scope',
  'requirements',
  'evaluation_criteria',
  'deadline',
  'additional_sections',
  'review',
];

export function getNextGuidedStep(
  current: GuidedStep | null
): GuidedStep | null {
  if (!current) return 'doc_type';
  const idx = GUIDED_STEP_ORDER.indexOf(current);
  if (idx === -1 || idx >= GUIDED_STEP_ORDER.length - 1) return null;
  return GUIDED_STEP_ORDER[idx + 1];
}

/**
 * Build the system prompt addendum during Q&A phase.
 * This tells Claude the user is in Q&A and what step they're on.
 */
export function buildQuestionSystemAddendum(step: GuidedStep | null): string {
  if (step) {
    return `\n\nThe user is answering guided questions to build a procurement document. They are currently on step: "${step}". After they answer, acknowledge their input briefly (1-2 sentences max). Do NOT generate document sections yet. Do NOT ask the next question or suggest what comes next — the system handles question progression automatically. Just confirm you received their answer.`;
  }
  return '';
}

/**
 * Build the complete generation system prompt.
 * Used when all questions are answered (or skipped) and we need to generate the full document.
 */
export function buildGenerationSystemPrompt(docType: 'RFI' | 'RFP'): string {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  return `You are an expert procurement consultant generating a complete, professional ${docLabel} (${docType}) document.

CRITICAL FORMATTING RULES — follow these EXACTLY:

1. Use ## for top-level document sections (e.g. "## Background / Project Overview")
2. Use ### for subsections within each section (e.g. "### Technical Requirements")
3. For sections that request supplier responses, format questions as numbered lists:
   ### [Subsection Title]
   1. [Question for the supplier to answer]
   2. [Another question]
   3. [Continue as needed]

4. Include ALL of the following standard sections (customize based on the provided context):
   ## Background / Project Overview
   ## Scope of Work
   ## Technical Requirements
   ## Vendor Qualifications
   ## Evaluation Criteria
   ## Timeline & Milestones
   ## Submission Instructions
   ## Supplier Response Questions
   ## Terms & Conditions

5. The "Supplier Response Questions" section MUST be organized as:
   ### [Category Subsection]
   1. Question one
   2. Question two
   ...

   Include subsections for: Technical Capability, Experience & References, Pricing, Implementation Approach, Support & Maintenance, Compliance & Security.

6. Write thorough, professional procurement language. Each section should be substantive (not just placeholders).
7. Infer the industry or category from the project description and tailor the language, terminology, and section depth accordingly.
8. If information was not provided for a section, use reasonable professional defaults and note assumptions with [Note: ...].
9. Generate the COMPLETE document in a single response. Do not truncate or summarize.`;
}

/**
 * Build the user-facing prompt that contains all gathered answers for generation.
 */
export function buildGenerationPrompt(
  answers: Record<string, string>,
  fileContext?: string
): string {
  let prompt = 'Generate a complete procurement document based on the following information:\n\n';

  if (answers.doc_type) prompt += `- **Document Type:** ${answers.doc_type}\n`;
  if (answers.project_title) prompt += `- **Project Title:** ${answers.project_title}\n`;
  if (answers.project_description) prompt += `- **Description:** ${answers.project_description}\n`;
  if (answers.requirements) prompt += `- **Key Requirements:** ${answers.requirements}\n`;
  if (answers.evaluation_criteria) prompt += `- **Evaluation Criteria:** ${answers.evaluation_criteria}\n`;
  if (answers.deadline) prompt += `- **Submission Deadline:** ${answers.deadline}\n`;
  if (answers.additional_sections) prompt += `- **Additional Sections Requested:** ${answers.additional_sections}\n`;

  // Count how many were actually answered
  const answeredCount = Object.values(answers).filter((v) => v && v.trim()).length;
  const totalSteps = 7; // doc_type through additional_sections (industry removed)
  const skippedCount = totalSteps - answeredCount;

  if (skippedCount > 0) {
    prompt += `\n**Note:** ${skippedCount} question(s) were skipped. For those sections, use reasonable professional defaults.\n`;
  }

  if (fileContext) {
    prompt += `\n---\n**Additional context from uploaded document:**\n${fileContext.substring(0, 8000)}\n`;
  }

  prompt += '\nGenerate the complete document now with all standard sections, subsections, and supplier response questions.';

  return prompt;
}
