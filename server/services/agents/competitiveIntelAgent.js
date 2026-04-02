const { agentCall } = require('../claudeService');
const { repairAndParse } = require('../security/jsonRepair');

const INTEL_SYSTEM_PROMPT = `You are a procurement market analyst with deep knowledge of industry benchmarks, standards, and risk factors. Based on the project context and industry, provide competitive intelligence that will make the procurement document more rigorous and well-informed.

You MUST return ONLY valid JSON with this exact structure:
{
  "industryBenchmarks": [
    { "metric": "<what is being measured>", "benchmark": "<the standard/typical value>", "source": "<where this benchmark comes from>" }
  ],
  "marketStandards": [
    { "standard": "<name of standard or practice>", "relevance": "<why it matters for this project>", "applicableSection": "<which document section should reference this>" }
  ],
  "riskFactors": [
    { "category": "<risk category>", "risk": "<specific risk description>", "mitigation": "<how to mitigate in the procurement document>" }
  ],
  "suggestedRequirements": [
    { "requirement": "<specific requirement to add>", "rationale": "<why this should be included>", "targetSection": "<which section should include this>" }
  ]
}

GUIDELINES:
1. Industry Benchmarks: Provide realistic, industry-standard metrics (SLAs, response times, uptime percentages, pricing ranges, delivery timelines).
2. Market Standards: Reference relevant certifications, frameworks, and compliance standards (ISO, SOC, NIST, OSHA, etc.).
3. Risk Factors: Identify procurement-specific risks (vendor lock-in, scope creep, compliance gaps, data security, transition risks).
4. Suggested Requirements: Propose specific, quantifiable requirements that strengthen the document.
5. Tailor everything to the specific project type and industry detected.
6. Limit to 3-4 items per category for focus.

Return ONLY the JSON object, no other text.`;

/**
 * Generate competitive intelligence based on project context and industry.
 * Runs async — should not block document generation.
 *
 * @param {Object} config
 * @param {string} config.docType 'RFI' or 'RFP'
 * @param {Object} config.answers Gathered answers from the user
 * @param {Object|null} config.industryProfile Detected industry profile
 * @returns {Promise<Object|null>} Competitive intelligence or null on failure
 */
async function generateCompetitiveIntel({ docType, answers, industryProfile, model }) {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  let userPrompt = `Provide competitive intelligence for a ${docLabel} (${docType}) with the following context:\n\n`;

  if (industryProfile) {
    userPrompt += `**Detected Industry:** ${industryProfile.name}\n`;
    userPrompt += `**Industry Sections:** ${industryProfile.sections.join(', ')}\n`;
    userPrompt += `**Compliance Frameworks:** ${industryProfile.complianceNotes.join(', ')}\n\n`;
  } else {
    userPrompt += `**Industry:** General / not specifically detected\n\n`;
  }

  // Include user answers for context
  const answerEntries = Object.entries(answers || {});
  if (answerEntries.length > 0) {
    userPrompt += `**Project Details:**\n`;
    for (const [key, value] of answerEntries) {
      if (value && value !== '*(Skipped)*') {
        userPrompt += `- ${key}: ${value}\n`;
      }
    }
    userPrompt += '\n';
  }

  userPrompt += `Provide competitive intelligence as JSON. Focus on actionable, specific insights that will make this ${docType} more rigorous.`;

  try {
    const response = await agentCall(INTEL_SYSTEM_PROMPT, userPrompt, { maxTokens: 4000, temperature: 0.3, model });

    // Parse JSON — handle possible markdown fences
    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = repairAndParse(jsonStr);
    if (!parsed) throw new Error('Could not parse competitive intel JSON');

    return {
      industryBenchmarks: Array.isArray(parsed.industryBenchmarks) ? parsed.industryBenchmarks.slice(0, 4).map(b => ({
        metric: b.metric || '',
        benchmark: b.benchmark || '',
        source: b.source || '',
      })) : [],
      marketStandards: Array.isArray(parsed.marketStandards) ? parsed.marketStandards.slice(0, 4).map(s => ({
        standard: s.standard || '',
        relevance: s.relevance || '',
        applicableSection: s.applicableSection || '',
      })) : [],
      riskFactors: Array.isArray(parsed.riskFactors) ? parsed.riskFactors.slice(0, 4).map(r => ({
        category: r.category || '',
        risk: r.risk || '',
        mitigation: r.mitigation || '',
      })) : [],
      suggestedRequirements: Array.isArray(parsed.suggestedRequirements) ? parsed.suggestedRequirements.slice(0, 4).map(r => ({
        requirement: r.requirement || '',
        rationale: r.rationale || '',
        targetSection: r.targetSection || '',
      })) : [],
    };
  } catch (err) {
    console.warn('Competitive Intel Agent failed:', err.message);
    return null;
  }
}

module.exports = { generateCompetitiveIntel };
