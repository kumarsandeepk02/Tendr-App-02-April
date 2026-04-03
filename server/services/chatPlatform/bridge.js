/**
 * ChatPlatformBridge — Platform-agnostic conversation router.
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

// Phases where the user is still providing project details
const PLANNING_PHASES = ['intake', 'scope_lock', 'requirements', 'eval_pricing', 'question_design', 'exploring'];

/**
 * Get a human-friendly agent label from docType using agentDefinitions as source of truth.
 */
function getAgentLabel(docType) {
  const agent = getAgent(docType);
  const roleLabels = { 'RFP Builder': 'RFP writer', 'RFI Builder': 'RFI specialist', 'Brainstorm': 'strategy partner' };
  return `${agent.name}, our ${roleLabels[agent.role] || agent.role.toLowerCase()}`;
}

/**
 * Extract first name from profile, with fallback.
 */
function getFirstName(profile) {
  return (profile.fullName || '').split(' ')[0] || 'there';
}

/**
 * Strip agent self-introductions from responses.
 * Agents introduce themselves in first response — strip that for Slack where Penny is the face.
 */
function stripAgentIntro(text) {
  return text
    .replace(/^(?:Hey(?: there)?[!.]?|Hi[!.]?)\s*I'm (?:Nova|Zuno|Zia)[^.!?\n]*[.!?]?\s*/i, '')
    .replace(/^\s*—\s*/, '')
    .trim();
}

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
- "new_project": user describes a project need AND we know or can infer the doc type
- "planning": user is answering questions or providing project details in an ongoing conversation
- "generate": user explicitly says "generate", "go for it", "let's do it", "build it", "I'm ready", "looks good generate", "yes go ahead" after seeing a brief
- "edit_section": user wants to modify a specific section of an existing document (phase must be "done")
- "status": user asks about progress, says "status?", "how's it going?", "is it done?", "update?" etc.
- If phase is "intake" or "exploring" and user provides project details, classify as "planning"
- If phase is "done" and mentions a section name, classify as "edit_section"
- When in doubt between "new_project" and "planning", prefer "planning" if a conversation already exists
- "let us build an RFP" = new_project with docType "rfp", NOT "generate"
- Return ONLY the JSON. No explanations.`;

// Injected so agents don't break Penny's identity
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

async function createConversation({ platform, channelId, threadId, projectId, userId }) {
  const [convo] = await db
    .insert(chatConversations)
    .values({ platform, channelId, threadId, projectId, userId, phase: 'intake' })
    .returning();
  return convo;
}

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
async function classifyIntent(message, phase, conversationHistory) {
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
 * Build a status message based on current project phase. No LLM call needed.
 */
function getStatusMessage(project, agentLabel) {
  if (!project) return "We haven't started a project yet. What do you need?";

  const title = project.title !== 'Untitled Project' ? `*${project.title}*` : 'your document';

  switch (project.phase) {
    case 'intake':
    case 'scope_lock':
    case 'requirements':
    case 'eval_pricing':
    case 'question_design':
    case 'exploring':
      return `We're still in the planning phase for ${title}. Keep giving me details and I'll let you know when we have enough to build a brief.`;
    case 'readiness':
      return `I've got a brief ready for ${title}. Want me to generate the full document? Just say the word.`;
    case 'generating':
      return `${agentLabel} is still drafting ${title} — I'll ping you as soon as it's done. Hang tight!`;
    case 'handoff':
    case 'done':
      return `${title} is done! Let me know if you want to tweak any sections.`;
    default:
      return `${title} is in progress. What do you need?`;
  }
}

/**
 * Build messages array for the planning agent with Slack identity override.
 * Prepends a seed exchange so the agent doesn't self-introduce, and appends
 * the SLACK_AGENT_CONTEXT to the last user message.
 */
function buildAgentMessages(planningMessages) {
  const messagesForAgent = [
    { role: 'user', content: 'Hey, I need help with a procurement document.' },
    { role: 'assistant', content: 'Sure thing! Tell me about what you need and I\'ll start gathering the details.' },
    ...planningMessages,
  ];
  const lastIdx = messagesForAgent.length - 1;
  if (messagesForAgent[lastIdx].role === 'user') {
    messagesForAgent[lastIdx] = {
      ...messagesForAgent[lastIdx],
      content: messagesForAgent[lastIdx].content + `\n\n[${SLACK_AGENT_CONTEXT}]`,
    };
  }
  return messagesForAgent;
}

/**
 * Main message handler.
 */
async function handleMessage({ profileId, profile, message, platform, channelId, threadId, messageId, postMessage }) {
  // Wrap user content for prompt injection defense
  const sanitizedMessage = wrapUserContent(message);

  // 1. Resolve existing conversation
  let convo = await resolveConversation(platform, channelId, threadId);
  let project = null;

  if (convo?.projectId) {
    const [p] = await db.select().from(projects).where(eq(projects.id, convo.projectId)).limit(1);
    project = p || null;
  }

  // 2. Phase-aware fast paths — no LLM call needed
  if (project) {
    const agentLabel = getAgentLabel(project.documentType);

    // During generation: any message gets a status response
    if (project.phase === 'generating') {
      await postMessage(getStatusMessage(project, agentLabel));
      return;
    }

    // Quick status check keywords
    if (/^(status|update|how('?s| is) it going|is it (done|ready)|progress|where are we)\??$/i.test(message.trim())) {
      await postMessage(getStatusMessage(project, agentLabel));
      return;
    }

    // Active planning phase — skip intent classification, go straight to planning
    if (convo && PLANNING_PHASES.includes(project.phase)) {
      return await continuePlanning({ convo, project, message: sanitizedMessage, messageId, profileId, postMessage });
    }
  }

  // 3. Classify intent (only when needed — no active planning conversation)
  const conversationHistory = project?.planningMessages || [];
  const phase = convo?.phase || project?.phase || 'none';
  const intent = await classifyIntent(message, phase, conversationHistory);

  // 4. Route based on intent
  switch (intent.intent) {
    case 'greeting': {
      const reply = await pennyMessage(message, `User's name is ${getFirstName(profile)}. This is their first message. Greet them and ask what they need help with.`);
      await postMessage(reply);
      return;
    }

    case 'new_project': {
      const docType = intent.docType || 'rfp';
      return await startProject({
        profileId, profile, docType, message: sanitizedMessage, platform,
        channelId, threadId, messageId, postMessage,
        priorMessages: conversationHistory,
      });
    }

    case 'planning': {
      if (!convo) {
        if (intent.docType) {
          return await startProject({
            profileId, profile, docType: intent.docType, message: sanitizedMessage, platform,
            channelId, threadId, messageId, postMessage,
            priorMessages: conversationHistory,
          });
        }
        const reply = await pennyMessage(message, 'User wants to work on something but hasn\'t specified RFP, RFI, or brainstorm. Ask them naturally.');
        await postMessage(reply);
        return;
      }
      return await continuePlanning({ convo, project, message: sanitizedMessage, messageId, profileId, postMessage });
    }

    case 'generate': {
      if (!project) {
        await postMessage("We haven't started a project yet! Tell me what you need and I'll get us going.");
        return;
      }
      return await startGeneration({ convo, project, profile, postMessage });
    }

    case 'status': {
      const agentLabel = getAgentLabel(project?.documentType);
      await postMessage(getStatusMessage(project, agentLabel));
      return;
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
      if (convo && project && PLANNING_PHASES.includes(project.phase)) {
        return await continuePlanning({ convo, project, message: sanitizedMessage, messageId, profileId, postMessage });
      }
      const reply = await pennyMessage(message, "I'm not sure what the user needs. Ask them to clarify — do they want to build an RFP, RFI, or brainstorm?");
      await postMessage(reply);
    }
  }
}

/**
 * Create a new project and start the planning conversation.
 */
async function startProject({ profileId, profile, docType, message, platform, channelId, threadId, messageId, postMessage, priorMessages }) {
  const agentLabel = getAgentLabel(docType);

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

  await createConversation({
    platform, channelId, threadId,
    projectId: project.id,
    userId: profileId,
  });

  await postMessage(`On it — I'll be working with ${agentLabel} on this. Let me get some details from you.`);

  const planningMessages = [];
  if (priorMessages && priorMessages.length > 0) {
    for (const msg of priorMessages) {
      planningMessages.push({
        role: msg.role,
        content: msg.content,
        source: msg.source || platform,
        timestamp: msg.timestamp || new Date().toISOString(),
      });
    }
  }

  planningMessages.push({
    role: 'user',
    content: message,
    source: platform,
    sourceMessageId: messageId,
    authorId: profileId,
    timestamp: new Date().toISOString(),
  });

  const agentResponse = await planningChat({
    messages: buildAgentMessages(planningMessages),
    fileContext: project.fileContext || '',
    model: project.model || 'sonnet',
    docType: project.documentType,
  });

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

  planningMessages.push({
    role: 'user',
    content: message,
    source: 'slack',
    sourceMessageId: messageId,
    authorId: profileId,
    timestamp: new Date().toISOString(),
  });

  const agentResponse = await planningChat({
    messages: buildAgentMessages(planningMessages),
    fileContext: project.fileContext || '',
    model: project.model || 'sonnet',
    docType: project.documentType,
  });

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
  const agentLabel = getAgentLabel(project.documentType);
  const firstName = getFirstName(profile);

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

    const sectionList = (brief.suggestedSections || [])
      .map((s, i) => `${i + 1}. ${s.title}`)
      .join('\n');

    await postMessage(
      `Here's what I've put together:\n\n*${brief.projectTitle || 'Untitled'}*\n${brief.projectDescription || ''}\n\nSections (${(brief.suggestedSections || []).length}):\n${sectionList}\n\nWant me to generate the full document?`
    );
    return;
  }

  await postMessage(`Got it — ${agentLabel} is drafting the full document now. I'll ping you when it's ready.`);

  await db
    .update(projects)
    .set({ phase: 'generating', updatedAt: new Date() })
    .where(eq(projects.id, project.id));

  if (convo) {
    await db
      .update(chatConversations)
      .set({ phase: 'generating', updatedAt: new Date() })
      .where(eq(chatConversations.id, convo.id));
  }

  pipelineRunner.runAsync({
    projectId: project.id,
    brief: project.briefData,
    project,
    onStart: () => {},
    onDone: async ({ sectionCount }) => {
      await postMessage(
        `Hey ${firstName}, your document is ready — ${sectionCount} sections. Take a look and let me know if anything needs tweaking.`
      );

      if (convo) {
        await db
          .update(chatConversations)
          .set({ phase: 'done', lastActivity: new Date(), updatedAt: new Date() })
          .where(eq(chatConversations.id, convo.id));
      }
    },
    onError: async () => {
      await db
        .update(projects)
        .set({ phase: 'readiness', updatedAt: new Date() })
        .where(eq(projects.id, project.id));

      await postMessage(`Ran into an issue generating the document. Want to try again?`);
    },
  });
}

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
  getActiveProjects,
};
