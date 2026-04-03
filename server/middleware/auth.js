const { WorkOS } = require('@workos-inc/node');
const { db } = require('../db');
const { profiles } = require('../db/schema');
const { eq } = require('drizzle-orm');

// ── WorkOS client (only initialized if key is set) ─────────────────────────
const workos = process.env.WORKOS_API_KEY
  ? new WorkOS(process.env.WORKOS_API_KEY)
  : null;

const IS_PROD = process.env.NODE_ENV === 'production';

/**
 * Dev bypass is only allowed when ALL of these are true:
 *   1. ALLOW_DEV_AUTH_BYPASS is explicitly "true"
 *   2. Not in production
 *   3. Request originates from localhost
 */
function isDevBypassAllowed(req) {
  if (process.env.ALLOW_DEV_AUTH_BYPASS !== 'true') return false;
  if (IS_PROD) return false;
  const ip = req.ip || req.connection?.remoteAddress || '';
  const localhostIps = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'];
  return localhostIps.includes(ip);
}

/**
 * Race a promise against a timeout. Rejects with `message` if the timeout fires first.
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

/**
 * Decode a JWT payload without verifying the signature.
 * The token is a WorkOS access token — we extract the `sub` (user ID)
 * and `exp` claims. Actual user validity is confirmed via getUser().
 */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

/**
 * Resolve or create a profile row for a given WorkOS user ID.
 */
async function resolveProfile(workosUserId, userData = {}) {
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.workosUserId, workosUserId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  const [newProfile] = await db
    .insert(profiles)
    .values({
      workosUserId,
      fullName: userData.fullName || 'Dev User',
      avatarUrl: userData.avatarUrl || null,
      role: 'procurement_manager',
      industry: 'General',
    })
    .returning();

  return newProfile;
}

/**
 * Auth middleware.
 *
 * Production: validates WorkOS session token from signed session cookie.
 * Dev bypass: only when ALLOW_DEV_AUTH_BYPASS=true, non-production, localhost.
 * Fails closed if auth config is missing.
 */
async function authMiddleware(req, res, next) {
  try {
    // ── Gated dev bypass (localhost only, explicit opt-in) ────────────────
    if (isDevBypassAllowed(req)) {
      const workosUserId = 'dev-dev-user';
      const profile = await resolveProfile(workosUserId, {
        fullName: 'Dev User',
      });

      req.auth = {
        profileId: profile.id,
        workosUserId: profile.workosUserId,
        profile,
      };
      return next();
    }

    // ── Fail closed if WorkOS is not configured ──────────────────────────
    if (!workos) {
      return res.status(503).json({ error: 'Authentication service not configured' });
    }

    // ── Read token from Authorization header (primary) or cookie (fallback)
    const authHeader = req.headers.authorization;
    let token;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else {
      token = req.signedCookies?.tendr_session;
    }
    if (!token) {
      return res.status(401).json({ error: 'Missing session' });
    }

    // The token is a WorkOS JWT access token. Decode it to extract
    // the user ID (sub claim) — getUser() expects a user ID, not a JWT.
    const payload = decodeJwtPayload(token);
    if (!payload || !payload.sub) {
      return res.status(401).json({ error: 'Invalid session token' });
    }

    // Check JWT expiry
    if (payload.exp && Date.now() / 1000 > payload.exp) {
      return res.status(401).json({ error: 'Session expired' });
    }

    // Fetch the full user profile from WorkOS (bounded timeout)
    const session = await withTimeout(
      workos.userManagement.getUser(payload.sub),
      10_000,
      'Authentication service timed out'
    );

    if (!session || !session.id) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const profile = await resolveProfile(session.id, {
      fullName: `${session.firstName || ''} ${session.lastName || ''}`.trim(),
      avatarUrl: session.profilePictureUrl || null,
    });

    req.auth = {
      profileId: profile.id,
      workosUserId: session.id,
      profile,
    };
    next();
  } catch (error) {
    console.error('Auth error:', error.message);
    if (error.message === 'Authentication service timed out') {
      return res.status(504).json({ error: 'Authentication service timed out. Please try again.' });
    }
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

/**
 * Helper to get auth context from request.
 */
function getAuth(req) {
  if (!req.auth) {
    throw new Error('Auth middleware not applied');
  }
  return req.auth;
}

module.exports = { authMiddleware, getAuth, resolveProfile, decodeJwtPayload };
