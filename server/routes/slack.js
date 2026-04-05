/**
 * Slack Routes — plain Express router with manual signature verification.
 *
 * DMs: flat conversation (no threads) — natural chat UX.
 * Channel mentions: threaded — keeps channels clean.
 */

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { WebClient } = require('@slack/web-api');
const { resolveUser } = require('../services/chatPlatform/userResolver');
const { handleMessage, resolveConversation } = require('../services/chatPlatform/bridge');
const { formatAuthLink, downloadSlackFile } = require('../services/chatPlatform/slackAdapter');

const router = express.Router();

// In-memory store for Slack OAuth state (short-lived, 5-min TTL)
const slackOAuthStates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, ts] of slackOAuthStates) {
    if (now - ts > 5 * 60 * 1000) slackOAuthStates.delete(key);
  }
}, 60 * 1000);

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

function verifySlackSignature(req, res, next) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return res.status(500).send('Signing secret not configured');

  const timestamp = req.headers['x-slack-request-timestamp'];
  const slackSig = req.headers['x-slack-signature'];

  if (!timestamp || !slackSig) return res.status(400).send('Missing Slack headers');
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return res.status(400).send('Request too old');

  const sigBaseString = `v0:${timestamp}:${req.rawBody}`;
  const mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret).update(sigBaseString).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(mySignature), Buffer.from(slackSig))) {
    return res.status(400).send('Invalid signature');
  }
  next();
}

const rawBodyParser = express.raw({ type: '*/*', limit: '5mb' });

function captureRawBody(req, res, next) {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString('utf8');
    try {
      req.body = JSON.parse(req.rawBody);
    } catch {
      req.body = Object.fromEntries(new URLSearchParams(req.rawBody));
    }
    return next();
  }
  if (req.body && typeof req.body === 'object') {
    req.rawBody = JSON.stringify(req.body);
    return next();
  }
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

// ── Message posting helpers ────────────────────────────────────────────────

/**
 * Post a message to Slack.
 * - DMs: posts flat in the channel (no thread_ts) for natural conversation flow.
 * - Channels: posts in a thread to keep the channel clean.
 */
async function postSlackMessage(channelId, text, blocks, { threadTs } = {}) {
  const client = getSlackClient();
  if (!client) {
    console.error('Slack client not initialized — missing valid SLACK_BOT_TOKEN');
    return;
  }
  try {
    await client.chat.postMessage({
      channel: channelId,
      text,
      ...(blocks ? { blocks } : {}),
      ...(threadTs ? { thread_ts: threadTs } : {}),
    });
  } catch (err) {
    console.error('Slack postMessage error:', err.message);
  }
}

// ── Helper: resolve profile or send auth link ──────────────────────────────
async function resolveOrAuth(slackUserId, workspaceId, channelId, opts = {}) {
  const profile = await resolveUser('slack', slackUserId, workspaceId);
  if (!profile) {
    const authMsg = formatAuthLink(slackUserId, workspaceId);
    await postSlackMessage(channelId, authMsg.text, authMsg.blocks, opts);
    return null;
  }
  return profile;
}

// ═══════════════════════════════════════════════════════════════════════════
// OAuth Routes
// ═══════════════════════════════════════════════════════════════════════════

function getBaseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  if (process.env.NODE_ENV === 'production' || req.get('host')?.includes('vercel.app')) {
    return `https://${req.get('host')}`;
  }
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/install', (req, res) => {
  const scopes = 'chat:write,commands,files:read,im:history,im:write,app_mentions:read,users:read';
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = `${getBaseUrl(req)}/api/slack/oauth/callback`;
  const state = crypto.randomBytes(24).toString('hex');
  slackOAuthStates.set(state, Date.now());
  res.redirect(`https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`);
});

router.get('/oauth/callback', async (req, res) => {
  const { code, error, state } = req.query;

  if (error) {
    console.error('Slack OAuth error:', error);
    return res.status(400).send(`Slack OAuth error: ${error}. <a href="/api/slack/install">Try again</a>`);
  }
  if (!code) {
    return res.status(400).send('Missing authorization code. <a href="/api/slack/install">Try again</a>');
  }
  if (!state || !slackOAuthStates.has(state)) {
    return res.status(400).send('Invalid or expired OAuth state. <a href="/api/slack/install">Try again</a>');
  }
  slackOAuthStates.delete(state);

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

    // Store token in env for this process (persists until restart)
    process.env.SLACK_BOT_TOKEN = botToken;
    slackClient = null;

    console.log(`Slack app installed successfully for team: ${teamName} (${data.team?.id})`);

    res.send(`
      <html>
        <body style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 80px auto; text-align: center;">
          <h1>Penny is installed!</h1>
          <p>Workspace: <strong>${teamName}</strong></p>
          <p style="background: #e8f5e9; padding: 16px; border-radius: 8px; color: #2e7d32;">
            Bot token has been configured. You're all set!
          </p>
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
// Event API
// ═══════════════════════════════════════════════════════════════════════════

router.post('/events', rawBodyParser, captureRawBody, verifySlackSignature, async (req, res) => {
  const body = req.body;

  if (body.type === 'url_verification') {
    return res.json({ challenge: body.challenge });
  }

  res.status(200).send();

  if (body.type === 'event_callback') {
    const event = body.event;
    const workspaceId = body.team_id;

    try {
      if (event.type === 'message' && !event.subtype && !event.bot_id) {
        // DMs: channel_type === 'im'
        const isDM = event.channel_type === 'im';
        if (isDM) {
          await handleDM(event, workspaceId);
        } else {
          // Message in a channel — only respond if in a thread we're tracking
          await handleChannelThread(event, workspaceId);
        }
      } else if (event.type === 'app_mention') {
        await handleMention(event, workspaceId);
      }
    } catch (err) {
      console.error('Slack event handler error:', err);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Slash Commands
// ═══════════════════════════════════════════════════════════════════════════

router.post('/commands', rawBodyParser, captureRawBody, verifySlackSignature, async (req, res) => {
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
    const authMsg = formatAuthLink(slackUserId, workspaceId);
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
      await respond("DM me 'status' and I'll tell you where your project stands.");
      return;
    }
    default: {
      await respond("Hey! I'm Penny. Here's what I can do:\n• `/penny new [rfp|rfi|brainstorm]` — Start a new project\n• `/penny list` — See your active projects\n\nOr just DM me and tell me what you need!");
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Event Handlers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Handle DM messages — flat conversation, no threads.
 * Conversation tracked by channelId only (one active project per DM).
 */
async function handleDM(event, workspaceId) {
  const slackUserId = event.user;
  const channelId = event.channel;

  // For DMs: use channelId as the threadId too (flat conversation key)
  const conversationKey = channelId;

  const profile = await resolveOrAuth(slackUserId, workspaceId, channelId);
  if (!profile) return;

  if (event.files && event.files.length > 0) {
    await handleFileUpload(event, profile, channelId, conversationKey);
    return;
  }

  await handleMessage({
    profileId: profile.id,
    profile,
    message: event.text || '',
    platform: 'slack',
    channelId,
    threadId: conversationKey,
    messageId: event.ts,
    postMessage: async (text, blocks) => {
      // DMs: post flat — no thread_ts
      await postSlackMessage(channelId, text, blocks);
    },
  });
}

/**
 * Handle @Penny mentions in channels — use threads.
 */
async function handleMention(event, workspaceId) {
  const slackUserId = event.user;
  const channelId = event.channel;
  const threadTs = event.thread_ts || event.ts;

  const profile = await resolveOrAuth(slackUserId, workspaceId, channelId, { threadTs });
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
      // Channels: post in thread
      await postSlackMessage(channelId, msg, blocks, { threadTs });
    },
  });
}

/**
 * Handle messages in channel threads we're already tracking.
 */
async function handleChannelThread(event, workspaceId) {
  if (!event.thread_ts) return; // Not in a thread — ignore

  const convo = await resolveConversation('slack', event.channel, event.thread_ts);
  if (!convo) return; // Not a thread we're tracking

  // Treat like a mention in an existing thread
  await handleMention(event, workspaceId);
}

/**
 * Handle file uploads: download, parse, save to DB, then route through
 * handleMessage so the planning agent gets the file context with proper
 * identity override and prompt defense.
 */
async function handleFileUpload(event, profile, channelId, conversationKey, threadTs) {
  const { resolveConversation } = require('../services/chatPlatform/bridge');
  const { db } = require('../db');
  const { projects, uploadedFiles } = require('../db/schema');
  const { eq } = require('drizzle-orm');

  const convo = await resolveConversation('slack', channelId, conversationKey);
  if (!convo || !convo.projectId) {
    await postSlackMessage(channelId, "I got a file, but I'm not sure which project it's for. Start a conversation first and then share the file.", null, { threadTs });
    return;
  }

  const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

  for (const file of event.files) {
    const supported = ['.pdf', '.docx', '.txt', '.doc'];
    const ext = (file.name || '').toLowerCase().match(/\.[^.]+$/)?.[0];

    if (!ext || !supported.includes(ext)) {
      await postSlackMessage(channelId, `I can only work with PDF, DOCX, and TXT files. \`${file.name}\` isn't a supported format.`, null, { threadTs });
      continue;
    }

    if (file.size && file.size > MAX_FILE_SIZE) {
      await postSlackMessage(channelId, `\`${file.name}\` is too large (${Math.round(file.size / 1024 / 1024)}MB). Max file size is 20MB — try uploading directly in Tendr.`, null, { threadTs });
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

      // Save file record
      await db.insert(uploadedFiles).values({
        projectId: convo.projectId,
        userId: profile.id,
        fileName: file.name,
        fileType: ext.replace('.', ''),
        fileSize: file.size || buffer.length,
        extractedText: extractedText.substring(0, 50000),
      });

      // Append to project fileContext
      const [project] = await db.select().from(projects).where(eq(projects.id, convo.projectId)).limit(1);
      const newContext = (project?.fileContext || '') + `\n\n--- ${file.name} ---\n${extractedText.substring(0, 10000)}`;
      await db.update(projects).set({ fileContext: newContext, updatedAt: new Date() }).where(eq(projects.id, convo.projectId));

      await postSlackMessage(channelId, `Got it — I've added *${file.name}* to the project.`, null, { threadTs });

      // Route through handleMessage so the planning agent gets proper context
      await handleMessage({
        profileId: profile.id,
        profile,
        message: `[Uploaded file: ${file.name}]`,
        platform: 'slack',
        channelId,
        threadId: conversationKey,
        messageId: event.ts,
        postMessage: async (text, blocks) => {
          await postSlackMessage(channelId, text, blocks, { threadTs });
        },
      });
    } catch (err) {
      console.error(`File processing error (${file.name}):`, err.message);
      await postSlackMessage(channelId, `I couldn't process *${file.name}* — try uploading it directly in Tendr instead.`, null, { threadTs });
    }
  }
}

module.exports = { slackRouter: router };
