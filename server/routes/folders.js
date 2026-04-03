const express = require('express');
const { db } = require('../db');
const { projectFolders, projects } = require('../db/schema');
const { getAuth } = require('../middleware/auth');
const { eq, and, desc, count } = require('drizzle-orm');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);

    const conditions = [eq(projectFolders.userId, profileId)];
    if (tenantId) conditions.push(eq(projectFolders.tenantId, tenantId));

    const rows = await db
      .select()
      .from(projectFolders)
      .where(and(...conditions))
      .orderBy(desc(projectFolders.updatedAt));

    const counts = {};
    for (const folder of rows) {
      const [result] = await db
        .select({ count: count() })
        .from(projects)
        .where(eq(projects.folderId, folder.id));
      counts[folder.id] = Number(result?.count || 0);
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
