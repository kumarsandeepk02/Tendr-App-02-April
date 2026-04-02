const { generateOutline } = require('./agents/outlineArchitect');
const { writeSection } = require('./agents/sectionWriter');
const { reviewDocument } = require('./agents/qualityReviewer');
const { analyzeDocuments } = require('./agents/documentAnalyzer');
const { generateCompetitiveIntel } = require('./agents/competitiveIntelAgent');

// Circuit breaker: max total output tokens (approximate via character count)
const MAX_TOTAL_CHARS = 100000; // ~25k tokens

/**
 * Run the multi-agent pipeline for document generation.
 *
 * Pipeline flow:
 * 1. Outline Architect → structured outline with context keys
 * 2. Section Writer (per-section) → streaming markdown
 * 3. Quality Reviewer (async) → structured feedback
 *
 * @param {Object} config Pipeline configuration
 * @param {Object} config.answers Gathered answers from the user
 * @param {string} [config.fileContext] Uploaded document text
 * @param {string} config.docType 'RFI' or 'RFP'
 * @param {Array<{title: string, description: string}|string>} [config.confirmedSections] User-confirmed sections (title + description) or legacy string titles
 * @param {Array} [config.uploadedDocuments] Array of {name, text} for multi-doc analysis
 * @param {Object} callbacks Event callbacks
 */
async function runPipeline(config, callbacks) {
  const { answers, fileContext, docType, confirmedSections, uploadedDocuments, model } = config;
  const { onSectionStart, onText, onSectionDone, onDone, onReview, onDocumentAnalysis, onCompetitiveIntel, onError, onStage } = callbacks;

  let fullDocument = '';
  let totalChars = 0;

  try {
    // Phase 1: Outline Architect
    if (onStage) onStage('brainstorming');
    const { outline, industry } = await generateOutline({
      answers,
      fileContext,
      docType,
      confirmedSections,
      model,
    });

    if (onStage) onStage('planning');
    const total = outline.length;
    const completedSections = [];

    // Phase 2: Section Writer (per-section)
    if (onStage) onStage('writing');
    for (let i = 0; i < outline.length; i++) {
      const section = outline[i];

      // Circuit breaker check
      if (totalChars >= MAX_TOTAL_CHARS) {
        console.warn(`Pipeline circuit breaker: ${totalChars} chars exceeds limit, stopping at section ${i + 1}/${total}`);
        break;
      }

      // Emit section start
      if (onSectionStart) onSectionStart(section.title, i, total);

      // Narrow context: only include answers for this section's contextKeys
      const relevantAnswers = {};
      const keys = section.contextKeys || [];
      for (const key of keys) {
        if (answers && answers[key]) {
          relevantAnswers[key] = answers[key];
        }
      }
      // Always include doc_type and project_title for context
      if (answers?.doc_type) relevantAnswers.doc_type = answers.doc_type;
      if (answers?.project_title) relevantAnswers.project_title = answers.project_title;

      try {
        const sectionContent = await writeSection(
          {
            sectionTitle: section.title,
            sectionDescription: section.description,
            relevantAnswers,
            fileContext: keys.length === 0 ? fileContext : undefined, // Only pass file context if no specific keys
            docType,
            previousSections: completedSections.slice(-3), // Last 3 sections for continuity
            industryProfile: industry,
            estimatedLength: section.estimatedLength,
            responseType: section.responseType || 'narrative',
            model,
          },
          (chunk) => {
            totalChars += chunk.length;
            if (onText) onText(chunk);
          },
          null // onDone handled below
        );

        completedSections.push({ title: section.title, content: sectionContent });
        fullDocument += sectionContent + '\n\n';

        if (onSectionDone) onSectionDone(section.title, sectionContent);
      } catch (sectionErr) {
        console.error(`Section Writer failed for "${section.title}":`, sectionErr.message);
        const placeholder = `## ${section.title}\n\n[Generation failed — please write this section manually]\n\n`;
        fullDocument += placeholder;
        totalChars += placeholder.length;

        // Emit the placeholder as text so the client shows something
        if (onText) onText(placeholder);
        if (onSectionDone) onSectionDone(section.title, placeholder);
      }
    }

    // Emit done with the full document
    if (onDone) onDone(fullDocument.trim());
    if (onStage) onStage('checking');

    // Phase 3: Quality Reviewer (async — fire and forget)
    // NOTE: Always call the callback (with null on failure) so the route handler
    // can decrement asyncPending via tryClose() and properly close the SSE connection.
    reviewDocument({ fullDocument, answers, docType, industryProfile: industry, model })
      .then((review) => {
        if (onReview) onReview(review || null);
      })
      .catch((err) => {
        console.warn('Quality review failed (non-critical):', err.message);
        if (onReview) onReview(null);
      });

    // Phase 4: Competitive Intelligence (async — fire and forget)
    generateCompetitiveIntel({ docType, answers, industryProfile: industry, model })
      .then((intel) => {
        if (onCompetitiveIntel) onCompetitiveIntel(intel || null);
      })
      .catch((err) => {
        console.warn('Competitive intel failed (non-critical):', err.message);
        if (onCompetitiveIntel) onCompetitiveIntel(null);
      });

    // Phase 5: Document Analysis — only if multiple documents uploaded
    if (uploadedDocuments && uploadedDocuments.length > 0 && completedSections.length > 0) {
      analyzeDocuments({ documents: uploadedDocuments, generatedSections: completedSections, docType, answers, model })
        .then((analysis) => {
          if (onDocumentAnalysis) onDocumentAnalysis(analysis || null);
        })
        .catch((err) => {
          console.warn('Document analysis failed (non-critical):', err.message);
          if (onDocumentAnalysis) onDocumentAnalysis(null);
        });
    }

  } catch (err) {
    console.error('Pipeline failed:', err.message);
    if (onError) onError(err.message || 'Pipeline generation failed');
  }
}

module.exports = { runPipeline };
