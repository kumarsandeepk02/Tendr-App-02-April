const { agentCall } = require('../claudeService');

// Industry profiles — ported from client-side prompts.ts
const INDUSTRY_PROFILES = [
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

function detectIndustry(answers) {
  const allText = Object.values(answers).join(' ').toLowerCase();
  let bestMatch = null;
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

// All valid answer keys that can be referenced in contextKeys
const ALL_ANSWER_KEYS = [
  'doc_type', 'project_title', 'project_description',
  'requirements', 'evaluation_criteria', 'deadline', 'additional_sections',
];

// responseType: 'narrative' = context-setting prose, 'vendor_response' = structured questions vendors must answer
const DEFAULT_OUTLINE = [
  { title: 'Background / Project Overview', description: 'Context on the issuing organization and project purpose', contextKeys: ['project_title', 'project_description'], estimatedLength: 'medium', dependencies: [], responseType: 'narrative' },
  { title: 'Scope of Work', description: 'Detailed description of work to be performed', contextKeys: ['project_description', 'requirements'], estimatedLength: 'long', dependencies: [], responseType: 'narrative' },
  { title: 'Technical Requirements', description: 'Technical capabilities and specifications vendors must address', contextKeys: ['requirements'], estimatedLength: 'long', dependencies: [], responseType: 'vendor_response' },
  { title: 'Vendor Qualifications', description: 'Experience, certifications, and capabilities vendors must demonstrate', contextKeys: ['requirements', 'evaluation_criteria'], estimatedLength: 'medium', dependencies: [], responseType: 'vendor_response' },
  { title: 'Evaluation Criteria', description: 'How proposals will be scored and ranked', contextKeys: ['evaluation_criteria'], estimatedLength: 'medium', dependencies: [], responseType: 'narrative' },
  { title: 'Timeline & Milestones', description: 'Project schedule, key dates, and deliverable deadlines', contextKeys: ['deadline'], estimatedLength: 'short', dependencies: [], responseType: 'narrative' },
  { title: 'Submission Instructions', description: 'How, when, and where to submit responses', contextKeys: ['deadline'], estimatedLength: 'short', dependencies: [], responseType: 'narrative' },
  { title: 'Pricing & Commercial', description: 'Pricing structure, cost breakdown, and commercial terms vendors must provide', contextKeys: ['requirements', 'evaluation_criteria'], estimatedLength: 'long', dependencies: [], responseType: 'vendor_response' },
  { title: 'Terms & Conditions', description: 'Legal terms, contract conditions, and compliance requirements', contextKeys: ['additional_sections'], estimatedLength: 'medium', dependencies: [], responseType: 'narrative' },
];

/**
 * Generate a structured outline for the document.
 * If confirmedSections are provided, uses those (title + description) and adds metadata.
 * confirmedSections can be an array of strings (legacy) or objects {title, description}.
 * Otherwise, asks Claude for a tailored outline.
 */
async function generateOutline({ answers, fileContext, docType, confirmedSections, model }) {
  const industry = detectIndustry(answers || {});

  // If user already confirmed sections from the client-side outline, enrich with metadata
  if (confirmedSections && confirmedSections.length > 0) {
    return {
      outline: confirmedSections.map((section, i) => {
        // Support both string[] (legacy) and {title, description}[] formats
        const title = typeof section === 'string' ? section : section.title;
        const description = typeof section === 'string' ? '' : (section.description || '');
        const responseType = (typeof section === 'object' && section.responseType) || inferResponseType(title);
        return {
          title,
          description,
          contextKeys: inferContextKeys(title, answers),
          estimatedLength: inferLength(title),
          dependencies: [],
          responseType,
        };
      }),
      industry,
    };
  }

  // Build the prompt for Claude to generate a tailored outline
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';
  const industryContext = industry
    ? `Industry: ${industry.name}. Include industry-specific sections for: ${industry.sections.join(', ')}.`
    : 'No specific industry detected. Use general procurement sections.';

  let userPrompt = `Create a section outline for a ${docLabel} (${docType}) document.\n\n${industryContext}\n\nProject information:\n`;

  const fields = [
    { key: 'doc_type', label: 'Document Type' },
    { key: 'project_title', label: 'Project Title' },
    { key: 'project_description', label: 'Description' },
    { key: 'requirements', label: 'Key Requirements' },
    { key: 'evaluation_criteria', label: 'Evaluation Criteria' },
    { key: 'deadline', label: 'Submission Deadline' },
    { key: 'additional_sections', label: 'Additional Sections' },
  ];

  for (const { key, label } of fields) {
    const value = answers?.[key]?.trim();
    if (value && value !== '*(Skipped)*') {
      userPrompt += `- ${label}: ${value}\n`;
    }
  }

  if (fileContext) {
    userPrompt += `\nUploaded reference document (excerpt):\n${fileContext.substring(0, 4000)}\n`;
  }

  userPrompt += `
Return a JSON array of 7-12 section objects. Each object MUST have:
- "title": Section heading (e.g., "Scope of Work")
- "description": 2-3 sentences describing what this section will contain, incorporating SPECIFIC details from the project information above (not generic placeholders). Each description should preview the actual content that will be generated.
- "contextKeys": Array of relevant answer keys from: ${ALL_ANSWER_KEYS.join(', ')}
- "estimatedLength": "short" (under 200 words), "medium" (200-500 words), or "long" (500+ words)
- "dependencies": Array of section titles this section references (usually empty)
- "responseType": Either "narrative" or "vendor_response"

RESPONSE TYPE RULES — THIS IS CRITICAL:
- "narrative": Context-setting sections that vendors READ but don't respond to directly. Use for: Introduction, Background, Scope of Work, Evaluation Criteria, Timeline, Submission Instructions, Terms & Conditions.
- "vendor_response": Sections where vendors must RESPOND with specific, structured answers. Use for: Technical Requirements, Vendor Qualifications, Pricing/Commercial, Security & Compliance, Implementation Approach, Support & SLAs, and any domain-specific requirement sections.

The purpose of an RFP is to collect COMPARABLE responses from vendors. Sections marked "vendor_response" will be generated with numbered questions that all vendors must answer identically, enabling apples-to-apples comparison.

IMPORTANT RULES:
1. Each section description must contain substantive, project-specific content hints — not just generic one-liners.
2. Tailor sections to this specific project and industry. Do NOT use a generic template blindly.
3. Reference actual details from the project info (products, quantities, locations, timelines, etc.) in descriptions.
4. A well-structured RFP typically has 3-5 "narrative" sections and 4-6 "vendor_response" sections.

Return ONLY the JSON array, no other text.`;

  const systemPrompt = `You are an expert procurement document architect. Your job is to design the optimal section structure for procurement documents. Return ONLY valid JSON — no markdown fences, no explanations, just the array.`;

  try {
    const response = await agentCall(systemPrompt, userPrompt, { maxTokens: 2000, temperature: 0.3, model });

    // Parse JSON — handle possible markdown fences
    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) throw new Error('Not an array');

    // Validate and normalize
    const outline = parsed.map((item, i) => ({
      title: item.title || `Section ${i + 1}`,
      description: item.description || '',
      contextKeys: Array.isArray(item.contextKeys) ? item.contextKeys.filter(k => ALL_ANSWER_KEYS.includes(k)) : [],
      estimatedLength: ['short', 'medium', 'long'].includes(item.estimatedLength) ? item.estimatedLength : 'medium',
      dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
      responseType: ['narrative', 'vendor_response'].includes(item.responseType) ? item.responseType : inferResponseType(item.title || ''),
    }));

    return { outline, industry };
  } catch (err) {
    console.warn('Outline Architect failed, using default outline:', err.message);
    return { outline: DEFAULT_OUTLINE, industry };
  }
}

// Heuristic: infer which answer keys are relevant to a section title
function inferContextKeys(title, answers) {
  const lower = title.toLowerCase();
  const keys = [];

  if (lower.includes('background') || lower.includes('overview')) keys.push('project_title', 'project_description');
  if (lower.includes('scope') || lower.includes('requirement') || lower.includes('technical')) keys.push('requirements', 'project_description');
  if (lower.includes('vendor') || lower.includes('qualification')) keys.push('requirements', 'evaluation_criteria');
  if (lower.includes('evaluation') || lower.includes('criteria')) keys.push('evaluation_criteria');
  if (lower.includes('timeline') || lower.includes('milestone') || lower.includes('submission') || lower.includes('deadline')) keys.push('deadline');
  if (lower.includes('supplier') || lower.includes('response') || lower.includes('question')) keys.push('requirements', 'evaluation_criteria');
  if (lower.includes('terms') || lower.includes('condition') || lower.includes('compliance') || lower.includes('security')) keys.push('additional_sections');

  // Deduplicate
  return [...new Set(keys)].filter(k => ALL_ANSWER_KEYS.includes(k));
}

// Heuristic: infer whether vendors need to respond to this section
function inferResponseType(title) {
  const lower = title.toLowerCase();
  // Narrative sections — vendors read but don't respond directly
  const narrativePatterns = ['background', 'overview', 'introduction', 'scope of work', 'evaluation criteria', 'timeline', 'milestone', 'submission', 'terms', 'condition', 'instruction', 'schedule'];
  if (narrativePatterns.some(p => lower.includes(p))) return 'narrative';
  // Vendor response sections — vendors must answer
  return 'vendor_response';
}

// Heuristic: infer section length from title
function inferLength(title) {
  const lower = title.toLowerCase();
  if (lower.includes('scope') || lower.includes('technical') || lower.includes('supplier response') || lower.includes('question')) return 'long';
  if (lower.includes('submission') || lower.includes('timeline') || lower.includes('deadline')) return 'short';
  return 'medium';
}

module.exports = { generateOutline, detectIndustry, INDUSTRY_PROFILES };
