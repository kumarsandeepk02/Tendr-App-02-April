const express = require('express');
const { db } = require('../db');
const { projectFolders, projects } = require('../db/schema');
const { getAuth } = require('../middleware/auth');
const { eq, and, desc, count, sql } = require('drizzle-orm');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);

    const conditions = [eq(projectFolders.userId, profileId)];
    if (tenantId) conditions.push(eq(projectFolders.tenantId, tenantId));

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = parseInt(req.query.offset) || 0;

    const [rows, [{ total }]] = await Promise.all([
      db.select().from(projectFolders).where(and(...conditions)).orderBy(desc(projectFolders.updatedAt)).limit(limit).offset(offset),
      db.select({ total: count() }).from(projectFolders).where(and(...conditions)),
    ]);

    // Grouped count — single query instead of N+1
    const folderIds = rows.map((f) => f.id);
    let counts = {};
    if (folderIds.length > 0) {
      const countRows = await db
        .select({ folderId: projects.folderId, count: count() })
        .from(projects)
        .where(sql`${projects.folderId} IN (${sql.join(folderIds.map(id => sql`${id}`), sql`, `)})`)
        .groupBy(projects.folderId);
      for (const r of countRows) {
        counts[r.folderId] = Number(r.count);
      }
    }

    res.json({
      folders: rows.map((f) => ({
        id: f.id,
        name: f.name,
        description: f.description,
        documentCount: counts[f.id] || 0,
        createdAt: new Date(f.createdAt).getTime(),
        updatedAt: new Date(f.updatedAt).getTime(),
      })),
      total: Number(total),
      limit,
      offset,
    });
  } catch (error) {
    console.error('List folders error:', error);
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const [folder] = await db
      .insert(projectFolders)
      .values({
        userId: profileId,
        tenantId: tenantId || null,
        name: name.trim(),
        description: description?.trim() || null,
      })
      .returning();

    res.status(201).json({
      id: folder.id,
      name: folder.name,
      description: folder.description,
      documentCount: 0,
      createdAt: new Date(folder.createdAt).getTime(),
      updatedAt: new Date(folder.updatedAt).getTime(),
    });
  } catch (error) {
    console.error('Create folder error:', error);
    res.status(500).json({ error: 'Failed to create folder' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;

    const conditions = [eq(projectFolders.id, id), eq(projectFolders.userId, profileId)];
    if (tenantId) conditions.push(eq(projectFolders.tenantId, tenantId));

    const [folder] = await db
      .select()
      .from(projectFolders)
      .where(and(...conditions))
      .limit(1);

    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    const docs = await db
      .select()
      .from(projects)
      .where(eq(projects.folderId, id))
      .orderBy(desc(projects.updatedAt));

    res.json({
      folder: {
        id: folder.id,
        name: folder.name,
        description: folder.description,
        documentCount: docs.length,
        createdAt: new Date(folder.createdAt).getTime(),
        updatedAt: new Date(folder.updatedAt).getTime(),
      },
      documents: docs.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status === 'generated' || p.status === 'exported' ? 'completed' : 'draft',
        documentType: (p.documentType || 'rfp').toUpperCase(),
        folderId: p.folderId,
        createdAt: new Date(p.createdAt).getTime(),
        updatedAt: new Date(p.updatedAt).getTime(),
      })),
    });
  } catch (error) {
    console.error('Get folder error:', error);
    res.status(500).json({ error: 'Failed to load folder' });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;
    const { name, description } = req.body;

    const updates = { updatedAt: new Date() };
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Folder name cannot be empty' });
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description?.trim() || null;

    const conditions = [eq(projectFolders.id, id), eq(projectFolders.userId, profileId)];
    if (tenantId) conditions.push(eq(projectFolders.tenantId, tenantId));

    const [updated] = await db
      .update(projectFolders)
      .set(updates)
      .where(and(...conditions))
      .returning();

    if (!updated) return res.status(404).json({ error: 'Folder not found' });

    res.json({
      id: updated.id,
      name: updated.name,
      description: updated.description,
      createdAt: new Date(updated.createdAt).getTime(),
      updatedAt: new Date(updated.updatedAt).getTime(),
    });
  } catch (error) {
    console.error('Update folder error:', error);
    res.status(500).json({ error: 'Failed to update folder' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;

    const conditions = [eq(projectFolders.id, id), eq(projectFolders.userId, profileId)];
    if (tenantId) conditions.push(eq(projectFolders.tenantId, tenantId));

    const [deleted] = await db
      .delete(projectFolders)
      .where(and(...conditions))
      .returning({ id: projectFolders.id });

    if (!deleted) return res.status(404).json({ error: 'Folder not found' });

    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

module.exports = router;
