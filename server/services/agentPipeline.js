const { generateOutline } = require('./agents/outlineArchitect');
const { writeSection, regenerateSection } = require('./agents/sectionWriter');
const { reviewDocument } = require('./agents/qualityReviewer');
const { analyzeDocuments } = require('./agents/documentAnalyzer');
const { generateCompetitiveIntel } = require('./agents/competitiveIntelAgent');
const { agentCall } = require('./claudeService');

// Circuit breaker: max total output tokens (approximate via character count)
const MAX_TOTAL_CHARS = 100000; // ~25k tokens

const SELF_EVAL_PROMPT = `You are a procurement document quality reviewer. Evaluate this section and return ONLY a JSON object:
{
  "pass": true/false,
  "issues": ["issue 1", "issue 2"] or [],
  "instruction": "specific rewrite instruction if pass=false" or null
}

Check for:
- Vague language ("appropriate", "as needed", "robust") — flag as fail
- Missing specifics where quantities, timelines, or SLAs should be stated
- Repetition of content from previous sections
- Procurement language: "shall" for mandatory, "should" for preferred, "may" for optional
- Section too short (< 50 words for a narrative section) or bloated (> 700 words)

If the section is adequate, return {"pass": true, "issues": [], "instruction": null}.
Be strict but fair. Only fail sections with clear, fixable problems.
Return ONLY the JSON.`;

/**
 * Quick per-section quality check. Returns null if pass, or a rewrite instruction if fail.
 */
async function evaluateSection(sectionTitle, sectionContent, previousSections, model) {
  try {
    let prompt = `## ${sectionTitle}\n${sectionContent}\n`;
    if (previousSections.length > 0) {
      prompt += `\nPrevious sections (for repetition check): ${previousSections.map(s => s.title).join(', ')}`;
    }

    const response = await agentCall(SELF_EVAL_PROMPT, prompt, {
      maxTokens: 300,
      temperature: 0.1,
      model: 'haiku', // Fast + cheap for eval
    });

    const jsonStr = response.replace(/```json?\s*/g, '').replace(/```/g, '').trim();
    const result = JSON.parse(jsonStr);
    if (result.pass === false && result.instruction) {
      return result.instruction;
    }
    return null;
  } catch (err) {
    // Eval failure is non-blocking — skip self-correction
    console.warn(`Self-eval failed for "${sectionTitle}":`, err.message);
    return null;
  }
}

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

      // Pass the full answers/brief to every section — don't filter by contextKeys.
      // contextKeys are still on the outline metadata for the outline architect's use,
      // but the section writer benefits from seeing the full project context.
      try {
        const sectionContent = await writeSection(
          {
            sectionTitle: section.title,
            sectionDescription: section.description,
            relevantAnswers: answers,
            fileContext: fileContext || undefined,
            docType,
            previousSections: completedSections, // All previous sections for continuity
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

        // Self-eval: check section quality and rewrite if needed (one attempt)
        let finalContent = sectionContent;
        const rewriteInstruction = await evaluateSection(
          section.title, sectionContent, completedSections, model
        );
        if (rewriteInstruction) {
          console.log(`Self-eval: rewriting "${section.title}" — ${rewriteInstruction}`);
          try {
            const rewritten = await regenerateSection(
              {
                sectionTitle: section.title,
                currentContent: sectionContent,
                instruction: rewriteInstruction,
                docType,
                answers,
                fileContext: fileContext || '',
                model,
              },
              () => {},
              () => {}
            );
            if (rewritten && rewritten.length > 50) {
              finalContent = `## ${section.title}\n\n${rewritten}`;
              // Re-emit the corrected content so the frontend gets the update
              if (onText) onText(`\n<!-- self-corrected -->\n`);
            }
          } catch (rewriteErr) {
            console.warn(`Self-eval rewrite failed for "${section.title}":`, rewriteErr.message);
          }
        }

        completedSections.push({ title: section.title, content: finalContent });
        fullDocument += finalContent + '\n\n';

        if (onSectionDone) onSectionDone(section.title, finalContent);
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
