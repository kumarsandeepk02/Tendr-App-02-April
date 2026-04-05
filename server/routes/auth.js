const express = require('express');
const crypto = require('crypto');
const { WorkOS } = require('@workos-inc/node');
const { authMiddleware, getAuth, resolveProfile, decodeJwtPayload } = require('../middleware/auth');
const { db } = require('../db');
const { oauthStates } = require('../db/schema');
const { eq, lt } = require('drizzle-orm');

const router = express.Router();

const workos = process.env.WORKOS_API_KEY
  ? new WorkOS(process.env.WORKOS_API_KEY)
  : null;

const IS_PROD = process.env.NODE_ENV === 'production';

function isDevBypassAllowed() {
  return (
    process.env.ALLOW_DEV_AUTH_BYPASS === 'true' && !IS_PROD
  );
}

/**
 * Race a promise against a timeout.
 */
function withTimeout(promise, ms, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Shared cookie options for the session cookie. */
function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? 'none' : 'lax', // 'none' required for cross-origin cookies
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    signed: true,
  };
}

// ── DB-backed state store for OAuth CSRF protection ─────────────────────
// Replaces in-memory Map — survives restarts, works across instances.
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

async function setOAuthState(key, data) {
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  await db.insert(oauthStates).values({ key, data, expiresAt }).onConflictDoUpdate({
    target: oauthStates.key,
    set: { data, expiresAt },
  });
}

async function getAndDeleteOAuthState(key) {
  const [row] = await db.select().from(oauthStates).where(eq(oauthStates.key, key)).limit(1);
  if (!row) return null;
  await db.delete(oauthStates).where(eq(oauthStates.key, key));
  if (row.expiresAt < new Date()) return null; // expired
  return row.data;
}

// Clean up expired states every 5 minutes
setInterval(async () => {
  try {
    await db.delete(oauthStates).where(lt(oauthStates.expiresAt, new Date()));
  } catch (err) {
    console.warn('OAuth state cleanup error:', err.message);
  }
}, 5 * 60_000);

/**
 * GET /api/auth/login
 * Returns the WorkOS authorization URL for the frontend to redirect to.
 */
router.get('/login', async (req, res) => {
  if (isDevBypassAllowed()) {
    return res.json({
      dev: true,
      message: 'Dev mode — call /api/auth/me to authenticate.',
    });
  }

  if (!workos) {
    return res.status(503).json({ error: 'Authentication service not configured' });
  }

  // Generate cryptographically random state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');
  const stateData = {};

  // If this login was triggered from Slack (Penny auth link), stash the Slack IDs
  if (req.query.linkSlack) {
    stateData.linkSlack = req.query.linkSlack;
    stateData.slackWorkspaceId = req.query.workspaceId || '';
  }

  await setOAuthState(state, stateData);

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: process.env.WORKOS_CLIENT_ID,
    redirectUri: process.env.WORKOS_REDIRECT_URI,
    state,
  });

  // If called from Slack (direct browser redirect), redirect directly instead of returning JSON
  if (req.query.linkSlack) {
    return res.redirect(authorizationUrl);
  }

  res.json({ url: authorizationUrl });
});

/**
 * GET /api/auth/callback?code=xxx&state=yyy
 * Exchanges the authorization code for a user + session.
 * Redirects to frontend with a one-time exchange code.
 *
 * If state contains a linkSlack param, the Slack identity is linked
 * to the authenticated user's profile automatically.
 */
router.get('/callback', async (req, res) => {
  try {
    if (isDevBypassAllowed()) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/callback`);
    }

    if (!workos) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?reason=not_configured`);
    }

    const { code, state } = req.query;

    // ── Validate OAuth state (DB-backed, one-time use) ──────────────
    const stateData = await getAndDeleteOAuthState(state);
    if (!stateData) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?reason=invalid_state`);
    }

    if (!code) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?reason=missing_code`);
    }

    // ── Exchange code server-side (with timeout) ───────────────────────
    const result = await withTimeout(
      workos.userManagement.authenticateWithCode({
        code,
        clientId: process.env.WORKOS_CLIENT_ID,
      }),
      10_000,
      'Authentication provider timed out'
    );

    // ── Link Slack identity if this auth was triggered from Penny ────
    if (stateData.linkSlack && stateData.slackWorkspaceId) {
      try {
        const { linkExternalIdentity } = require('../services/chatPlatform/userResolver');

        const payload = decodeJwtPayload(result.accessToken);
        const profile = await resolveProfile(payload.sub, {
          fullName: `${result.user?.firstName || ''} ${result.user?.lastName || ''}`.trim(),
        });

        await linkExternalIdentity({
          profileId: profile.id,
          provider: 'slack',
          externalUserId: stateData.linkSlack,
          externalWorkspaceId: stateData.slackWorkspaceId,
        });
        console.log(`Linked Slack user ${stateData.linkSlack} to profile ${profile.id}`);
      } catch (linkErr) {
        console.error('Slack identity link failed (non-blocking):', linkErr.message);
      }
    }

    // Store access token in a one-time exchange code (DB-backed)
    const exchangeCode = crypto.randomBytes(32).toString('hex');
    await setOAuthState(`exchange:${exchangeCode}`, {
      accessToken: result.accessToken,
    });

    // Redirect to frontend with the exchange code
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback?exchange_code=${exchangeCode}`);
  } catch (error) {
    console.error('Auth callback error:', error.message);
    const reason = error.message.includes('timed out') ? 'timeout' : 'exchange_failed';
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?reason=${reason}`);
  }
});

/**
 * POST /api/auth/exchange
 * Exchanges a one-time code for a session cookie.
 * Called by the frontend after the callback redirect.
 */
router.post('/exchange', async (req, res) => {
  const { exchange_code } = req.body;
  if (!exchange_code) {
    return res.status(400).json({ error: 'Missing exchange code' });
  }

  const entry = await getAndDeleteOAuthState(`exchange:${exchange_code}`);

  if (!entry || !entry.accessToken) {
    return res.status(401).json({ error: 'Invalid or expired exchange code' });
  }

  // Set cookie (works in same-origin/local dev) and return token in body
  // (for cross-origin prod where Vercel proxy strips Set-Cookie headers).
  res.cookie('tendr_session', entry.accessToken, sessionCookieOptions());
  res.json({ success: true, token: entry.accessToken });
});

/**
 * GET /api/auth/me
 * Returns the current user's profile (requires auth).
 */
router.get('/me', authMiddleware, (req, res) => {
  const { profile } = getAuth(req);
  res.json({ profile });
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
router.post('/logout', (req, res) => {
  res.clearCookie('tendr_session', { path: '/' });
  res.json({ success: true });
});

module.exports = router;
