const express = require('express');
const { db } = require('../db');
const { tenants, profiles, projects, projectFolders } = require('../db/schema');
const { eq, count, desc, sql } = require('drizzle-orm');
const { adminRoleCheck } = require('../middleware/tenant');

const router = express.Router();

// All admin routes require admin role (checked before mounting)

/**
 * GET /api/admin/tenants
 */
router.get('/tenants', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const [allTenants, [{ total }]] = await Promise.all([
      db.select().from(tenants).orderBy(desc(tenants.createdAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(tenants),
    ]);

    // Grouped counts — two queries instead of 2N
    const tenantIds = allTenants.map((t) => t.id);
    let userCounts = {};
    let docCounts = {};
    if (tenantIds.length > 0) {
      const idList = sql.join(tenantIds.map(id => sql`${id}`), sql`, `);
      const [uRows, dRows] = await Promise.all([
        db.select({ tenantId: profiles.tenantId, count: count() }).from(profiles)
          .where(sql`${profiles.tenantId} IN (${idList})`).groupBy(profiles.tenantId),
        db.select({ tenantId: projects.tenantId, count: count() }).from(projects)
          .where(sql`${projects.tenantId} IN (${idList})`).groupBy(projects.tenantId),
      ]);
      for (const r of uRows) userCounts[r.tenantId] = Number(r.count);
      for (const r of dRows) docCounts[r.tenantId] = Number(r.count);
    }

    const result = allTenants.map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      type: t.type,
      workosOrgId: t.workosOrgId,
      settings: t.settings,
      userCount: userCounts[t.id] || 0,
      documentCount: docCounts[t.id] || 0,
      createdAt: new Date(t.createdAt).getTime(),
      updatedAt: new Date(t.updatedAt).getTime(),
    }));

    res.json({ tenants: result, total: Number(total), limit, offset });
  } catch (error) {
    console.error('Admin list tenants error:', error);
    res.status(500).json({ error: 'Failed to list tenants' });
  }
});

/**
 * POST /api/admin/tenants
 */
router.post('/tenants', async (req, res) => {
  try {
    const { name, slug, type, workosOrgId } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'name and slug are required' });
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    const [tenant] = await db
      .insert(tenants)
      .values({
        name,
        slug: cleanSlug,
        type: type || 'individual',
        workosOrgId: workosOrgId || null,
        settings: {},
      })
      .returning();

    res.status(201).json({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      type: tenant.type,
      workosOrgId: tenant.workosOrgId,
      createdAt: new Date(tenant.createdAt).getTime(),
    });
  } catch (error) {
    if (error.message?.includes('unique')) {
      return res.status(409).json({ error: 'Tenant slug already exists' });
    }
    console.error('Admin create tenant error:', error);
    res.status(500).json({ error: 'Failed to create tenant' });
  }
});

/**
 * PATCH /api/admin/tenants/:id
 */
router.patch('/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, settings, workosOrgId } = req.body;

    const updates = { updatedAt: new Date() };
    if (name !== undefined) updates.name = name;
    if (settings !== undefined) updates.settings = settings;
    if (workosOrgId !== undefined) updates.workosOrgId = workosOrgId;

    const [updated] = await db
      .update(tenants)
      .set(updates)
      .where(eq(tenants.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Tenant not found' });

    res.json({
      id: updated.id,
      slug: updated.slug,
      name: updated.name,
      type: updated.type,
      settings: updated.settings,
      updatedAt: new Date(updated.updatedAt).getTime(),
    });
  } catch (error) {
    console.error('Admin update tenant error:', error);
    res.status(500).json({ error: 'Failed to update tenant' });
  }
});

/**
 * DELETE /api/admin/tenants/:id
 */
router.delete('/tenants/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [deleted] = await db
      .delete(tenants)
      .where(eq(tenants.id, id))
      .returning({ id: tenants.id });

    if (!deleted) return res.status(404).json({ error: 'Tenant not found' });

    res.json({ success: true });
  } catch (error) {
    console.error('Admin delete tenant error:', error);
    res.status(500).json({ error: 'Failed to delete tenant' });
  }
});

/**
 * GET /api/admin/tenants/:id/users
 */
router.get('/tenants/:id/users', async (req, res) => {
  try {
    const { id } = req.params;

    const users = await db
      .select()
      .from(profiles)
      .where(eq(profiles.tenantId, id))
      .orderBy(desc(profiles.createdAt));

    res.json({
      users: users.map((u) => ({
        id: u.id,
        fullName: u.fullName,
        workosUserId: u.workosUserId,
        role: u.role,
        createdAt: new Date(u.createdAt).getTime(),
      })),
    });
  } catch (error) {
    console.error('Admin list users error:', error);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

/**
 * POST /api/admin/tenants/:id/users
 * Assign an existing profile to this tenant.
 */
router.post('/tenants/:id/users', async (req, res) => {
  try {
    const { id } = req.params;
    const { profileId, workosUserId } = req.body;

    // Find the profile
    let profile;
    if (profileId) {
      const [p] = await db.select().from(profiles).where(eq(profiles.id, profileId)).limit(1);
      profile = p;
    } else if (workosUserId) {
      const [p] = await db.select().from(profiles).where(eq(profiles.workosUserId, workosUserId)).limit(1);
      profile = p;
    } else {
      return res.status(400).json({ error: 'profileId or workosUserId required' });
    }

    if (!profile) return res.status(404).json({ error: 'User not found' });

    // Verify tenant exists
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });

    // Assign
    await db
      .update(profiles)
      .set({ tenantId: id, updatedAt: new Date() })
      .where(eq(profiles.id, profile.id));

    res.json({ success: true, profileId: profile.id, tenantId: id });
  } catch (error) {
    console.error('Admin add user error:', error);
    res.status(500).json({ error: 'Failed to add user' });
  }
});

/**
 * DELETE /api/admin/tenants/:id/users/:userId
 * Remove user from tenant (set tenantId to null).
 */
router.delete('/tenants/:id/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    await db
      .update(profiles)
      .set({ tenantId: null, updatedAt: new Date() })
      .where(eq(profiles.id, userId));

    res.json({ success: true });
  } catch (error) {
    console.error('Admin remove user error:', error);
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

module.exports = router;
