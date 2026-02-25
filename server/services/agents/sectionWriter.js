const { agentStream } = require('../claudeService');

const MAX_TOKENS_BY_LENGTH = {
  short: 1500,
  medium: 2500,
  long: 4000,
};

/**
 * Build a system prompt for the section writer agent.
 * Includes procurement language standards and industry context.
 */
function buildSectionSystemPrompt(docType, industryProfile) {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  let industryContext = '';
  if (industryProfile) {
    industryContext = `
INDUSTRY CONTEXT: ${industryProfile.name}
- Tailor language and terminology to this industry.
- Reference applicable compliance frameworks: ${industryProfile.complianceNotes.join('; ')}.`;
  }

  return `You are an expert procurement document writer generating ONE section of a ${docLabel} (${docType}).
${industryContext}

PROCUREMENT LANGUAGE STANDARDS:
- Use "shall" for mandatory requirements the vendor must meet.
- Use "should" for strongly preferred but non-mandatory items.
- Use "may" for optional or discretionary items.
- Be specific and quantifiable (e.g., "shall respond within 4 business hours" not "shall respond promptly").
- Flag any assumptions with [Assumption: <reasoning>].

FORMATTING RULES:
- Do NOT output the section heading (## title) — it will be added automatically.
- Use ### for subsections within this section.
- For question sections, use numbered lists under ### subsection headings.
- Write thorough, publication-ready procurement language. No placeholders or stubs.
- Generate ONLY the content for this single section. Do not reference or generate other sections.`;
}

/**
 * Build the user prompt for generating a single section.
 */
function buildSectionUserPrompt({ sectionTitle, sectionDescription, relevantAnswers, fileContext, previousSections }) {
  let prompt = `Generate the complete content for the following section:\n\n`;
  prompt += `**Section:** ${sectionTitle}\n`;
  if (sectionDescription) {
    prompt += `**Purpose:** ${sectionDescription}\n`;
  }

  // Add relevant answers (narrowed context)
  const answerEntries = Object.entries(relevantAnswers || {});
  if (answerEntries.length > 0) {
    prompt += `\n**Relevant project information:**\n`;
    for (const [key, value] of answerEntries) {
      if (value && value !== '*(Skipped)*') {
        prompt += `- ${key}: ${value}\n`;
      }
    }
  }

  // Add file context if relevant
  if (fileContext) {
    prompt += `\n**Reference document excerpt:**\n${fileContext.substring(0, 3000)}\n`;
  }

  // Add previous sections summary for continuity
  if (previousSections && previousSections.length > 0) {
    prompt += `\n**Already-generated sections (for continuity — do NOT repeat their content):**\n`;
    for (const prev of previousSections) {
      const preview = prev.content.substring(0, 100).replace(/\n/g, ' ');
      prompt += `- ${prev.title}: ${preview}...\n`;
    }
  }

  prompt += `\nWrite the complete content for "${sectionTitle}" now. Be thorough and use professional procurement language.`;

  return prompt;
}

/**
 * Generate a single document section via streaming.
 *
 * @param {Object} config Section configuration
 * @param {Function} onText Called with each text chunk
 * @param {Function} onDone Called with the complete section text
 * @returns {Promise<string>} The complete section text
 */
async function writeSection(config, onText, onDone) {
  const {
    sectionTitle,
    sectionDescription,
    relevantAnswers,
    fileContext,
    docType,
    previousSections,
    industryProfile,
    estimatedLength = 'medium',
  } = config;

  const systemPrompt = buildSectionSystemPrompt(docType, industryProfile);
  const userPrompt = buildSectionUserPrompt({
    sectionTitle,
    sectionDescription,
    relevantAnswers,
    fileContext,
    previousSections,
  });

  const maxTokens = MAX_TOKENS_BY_LENGTH[estimatedLength] || 2500;

  // Prepend the section heading before streaming content
  const heading = `## ${sectionTitle}\n\n`;
  if (onText) onText(heading);

  let sectionContent = '';

  const fullText = await agentStream(
    systemPrompt,
    userPrompt,
    (chunk) => {
      sectionContent += chunk;
      if (onText) onText(chunk);
    },
    () => {
      // Stream complete — onDone is called below with full content
    },
    { maxTokens, temperature: 0.4 }
  );

  const completeSection = heading + fullText;
  if (onDone) onDone(completeSection);
  return completeSection;
}

module.exports = { writeSection };
