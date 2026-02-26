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

/**
 * Regenerate / refine a single document section via streaming.
 * Used for section-level regeneration and quality review auto-fix.
 *
 * @param {Object} config Regeneration configuration
 * @param {string} config.sectionTitle The section heading
 * @param {string} config.currentContent Existing section body text
 * @param {string} config.instruction What to do (e.g. "Make more specific", custom text, or issue fix)
 * @param {string} config.docType 'RFI' or 'RFP'
 * @param {Object} config.answers All gathered answers for context
 * @param {string} config.fileContext Uploaded file text (optional)
 * @param {Function} onText Called with each text chunk
 * @param {Function} onDone Called with the complete refined text
 * @returns {Promise<string>} The complete refined section text
 */
async function regenerateSection(config, onText, onDone) {
  const {
    sectionTitle,
    currentContent,
    instruction,
    docType,
    answers,
    fileContext,
  } = config;

  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  const systemPrompt = `You are an expert procurement document writer refining ONE section of a ${docLabel} (${docType}).

YOUR TASK: Rewrite the section below according to the user's instruction.

RULES:
- Maintain procurement language standards (shall/should/may).
- Be specific and quantifiable wherever possible.
- Do NOT output the section heading (## title) — only output the body content.
- Use ### for subsections within this section.
- Write thorough, publication-ready procurement language.
- If the instruction asks to make it more concise, cut redundancy but preserve all critical requirements.
- If the instruction asks to make it more specific, add concrete metrics, SLAs, and quantifiable criteria.
- If the instruction describes an issue to fix, address that specific issue while preserving the rest of the section.

CURRENT SECTION CONTENT:
${currentContent}`;

  let userPrompt = `**Instruction:** ${instruction}\n\n`;

  // Add project context from answers
  const answerEntries = Object.entries(answers || {});
  if (answerEntries.length > 0) {
    userPrompt += `**Project context:**\n`;
    for (const [key, value] of answerEntries) {
      if (value && value !== '*(Skipped)*') {
        userPrompt += `- ${key}: ${value}\n`;
      }
    }
  }

  if (fileContext) {
    userPrompt += `\n**Reference document excerpt:**\n${fileContext.substring(0, 2000)}\n`;
  }

  userPrompt += `\nRewrite the "${sectionTitle}" section now. Output ONLY the refined body content, no heading.`;

  let refinedContent = '';

  const fullText = await agentStream(
    systemPrompt,
    userPrompt,
    (chunk) => {
      refinedContent += chunk;
      if (onText) onText(chunk);
    },
    () => {},
    { maxTokens: 4000, temperature: 0.4 }
  );

  if (onDone) onDone(fullText);
  return fullText;
}

module.exports = { writeSection, regenerateSection };
