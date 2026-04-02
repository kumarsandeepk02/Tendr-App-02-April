const { agentCall } = require('../claudeService');
const { getAgent } = require('./orchestrators/agentDefinitions');

const READINESS_SYSTEM = `You are a procurement readiness reviewer. Analyze the project brief and flag issues that could make the final document weak, vague, or incomplete.

For each issue, assign a severity:
- "red": Critical gap — the document will likely be ineffective without this (e.g., no scope defined, no evaluation criteria, vague requirements with no specifics)
- "yellow": Worth addressing — the document will work but could be stronger (e.g., missing timeline details, generic descriptions, no compliance mentions for regulated industry)
- "green": Nice to have — minor improvement opportunities

OUTPUT FORMAT — Return ONLY valid JSON:
{
  "status": "red" | "yellow" | "green",
  "issues": [
    {
      "severity": "red" | "yellow" | "green",
      "title": "Short issue title",
      "description": "What's missing or vague, and why it matters",
      "suggestion": "Specific action the user could take to fix it"
    }
  ],
  "summary": "1-2 sentence overall assessment in conversational tone"
}

RULES:
1. Be specific — don't flag generic issues. Reference actual content from the brief.
2. Status is the highest severity found (any red → status is red, else any yellow → yellow, else green).
3. Limit to 3-7 issues. Don't nitpick.
4. The summary should sound like a coworker giving honest feedback, not a form validation error.
5. Return ONLY the JSON. No markdown fences.`;

/**
 * Run a readiness review on the brief.
 * Returns structured issues with red/yellow/green severity.
 * For RFP (Nova): shows all issues, flags reds prominently but never blocks.
 * For RFI (Zuno): advisory only, lighter review.
 * For Brainstorm (Zia): skipped entirely (caller should check agent config).
 */
async function reviewReadiness({ brief, docType, model }) {
  const agent = getAgent(docType);

  // Skip readiness review for brainstorm
  if (!agent.pipeline.readinessReview) {
    return null;
  }

  let userPrompt = `Review this project brief for readiness to generate a ${(docType || 'RFP').toUpperCase()} document:\n\n`;
  userPrompt += `Title: ${brief.projectTitle || 'Not specified'}\n`;
  userPrompt += `Type: ${brief.docType || docType || 'RFP'}\n`;
  userPrompt += `Description: ${brief.projectDescription || 'Not specified'}\n`;
  userPrompt += `Industry: ${brief.industry || 'General'}\n`;
  userPrompt += `Timeline: ${brief.timeline || 'Not specified'}\n`;
  userPrompt += `Requirements: ${(brief.requirements || []).join('; ') || 'None specified'}\n`;
  userPrompt += `Evaluation Criteria: ${(brief.evaluationCriteria || []).join('; ') || 'None specified'}\n`;
  userPrompt += `Confidence: ${brief.confidence?.overall || 'unknown'}\n`;
  userPrompt += `Missing Info: ${(brief.confidence?.missingInfo || []).join('; ') || 'None flagged'}\n`;
  userPrompt += `Sections: ${(brief.suggestedSections || []).filter(s => s.included !== false).map(s => s.title).join(', ')}\n`;

  try {
    const response = await agentCall(READINESS_SYSTEM, userPrompt, {
      maxTokens: 1500,
      temperature: 0.3,
      model,
    });

    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('Readiness review failed:', err.message);
    // Return a green pass so the user is never blocked
    return {
      status: 'green',
      issues: [],
      summary: 'Readiness review could not be completed. You can proceed with generation.',
    };
  }
}

module.exports = { reviewReadiness };
