/**
 * ChatPlatformBridge — Platform-agnostic conversation router.
 *
 * Takes incoming messages from Slack/Teams and routes them to the
 * appropriate Tendr service (planning, generation, section editing).
 * Penny's thin system prompt handles intent classification only.
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

const PENNY_SYSTEM_PROMPT = `You are Penny, a coworker at Tendr who helps teammates build RFPs and RFIs.
You are friendly, casual, and concise — you talk like a real teammate in Slack.

Your job is to:
1. Understand what the user needs (RFP, RFI, or brainstorm)
2. Confirm your understanding before proceeding
3. Connect them with the right specialist (Nova for RFPs, Zuno for RFIs, Zia for brainstorming)
4. Relay status updates during document generation

You NEVER:
- Answer domain questions about procurement, RFPs, or the user's project yourself
- Generate document content
- Diverge from the specialist agent's responses
- Use formal or robotic language

When you infer the document type, always confirm with the user before routing.
Keep your messages short — 1-3 sentences max.`;

const INTENT_SYSTEM_PROMPT = `You are classifying user intent in a Slack conversation about procurement documents.

Given the user's message AND the current conversation phase, return ONLY a JSON object:
{
  "intent": "greeting" | "new_project" | "planning" | "generate" | "edit_section" | "status" | "list_projects" | "confirm_doctype" | "unknown",
  "docType": "rfp" | "rfi" | "brainstorm" | null,
  "sectionQuery": "<section name if intent is edit_section>" | null,
  "editInstruction": "<what to change if intent is edit_section>" | null,
  "confirmed": true | false
}

RULES:
- "greeting": user says hi, hello, hey, etc. with no project context
- "new_project": user describes a project or need for the first time
- "planning": user is answering questions or continuing the planning conversation
- "generate": user says "generate", "go for it", "let's do it", "build it", etc.
- "edit_section": user wants to modify a specific section of an existing document
- "confirm_doctype": user is confirming RFP vs RFI selection
- If the phase is "intake" and it's not a greeting, classify as "planning"
- If the phase is "done" and mentions a section, classify as "edit_section"
- Return ONLY the JSON. No explanations.`;

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
 */
async function classifyIntent(message, phase) {
  const userPrompt = `Phase: ${phase || 'none'}\nUser message: ${message}`;
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
    return { intent: 'planning', docType: null, sectionQuery: null, editInstruction: null, confirmed: false };
  }
}

/**
 * Generate a Penny connector message (greeting, routing confirmation, etc).
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
 *
 * @param {Object} opts
 * @param {string} opts.profileId - Tendr user ID
 * @param {Object} opts.profile - Full profile row
 * @param {string} opts.message - User's text message
 * @param {string} opts.platform - 'slack' or 'teams'
 * @param {string} opts.channelId - Channel/DM ID
 * @param {string} opts.threadId - Thread timestamp
 * @param {string} opts.messageId - Source message ID (Slack ts)
 * @param {Function} opts.postMessage - Function to post a reply (text, blocks)
 */
async function handleMessage({ profileId, profile, message, platform, channelId, threadId, messageId, postMessage }) {
  const sanitizedMessage = wrapUserContent(message);

  // 1. Resolve existing conversation
  let convo = await resolveConversation(platform, channelId, threadId);
  let project = null;

  if (convo?.projectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, convo.projectId)).limit(1);
    project = p || null;
  }

  // 2. Classify intent
  const phase = convo?.phase || project?.phase || 'none';
  const intent = await classifyIntent(message, phase);

  // 3. Route based on intent
  switch (intent.intent) {
    case 'greeting': {
      const firstName = (profile.fullName || '').split(' ')[0] || 'there';
      const reply = await pennyMessage(message, `User's name is ${firstName}. This is their first message.`);
      await postMessage(reply);
      return;
    }

    case 'new_project':
    case 'confirm_doctype': {
      // If we already have a docType confirmation, create the project
      if (intent.docType && intent.confirmed) {
        return await startProject({ profileId, profile, docType: intent.docType, message, platform, channelId, threadId, messageId, postMessage });
      }

      // Infer docType and ask for confirmation
      if (intent.docType) {
        const agent = getAgent(intent.docType);
        const reply = await pennyMessage(
          message,
          `I think this is a ${intent.docType.toUpperCase()}. The specialist is ${agent.name}. Ask to confirm.`
        );
        await postMessage(reply);
      } else {
        const reply = await pennyMessage(message, 'User described a project but I cannot tell if they need an RFP, RFI, or brainstorm. Ask them.');
        await postMessage(reply);
      }
      return;
    }

    case 'planning': {
      // If no conversation yet, check if this looks like a new project
      if (!convo) {
        // Try to match to an existing project or start fresh
        if (intent.docType) {
          return await startProject({ profileId, profile, docType: intent.docType, message, platform, channelId, threadId, messageId, postMessage });
        }
        // Treat as new project intent
        const reply = await pennyMessage(message, 'User seems to want to work on something. Ask what they need — RFP, RFI, or just brainstorming.');
        await postMessage(reply);
        return;
      }

      // Continue planning conversation
      return await continuePlanning({ convo, project, message, messageId, profileId, postMessage });
    }

    case 'generate': {
      if (!project || !project.briefData) {
        await postMessage("I don't have a brief ready yet — let's keep planning first.");
        return;
      }
      return await startGeneration({ convo, project, profile, postMessage });
    }

    case 'edit_section': {
      if (!project || project.phase !== 'done') {
        await postMessage("I can only edit sections after the document is generated. Let's finish generation first.");
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
      // Fallback: if we have an active conversation, treat as planning
      if (convo && project && ['intake', 'scope_lock', 'requirements', 'eval_pricing', 'question_design', 'exploring'].includes(project.phase)) {
        return await continuePlanning({ convo, project, message, messageId, profileId, postMessage });
      }
      const reply = await pennyMessage(message, "I'm not sure what the user needs. Ask them to clarify.");
      await postMessage(reply);
    }
  }
}

/**
 * Create a new project and start the planning conversation.
 */
async function startProject({ profileId, profile, docType, message, platform, channelId, threadId, messageId, postMessage }) {
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

  // Get agent and post routing message
  const agent = getAgent(docType);
  await postMessage(`Got it — connecting you with ${agent.name}.`);

  // Route first message through planning agent
  const planningMessages = [
    { role: 'user', content: message, source: platform, sourceMessageId: messageId, authorId: profileId, timestamp: new Date().toISOString() },
  ];

  const agentResponse = await planningChat({
    messages: planningMessages,
    fileContext: project.fileContext || '',
    model: project.model || 'sonnet',
    docType: project.documentType,
  });

  // Save messages
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

  await postMessage(agentResponse);
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

  // Call planning agent
  const agentResponse = await planningChat({
    messages: planningMessages,
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

  await postMessage(agentResponse);
}

/**
 * Generate brief and ask for approval, or start generation if brief exists.
 */
async function startGeneration({ convo, project, profile, postMessage }) {
  const agent = getAgent(project.documentType);
  const firstName = (profile.fullName || '').split(' ')[0] || 'there';

  // If no brief yet, generate one first
  if (!project.briefData) {
    await postMessage("Let me put together a brief first...");

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
      `Here's what ${agent.name} put together:\n\n*${brief.projectTitle || 'Untitled'}*\n${brief.projectDescription || ''}\n\nSections (${(brief.suggestedSections || []).length}):\n${sectionList}\n\nWant me to generate the full document?`
    );
    return;
  }

  // Brief exists — start pipeline
  await postMessage(`${agent.name}'s on it — I'll ping you when the document's ready.`);

  pipelineRunner.runAsync({
    projectId: project.id,
    brief: project.briefData,
    project,
    onStart: () => {},
    onDone: async ({ sectionCount }) => {
      await postMessage(
        `Hey ${firstName}, your ${project.title || 'document'} is ready — ${sectionCount} sections.`
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
    // List available sections
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

  // Save updated section
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
