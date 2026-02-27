const { agentCall } = require('../claudeService');

const PLANNING_AGENT_SYSTEM = `You are an expert procurement consultant acting as a Planning Agent. Your role is to have a natural, freeform conversation with the user to understand their procurement needs before generating a document.

BEHAVIORAL RULES:
1. Be conversational and proactive — ask smart follow-up questions based on what the user says.
2. Extract key information naturally: project type (RFI/RFP), title, description, requirements, evaluation criteria, timeline, industry context.
3. If the user is vague, ask clarifying questions. If they're detailed, acknowledge and probe deeper.
4. You can handle multi-topic responses — if the user gives you lots of info at once, acknowledge all of it.
5. Reference uploaded documents when the user mentions them.
6. After 2-3 exchanges (or when you have enough context), suggest moving to the brief/outline phase.
7. Keep responses concise (2-4 sentences max) unless the user asks for detail.
8. Use a warm, professional tone — not robotic.
9. Never generate document content during planning — just gather information.
10. If the user says something like "that's all" or "let's go" or "generate", that's your cue to suggest creating the brief.

PROACTIVE BEHAVIORS:
- If the user mentions an industry, acknowledge it and ask about industry-specific needs (compliance, regulations, etc.)
- If they mention a timeline, ask about phasing or milestones
- If they mention requirements, ask about must-haves vs nice-to-haves
- If they mention budget, ask about pricing structure expectations (fixed, T&M, etc.)
- Suggest uploading documents if the user mentions existing specs, SOWs, or previous RFPs

OUTPUT FORMAT:
Respond with ONLY your conversational message. No JSON, no markdown headers, no structured data.`;

/**
 * Planning Agent: have a conversation with the user to gather procurement context.
 * Returns the agent's conversational response.
 */
async function planningChat({ messages, fileContext, model }) {
  // Build user message with file context if present
  let systemPrompt = PLANNING_AGENT_SYSTEM;

  if (fileContext) {
    systemPrompt += `\n\nREFERENCE DOCUMENT CONTEXT:\nThe user has uploaded reference documents. Here is the extracted text (excerpt):\n\`\`\`\n${fileContext.substring(0, 6000)}\n\`\`\`\nReference this information when relevant to the conversation.`;
  }

  const response = await agentCall(systemPrompt, messages, {
    maxTokens: 500,
    temperature: 0.7,
    model,
    isConversation: true, // Flag to use messages array directly
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
      "description": "1-sentence description of what this section covers",
      "priority": "high" | "medium" | "low"
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
6. Return ONLY the JSON. No markdown fences, no explanations.`;

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
    maxTokens: 2000,
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
    // Return a minimal brief so the flow doesn't break
    return {
      docType: 'RFP',
      projectTitle: 'Untitled Project',
      projectDescription: 'Unable to extract description from conversation.',
      industry: 'General',
      requirements: [],
      evaluationCriteria: [],
      timeline: 'Not specified',
      additionalContext: '',
      suggestedSections: [
        { title: 'Background / Project Overview', description: 'Context on the project', priority: 'high' },
        { title: 'Scope of Work', description: 'Work to be performed', priority: 'high' },
        { title: 'Technical Requirements', description: 'Technical specifications', priority: 'high' },
        { title: 'Vendor Qualifications', description: 'Required vendor capabilities', priority: 'medium' },
        { title: 'Evaluation Criteria', description: 'How proposals will be scored', priority: 'medium' },
        { title: 'Timeline & Milestones', description: 'Project schedule', priority: 'medium' },
        { title: 'Submission Instructions', description: 'How to submit responses', priority: 'low' },
        { title: 'Terms & Conditions', description: 'Legal terms', priority: 'low' },
      ],
      confidence: { overall: 0.3, missingInfo: ['Most project details were not captured'] },
    };
  }
}

const NARRATION_PROMPTS = {
  section_start: (title, index, total, description) =>
    `Starting section ${index + 1} of ${total}: **${title}**${description ? ` — ${description}` : ''}`,
  thinking: (title, context) => {
    const thoughts = [
      `Crafting the ${title} section based on the project requirements...`,
      `Building out ${title} with industry-specific details...`,
      `Writing ${title} — incorporating the key requirements discussed...`,
      `Developing ${title} to meet the evaluation criteria...`,
      `Composing ${title} with procurement best practices in mind...`,
    ];
    return thoughts[Math.floor(Math.random() * thoughts.length)];
  },
  section_done: (title) =>
    `✓ Completed **${title}**`,
  review_start: () =>
    `Running quality review across all sections...`,
  intel_start: () =>
    `Analyzing competitive landscape and industry benchmarks...`,
};

module.exports = { planningChat, generateBrief, NARRATION_PROMPTS };
