const { WorkOS } = require('@workos-inc/node');
const { db } = require('../db');
const { profiles } = require('../db/schema');
const { eq } = require('drizzle-orm');

// ── WorkOS client (only initialized if key is set) ─────────────────────────
const workos = process.env.WORKOS_API_KEY
  ? new WorkOS(process.env.WORKOS_API_KEY)
  : null;

const IS_DEV = !process.env.WORKOS_API_KEY || process.env.NODE_ENV === 'development';

/**
 * Resolve or create a profile row for a given WorkOS user ID.
 * In dev mode, creates a dev profile automatically.
 */
async function resolveProfile(workosUserId, userData = {}) {
  // Check if profile exists
  const existing = await db
    .select()
    .from(profiles)
    .where(eq(profiles.workosUserId, workosUserId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0];
  }

  // Auto-create profile
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
 * Production: validates WorkOS session token from Authorization header.
 * Dev mode: accepts x-user-id header (defaults to 'dev-user'), auto-creates profile.
 */
async function authMiddleware(req, res, next) {
  try {
    // ── Dev bypass ────────────────────────────────────────────────────────
    if (IS_DEV) {
      const devUserId = req.headers['x-user-id'] || 'dev-user';
      const workosUserId = `dev-${devUserId}`;
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

    // ── Production: validate WorkOS session ───────────────────────────────
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing authorization token' });
    }

    const token = authHeader.split(' ')[1];

    // Verify the session with WorkOS
    const session = await workos.userManagement.getUser(token);
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

module.exports = { authMiddleware, getAuth, resolveProfile };
