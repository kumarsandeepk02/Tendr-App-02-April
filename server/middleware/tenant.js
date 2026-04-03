const { db } = require('../db');
const { profiles, tenants } = require('../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Tenant middleware — resolves the tenant for the authenticated user.
 *
 * Runs AFTER authMiddleware. Reads the user's profile to get tenantId,
 * or auto-provisions an individual tenant if none exists.
 *
 * Sets req.auth.tenantId for use in all downstream route queries.
 */
async function tenantMiddleware(req, res, next) {
  try {
    const { profileId, profile } = req.auth;
    if (!profileId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Fast path: profile already has tenantId
    if (profile.tenantId) {
      req.auth.tenantId = profile.tenantId;
      return next();
    }

    // Check if JWT contains org_id (WorkOS organization)
    const orgId = req.auth.workosOrgId || null;

    if (orgId) {
      // Look up tenant by WorkOS org ID
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(eq(tenants.workosOrgId, orgId))
        .limit(1);

      if (tenant) {
        // Link user to this tenant
        await db
          .update(profiles)
          .set({ tenantId: tenant.id, updatedAt: new Date() })
          .where(eq(profiles.id, profileId));

        req.auth.tenantId = tenant.id;
        req.auth.profile = { ...profile, tenantId: tenant.id };
        return next();
      }
    }

    // No org or no matching tenant — auto-create individual tenant
    const slug = `user-${profileId.substring(0, 8)}`;
    const [existing] = await db
      .select()
      .from(tenants)
      .where(eq(tenants.slug, slug))
      .limit(1);

    let tenantId;
    if (existing) {
      tenantId = existing.id;
    } else {
      const [newTenant] = await db
        .insert(tenants)
        .values({
          slug,
          name: profile.fullName || 'Personal',
          type: 'individual',
          workosOrgId: orgId || null,
        })
        .returning();
      tenantId = newTenant.id;
    }

    // Link profile to tenant
    await db
      .update(profiles)
      .set({ tenantId, updatedAt: new Date() })
      .where(eq(profiles.id, profileId));

    req.auth.tenantId = tenantId;
    req.auth.profile = { ...profile, tenantId };
    next();
  } catch (error) {
    console.error('Tenant middleware error:', error.message);
    res.status(500).json({ error: 'Failed to resolve tenant' });
  }
}

/**
 * Admin role check middleware — requires 'admin' role from JWT.
 */
function adminRoleCheck(req, res, next) {
  const role = req.auth.role;
  if (role === 'admin' || role === 'superadmin') {
    return next();
  }
  // Fallback: check if user is a known superadmin by profile ID
  const superadminIds = (process.env.SUPERADMIN_IDS || '').split(',').filter(Boolean);
  if (superadminIds.includes(req.auth.profileId)) {
    return next();
  }
  res.status(403).json({ error: 'Admin access required' });
}

module.exports = { tenantMiddleware, adminRoleCheck };
