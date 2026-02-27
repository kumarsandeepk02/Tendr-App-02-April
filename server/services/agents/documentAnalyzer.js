const { agentCall } = require('../claudeService');

const ANALYZER_SYSTEM_PROMPT = `You are a procurement document analyst. Your job is to cross-reference uploaded reference documents with the generated RFP/RFI sections and identify gaps, conflicts, and enrichment opportunities.

You MUST return ONLY valid JSON with this exact structure:
{
  "gaps": [
    { "source": "<which reference document>", "requirement": "<requirement mentioned in the reference doc>", "suggestedSection": "<which generated section should cover this>" }
  ],
  "conflicts": [
    { "doc1": "<first document>", "doc2": "<second document or generated section>", "description": "<what conflicts>" }
  ],
  "enrichments": [
    { "section": "<generated section title>", "suggestion": "<what specific detail to add>", "sourceDoc": "<which reference doc has this info>" }
  ]
}

ANALYSIS RULES:
1. For gaps: Identify requirements, constraints, compliance items, or deliverables mentioned in reference docs but NOT covered in any generated section.
2. For conflicts: Find contradictions between reference docs OR between reference docs and generated content (e.g., different timelines, conflicting requirements).
3. For enrichments: Find specific details, metrics, or context in reference docs that could strengthen a generated section.
4. Be specific and actionable — vague suggestions are not helpful.
5. Limit to the most impactful findings (max 5 per category).

Return ONLY the JSON object, no other text.`;

/**
 * Analyze uploaded documents against generated sections.
 * Runs async (fire-and-forget) after document generation.
 *
 * @param {Object} config
 * @param {Array<{name: string, text: string}>} config.documents Uploaded reference documents
 * @param {Array<{title: string, content: string}>} config.generatedSections Generated document sections
 * @param {string} config.docType 'RFI' or 'RFP'
 * @param {Object} config.answers Gathered answers from the user
 * @returns {Promise<Object|null>} Analysis result or null on failure
 */
async function analyzeDocuments({ documents, generatedSections, docType, answers, model }) {
  if (!documents || documents.length < 1 || !generatedSections || generatedSections.length === 0) {
    return null;
  }

  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  let userPrompt = `Cross-reference the following reference documents with the generated ${docLabel} sections.\n\n`;

  // Include reference documents (truncated)
  userPrompt += `## Reference Documents\n\n`;
  documents.forEach((doc, i) => {
    const truncated = doc.text.length > 6000 ? doc.text.substring(0, 6000) + '\n[truncated]' : doc.text;
    userPrompt += `### Document ${i + 1}: ${doc.name}\n${truncated}\n\n`;
  });

  // Include generated sections (titles + first 500 chars each)
  userPrompt += `## Generated ${docType} Sections\n\n`;
  generatedSections.forEach((section) => {
    const preview = section.content.length > 500 ? section.content.substring(0, 500) + '...' : section.content;
    userPrompt += `### ${section.title}\n${preview}\n\n`;
  });

  // Include original user answers for context
  const answerEntries = Object.entries(answers || {});
  if (answerEntries.length > 0) {
    userPrompt += `## Original User Inputs\n`;
    for (const [key, value] of answerEntries) {
      if (value && value !== '*(Skipped)*') {
        userPrompt += `- ${key}: ${value}\n`;
      }
    }
    userPrompt += '\n';
  }

  userPrompt += `Provide your cross-reference analysis as JSON.`;

  try {
    const response = await agentCall(ANALYZER_SYSTEM_PROMPT, userPrompt, { maxTokens: 2000, temperature: 0.2, model });

    // Parse JSON — handle possible markdown fences
    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const objMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objMatch) {
      jsonStr = objMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps.slice(0, 5).map(g => ({
        source: g.source || 'Reference document',
        requirement: g.requirement || '',
        suggestedSection: g.suggestedSection || 'General',
      })) : [],
      conflicts: Array.isArray(parsed.conflicts) ? parsed.conflicts.slice(0, 5).map(c => ({
        doc1: c.doc1 || '',
        doc2: c.doc2 || '',
        description: c.description || '',
      })) : [],
      enrichments: Array.isArray(parsed.enrichments) ? parsed.enrichments.slice(0, 5).map(e => ({
        section: e.section || '',
        suggestion: e.suggestion || '',
        sourceDoc: e.sourceDoc || '',
      })) : [],
    };
  } catch (err) {
    console.warn('Document Analyzer failed:', err.message);
    return null;
  }
}

module.exports = { analyzeDocuments };
