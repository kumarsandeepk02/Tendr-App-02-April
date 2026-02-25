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

// ===================== Industry Detection =====================

interface IndustryProfile {
  name: string;
  keywords: string[];
  sections: string[];
  complianceNotes: string[];
}

const INDUSTRY_PROFILES: IndustryProfile[] = [
  {
    name: 'Technology / Software',
    keywords: ['software', 'saas', 'cloud', 'api', 'platform', 'it ', 'technology', 'digital', 'data', 'cyber', 'devops', 'infrastructure'],
    sections: ['Technical Architecture & Integration', 'Data Security & Privacy', 'SLA & Uptime Requirements', 'Migration & Implementation Plan'],
    complianceNotes: ['SOC 2 Type II compliance', 'GDPR/CCPA data handling', 'ISO 27001 certification'],
  },
  {
    name: 'Healthcare',
    keywords: ['healthcare', 'hospital', 'clinical', 'patient', 'medical', 'hipaa', 'ehr', 'pharmaceutical', 'health'],
    sections: ['HIPAA Compliance Requirements', 'Clinical Workflow Integration', 'Patient Data Handling', 'Regulatory & Accreditation'],
    complianceNotes: ['HIPAA compliance mandatory', 'FDA regulations if applicable', 'HITRUST certification'],
  },
  {
    name: 'Construction / Engineering',
    keywords: ['construction', 'building', 'engineering', 'architect', 'contractor', 'civil', 'site', 'renovation'],
    sections: ['Safety & OSHA Compliance', 'Bonding & Insurance Requirements', 'Project Phasing & Milestones', 'Permitting & Regulatory'],
    complianceNotes: ['OSHA compliance requirements', 'Bonding requirements', 'Local permitting regulations'],
  },
  {
    name: 'Financial Services',
    keywords: ['financial', 'banking', 'insurance', 'fintech', 'investment', 'lending', 'payment', 'compliance'],
    sections: ['Regulatory Compliance', 'Data Encryption & Security', 'Audit Trail Requirements', 'Business Continuity & Disaster Recovery'],
    complianceNotes: ['SOX compliance', 'PCI DSS if payment data', 'State/federal regulatory requirements'],
  },
  {
    name: 'Government / Public Sector',
    keywords: ['government', 'federal', 'state', 'municipal', 'public sector', 'agency', 'procurement office'],
    sections: ['Small/Disadvantaged Business Participation', 'Section 508 Accessibility', 'FedRAMP Authorization', 'Protest & Dispute Procedures'],
    complianceNotes: ['FAR/DFAR compliance', 'Section 508 accessibility', 'FedRAMP if cloud services'],
  },
];

function detectIndustry(answers: Record<string, string>): IndustryProfile | null {
  const allText = Object.values(answers).join(' ').toLowerCase();

  let bestMatch: IndustryProfile | null = null;
  let bestScore = 0;

  for (const profile of INDUSTRY_PROFILES) {
    const score = profile.keywords.reduce((count, kw) => {
      return count + (allText.includes(kw) ? 1 : 0);
    }, 0);
    if (score > bestScore && score >= 2) {
      bestScore = score;
      bestMatch = profile;
    }
  }

  return bestMatch;
}

// ===================== Generation Prompts =====================

/**
 * Build the complete generation system prompt.
 * Dynamically adapts based on detected industry and optional confirmed outline.
 */
export function buildGenerationSystemPrompt(
  docType: 'RFI' | 'RFP',
  answers?: Record<string, string>,
  confirmedSections?: string[]
): string {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';
  const industry = answers ? detectIndustry(answers) : null;

  const industryContext = industry
    ? `\nDETECTED INDUSTRY: ${industry.name}\n- Tailor all language, terminology, and examples to this industry.\n- Include these industry-specific sections if not already covered: ${industry.sections.join(', ')}.\n- Reference applicable compliance frameworks: ${industry.complianceNotes.join('; ')}.\n`
    : '\nNo specific industry detected. Use general-purpose procurement language and include broadly applicable sections.\n';

  // Determine sections list
  let sectionsBlock: string;
  if (confirmedSections && confirmedSections.length > 0) {
    // Use the user-approved outline
    const sectionsList = confirmedSections.map((s) => `   ## ${s}`).join('\n');
    sectionsBlock = `4. Generate EXACTLY the following sections in this order (approved by the user):\n${sectionsList}\n`;
  } else {
    // Default sections
    sectionsBlock = `4. Include ALL of the following standard sections (customize based on provided context):
   ## Background / Project Overview
   ## Scope of Work
   ## Technical Requirements
   ## Vendor Qualifications
   ## Evaluation Criteria
   ## Timeline & Milestones
   ## Submission Instructions
   ## Supplier Response Questions
   ## Terms & Conditions\n`;
  }

  return `You are an expert procurement consultant generating a complete, professional ${docLabel} (${docType}) document.
${industryContext}
PROCUREMENT LANGUAGE STANDARDS:
- Use "shall" for mandatory requirements the vendor must meet.
- Use "should" for strongly preferred but non-mandatory items.
- Use "may" for optional or discretionary items.
- Be specific and quantifiable wherever possible (e.g., "shall respond within 4 business hours" not "shall respond promptly").
- Flag any assumptions clearly with [Assumption: <reasoning>].

CRITICAL FORMATTING RULES — follow these EXACTLY:

1. Use ## for top-level document sections.
2. Use ### for subsections within each section.
3. For sections that request supplier responses, format questions as numbered lists:
   ### [Subsection Title]
   1. [Question for the supplier to answer]
   2. [Another question]

${sectionsBlock}
5. The "Supplier Response Questions" section MUST be organized as:
   ### [Category Subsection]
   1. Question one
   2. Question two
   ...
   Include subsections for: Technical Capability, Experience & References, Pricing, Implementation Approach, Support & Maintenance, Compliance & Security.

6. Write thorough, publication-ready procurement language. Each section must be substantive — no placeholders.
7. Generate the COMPLETE document in a single response. Do not truncate or summarize.`;
}

/**
 * Build the user-facing prompt that contains all gathered answers for generation.
 * Explicitly marks provided vs. skipped fields for better Claude output.
 */
export function buildGenerationPrompt(
  answers: Record<string, string>,
  fileContext?: string
): string {
  let prompt = 'Generate a complete procurement document based on the following information:\n\n';

  const fields: { key: string; label: string }[] = [
    { key: 'doc_type', label: 'Document Type' },
    { key: 'project_title', label: 'Project Title' },
    { key: 'project_description', label: 'Description' },
    { key: 'requirements', label: 'Key Requirements' },
    { key: 'evaluation_criteria', label: 'Evaluation Criteria' },
    { key: 'deadline', label: 'Submission Deadline' },
    { key: 'additional_sections', label: 'Additional Sections Requested' },
  ];

  const answered: string[] = [];
  const skipped: string[] = [];

  for (const { key, label } of fields) {
    const value = answers[key]?.trim();
    if (value && value !== '*(Skipped)*') {
      answered.push(`- **${label}:** ${value}`);
    } else {
      skipped.push(label);
    }
  }

  if (answered.length > 0) {
    prompt += '### Provided Information\n';
    prompt += answered.join('\n') + '\n\n';
  }

  if (skipped.length > 0) {
    prompt += '### Skipped Fields (use professional defaults)\n';
    prompt += 'The following fields were skipped by the user. For each, infer reasonable defaults from the provided context and flag assumptions with [Assumption: ...]:\n';
    prompt += skipped.map((s) => `- ${s}`).join('\n') + '\n\n';
  }

  if (fileContext) {
    prompt += '### Uploaded Reference Document\n';
    prompt += 'The user uploaded the following document. Extract relevant scope details, requirements, constraints, timelines, and compliance mentions. Incorporate them into the appropriate sections. Do not reproduce the document verbatim — synthesize and adapt the information.\n\n';
    prompt += '```\n' + fileContext.substring(0, 8000) + '\n```\n\n';
  }

  prompt += 'Generate the complete document now with all required sections, subsections, and supplier response questions.';

  return prompt;
}

// ===================== Outline Prompt =====================

/**
 * Build the prompt for generating a section outline (used before full document generation).
 * Returns a prompt that asks Claude for a JSON array of proposed sections.
 */
export function buildOutlinePrompt(
  answers: Record<string, string>,
  fileContext?: string
): string {
  let prompt = 'Based on the following project information, propose a section outline for the procurement document.\n\n';

  const fields: { key: string; label: string }[] = [
    { key: 'doc_type', label: 'Document Type' },
    { key: 'project_title', label: 'Project Title' },
    { key: 'project_description', label: 'Description' },
    { key: 'requirements', label: 'Key Requirements' },
    { key: 'evaluation_criteria', label: 'Evaluation Criteria' },
    { key: 'deadline', label: 'Submission Deadline' },
    { key: 'additional_sections', label: 'Additional Sections Requested' },
  ];

  for (const { key, label } of fields) {
    const value = answers[key]?.trim();
    if (value && value !== '*(Skipped)*') {
      prompt += `- **${label}:** ${value}\n`;
    }
  }

  if (fileContext) {
    prompt += `\n**Uploaded document context (excerpt):**\n${fileContext.substring(0, 4000)}\n`;
  }

  prompt += `
Return a JSON array of section objects. Each object should have:
- "title": The section heading (e.g., "Background / Project Overview")
- "description": A 1-sentence description of what this section will contain

Include 7-12 sections appropriate for this specific project. Tailor the sections to the project type and industry — do not use a generic template.

Return ONLY the JSON array, no other text. Example format:
[{"title": "Background / Project Overview", "description": "Provides context on the issuing organization and project purpose."}]`;

  return prompt;
}
