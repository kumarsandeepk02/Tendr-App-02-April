const { runPipeline } = require('../agentPipeline');
const { db } = require('../../db');
const { projects, documentSections } = require('../../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Run the document generation pipeline asynchronously.
 * Designed for Slack/Teams: no streaming, just start + done callbacks.
 *
 * @param {Object} opts
 * @param {string} opts.projectId - Project to generate for
 * @param {Object} opts.brief - Brief data with suggestedSections
 * @param {Object} opts.project - Full project record
 * @param {Function} opts.onStart - Called when pipeline begins
 * @param {Function} opts.onDone - Called with { sectionCount } when complete
 * @param {Function} opts.onError - Called with error message on failure
 */
async function runAsync({ projectId, brief, project, onStart, onDone, onError }) {
  try {
    if (onStart) onStart();

    // Update phase to generating
    await db
      .update(projects)
      .set({ phase: 'generating', updatedAt: new Date() })
      .where(eq(projects.id, projectId));

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
            // Save sections to DB
            if (completedSections.length > 0) {
              await db.transaction(async (tx) => {
                // Clear existing sections
                await tx.delete(documentSections).where(eq(documentSections.projectId, projectId));
                // Insert new sections
                await tx.insert(documentSections).values(
                  completedSections.map((s, i) => ({
                    projectId,
                    title: s.title,
                    content: s.content || '',
                    sectionType: 'informational',
                    order: i,
                  }))
                );
              });
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
