/**
 * ChatPlatformBridge — Platform-agnostic conversation router.
 *
 * Takes incoming messages from Slack/Teams and routes them to the
 * appropriate Tendr service (planning, generation, section editing).
 *
 * KEY DESIGN: Penny is the ONLY face the user sees. Nova/Zuno/Zia work
 * behind the scenes. Penny refers to them as "Nova, our RFP writer" etc.
 * but the user never talks to them directly.
 */

const { db } = require('../../db');
const { projects, chatConversations, documentSections } = require('../../db/schema');
const { eq, and, desc } = require('drizzle-orm');
const { planningChat, generateBrief } = require('../agents/planningAgent');
const { getAgent } = require('../agents/orchestrators/agentDefinitions');
const { regenerateSection } = require('../agents/sectionWriter');
const { agentCall } = require('../claudeService');
const { wrapUserContent } = require('../security/promptDefense');
const { matchSection } = require('./sectionMatcher');
const pipelineRunner = require('./pipelineRunner');

/**
 * Strip agent self-introductions from responses.
 * Nova/Zuno/Zia introduce themselves in their first response — remove that for Slack.
 */
function stripAgentIntro(text) {
  // Remove lines like "Hey! I'm Nova, your RFP architect — ..."
  // or "I'm Zuno, a curious..." etc.
  return text
    .replace(/^(?:Hey[!.]?\s*)?I'm (?:Nova|Zuno|Zia)[^.!?\n]*[.!?]?\s*/i, '')
    .replace(/^(?:Hey there[!.]?\s*)?I'm (?:Nova|Zuno|Zia)[^.!?\n]*[.!?]?\s*/i, '')
    .replace(/^(?:Hi[!.]?\s*)?I'm (?:Nova|Zuno|Zia)[^.!?\n]*[.!?]?\s*/i, '')
    .replace(/^\s*—\s*/, '')
    .trim();
}

// Agent display names — Penny's way of referencing them
const AGENT_LABELS = {
  rfp: 'Nova, our RFP writer',
  rfi: 'Zuno, our RFI specialist',
  brainstorm: 'Zia, our strategy partner',
};

const PENNY_SYSTEM_PROMPT = `You are Penny, a coworker at Tendr who helps teammates build RFPs and RFIs via Slack.
You are friendly, casual, and concise — you talk like a real teammate.

You have specialist teammates who work behind the scenes:
- Nova: RFP writer
- Zuno: RFI specialist
- Zia: Strategy/brainstorm partner

YOU are always the one talking to the user. You never hand off the conversation.
You can mention your specialists naturally ("I'm working with Nova on this" or
"I'll have Nova draft that") but the user always talks to YOU.

Your job:
1. Figure out what the user needs (RFP, RFI, or brainstorm)
2. Once clear, start gathering project details — don't re-ask what they already told you
3. Keep the conversation moving forward

You NEVER:
- Let the user talk to Nova/Zuno/Zia directly
- Say "connecting you with..." or "handing off to..."
- Re-ask questions the user already answered
- Use formal or robotic language

Keep messages short — 1-3 sentences max.`;

const INTENT_SYSTEM_PROMPT = `You classify user intent in a Slack conversation about procurement documents.

Given the conversation history, current phase, and latest message, return ONLY a JSON object:
{
  "intent": "greeting" | "new_project" | "planning" | "generate" | "edit_section" | "status" | "list_projects" | "unknown",
  "docType": "rfp" | "rfi" | "brainstorm" | null,
  "sectionQuery": "<section name if edit_section>" | null,
  "editInstruction": "<what to change if edit_section>" | null
}

RULES:
- "greeting": ONLY if the very first message is just hi/hello/hey with zero project context
- "new_project": user describes a project need AND we know or can infer the doc type. If user says "build an RFP" or "I need an RFI", that IS a new project with a clear docType.
- "planning": user is answering questions or providing project details in an ongoing conversation
- "generate": user explicitly says "generate", "go for it", "let's do it", "build it", "I'm ready", "looks good generate" etc.
- "edit_section": user wants to modify a specific section of an existing document (phase must be "done")
- If phase is "intake" or "exploring" and user provides project details, classify as "planning"
- If phase is "done" and mentions a section name, classify as "edit_section"
- When in doubt between "new_project" and "planning", prefer "planning" if a conversation already exists
- "let us build an RFP" = new_project with docType "rfp", NOT "generate"
- Return ONLY the JSON. No explanations.`;

// Slack-specific instruction injected into the planning agent's messages
// so the agent doesn't introduce itself by name — Penny is the face.
const SLACK_AGENT_CONTEXT = `CRITICAL OVERRIDE — READ THIS FIRST:
You are responding through Slack as "Penny." The user does NOT know you exist as a separate agent.
- NEVER say "I'm Nova", "I'm Zuno", "I'm Zia", or introduce yourself by any name.
- NEVER say "happy to help you build this out" or any first-introduction phrasing.
- The user has ALREADY been talking to Penny. This is a CONTINUATION of that conversation.
- Just pick up naturally from what the user said and start asking smart follow-up questions.
- Act as if you've been in this conversation the whole time.`;

/**
 * Resolve an existing conversation from a Slack/Teams thread.
 */
async function resolveConversation(platform, channelId, threadId) {
  const [convo] = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.platform, platform),
        eq(chatConversations.channelId, channelId),
        eq(chatConversations.threadId, threadId)
      )
    )
    .limit(1);

  return convo || null;
}

/**
 * Create a new conversation record.
 */
async function createConversation({ platform, channelId, threadId, projectId, userId }) {
  const [convo] = await db
    .insert(chatConversations)
    .values({ platform, channelId, threadId, projectId, userId, phase: 'intake' })
    .returning();
  return convo;
}

/**
 * Get the user's active projects (for disambiguation).
 */
async function getActiveProjects(userId) {
  return db
    .select()
    .from(projects)
    .where(and(eq(projects.userId, userId), eq(projects.status, 'in_progress')))
    .orderBy(desc(projects.updatedAt))
    .limit(10);
}

/**
 * Classify user intent using Claude.
 * Includes recent conversation history for context.
 */
async function classifyIntent(message, phase, conversationHistory) {
  // Build context from recent messages (last 6)
  const recentHistory = (conversationHistory || []).slice(-6);
  let historyStr = '';
  if (recentHistory.length > 0) {
    historyStr = 'Recent conversation:\n' +
      recentHistory.map(m => `${m.role === 'user' ? 'User' : 'Penny'}: ${m.content.substring(0, 150)}`).join('\n') +
      '\n\n';
  }

  const userPrompt = `${historyStr}Phase: ${phase || 'none'}\nHas existing conversation: ${recentHistory.length > 0 ? 'yes' : 'no'}\nLatest user message: ${message}`;
  try {
    const response = await agentCall(INTENT_SYSTEM_PROMPT, userPrompt, {
      maxTokens: 200,
      temperature: 0.1,
      model: 'haiku',
    });
    const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn('Intent classification failed:', err.message);
    return { intent: 'planning', docType: null, sectionQuery: null, editInstruction: null };
  }
}

/**
 * Generate a Penny connector message (greeting, short responses).
 */
async function pennyMessage(userMessage, context = '') {
  const prompt = context
    ? `Context: ${context}\n\nUser said: ${userMessage}\n\nRespond as Penny.`
    : `User said: ${userMessage}\n\nRespond as Penny.`;

  return agentCall(PENNY_SYSTEM_PROMPT, prompt, {
    maxTokens: 150,
    temperature: 0.7,
    model: 'haiku',
  });
}

/**
 * Main message handler — routes incoming messages to the right service.
 */
async function handleMessage({ profileId, profile, message, platform, channelId, threadId, messageId, postMessage }) {
  // 1. Resolve existing conversation
  let convo = await resolveConversation(platform, channelId, threadId);
  let project = null;

  if (convo?.projectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, convo.projectId)).limit(1);
    project = p || null;
  }

  // Get conversation history for context
  const conversationHistory = project?.planningMessages || [];

  // 2. Classify intent with conversation history
  const phase = convo?.phase || project?.phase || 'none';
  const intent = await classifyIntent(message, phase, conversationHistory);

  // 3. Route based on intent
  switch (intent.intent) {
    case 'greeting': {
      const firstName = (profile.fullName || '').split(' ')[0] || 'there';
      const reply = await pennyMessage(message, `User's name is ${firstName}. This is their first message. Greet them and ask what they need help with.`);
      await postMessage(reply);
      return;
    }

    case 'new_project': {
      const docType = intent.docType || 'rfp';
      return await startProject({
        profileId, profile, docType, message, platform,
        channelId, threadId, messageId, postMessage,
        priorMessages: conversationHistory,
      });
    }

    case 'planning': {
      // No conversation yet — need to create a project first
      if (!convo) {
        if (intent.docType) {
          return await startProject({
            profileId, profile, docType: intent.docType, message, platform,
            channelId, threadId, messageId, postMessage,
            priorMessages: conversationHistory,
          });
        }
        // Can't determine doc type yet — ask
        const reply = await pennyMessage(message, 'User wants to work on something but hasn\'t specified RFP, RFI, or brainstorm. Ask them naturally.');
        await postMessage(reply);
        return;
      }

      // Continue planning conversation
      return await continuePlanning({ convo, project, message, messageId, profileId, postMessage });
    }

    case 'generate': {
      if (!project) {
        await postMessage("We haven't started a project yet! Tell me what you need and I'll get us going.");
        return;
      }
      return await startGeneration({ convo, project, profile, postMessage });
    }

    case 'edit_section': {
      if (!project || project.phase !== 'done') {
        await postMessage("I can only edit sections after the document is generated. Let's finish the current step first.");
        return;
      }
      return await editSection({
        project,
        sectionQuery: intent.sectionQuery || message,
        instruction: intent.editInstruction || message,
        postMessage,
      });
    }

    case 'list_projects': {
      const active = await getActiveProjects(profileId);
      if (active.length === 0) {
        await postMessage("You don't have any active projects. Want to start one?");
      } else {
        const list = active.map((p, i) => `${i + 1}. *${p.title}* (${(p.documentType || 'rfp').toUpperCase()})`).join('\n');
        await postMessage(`Your active projects:\n\n${list}`);
      }
      return;
    }

    default: {
      // Fallback: if we have an active conversation in planning, treat as planning
      if (convo && project && ['intake', 'scope_lock', 'requirements', 'eval_pricing', 'question_design', 'exploring'].includes(project.phase)) {
        return await continuePlanning({ convo, project, message, messageId, profileId, postMessage });
      }
      const reply = await pennyMessage(message, "I'm not sure what the user needs. Ask them to clarify — do they want to build an RFP, RFI, or brainstorm?");
      await postMessage(reply);
    }
  }
}

/**
 * Create a new project and start the planning conversation.
 * Carries forward any prior messages from the pre-project conversation.
 */
async function startProject({ profileId, profile, docType, message, platform, channelId, threadId, messageId, postMessage, priorMessages }) {
  const agentLabel = AGENT_LABELS[docType.toLowerCase()] || 'Nova, our RFP writer';

  // Create project
  const [project] = await db
    .insert(projects)
    .values({
      userId: profileId,
      title: 'Untitled Project',
      documentType: docType.toLowerCase(),
      phase: 'intake',
      status: 'in_progress',
      planningMessages: [],
    })
    .returning();

  // Create conversation mapping
  const convo = await createConversation({
    platform,
    channelId,
    threadId,
    projectId: project.id,
    userId: profileId,
  });

  // Penny acknowledges — she's the face, agents work behind the scenes
  await postMessage(`On it — I'll be working with ${agentLabel} on this. Let me get some details from you.`);

  // Build planning messages — carry forward ALL prior messages from the thread
  const planningMessages = [];

  if (priorMessages && priorMessages.length > 0) {
    // Carry forward prior conversation (Penny ↔ user before project was created)
    for (const msg of priorMessages) {
      planningMessages.push({
        role: msg.role,
        content: msg.content,
        source: msg.source || platform,
        timestamp: msg.timestamp || new Date().toISOString(),
      });
    }
  }

  // Add the current message
  planningMessages.push({
    role: 'user',
    content: message,
    source: platform,
    sourceMessageId: messageId,
    authorId: profileId,
    timestamp: new Date().toISOString(),
  });

  // Call planning agent with Slack context injected.
  // The override goes as the LAST assistant message before user content
  // so it takes priority over the agent's own system prompt.
  const messagesForAgent = [];
  // Fake a prior exchange so the agent thinks it already introduced itself
  messagesForAgent.push({ role: 'user', content: 'Hey, I need help with a procurement document.' });
  messagesForAgent.push({ role: 'assistant', content: 'Sure thing! Tell me about what you need and I\'ll start gathering the details.' });
  // Now add real messages
  messagesForAgent.push(...planningMessages);
  // Append override reminder as system-level context in the last user message
  const lastIdx = messagesForAgent.length - 1;
  if (messagesForAgent[lastIdx].role === 'user') {
    messagesForAgent[lastIdx] = {
      ...messagesForAgent[lastIdx],
      content: messagesForAgent[lastIdx].content + `\n\n[${SLACK_AGENT_CONTEXT}]`,
    };
  }

  const agentResponse = await planningChat({
    messages: messagesForAgent,
    fileContext: project.fileContext || '',
    model: project.model || 'sonnet',
    docType: project.documentType,
  });

  // Save messages (without the injected context — those are ephemeral)
  planningMessages.push({
    role: 'assistant',
    content: agentResponse,
    source: 'agent',
    timestamp: new Date().toISOString(),
  });

  await db
    .update(projects)
    .set({ planningMessages, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  await postMessage(stripAgentIntro(agentResponse));
}

/**
 * Continue an existing planning conversation.
 */
async function continuePlanning({ convo, project, message, messageId, profileId, postMessage }) {
  const planningMessages = [...(project.planningMessages || [])];

  // Append user message
  planningMessages.push({
    role: 'user',
    content: message,
    source: 'slack',
    sourceMessageId: messageId,
    authorId: profileId,
    timestamp: new Date().toISOString(),
  });

  // Call planning agent with Slack identity override
  const messagesForAgent = [
    { role: 'user', content: 'Hey, I need help with a procurement document.' },
    { role: 'assistant', content: 'Sure thing! Tell me about what you need and I\'ll start gathering the details.' },
    ...planningMessages,
  ];
  // Append override to last user message
  const lastIdx = messagesForAgent.length - 1;
  if (messagesForAgent[lastIdx].role === 'user') {
    messagesForAgent[lastIdx] = {
      ...messagesForAgent[lastIdx],
      content: messagesForAgent[lastIdx].content + `\n\n[${SLACK_AGENT_CONTEXT}]`,
    };
  }

  const agentResponse = await planningChat({
    messages: messagesForAgent,
    fileContext: project.fileContext || '',
    model: project.model || 'sonnet',
    docType: project.documentType,
  });

  // Append agent response
  planningMessages.push({
    role: 'assistant',
    content: agentResponse,
    source: 'agent',
    timestamp: new Date().toISOString(),
  });

  // Save to project
  await db
    .update(projects)
    .set({ planningMessages, updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  // Update conversation last activity
  await db
    .update(chatConversations)
    .set({ lastActivity: new Date(), updatedAt: new Date() })
    .where(eq(chatConversations.id, convo.id));

  await postMessage(stripAgentIntro(agentResponse));
}

/**
 * Generate brief and ask for approval, or start generation if brief exists.
 */
async function startGeneration({ convo, project, profile, postMessage }) {
  const agentLabel = AGENT_LABELS[project.documentType] || 'Nova, our RFP writer';
  const firstName = (profile.fullName || '').split(' ')[0] || 'there';

  // If no brief yet, generate one first
  if (!project.briefData) {
    await postMessage("Let me pull together a brief from everything we've discussed...");

    const brief = await generateBrief({
      messages: project.planningMessages || [],
      fileContext: project.fileContext || '',
      model: project.model || 'sonnet',
    });

    await db
      .update(projects)
      .set({ briefData: brief, phase: 'readiness', updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    // Format brief for Slack
    const sectionList = (brief.suggestedSections || [])
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join('\n');

    await postMessage(
      `Here's what I've put together:\n\n*${brief.projectTitle || 'Untitled'}*\n${brief.projectDescription || ''}\n\nSections (${(brief.suggestedSections || []).length}):\n${sectionList}\n\nWant me to generate the full document?`
    );
    return;
  }

  // Brief exists — start pipeline
  await postMessage(`I'm handing this to ${agentLabel} to draft — I'll ping you when it's ready.`);

  pipelineRunner.runAsync({
    projectId: project.id,
    brief: project.briefData,
    project,
    onStart: () => {},
    onDone: async ({ sectionCount }) => {
      await postMessage(
        `Hey ${firstName}, your document is ready — ${sectionCount} sections. Take a look and let me know if anything needs tweaking.`
      );

      // Update conversation phase
      if (convo) {
        await db
          .update(chatConversations)
          .set({ phase: 'done', lastActivity: new Date(), updatedAt: new Date() })
          .where(eq(chatConversations.id, convo.id));
      }
    },
    onError: async (errMsg) => {
      await postMessage(`Ran into an issue generating the document: ${errMsg}. Want to try again?`);
    },
  });
}

/**
 * Edit a section via natural language instruction.
 */
async function editSection({ project, sectionQuery, instruction, postMessage }) {
  const section = await matchSection(sectionQuery, project.id);

  if (!section) {
    const sections = await db
      .select({ title: documentSections.title })
      .from(documentSections)
      .where(eq(documentSections.projectId, project.id))
      .orderBy(documentSections.order);

    const list = sections.map((s, i) => `${i + 1}. ${s.title}`).join('\n');
    await postMessage(`I couldn't find that section. Here are the ones I have:\n\n${list}\n\nWhich one did you mean?`);
    return;
  }

  await postMessage(`Updating *${section.title}*...`);

  const updatedContent = await regenerateSection(
    {
      sectionTitle: section.title,
      currentContent: section.content,
      instruction,
      docType: (project.documentType || 'rfp').toUpperCase(),
      answers: project.planningMessages || [],
      fileContext: project.fileContext || '',
      model: project.model || 'sonnet',
    },
    () => {},
    () => {}
  );

  await db
    .update(documentSections)
    .set({ content: updatedContent, updatedAt: new Date() })
    .where(eq(documentSections.id, section.id));

  await postMessage(`Done — updated the *${section.title}* section.`);
}

module.exports = {
  handleMessage,
  resolveConversation,
  createConversation,
  classifyIntent,
  getActiveProjects,
};
