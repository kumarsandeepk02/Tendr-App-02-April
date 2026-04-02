const { agentCall } = require('../claudeService');
const { getAgent } = require('./orchestrators/agentDefinitions');

/**
 * Planning Agent: have a conversation with the user to gather procurement context.
 * Uses the correct agent personality based on docType (Nova/Zuno/Zia).
 * Returns the agent's conversational response.
 */
async function planningChat({ messages, fileContext, model, docType }) {
  const agent = getAgent(docType);
  let systemPrompt = agent.planning.systemPrompt;

  if (fileContext) {
    systemPrompt += `\n\nREFERENCE DOCUMENT CONTEXT:\nThe user has uploaded reference documents. Here is the extracted text (excerpt):\n\`\`\`\n${fileContext.substring(0, 6000)}\n\`\`\`\nReference this information when relevant to the conversation.`;
  }

  const response = await agentCall(systemPrompt, messages, {
    maxTokens: agent.planning.maxTokens,
    temperature: agent.planning.temperature,
    model,
    isConversation: true,
  });

  return response;
}

const BRIEF_SYSTEM = `You are an expert procurement document architect. Analyze the conversation history and extract a structured brief for document generation.

OUTPUT FORMAT — Return ONLY valid JSON with this exact structure:
{
  "docType": "RFP" or "RFI",
  "projectTitle": "Extracted or inferred project title",
  "projectDescription": "2-3 sentence summary of the project",
  "industry": "Detected industry or 'General'",
  "requirements": ["requirement 1", "requirement 2", ...],
  "evaluationCriteria": ["criterion 1", "criterion 2", ...],
  "timeline": "Extracted timeline info or 'Not specified'",
  "additionalContext": "Any other relevant details from the conversation",
  "suggestedSections": [
    {
      "title": "Section Title",
      "description": "2-3 sentence summary of what THIS section will cover, using SPECIFIC details from the conversation. Include concrete facts: products, quantities, locations, companies, timelines, compliance needs, or requirements that were discussed. This summary tells the user exactly what the AI will write for this section — they should be able to read it and say 'yes, that captures what I told you.'",
      "priority": "high" | "medium" | "low",
      "responseType": "narrative" | "vendor_response"
    }
  ],
  "confidence": {
    "overall": 0.0 to 1.0,
    "missingInfo": ["list of important info not yet gathered"]
  }
}

RULES:
1. Extract information from ALL messages in the conversation.
2. Include uploaded document context if available.
3. Suggest 7-12 sections tailored to the specific project and industry.
4. Be honest about confidence — if info is sparse, say so.
5. Infer document type from context if not explicitly stated (default to RFP).
6. Return ONLY the JSON. No markdown fences, no explanations.
7. CRITICAL: Each section description MUST be 2-3 sentences, specific to THIS project. Never use generic placeholder descriptions like "Context on the project" or "Work to be performed." Instead, summarize what was actually discussed — e.g. "Covers the migration of 50 VMs from the company's on-premise data center to AWS, including the business drivers (cost reduction, scalability) and expected outcomes discussed by the user." The description should read like a mini-brief for that section.`;

/**
 * Generate a structured brief from the planning conversation.
 * Returns a JSON object with extracted project details and suggested outline.
 */
async function generateBrief({ messages, fileContext, model }) {
  let userPrompt = 'Analyze the following planning conversation and generate a structured brief:\n\n';

  for (const msg of messages) {
    const role = msg.role === 'user' ? 'User' : 'Assistant';
    userPrompt += `${role}: ${msg.content}\n\n`;
  }

  if (fileContext) {
    userPrompt += `\nUPLOADED DOCUMENT CONTEXT:\n${fileContext.substring(0, 6000)}\n`;
  }

  userPrompt += '\nGenerate the structured brief JSON now.';

  const response = await agentCall(BRIEF_SYSTEM, userPrompt, {
    maxTokens: 4000,
    temperature: 0.2,
    model,
  });

  // Parse JSON response
  let jsonStr = response;
  const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  try {
    const brief = JSON.parse(jsonStr);
    return brief;
  } catch (err) {
    console.error('Brief generation JSON parse failed:', err.message);
    console.error('Raw response (first 500 chars):', response.substring(0, 500));
    const error = new Error('Failed to generate brief: AI returned invalid JSON. Please try again.');
    error.code = 'BRIEF_PARSE_ERROR';
    error.retryable = true;
    throw error;
  }
}

/**
 * Generate contextual narration lines for each section.
 * Uses the agent's narration config for personality-appropriate messages.
 */
const NARRATION_GEN_SYSTEM = `You are writing brief, contextual progress messages for a document generation UI.
The user will see these messages while their procurement document is being written section by section.

Each message should:
- Reference specific details from the project (company names, technologies, compliance standards, etc.)
- Be 1 sentence, under 20 words
- Sound like a knowledgeable analyst working on their document
- Not repeat the same phrasing across messages
- Start with a verb (e.g. "Drafting...", "Incorporating...", "Building...")

OUTPUT FORMAT: Return a JSON object with section titles as keys and narration strings as values.
Return ONLY the JSON, no markdown fences.`;

async function generateNarrations({ brief, messages, model }) {
  const sectionTitles = (brief.suggestedSections || [])
    .filter(s => s.included !== false)
    .map(s => s.title);

  if (sectionTitles.length === 0) return {};

  let userPrompt = `Generate a contextual narration message for each of these document sections. The message appears while the AI writes that section.\n\n`;
  userPrompt += `Project: ${brief.projectTitle || 'Untitled'}\n`;
  userPrompt += `Description: ${brief.projectDescription || ''}\n`;
  userPrompt += `Key requirements: ${(brief.requirements || []).join('; ')}\n`;
  userPrompt += `Industry: ${brief.industry || 'General'}\n\n`;

  if (messages && messages.length > 0) {
    const userMsgs = messages.filter(m => m.role === 'user').slice(0, 5);
    if (userMsgs.length > 0) {
      userPrompt += `Key conversation points:\n`;
      for (const msg of userMsgs) {
        userPrompt += `- ${msg.content.substring(0, 200)}\n`;
      }
      userPrompt += '\n';
    }
  }

  userPrompt += `Sections:\n${sectionTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n`;
  userPrompt += `Generate a contextual narration for each section. Return ONLY the JSON.`;

  try {
    const response = await agentCall(NARRATION_GEN_SYSTEM, userPrompt, {
      maxTokens: 1000,
      temperature: 0.6,
      model,
    });

    let jsonStr = response;
    const fenceMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonStr = fenceMatch[1].trim();

    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn('Narration generation failed, using defaults:', err.message);
    return {};
  }
}

const NARRATION_PROMPTS = {
  section_start: (title, index, total, description) =>
    `Starting section ${index + 1} of ${total}: **${title}**${description ? ` — ${description}` : ''}`,
  thinking: (title) => {
    const thoughts = [
      `Crafting the ${title} section based on the project requirements...`,
      `Building out ${title} with industry-specific details...`,
      `Writing ${title} — incorporating the key requirements discussed...`,
      `Developing ${title} to meet the evaluation criteria...`,
      `Composing ${title} with procurement best practices in mind...`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  },
  section_done: (title) => `✓ Completed **${title}**`,
  review_start: () => `Running quality review across all sections...`,
  intel_start: () => `Analyzing competitive landscape and industry benchmarks...`,
};

module.exports = { planningChat, generateBrief, generateNarrations, NARRATION_PROMPTS };
