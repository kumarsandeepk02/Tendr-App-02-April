const { agentCall } = require('../claudeService');

/**
 * Generate a structured outline for the document.
 * If confirmedSections are provided, enriches them with metadata.
 * Otherwise asks Claude for a tailored outline.
 *
 * Industry detection, response type, and length estimation are all
 * delegated to Claude — no hardcoded heuristics.
 */
async function generateOutline({ answers, fileContext, docType, confirmedSections, model }) {
  // If user already confirmed sections from the brief, ask Claude to enrich them
  if (confirmedSections && confirmedSections.length > 0) {
    const enriched = await enrichConfirmedSections(confirmedSections, answers, fileContext, docType, model);
    return enriched;
  }

  // No confirmed sections — ask Claude for a full outline
  return await generateFullOutline(answers, fileContext, docType, model);
}

/**
 * Enrich user-confirmed sections with metadata (responseType, length, industry).
 * Claude decides everything — no keyword matching.
 */
async function enrichConfirmedSections(confirmedSections, answers, fileContext, docType, model) {
  const sections = confirmedSections.map((s) => {
    const title = typeof s === 'string' ? s : s.title;
    const description = typeof s === 'string' ? '' : (s.description || '');
    const responseType = typeof s === 'object' && s.responseType ? s.responseType : null;
    return { title, description, responseType };
  });

  const sectionList = sections.map((s, i) => `${i + 1}. "${s.title}"${s.description ? ` — ${s.description}` : ''}`).join('\n');

  let prompt = `Given these confirmed sections for a ${docType} document, return a JSON object with two fields:

1. "industry": An object describing the detected industry with:
   - "name": Industry name (e.g., "Technology / Software", "Healthcare", "Construction")
   - "complianceNotes": Array of relevant compliance frameworks
   - "sections": Array of industry-specific section suggestions (for reference only)
   Or null if no specific industry is detected.

2. "sections": An array enriching each section with:
   - "title": The section title (keep as-is)
   - "description": The section description (keep as-is)
   - "estimatedLength": "short" (under 200 words), "medium" (200-500), or "long" (500+)
   - "responseType": "narrative" (context vendors read) or "vendor_response" (questions vendors answer)
   - "contextKeys": Empty array (not used)
   - "dependencies": Empty array

Sections:\n${sectionList}

Project info:\n`;

  const briefFields = ['projectTitle', 'projectDescription', 'requirements', 'evaluationCriteria', 'timeline', 'industry', 'docType'];
  for (const key of briefFields) {
    const val = answers?.[key];
    if (val && typeof val === 'string' && val.trim()) {
      prompt += `- ${key}: ${val}\n`;
    } else if (Array.isArray(val) && val.length > 0) {
      prompt += `- ${key}: ${val.join('; ')}\n`;
    }
  }

  if (fileContext) {
    prompt += `\nReference document excerpt:\n${fileContext.substring(0, 3000)}\n`;
  }

  prompt += '\nReturn ONLY valid JSON — no markdown fences.';

  try {
    const response = await agentCall(
      'You are a procurement document architect. Analyze the project and return structured metadata. Return ONLY valid JSON.',
      prompt,
      { maxTokens: 1500, temperature: 0.2, model }
    );

    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    const industry = parsed.industry || null;

    const outline = (parsed.sections || sections).map((item, i) => ({
      title: item.title || sections[i]?.title || `Section ${i + 1}`,
      description: item.description || sections[i]?.description || '',
      contextKeys: [],
      estimatedLength: ['short', 'medium', 'long'].includes(item.estimatedLength) ? item.estimatedLength : 'medium',
      dependencies: [],
      responseType: sections[i]?.responseType || (['narrative', 'vendor_response'].includes(item.responseType) ? item.responseType : 'narrative'),
    }));

    return { outline, industry };
  } catch (err) {
    console.warn('Section enrichment failed, using defaults:', err.message);
    return {
      outline: sections.map((s) => ({
        title: s.title,
        description: s.description,
        contextKeys: [],
        estimatedLength: 'medium',
        dependencies: [],
        responseType: s.responseType || 'narrative',
      })),
      industry: null,
    };
  }
}

/**
 * Generate a full outline from scratch using Claude.
 */
async function generateFullOutline(answers, fileContext, docType, model) {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  let userPrompt = `Create a section outline for a ${docLabel} (${docType}) document.\n\nProject information:\n`;

  const fields = [
    { key: 'doc_type', label: 'Document Type' },
    { key: 'project_title', label: 'Project Title' },
    { key: 'projectTitle', label: 'Project Title' },
    { key: 'project_description', label: 'Description' },
    { key: 'projectDescription', label: 'Description' },
    { key: 'requirements', label: 'Key Requirements' },
    { key: 'evaluation_criteria', label: 'Evaluation Criteria' },
    { key: 'evaluationCriteria', label: 'Evaluation Criteria' },
    { key: 'deadline', label: 'Submission Deadline' },
    { key: 'timeline', label: 'Timeline' },
    { key: 'industry', label: 'Industry' },
    { key: 'additional_sections', label: 'Additional Sections' },
    { key: 'additionalContext', label: 'Additional Context' },
  ];

  const seen = new Set();
  for (const { key, label } of fields) {
    const value = answers?.[key];
    if (!value || seen.has(label)) continue;
    const text = Array.isArray(value) ? value.join('; ') : String(value).trim();
    if (text && text !== '*(Skipped)*') {
      userPrompt += `- ${label}: ${text}\n`;
      seen.add(label);
    }
  }

  if (fileContext) {
    userPrompt += `\nUploaded reference document (excerpt):\n${fileContext.substring(0, 4000)}\n`;
  }

  userPrompt += `
Return a JSON object with two fields:

1. "industry": An object with:
   - "name": Detected industry (e.g., "Technology", "Healthcare", "General")
   - "complianceNotes": Array of relevant compliance/regulatory frameworks
   - "sections": Array of industry-specific section suggestions
   Or null if no specific industry is apparent.

2. "sections": Array of 7-12 section objects, each with:
   - "title": Section heading
   - "description": 2-3 sentences with SPECIFIC details from the project info above
   - "estimatedLength": "short", "medium", or "long"
   - "dependencies": Array of section titles this references (usually empty)
   - "responseType": "narrative" or "vendor_response"

RESPONSE TYPE RULES:
- "narrative": Sections vendors READ (Background, Scope, Evaluation Criteria, Timeline, Terms)
- "vendor_response": Sections vendors RESPOND to with structured answers (Technical Requirements, Qualifications, Pricing, Security)

A good ${docType} has 3-5 narrative + 4-6 vendor_response sections.
Reference actual project details in descriptions — no generic placeholders.
Return ONLY valid JSON.`;

  try {
    const response = await agentCall(
      'You are an expert procurement document architect. Design optimal section structures. Return ONLY valid JSON — no markdown fences.',
      userPrompt,
      { maxTokens: 2000, temperature: 0.3, model }
    );

    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    const parsed = JSON.parse(jsonStr);
    const industry = parsed.industry || null;

    const outline = (parsed.sections || []).map((item, i) => ({
      title: item.title || `Section ${i + 1}`,
      description: item.description || '',
      contextKeys: [],
      estimatedLength: ['short', 'medium', 'long'].includes(item.estimatedLength) ? item.estimatedLength : 'medium',
      dependencies: Array.isArray(item.dependencies) ? item.dependencies : [],
      responseType: ['narrative', 'vendor_response'].includes(item.responseType) ? item.responseType : 'narrative',
    }));

    return { outline, industry };
  } catch (err) {
    console.warn('Outline generation failed:', err.message);
    // Minimal fallback — just the basics
    return {
      outline: [
        { title: 'Background & Overview', description: '', contextKeys: [], estimatedLength: 'medium', dependencies: [], responseType: 'narrative' },
        { title: 'Scope of Work', description: '', contextKeys: [], estimatedLength: 'long', dependencies: [], responseType: 'narrative' },
        { title: 'Requirements', description: '', contextKeys: [], estimatedLength: 'long', dependencies: [], responseType: 'vendor_response' },
        { title: 'Vendor Qualifications', description: '', contextKeys: [], estimatedLength: 'medium', dependencies: [], responseType: 'vendor_response' },
        { title: 'Evaluation Criteria', description: '', contextKeys: [], estimatedLength: 'medium', dependencies: [], responseType: 'narrative' },
        { title: 'Timeline', description: '', contextKeys: [], estimatedLength: 'short', dependencies: [], responseType: 'narrative' },
        { title: 'Pricing', description: '', contextKeys: [], estimatedLength: 'long', dependencies: [], responseType: 'vendor_response' },
        { title: 'Submission Instructions', description: '', contextKeys: [], estimatedLength: 'short', dependencies: [], responseType: 'narrative' },
      ],
      industry: null,
    };
  }
}

module.exports = { generateOutline };
