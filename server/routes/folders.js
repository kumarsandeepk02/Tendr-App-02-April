const express = require('express');
const { db } = require('../db');
const { projectFolders, projects } = require('../db/schema');
const { getAuth } = require('../middleware/auth');
const { eq, and, desc, count } = require('drizzle-orm');

const router = express.Router();

/**
 * GET /api/folders
 * List all folders for the authenticated user with document counts.
 */
router.get('/', async (req, res) => {
  try {
    const { profileId } = getAuth(req);

    const rows = await db
      .select()
      .from(projectFolders)
      .where(eq(projectFolders.userId, profileId))
      .orderBy(desc(projectFolders.updatedAt));

    // Get document counts per folder
    const folderIds = rows.map((f) => f.id);
    const counts = {};
    if (folderIds.length > 0) {
      for (const folderId of folderIds) {
        const [result] = await db
          .select({ count: count() })
          .from(projects)
          .where(eq(projects.folderId, folderId));
        counts[folderId] = Number(result?.count || 0);
      }
    }

    const result = rows.map((f) => ({
      id: f.id,
      name: f.name,
      description: f.description,
      documentCount: counts[f.id] || 0,
      createdAt: new Date(f.createdAt).getTime(),
      updatedAt: new Date(f.updatedAt).getTime(),
    }));

    res.json({ folders: result });
  } catch (error) {
    console.error('List folders error:', error);
    res.status(500).json({ error: 'Failed to load folders' });
  }
});

/**
 * POST /api/folders
 * Create a new folder.
 */
router.post('/', async (req, res) => {
  try {
    const { profileId } = getAuth(req);
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Folder name is required' });
    }

    const [folder] = await db
      .insert(projectFolders)
      .values({
        userId: profileId,
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

/**
 * GET /api/folders/:id
 * Get a single folder with its documents.
 */
router.get('/:id', async (req, res) => {
  try {
    const { profileId } = getAuth(req);
    const { id } = req.params;

    const [folder] = await db
      .select()
      .from(projectFolders)
      .where(and(eq(projectFolders.id, id), eq(projectFolders.userId, profileId)))
      .limit(1);

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }

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
        phase: mapPhaseToFrontend(p.phase),
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

/**
 * PATCH /api/folders/:id
 * Update folder name/description.
 */
router.patch('/:id', async (req, res) => {
  try {
    const { profileId } = getAuth(req);
    const { id } = req.params;
    const { name, description } = req.body;

    const updates = { updatedAt: new Date() };
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'Folder name cannot be empty' });
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description?.trim() || null;

    const [updated] = await db
      .update(projectFolders)
      .set(updates)
      .where(and(eq(projectFolders.id, id), eq(projectFolders.userId, profileId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Folder not found' });
    }

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

/**
 * DELETE /api/folders/:id
 * Delete a folder. Documents inside become standalone (folderId → null via FK constraint).
 */
router.delete('/:id', async (req, res) => {
  try {
    const { profileId } = getAuth(req);
    const { id } = req.params;

    const [deleted] = await db
      .delete(projectFolders)
      .where(and(eq(projectFolders.id, id), eq(projectFolders.userId, profileId)))
      .returning({ id: projectFolders.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete folder error:', error);
    res.status(500).json({ error: 'Failed to delete folder' });
  }
});

// Reuse the same phase mapping from projects route
function mapPhaseToFrontend(dbPhase) {
  const map = {
    intake: 'questions',
    scope_lock: 'questions',
    requirements: 'questions',
    eval_pricing: 'questions',
    question_design: 'questions',
    exploring: 'questions',
    readiness: 'outline_review',
    generating: 'generating',
    handoff: 'questions',
    done: 'done',
  };
  return map[dbPhase] || 'questions';
}

module.exports = router;
