/**
 * Slack Routes — plain Express router with manual signature verification.
 *
 * Handles:
 * - Slack OAuth install + callback
 * - Slack event API (messages, mentions, file_shared)
 * - Slash commands (/penny)
 * - Interactivity (button clicks)
 */

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { WebClient } = require('@slack/web-api');
const { resolveUser } = require('../services/chatPlatform/userResolver');
const { handleMessage } = require('../services/chatPlatform/bridge');
const { formatAuthLink, downloadSlackFile } = require('../services/chatPlatform/slackAdapter');

const router = express.Router();

// Slack WebClient — initialized lazily once we have a valid token
let slackClient = null;
function getSlackClient() {
  if (!slackClient) {
    const token = process.env.SLACK_BOT_TOKEN;
    if (token && token.startsWith('xoxb-')) {
      slackClient = new WebClient(token);
    }
  }
  return slackClient;
}

// ── Signature Verification ─────────────────────────────────────────────────

/**
 * Verify that a request actually came from Slack.
 * Must be applied BEFORE express.json() parses the body (needs raw body).
 */
function verifySlackSignature(req, res, next) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return res.status(500).send('Signing secret not configured');

  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSig = req.headers['x-slack-signature'];

  if (!timestamp || !slackSig) return res.status(400).send('Missing Slack headers');

  // Prevent replay attacks (5 min window)
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return res.status(400).send('Request too old');
  }

  const sigBaseString = `v0:${timestamp}:${req.rawBody}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSig))) {
    return res.status(400).send('Invalid signature');
  }

  next();
}

/**
 * Express middleware to parse raw body for Slack signature verification.
 * Uses express.raw() to get the buffer, then parses JSON/URL-encoded.
 */
const rawBodyParser = express.raw({ type: '*/*', limit: '5mb' });

function captureRawBody(req, res, next) {
  // If body is already a Buffer (from express.raw), use it
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString('utf8');
    try {
      req.body = JSON.parse(req.rawBody);
    } catch {
      req.body = Object.fromEntries(new URLSearchParams(req.rawBody));
    }
    return next();
  }

  // If body is already parsed (e.g. by proxy), reconstruct raw string
  if (req.body && typeof req.body === 'object') {
    req.rawBody = JSON.stringify(req.body);
    return next();
  }

  // Fallback: read stream manually
  let data = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => { data += chunk; });
  req.on('end', () => {
    req.rawBody = data;
    try {
      req.body = JSON.parse(data);
    } catch {
      req.body = Object.fromEntries(new URLSearchParams(data));
    }
    next();
  });
}

// ── Helper: post message to a thread ───────────────────────────────────────
async function postToThread(channelId, threadTs, text, blocks) {
  const client = getSlackClient();
  if (!client) {
    console.error('Slack client not initialized — missing valid SLACK_BOT_TOKEN');
    return;
  }
  try {
    await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text,
      ...(blocks ? { blocks } : {}),
    });
  } catch (err) {
    console.error('Slack postMessage error:', err.message);
  }
}

// ── Helper: resolve profile or send auth link ──────────────────────────────
async function resolveOrAuth(slackUserId, workspaceId, channelId, threadTs) {
  const profile = await resolveUser('slack', slackUserId, workspaceId);
  if (!profile) {
    const authMsg = formatAuthLink(slackUserId);
    await postToThread(channelId, threadTs, authMsg.text, authMsg.blocks);
    return null;
  }
  return profile;
}

// ═══════════════════════════════════════════════════════════════════════════
// OAuth Routes (plain GET — no signature verification needed)
// ═══════════════════════════════════════════════════════════════════════════

// Resolve the public base URL (prod Vercel domain or localhost for dev)
function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  if (process.env.NODE_ENV === 'production' || req.get('host')?.includes('vercel.app')) {
    return `https://${req.get('host')}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}

// GET /api/slack/install
router.get('/install', (req, res) => {
  const scopes = 'chat:write,commands,files:read,im:history,im:write,app_mentions:read,users:read';
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = `${getBaseUrl(req)}/api/slack/oauth/callback`;
  res.redirect(`https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}`);
});

// GET /api/slack/oauth/callback
router.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    console.error('Slack OAuth error:', error);
    return res.status(400).send(`Slack OAuth error: ${error}. <a href="/api/slack/install">Try again</a>`);
  }
  if (!code) {
    return res.status(400).send('Missing authorization code. <a href="/api/slack/install">Try again</a>');
  }

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${getBaseUrl(req)}/api/slack/oauth/callback`,
      }),
    });

    const data = await response.json();
    if (!data.ok) {
      console.error('Slack OAuth token exchange failed:', data.error);
      return res.status(400).send(`OAuth failed: ${data.error}. <a href="/api/slack/install">Try again</a>`);
    }

    const botToken = data.access_token;
    const teamName = data.team?.name;

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Slack app installed successfully!');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Team: ${teamName} (${data.team?.id})`);
    console.log(`  Bot User ID: ${data.bot_user_id}`);
    console.log(`  SLACK_BOT_TOKEN=${botToken}`);
    console.log('═══════════════════════════════════════════════════');

    // Reset the cached client so it picks up the new token next time
    slackClient = null;

    res.send(`
      <html>
        <body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 80px auto; text-align: center;">
          <h1>Penny is installed!</h1>
          <p>Workspace: <strong>${teamName}</strong></p>
          <p style="background: #f4f4f4; padding: 16px; border-radius: 8px; font-family: monospace; word-break: break-all;">
            SLACK_BOT_TOKEN=<strong>${botToken}</strong>
          </p>
          <p>Copy the line above into your <code>server/.env</code>, then restart the server.</p>
          <p style="margin-top: 32px;"><a href="https://slack.com/app_redirect?app=${process.env.SLACK_APP_ID}">Open Penny in Slack</a></p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('Slack OAuth callback error:', err);
    res.status(500).send('OAuth failed. Check server logs.');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Event API (POST — requires signature verification + raw body)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/events', rawBodyParser, captureRawBody, verifySlackSignature, async (req, res) => {
  const body = req.body;

  // URL verification challenge (Slack sends this on initial setup)
  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  // Acknowledge immediately (Slack requires 200 within 3 seconds)
  res.status(200).send();

  // Process event asynchronously
  if (body.type === 'event_callback') {
    const event = body.event;
    const workspaceId = body.team_id;

    try {
      if (event.type === 'message' && !event.subtype && !event.bot_id) {
        await handleDM(event, workspaceId);
      } else if (event.type === 'app_mention') {
        await handleMention(event, workspaceId);
      }
    } catch (err) {
      console.error('Slack event handler error:', err);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Slash Commands (POST — URL-encoded body)
// ═══════════════════════════════════════════════════════════════════════════

router.post('/commands', rawBodyParser, captureRawBody, verifySlackSignature, async (req, res) => {
  // Acknowledge immediately
  res.status(200).send();

  const { user_id: slackUserId, team_id: workspaceId, text } = req.body;
  const args = (text || '').trim().split(/\s+/);
  const subcommand = args[0]?.toLowerCase();
  const responseUrl = req.body.response_url;

  const respond = async (msg) => {
    try {
      await fetch(responseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(typeof msg === 'string' ? { text: msg } : msg),
      });
    } catch (err) {
      console.error('Slack respond error:', err.message);
    }
  };

  const profile = await resolveUser('slack', slackUserId, workspaceId);
  if (!profile) {
    const authMsg = formatAuthLink(slackUserId);
    await respond({ text: authMsg.text, blocks: authMsg.blocks });
    return;
  }

  switch (subcommand) {
    case 'new': {
      const docType = args[1]?.toLowerCase() || 'rfp';
      const validTypes = ['rfp', 'rfi', 'brainstorm'];
      if (!validTypes.includes(docType)) {
        await respond('Invalid type. Use: `/penny new rfp`, `/penny new rfi`, or `/penny new brainstorm`');
        return;
      }
      await respond(`Starting a new ${docType.toUpperCase()} project. Send me a message describing what you need!`);
      return;
    }
    case 'list': {
      const { getActiveProjects } = require('../services/chatPlatform/bridge');
      const active = await getActiveProjects(profile.id);
      if (active.length === 0) {
        await respond("You don't have any active projects. Use `/penny new` to start one!");
        return;
      }
      const list = active.map((p, i) => `${i + 1}. *${p.title}* (${(p.documentType || 'rfp').toUpperCase()}) — ${p.phase}`).join('\n');
      await respond(`Your active projects:\n\n${list}`);
      return;
    }
    case 'status': {
      await respond("Send this in a project thread and I'll give you the status.");
      return;
    }
    default: {
      await respond("Hey! I'm Penny. Here's what I can do:\n• `/penny new [rfp|rfi|brainstorm]` — Start a new project\n• `/penny list` — See your active projects\n• `/penny status` — Check project status (in a thread)\n\nOr just DM me and tell me what you need!");
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════════════════════

async function handleDM(event, workspaceId) {
  const slackUserId = event.user;
  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;

  const profile = await resolveOrAuth(slackUserId, workspaceId, channelId, threadTs);
  if (!profile) return;

  // Handle file uploads
  if (event.files && event.files.length > 0) {
    await handleFileUpload(event, profile, channelId, threadTs);
    return;
  }

  await handleMessage({
    profileId: profile.id,
    profile,
    message: event.text || '',
    platform: 'slack',
    channelId,
    threadId: threadTs,
    messageId: event.ts,
    postMessage: async (text, blocks) => {
      await postToThread(channelId, threadTs, text, blocks);
    },
  });
}

async function handleMention(event, workspaceId) {
  const slackUserId = event.user;
  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;

  const profile = await resolveOrAuth(slackUserId, workspaceId, channelId, threadTs);
  if (!profile) return;

  const text = (event.text || '').replace(/<@[A-Z0-9]+>/g, '').trim();

  await handleMessage({
    profileId: profile.id,
    profile,
    message: text,
    platform: 'slack',
    channelId,
    threadId: threadTs,
    messageId: event.ts,
    postMessage: async (msg, blocks) => {
      await postToThread(channelId, threadTs, msg, blocks);
    },
  });
}

async function handleFileUpload(event, profile, channelId, threadTs) {
  const { resolveConversation } = require('../services/chatPlatform/bridge');
  const { db } = require('../db');
  const { projects, uploadedFiles } = require('../db/schema');
  const { eq } = require('drizzle-orm');

  const convo = await resolveConversation('slack', channelId, threadTs);
  if (!convo || !convo.projectId) {
    await postToThread(channelId, threadTs, "I got a file, but I'm not sure which project it's for. Start a conversation first and then share the file.");
    return;
  }

  for (const file of event.files) {
    const supported = ['.pdf', '.docx', '.txt', '.doc'];
    const ext = (file.name || '').toLowerCase().match(/\.[^.]+$/)?.[0];

    if (!ext || !supported.includes(ext)) {
      await postToThread(channelId, threadTs, `I can only work with PDF, DOCX, and TXT files. \`${file.name}\` isn't a supported format.`);
      continue;
    }

    try {
      const token = process.env.SLACK_BOT_TOKEN;
      const fileUrl = file.url_private_download || file.url_private;
      const buffer = await downloadSlackFile(fileUrl, token);

      let extractedText = '';
      if (ext === '.pdf') {
        const pdfParse = require('pdf-parse');
        const parsed = await pdfParse(buffer);
        extractedText = parsed.text;
      } else if (ext === '.docx' || ext === '.doc') {
        const mammoth = require('mammoth');
        const result = await mammoth.extractRawText({ buffer });
        extractedText = result.value;
      } else {
        extractedText = buffer.toString('utf-8');
      }

      await db.insert(uploadedFiles).values({
        projectId: convo.projectId,
        userId: profile.id,
        fileName: file.name,
        fileType: ext.replace('.', ''),
        fileSize: file.size || buffer.length,
        extractedText: extractedText.substring(0, 50000),
      });

      const [project] = await db.select().from(projects).where(eq(projects.id, convo.projectId)).limit(1);
      const existingContext = project?.fileContext || '';
      const newContext = existingContext + `\n\n--- ${file.name} ---\n${extractedText.substring(0, 10000)}`;

      await db.update(projects).set({ fileContext: newContext, updatedAt: new Date() }).where(eq(projects.id, convo.projectId));

      await postToThread(channelId, threadTs, `Got it — I've added *${file.name}* to the project.`);

      const { planningChat } = require('../services/agents/planningAgent');
      const planningMessages = [...(project?.planningMessages || [])];
      planningMessages.push({
        role: 'user',
        content: `[Uploaded file: ${file.name}]`,
        source: 'slack',
        sourceMessageId: event.ts,
        authorId: profile.id,
        timestamp: new Date().toISOString(),
      });

      const agentResponse = await planningChat({
        messages: planningMessages,
        fileContext: newContext,
        model: project?.model || 'sonnet',
        docType: project?.documentType || 'rfp',
      });

      planningMessages.push({ role: 'assistant', content: agentResponse, source: 'agent', timestamp: new Date().toISOString() });
      await db.update(projects).set({ planningMessages, updatedAt: new Date() }).where(eq(projects.id, convo.projectId));
      await postToThread(channelId, threadTs, agentResponse);
    } catch (err) {
      console.error(`File processing error (${file.name}):`, err.message);
      await postToThread(channelId, threadTs, `I couldn't process *${file.name}* — try uploading it directly in Tendr instead.`);
    }
  }
}

module.exports = { slackRouter: router };
