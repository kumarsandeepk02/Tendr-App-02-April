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
    sameSite: 'lax',
    path: '/',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    signed: true,
    domain: IS_PROD ? '.moleculeone.ai' : undefined,
  };
}

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

  // Store state in a short-lived signed cookie
  res.cookie('oauth_state', state, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
    signed: true,
    domain: IS_PROD ? '.moleculeone.ai' : undefined,
  });

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
 * Sets an HttpOnly session cookie instead of returning tokens in the URL.
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

    // ── Validate OAuth state ───────────────────────────────────────────
    const storedState = req.signedCookies?.oauth_state;
    res.clearCookie('oauth_state', { path: '/', domain: IS_PROD ? '.moleculeone.ai' : undefined });

    if (!state || !storedState || state !== storedState) {
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

    // ── Set HttpOnly session cookie ────────────────────────────────────
    res.cookie('tendr_session', result.accessToken, sessionCookieOptions());

    // Redirect to frontend callback without any tokens in the URL
    res.redirect(`${process.env.FRONTEND_URL}/auth/callback`);
  } catch (error) {
    console.error('Auth callback error:', error.message);
    const reason = error.message.includes('timed out') ? 'timeout' : 'exchange_failed';
    res.redirect(`${process.env.FRONTEND_URL}/auth/error?reason=${reason}`);
  }
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
  res.clearCookie('tendr_session', { path: '/', domain: IS_PROD ? '.moleculeone.ai' : undefined });
  res.json({ success: true });
});

module.exports = router;
