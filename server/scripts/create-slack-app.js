#!/usr/bin/env node

/**
 * Create the Penny Slack app using the Slack Manifest API.
 *
 * Usage:
 *   node scripts/create-slack-app.js <config-token> [request-url]
 *
 * - config-token: Your Slack app configuration token (from api.slack.com/apps)
 * - request-url: (optional) Your server's public URL, default: http://localhost:3001
 *
 * After running, this script will output the credentials you need for .env.
 */

const fetch = require('node-fetch');

const CONFIG_TOKEN = process.argv[2];
const BASE_URL = process.argv[3] || 'http://localhost:3001';

if (!CONFIG_TOKEN) {
  console.error('Usage: node scripts/create-slack-app.js <config-token> [server-url]');
  console.error('');
  console.error('Get your config token at: https://api.slack.com/apps');
  console.error('Scroll to "Your App Configuration Tokens" → Generate Token');
  process.exit(1);
}

const manifest = {
  _metadata: {
    major_version: 2,
    minor_version: 1,
  },
  display_information: {
    name: 'Penny',
    description: 'Your Tendr coworker — build RFPs and RFIs right from Slack.',
    long_description:
      'Penny connects you with Tendr\'s AI specialists (Nova, Zuno, and Zia) to plan and generate procurement documents without leaving Slack. Start a conversation, upload reference docs, and get a polished RFP or RFI delivered back to you. All editing and export happens in the Tendr web app — Penny handles the conversation.',
    background_color: '#4A154B',
  },
  features: {
    bot_user: {
      display_name: 'Penny',
      always_online: true,
    },
    slash_commands: [
      {
        command: '/penny',
        description: 'Manage your Tendr projects',
        url: `${BASE_URL}/api/slack/events`,
        usage_hint: '[new rfp|rfi|brainstorm] [list] [status]',
        should_escape: false,
      },
    ],
  },
  oauth_config: {
    scopes: {
      bot: [
        'chat:write',
        'commands',
        'files:read',
        'im:history',
        'im:write',
        'app_mentions:read',
        'users:read',
      ],
    },
    redirect_urls: [`${BASE_URL}/api/slack/oauth/callback`],
  },
  settings: {
    event_subscriptions: {
      request_url: `${BASE_URL}/api/slack/events`,
      bot_events: ['message.im', 'app_mention', 'file_shared'],
    },
    socket_mode_enabled: false,
    interactivity: {
      is_enabled: true,
      request_url: `${BASE_URL}/api/slack/events`,
    },
    org_deploy_enabled: false,
  },
};

async function createApp() {
  console.log('Creating Penny Slack app...');
  console.log(`Server URL: ${BASE_URL}`);
  console.log('');

  const response = await fetch('https://slack.com/api/apps.manifest.create', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CONFIG_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ manifest }),
  });

  const data = await response.json();

  if (!data.ok) {
    console.error('Failed to create app:', data.error);
    if (data.errors) {
      console.error('Validation errors:');
      for (const err of data.errors) {
        console.error(`  - ${err.message} (${err.pointer || 'unknown field'})`);
      }
    }
    process.exit(1);
  }

  console.log('Penny Slack app created!');
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Add these to your server/.env file:');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log(`SLACK_APP_ID=${data.app_id}`);
  console.log(`SLACK_CLIENT_ID=${data.credentials.client_id}`);
  console.log(`SLACK_CLIENT_SECRET=${data.credentials.client_secret}`);
  console.log(`SLACK_SIGNING_SECRET=${data.credentials.signing_secret}`);
  console.log('');
  console.log('═══════════════════════════════════════════════════');
  console.log('');
  console.log('NEXT STEPS:');
  console.log(`1. Install the app to your workspace: ${data.oauth_authorize_url}`);
  console.log('2. After installing, copy the Bot User OAuth Token (xoxb-...) from:');
  console.log(`   https://api.slack.com/apps/${data.app_id}/oauth`);
  console.log('3. Add SLACK_BOT_TOKEN=xoxb-... to your .env');
  console.log('4. Restart your server');
  console.log('');

  return data;
}

createApp().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
