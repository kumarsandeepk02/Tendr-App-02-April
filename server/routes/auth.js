const express = require('express');
const crypto = require('crypto');
const { WorkOS } = require('@workos-inc/node');
const { authMiddleware, getAuth } = require('../middleware/auth');

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

// ── Server-side state store for OAuth CSRF protection ────────────────────
// Cookies don't survive Vercel's reverse proxy, so we store state server-side.
// Map<state_string, { createdAt: number }>. Entries expire after 10 minutes.
const pendingStates = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingStates) {
    if (now - val.createdAt > 10 * 60 * 1000) pendingStates.delete(key);
  }
}, 60_000);

/**
 * GET /api/auth/login
 * Returns the WorkOS authorization URL for the frontend to redirect to.
 */
router.get('/login', (req, res) => {
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
  pendingStates.set(state, { createdAt: Date.now() });

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: process.env.WORKOS_CLIENT_ID,
    redirectUri: process.env.WORKOS_REDIRECT_URI,
    state,
  });

  res.json({ url: authorizationUrl });
});

/**
 * GET /api/auth/callback?code=xxx&state=yyy
 * Exchanges the authorization code for a user + session.
 * Redirects to frontend with a one-time exchange code.
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

    // ── Validate OAuth state (server-side store) ─────────────────────
    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${process.env.FRONTEND_URL}/auth/error?reason=invalid_state`);
    }
    pendingStates.delete(state);

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

    // Store access token in a one-time exchange code
    const exchangeCode = crypto.randomBytes(32).toString('hex');
    pendingStates.set(`exchange:${exchangeCode}`, {
      createdAt: Date.now(),
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
router.post('/exchange', (req, res) => {
  const { exchange_code } = req.body;
  if (!exchange_code) {
    return res.status(400).json({ error: 'Missing exchange code' });
  }

  const key = `exchange:${exchange_code}`;
  const entry = pendingStates.get(key);
  pendingStates.delete(key);

  if (!entry || !entry.accessToken) {
    return res.status(401).json({ error: 'Invalid or expired exchange code' });
  }

  // Check expiry (10 minutes)
  if (Date.now() - entry.createdAt > 10 * 60 * 1000) {
    return res.status(401).json({ error: 'Exchange code expired' });
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
