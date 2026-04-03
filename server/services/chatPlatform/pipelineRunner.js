const { runPipeline } = require('../agentPipeline');
const { db } = require('../../db');
const { projects, documentSections } = require('../../db/schema');
const { eq } = require('drizzle-orm');

/**
 * Run the document generation pipeline asynchronously.
 * Designed for Slack/Teams: no streaming, just start + done callbacks.
 *
 * NOTE: Neon HTTP driver doesn't support real transactions. We use
 * sequential operations instead (delete then insert).
 */
async function runAsync({ projectId, brief, project, onStart, onDone, onError }) {
  try {
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
            // Save sections — sequential ops instead of transaction
            if (completedSections.length > 0) {
              // Delete existing sections first
              await db.delete(documentSections).where(eq(documentSections.projectId, projectId));

              // Insert new sections
              await db.insert(documentSections).values(
                completedSections.map((s, i) => ({
                  projectId,
                  title: s.title,
                  content: s.content || '',
                  sectionType: 'informational',
                  order: i,
                }))
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
