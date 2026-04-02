const express = require('express');
const { WorkOS } = require('@workos-inc/node');
const { authMiddleware, getAuth } = require('../middleware/auth');

const router = express.Router();

const workos = process.env.WORKOS_API_KEY
  ? new WorkOS(process.env.WORKOS_API_KEY)
  : null;

const IS_DEV = !process.env.WORKOS_API_KEY || process.env.NODE_ENV === 'development';

/**
 * GET /api/auth/login
 * Returns the WorkOS authorization URL for the frontend to redirect to.
 */
router.get('/login', (req, res) => {
  if (IS_DEV) {
    return res.json({
      dev: true,
      message: 'Dev mode — no login required. Send x-user-id header with API requests.',
    });
  }

  const authorizationUrl = workos.userManagement.getAuthorizationUrl({
    provider: 'authkit',
    clientId: process.env.WORKOS_CLIENT_ID,
    redirectUri: process.env.WORKOS_REDIRECT_URI,
  });

  res.json({ url: authorizationUrl });
});

/**
 * GET /api/auth/callback?code=xxx
 * Exchanges the authorization code for a user + session.
 */
router.get('/callback', async (req, res) => {
  try {
    if (IS_DEV) {
      return res.redirect(`${process.env.FRONTEND_URL}?auth=dev`);
    }

    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const result = await workos.userManagement.authenticateWithCode({
      code,
      clientId: process.env.WORKOS_CLIENT_ID,
    });

    // Return the access token and user info to the frontend
    res.redirect(
      `${process.env.FRONTEND_URL}/auth/callback?token=${result.accessToken}&user=${encodeURIComponent(JSON.stringify({
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        profilePictureUrl: result.user.profilePictureUrl,
      }))}`
    );
  } catch (error) {
    console.error('Auth callback error:', error.message);
    res.redirect(`${process.env.FRONTEND_URL}/auth/error`);
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
 * Clears session (frontend handles token removal).
 */
router.post('/logout', (req, res) => {
  res.json({ success: true });
});

module.exports = router;
