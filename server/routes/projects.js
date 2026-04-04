const express = require('express');
const { db } = require('../db');
const { projects, documentSections, qualityReviews, competitiveIntel, documentAnalyses } = require('../db/schema');
const { getAuth } = require('../middleware/auth');
const { eq, and, desc, isNull } = require('drizzle-orm');

const router = express.Router();

/**
 * GET /api/projects
 */
router.get('/', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);

    const conditions = [eq(projects.userId, profileId)];
    if (tenantId) conditions.push(eq(projects.tenantId, tenantId));
    if (req.query.folderId === 'none') {
      conditions.push(isNull(projects.folderId));
    } else if (req.query.folderId) {
      conditions.push(eq(projects.folderId, req.query.folderId));
    }

    const rows = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.updatedAt));

    const includeBriefs = req.query.includeBriefs === 'true';

    const result = rows.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status === 'generated' || p.status === 'exported' ? 'completed' : 'draft',
      documentType: (p.documentType || 'rfp').toUpperCase(),
      phase: mapPhaseToFrontend(p.phase),
      folderId: p.folderId || null,
      createdAt: new Date(p.createdAt).getTime(),
      updatedAt: new Date(p.updatedAt).getTime(),
      ...(includeBriefs && p.briefData ? {
        briefData: {
          projectTitle: p.briefData.projectTitle,
          projectDescription: p.briefData.projectDescription,
          docType: p.briefData.docType,
          industry: p.briefData.industry,
          requirements: p.briefData.requirements,
          evaluationCriteria: p.briefData.evaluationCriteria,
          timeline: p.briefData.timeline,
        },
      } : {}),
    }));

    res.json({ projects: result });
  } catch (error) {
    console.error('List projects error:', error);
    res.status(500).json({ error: 'Failed to load projects' });
  }
});

/**
 * POST /api/projects
 */
router.post('/', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { title, documentType, folderId } = req.body;

    const [project] = await db
      .insert(projects)
      .values({
        userId: profileId,
        tenantId: tenantId || null,
        title: title || 'Untitled Document',
        documentType: (documentType || 'rfp').toLowerCase(),
        folderId: folderId || null,
        phase: 'intake',
        status: 'in_progress',
      })
      .returning();

    res.status(201).json({
      id: project.id,
      title: project.title,
      status: 'draft',
      documentType: (project.documentType || 'rfp').toUpperCase(),
      phase: mapPhaseToFrontend(project.phase),
      folderId: project.folderId || null,
      createdAt: new Date(project.createdAt).getTime(),
      updatedAt: new Date(project.updatedAt).getTime(),
    });
  } catch (error) {
    console.error('Create project error:', error);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

/**
 * GET /api/projects/:id
 */
router.get('/:id', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;

    const conditions = [eq(projects.id, id), eq(projects.userId, profileId)];
    if (tenantId) conditions.push(eq(projects.tenantId, tenantId));

    const [project] = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [sections, reviews, intel, analyses] = await Promise.all([
      db.select().from(documentSections).where(eq(documentSections.projectId, id)).orderBy(documentSections.order),
      db.select().from(qualityReviews).where(eq(qualityReviews.projectId, id)).orderBy(desc(qualityReviews.createdAt)).limit(1),
      db.select().from(competitiveIntel).where(eq(competitiveIntel.projectId, id)).orderBy(desc(competitiveIntel.createdAt)).limit(1),
      db.select().from(documentAnalyses).where(eq(documentAnalyses.projectId, id)).orderBy(desc(documentAnalyses.createdAt)).limit(1),
    ]);

    res.json({
      project: {
        id: project.id,
        title: project.title,
        status: project.status === 'generated' || project.status === 'exported' ? 'completed' : 'draft',
        documentType: (project.documentType || 'rfp').toUpperCase(),
        phase: mapPhaseToFrontend(project.phase),
        folderId: project.folderId || null,
        createdAt: new Date(project.createdAt).getTime(),
        updatedAt: new Date(project.updatedAt).getTime(),
        briefData: project.briefData,
        planningMessages: project.planningMessages,
        fileContext: project.fileContext,
        model: project.model,
      },
      sections: sections.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        sectionType: s.sectionType,
        order: s.order,
      })),
      qualityReview: reviews[0] ? {
        score: reviews[0].score,
        issues: reviews[0].issues,
        consistencyNotes: reviews[0].consistencyNotes,
        missingElements: reviews[0].missingElements,
      } : null,
      competitiveIntel: intel[0] ? {
        industryBenchmarks: intel[0].benchmarks,
        marketStandards: intel[0].standards,
        riskFactors: intel[0].riskFactors,
        suggestedRequirements: intel[0].suggestions,
      } : null,
      documentAnalysis: analyses[0] ? {
        gaps: analyses[0].gaps,
        conflicts: analyses[0].conflicts,
        enrichments: analyses[0].enrichments,
      } : null,
    });
  } catch (error) {
    console.error('Get project error:', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

/**
 * PATCH /api/projects/:id
 */
router.patch('/:id', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;
    const updates = req.body;

    const dbUpdates = {};
    if (updates.title !== undefined) dbUpdates.title = updates.title;
    if (updates.documentType !== undefined) dbUpdates.documentType = updates.documentType.toLowerCase();
    if (updates.phase !== undefined) dbUpdates.phase = mapPhaseToBackend(updates.phase);
    if (updates.status !== undefined) dbUpdates.status = updates.status === 'completed' ? 'generated' : 'in_progress';
    if (updates.briefData !== undefined) dbUpdates.briefData = updates.briefData;
    if (updates.planningMessages !== undefined) dbUpdates.planningMessages = updates.planningMessages;
    if (updates.fileContext !== undefined) dbUpdates.fileContext = updates.fileContext;
    if (updates.model !== undefined) dbUpdates.model = updates.model;
    if (updates.folderId !== undefined) dbUpdates.folderId = updates.folderId || null;
    dbUpdates.updatedAt = new Date();

    const conditions = [eq(projects.id, id), eq(projects.userId, profileId)];
    if (tenantId) conditions.push(eq(projects.tenantId, tenantId));

    const [updated] = await db
      .update(projects)
      .set(dbUpdates)
      .where(and(...conditions))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      id: updated.id,
      title: updated.title,
      status: updated.status === 'generated' || updated.status === 'exported' ? 'completed' : 'draft',
      documentType: (updated.documentType || 'rfp').toUpperCase(),
      phase: mapPhaseToFrontend(updated.phase),
      folderId: updated.folderId || null,
      createdAt: new Date(updated.createdAt).getTime(),
      updatedAt: new Date(updated.updatedAt).getTime(),
    });
  } catch (error) {
    console.error('Update project error:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

/**
 * DELETE /api/projects/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;

    const conditions = [eq(projects.id, id), eq(projects.userId, profileId)];
    if (tenantId) conditions.push(eq(projects.tenantId, tenantId));

    const [deleted] = await db
      .delete(projects)
      .where(and(...conditions))
      .returning({ id: projects.id });

    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Delete project error:', error);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

/**
 * PATCH /api/projects/:id/sections
 */
router.patch('/:id/sections', async (req, res) => {
  try {
    const { profileId, tenantId } = getAuth(req);
    const { id } = req.params;
    const { sections: sectionData } = req.body;

    const conditions = [eq(projects.id, id), eq(projects.userId, profileId)];
    if (tenantId) conditions.push(eq(projects.tenantId, tenantId));

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(...conditions))
      .limit(1);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!Array.isArray(sectionData)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }

    await db.transaction(async (tx) => {
      await tx.delete(documentSections).where(eq(documentSections.projectId, id));

      if (sectionData.length > 0) {
        await tx.insert(documentSections).values(
          sectionData.map((s, i) => ({
            projectId: id,
            title: s.title,
            content: s.content || '',
            sectionType: s.sectionType || 'informational',
            order: i,
          }))
        );
      }

      await tx.update(projects).set({ updatedAt: new Date() }).where(eq(projects.id, id));
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Update sections error:', error);
    res.status(500).json({ error: 'Failed to update sections' });
  }
});

// ── Phase mapping helpers ───────────────────────────────────────────────────

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

function mapPhaseToBackend(frontendPhase) {
  const map = {
    questions: 'intake',
    outline_review: 'readiness',
    generating: 'generating',
    done: 'done',
    landing: 'intake',
    planning: 'intake',
    brief: 'readiness',
  };
  return map[frontendPhase] || 'intake';
}

module.exports = router;
