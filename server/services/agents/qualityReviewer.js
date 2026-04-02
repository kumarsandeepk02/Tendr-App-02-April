const { agentCall } = require('../claudeService');
const { repairAndParse } = require('../security/jsonRepair');

const REVIEW_SYSTEM_PROMPT = `You are a senior procurement quality reviewer. Your job is to analyze a completed RFI/RFP document and identify issues, inconsistencies, and missing elements.

You MUST return ONLY valid JSON with this exact structure:
{
  "score": <number 0-100>,
  "issues": [
    { "section": "<section title>", "severity": "error|warning|info", "message": "<specific actionable feedback>" }
  ],
  "consistencyNotes": ["<note about cross-section consistency>"],
  "missingElements": ["<element that should be present but isn't>"]
}

SCORING GUIDE:
- 90-100: Publication-ready, professional quality
- 80-89: Good quality, minor improvements possible
- 70-79: Adequate but needs revision in some areas
- 60-69: Below standard, several sections need work
- Below 60: Major issues, significant revision needed

SEVERITY LEVELS:
- "error": Must fix before sending (e.g., missing mandatory section, contradictory requirements)
- "warning": Should fix for quality (e.g., vague language, missing metrics)
- "info": Optional improvement (e.g., could add more detail, formatting suggestion)

CHECK FOR:
1. Procurement language: proper use of "shall/should/may"
2. Specificity: quantifiable requirements vs vague language ("as needed", "appropriate")
3. Completeness: all standard sections present, no empty stubs
4. Consistency: tone, terminology, and formatting uniform across sections
5. Compliance references: appropriate for the industry
6. Assumptions flagged: any inferred content marked with [Assumption: ...]
7. Supplier questions: well-structured, actionable, not redundant

Return ONLY the JSON object, no other text.`;

/**
 * Review a completed document and return structured quality feedback.
 * This runs async — it should not block document display.
 *
 * @param {Object} config
 * @param {string} config.fullDocument The complete markdown document
 * @param {Object} config.answers Gathered answers from the user
 * @param {string} config.docType 'RFI' or 'RFP'
 * @param {Object|null} config.industryProfile Detected industry profile
 * @returns {Promise<Object|null>} Quality review result or null on failure
 */
async function reviewDocument({ fullDocument, answers, docType, industryProfile, model }) {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  let userPrompt = `Review this ${docLabel} (${docType}) document for quality and completeness.\n\n`;

  if (industryProfile) {
    userPrompt += `Expected industry: ${industryProfile.name}\n`;
    userPrompt += `Expected compliance frameworks: ${industryProfile.complianceNotes.join(', ')}\n\n`;
  }

  // Include original answers for reference
  const answerEntries = Object.entries(answers || {});
  if (answerEntries.length > 0) {
    userPrompt += `Original user inputs:\n`;
    for (const [key, value] of answerEntries) {
      if (value && value !== '*(Skipped)*') {
        userPrompt += `- ${key}: ${value}\n`;
      }
    }
    userPrompt += '\n';
  }

  // Truncate document if very long (keep under token limits)
  const truncatedDoc = fullDocument.length > 20000
    ? fullDocument.substring(0, 20000) + '\n\n[Document truncated for review — only first 20,000 characters reviewed]'
    : fullDocument;

  userPrompt += `DOCUMENT TO REVIEW:\n\n${truncatedDoc}\n\nProvide your quality review as JSON.`;

  try {
    const response = await agentCall(REVIEW_SYSTEM_PROMPT, userPrompt, { maxTokens: 4000, temperature: 0.2, model });

    // Parse JSON — handle possible markdown fences
    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = repairAndParse(jsonStr);
    if (!parsed) throw new Error('Could not parse quality review JSON');

    // Validate structure
    return {
      score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, parsed.score)) : 70,
      issues: Array.isArray(parsed.issues) ? parsed.issues.map(issue => ({
        section: issue.section || 'General',
        severity: ['error', 'warning', 'info'].includes(issue.severity) ? issue.severity : 'info',
        message: issue.message || '',
      })) : [],
      consistencyNotes: Array.isArray(parsed.consistencyNotes) ? parsed.consistencyNotes : [],
      missingElements: Array.isArray(parsed.missingElements) ? parsed.missingElements : [],
    };
  } catch (err) {
    console.warn('Quality Reviewer failed:', err.message);
    return null;
  }
}

module.exports = { reviewDocument };
