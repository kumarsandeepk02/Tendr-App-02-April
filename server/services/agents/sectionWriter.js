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
function buildSectionSystemPrompt(docType, industryProfile, responseType) {
  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  let industryContext = '';
  if (industryProfile) {
    industryContext = `
INDUSTRY CONTEXT: ${industryProfile.name}
- Tailor language and terminology to this industry.
- Reference applicable compliance frameworks: ${industryProfile.complianceNotes.join('; ')}.`;
  }

  const baseRules = `You are an expert procurement document writer generating ONE section of a ${docLabel} (${docType}).
${industryContext}

DOCUMENT SCOPE — CRITICAL DISTINCTION:
- An RFP/RFI tells vendors WHAT you need and HOW you will evaluate their responses. It is NOT a contract.
- Do NOT include contract-level provisions: binding legal obligations, penalty clauses, IP ownership, indemnification, or detailed payment schedules.
- Where legal or contractual terms are relevant, write: "Detailed terms will be established in the resulting contract."

CONCISENESS STANDARDS:
- Each subsection: 2-4 paragraphs maximum. Prefer brevity.
- State what is needed directly. No lengthy preambles or restating the project background.
- Do not repeat information from other sections.
- Target word count: "short" ~150 words, "medium" ~300 words, "long" ~500 words. Never exceed 700 words.

PROCUREMENT LANGUAGE STANDARDS:
- Use "shall" for mandatory requirements, "should" for preferred, "may" for optional.
- Be specific and quantifiable (e.g., "shall respond within 4 business hours" not "shall respond promptly").
- Flag assumptions with [Assumption: <reasoning>].

FORMATTING RULES:
- Do NOT output the section heading (## title) — it will be added automatically.
- Use ### for subsections within this section.
- Generate ONLY the content for this single section.`;

  // Narrative sections: context-setting prose that vendors read
  if (responseType === 'narrative') {
    return baseRules + `

SECTION TYPE: NARRATIVE (context-setting)
This section provides context that vendors need to understand before responding. Write clear, professional prose.
- Use bulleted lists where appropriate for clarity.
- This section does NOT require vendor responses — it sets the stage.
- Write as if briefing a vendor who knows nothing about your organization or project.`;
  }

  // Vendor response sections: structured questions for comparable answers
  return baseRules + `

SECTION TYPE: VENDOR RESPONSE (requires structured vendor answers)
This section contains questions and requirements that vendors MUST respond to. The primary goal is COMPARABILITY — every vendor should answer the same questions in the same structure so responses can be compared side by side.

STRUCTURE — FOLLOW THIS EXACTLY:
1. Start with a brief context paragraph (2-3 sentences) explaining what this section evaluates and why it matters.
2. Then list NUMBERED questions/requirements that vendors must respond to.
3. Group related questions under ### subsection headings if there are more than 6 questions.

QUESTION WRITING RULES — CRITICAL FOR COMPARABILITY:
- Each question must be specific enough that two vendors cannot interpret it differently.
- Ask for the SAME format from every vendor: "Provide a table showing...", "List the top 5...", "Describe in no more than 500 words..."
- Specify the response format where possible: table, list, yes/no with explanation, narrative (max word count), or reference to attached documentation.
- Include measurable criteria: "State your guaranteed uptime SLA as a percentage", not "Describe your reliability."
- Where relevant, ask vendors to reference specific quantities, timelines, or metrics from the scope.
- Each question should map to an evaluation criterion so reviewers can score responses consistently.
- Number all questions sequentially within the section (1, 2, 3...).

EXAMPLE FORMAT:
*This section evaluates the vendor's technical capabilities against [Project Name]'s infrastructure requirements.*

1. **Platform Architecture:** Describe your platform's architecture. Include a diagram showing key components, data flow, and integration points. *(Response format: narrative + architecture diagram, max 1 page)*
2. **Scalability:** How does your platform handle scaling from current usage (X users) to projected growth (Y users)? Provide specific metrics from comparable deployments. *(Response format: narrative with metrics table)*
3. **Uptime & Reliability:** State your guaranteed uptime SLA as a percentage. Provide monthly uptime data for the past 12 months for your three largest clients. *(Response format: percentage + data table)*

DO NOT write generic questions like "Describe your approach" without specifying what aspect, what format, and what level of detail you expect.`;
}

/**
 * Build the user prompt for generating a single section.
 */
function buildSectionUserPrompt({ sectionTitle, sectionDescription, relevantAnswers, fileContext, previousSections, responseType }) {
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

  if (responseType === 'vendor_response') {
    prompt += `\nWrite the content for "${sectionTitle}" now. This is a VENDOR RESPONSE section — start with a brief context paragraph, then write numbered questions that vendors must answer. Each question must specify the expected response format. Make questions specific enough for comparable, scoreable vendor responses.`;
  } else {
    prompt += `\nWrite the content for "${sectionTitle}" now. This is a NARRATIVE section — write clear, professional context-setting prose. Be concise and specific. Avoid repeating context from other sections.`;
  }

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
    responseType = 'narrative',
    model,
  } = config;

  const systemPrompt = buildSectionSystemPrompt(docType, industryProfile, responseType);
  const userPrompt = buildSectionUserPrompt({
    sectionTitle,
    sectionDescription,
    relevantAnswers,
    fileContext,
    previousSections,
    responseType,
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
    { maxTokens, temperature: 0.4, model }
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
    model,
  } = config;

  const docLabel = docType === 'RFI' ? 'Request for Information' : 'Request for Proposal';

  const systemPrompt = `You are an expert procurement document writer refining ONE section of a ${docLabel} (${docType}).

YOUR TASK: Rewrite the section below according to the user's instruction.

RULES:
- Maintain procurement language standards (shall/should/may).
- Be specific and quantifiable wherever possible.
- Do NOT output the section heading (## title) — only output the body content.
- Use ### for subsections within this section.
- Write concise, publication-ready procurement language. Favor bullet points for requirements.
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
    { maxTokens: 4000, temperature: 0.4, model }
  );

  if (onDone) onDone(fullText);
  return fullText;
}

module.exports = { writeSection, regenerateSection };
