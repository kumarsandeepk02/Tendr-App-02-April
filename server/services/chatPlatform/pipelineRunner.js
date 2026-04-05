const { runPipeline } = require('../agentPipeline');
const { db } = require('../../db');
const { projects, documentSections } = require('../../db/schema');
const { eq, and, ne } = require('drizzle-orm');

/**
 * Run the document generation pipeline asynchronously.
 * Designed for Slack/Teams: no streaming, just start + done callbacks.
 *
 * NOTE: Neon HTTP driver doesn't support real transactions. We use
 * sequential operations instead (delete then insert).
 */
async function runAsync({ projectId, brief, project, onStart, onDone, onError }) {
  try {
    // Idempotency guard: only one generation at a time per project.
    // Atomically set phase to 'generating' only if not already generating.
    const [locked] = await db
      .update(projects)
      .set({ phase: 'generating', updatedAt: new Date() })
      .where(and(eq(projects.id, projectId), ne(projects.phase, 'generating')))
      .returning({ id: projects.id });

    if (!locked) {
      if (onError) onError('A generation is already in progress for this project.');
      return;
    }

    if (onStart) onStart();

    const confirmedSections = (brief.suggestedSections || []).filter((s) => s.included !== false);
    const completedSections = [];

    await runPipeline(
      {
        answers: brief,
        fileContext: project.fileContext || '',
        docType: (project.documentType || 'rfp').toUpperCase(),
        confirmedSections,
        uploadedDocuments: [],
        model: project.model || 'sonnet',
      },
      {
        onSectionStart: () => {},
        onText: () => {},
        onSectionDone: (title, content) => {
          completedSections.push({ title, content });
        },
        onDone: async () => {
          try {
            // Save sections — insert first, then delete old ones.
            // This order prevents data loss if the insert fails.
            if (completedSections.length > 0) {
              // Atomic-ish replacement: insert new sections with a generation
              // marker, then batch-delete all old sections in one query.
              const inserted = await db.insert(documentSections).values(
                completedSections.map((s, i) => ({
                  projectId,
                  title: s.title,
                  content: s.content || '',
                  sectionType: 'informational',
                  order: i,
                }))
              ).returning({ id: documentSections.id });

              // Batch-delete all old sections (those not in the new set)
              const newIds = inserted.map(r => r.id);
              const { notInArray } = require('drizzle-orm');
              await db.delete(documentSections).where(
                and(
                  eq(documentSections.projectId, projectId),
                  notInArray(documentSections.id, newIds)
                )
              );
            }

            // Update project phase to done
            await db
              .update(projects)
              .set({ phase: 'done', status: 'generated', updatedAt: new Date() })
              .where(eq(projects.id, projectId));

            if (onDone) onDone({ sectionCount: completedSections.length });
          } catch (saveErr) {
            console.error('Pipeline save error:', saveErr);
            if (onError) onError('Document generated but failed to save. Try again.');
          }
        },
        onReview: () => {},
        onCompetitiveIntel: () => {},
        onDocumentAnalysis: () => {},
        onError: (errMsg) => {
          console.error('Pipeline error:', errMsg);
          if (onError) onError(errMsg);
        },
        onStage: () => {},
      }
    );
  } catch (err) {
    console.error('Pipeline runner error:', err);
    if (onError) onError(err.message || 'Generation failed');
  }
}

module.exports = { runAsync };
