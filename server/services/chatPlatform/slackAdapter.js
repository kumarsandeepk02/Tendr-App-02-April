/**
 * Slack Adapter — Slack-specific message formatting + API helpers.
 * Converts Tendr responses into Slack Block Kit format and provides
 * helpers for posting messages, downloading files, etc.
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

/**
 * Format a plain text response for Slack with optional deep-link button.
 */
function formatMessage(text, { deepLink, buttonText } = {}) {
  const blocks = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text },
    },
  ];

  if (deepLink && buttonText) {
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: buttonText },
          url: deepLink,
          action_id: 'open_tendr_link',
        },
      ],
    });
  }

  return { blocks, text }; // text is fallback for notifications
}

/**
 * Format the auth link message for unlinked users.
 */
function formatAuthLink(slackUserId, workspaceId) {
  const baseUrl = process.env.PUBLIC_URL || FRONTEND_URL;
  const authUrl = `${baseUrl}/api/auth/login?linkSlack=${encodeURIComponent(slackUserId)}&workspaceId=${encodeURIComponent(workspaceId || '')}`;
  return formatMessage(
    `Hey! I don't think we've met yet. Link your Tendr account so I can help you out:`,
    { deepLink: authUrl, buttonText: 'Sign in to Tendr' }
  );
}

/**
 * Format a brief summary for Slack.
 */
function formatBrief(brief, projectId) {
  const sectionList = (brief.suggestedSections || [])
    .map((s, i) => `${i + 1}. ${s.title}`)
    .join('\n');

  const text = `Here's what I put together:\n\n*${brief.projectTitle || 'Untitled'}*\n${brief.projectDescription || ''}\n\nSections (${(brief.suggestedSections || []).length}):\n${sectionList}\n\nWant me to generate the full document? Or review the brief in Tendr first?`;

  return formatMessage(text, {
    deepLink: `${FRONTEND_URL}/project/${projectId}?phase=brief`,
    buttonText: 'Review brief in Tendr',
  });
}

/**
 * Format a generation-complete message.
 */
function formatGenerationComplete(projectTitle, sectionCount, projectId, agentName) {
  const text = `Your ${projectTitle} is ready — ${sectionCount} sections. ${agentName} did the heavy lifting.`;
  return formatMessage(text, {
    deepLink: `${FRONTEND_URL}/project/${projectId}?phase=done`,
    buttonText: 'Open in Tendr',
  });
}

/**
 * Format a section-edit confirmation.
 */
function formatSectionEdited(sectionTitle, projectId, sectionId) {
  const text = `Done — updated the *${sectionTitle}* section.`;
  return formatMessage(text, {
    deepLink: `${FRONTEND_URL}/project/${projectId}?phase=done&section=${sectionId}`,
    buttonText: 'View changes',
  });
}

/**
 * Format an error message.
 */
function formatError(message) {
  return formatMessage(message || 'Something went wrong. Want to try again?');
}

/**
 * Format a project list for disambiguation.
 */
function formatProjectList(projects) {
  const list = projects
    .map((p, i) => `${i + 1}. *${p.title}* (${(p.documentType || 'rfp').toUpperCase()})`)
    .join('\n');

  return formatMessage(`Which project are you working on?\n\n${list}\n\nJust reply with the number.`);
}

/**
 * Build a deep-link URL to a project.
 */
function projectUrl(projectId, { phase, sectionId } = {}) {
  let url = `${FRONTEND_URL}/project/${projectId}`;
  const params = [];
  if (phase) params.push(`phase=${phase}`);
  if (sectionId) params.push(`section=${sectionId}`);
  if (params.length) url += '?' + params.join('&');
  return url;
}

/**
 * Download a file from Slack using the bot token.
 * Returns the file buffer.
 */
async function downloadSlackFile(fileUrl, botToken) {
  const fetch = require('node-fetch');
  const response = await fetch(fileUrl, {
    headers: { Authorization: `Bearer ${botToken}` },
  });
  if (!response.ok) {
    throw new Error(`Slack file download failed: ${response.status}`);
  }
  return response.buffer();
}

module.exports = {
  formatMessage,
  formatAuthLink,
  formatBrief,
  formatGenerationComplete,
  formatSectionEdited,
  formatError,
  formatProjectList,
  projectUrl,
  downloadSlackFile,
};
// NOTE: Only formatAuthLink and downloadSlackFile are currently imported.
// Other exports are available for deep-link features (Phase 3).
