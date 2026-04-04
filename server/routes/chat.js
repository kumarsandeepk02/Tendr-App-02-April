const express = require('express');
const router = express.Router();
const { sendMessage, agentToolLoop, MODELS, DEFAULT_MODEL_KEY } = require('../services/claudeService');
const { TOOL_SCHEMAS } = require('../services/toolDefinitions');
const { runPipeline } = require('../services/agentPipeline');
const { regenerateSection } = require('../services/agents/sectionWriter');
const { analyzeDocuments } = require('../services/agents/documentAnalyzer');
const { generateCompetitiveIntel } = require('../services/agents/competitiveIntelAgent');
const { planningChat, generateBrief, generateNarrations } = require('../services/agents/planningAgent');
const { getAgent } = require('../services/agents/orchestrators/agentDefinitions');
const { reviewReadiness } = require('../services/agents/readinessReviewer');

// GET available models
router.get('/models', (req, res) => {
  const models = Object.entries(MODELS).map(([key, m]) => ({
    key,
    id: m.id,
    label: m.label,
    description: m.description,
    tier: m.tier,
    isDefault: key === DEFAULT_MODEL_KEY,
  }));
  res.json({ models, default: DEFAULT_MODEL_KEY });
});

router.post('/', async (req, res) => {
  try {
    const { messages, systemPrompt, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const content = await sendMessage(messages, systemPrompt, { model });
    res.json({ content });
  } catch (error) {
    console.error('Chat API error:', error.message);
    res.status(500).json({
      error: 'Failed to generate response. Please try again.',
    });
  }
});

// Tool-enabled chat — server-side tool_use loop
router.post('/tools', async (req, res) => {
  try {
    const { messages, systemPrompt, documentState, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }
    if (!documentState) {
      return res.status(400).json({ error: 'documentState is required' });
    }

    const { profileId, tenantId } = req.auth || {};
    const result = await agentToolLoop(
      systemPrompt,
      messages.filter(m => m.role !== 'system'),
      TOOL_SCHEMAS,
      documentState,
      { model, docType: documentState.brief?.docType || 'RFP', userId: profileId, tenantId }
    );

    res.json({
      content: result.content,
      toolResults: result.toolResults.map(tr => ({
        tool: tr.tool,
        args: tr.args,
        result: tr.result,
        mutation: tr.mutation,
      })),
    });
  } catch (error) {
    console.error('Tool chat API error:', error.message);
    res.status(500).json({ error: 'Failed to process request. Please try again.' });
  }
});

// Section regeneration SSE endpoint (shared by section regen + quality review fix)
router.post('/regenerate-section', async (req, res) => {
  try {
    const { sectionTitle, currentContent, instruction, docType, answers, fileContext, model } = req.body;

    if (!sectionTitle || !instruction) {
      return res.status(400).json({ error: 'sectionTitle and instruction are required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await regenerateSection(
      { sectionTitle, currentContent, instruction, docType, answers, fileContext, model },
      (chunk) => {
        res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
      },
      (fullText) => {
        res.write(`data: ${JSON.stringify({ type: 'done', content: fullText })}\n\n`);
        res.end();
      }
    );
  } catch (error) {
    console.error('Regenerate section error:', error.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Section regeneration failed. Please try again.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to regenerate section. Please try again.' });
    }
  }
});

// Document analysis endpoint (cross-reference uploaded docs with generated sections)
router.post('/analyze-documents', async (req, res) => {
  try {
    const { documents, generatedSections, docType, answers, model } = req.body;

    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      return res.status(400).json({ error: 'documents array is required' });
    }
    if (!generatedSections || !Array.isArray(generatedSections)) {
      return res.status(400).json({ error: 'generatedSections array is required' });
    }

    const result = await analyzeDocuments({ documents, generatedSections, docType, answers, model });

    if (result) {
      res.json(result);
    } else {
      res.json({ gaps: [], conflicts: [], enrichments: [] });
    }
  } catch (error) {
    console.error('Document analysis error:', error.message);
    res.status(500).json({ error: 'Document analysis failed.' });
  }
});

// Competitive intelligence endpoint
router.post('/competitive-intel', async (req, res) => {
  try {
    const { docType, answers, industryProfile, model } = req.body;

    if (!docType || !answers) {
      return res.status(400).json({ error: 'docType and answers are required' });
    }

    const result = await generateCompetitiveIntel({ docType, answers, industryProfile, model });

    if (result) {
      res.json(result);
    } else {
      res.json({ industryBenchmarks: [], marketStandards: [], riskFactors: [], suggestedRequirements: [] });
    }
  } catch (error) {
    console.error('Competitive intel error:', error.message);
    res.status(500).json({ error: 'Competitive intelligence generation failed.' });
  }
});

// ===================== V2 Endpoints =====================

// V2: Planning Agent chat — freeform conversation to gather project context
// Accepts docType to select the right agent personality (Nova/Zuno/Zia)
router.post('/v2/planning', async (req, res) => {
  try {
    const { messages, fileContext, model, docType } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const content = await planningChat({ messages, fileContext, model, docType });
    res.json({ content });
  } catch (error) {
    console.error('V2 Planning chat error:', error.message);
    res.status(500).json({
      error: 'Failed to generate response. Please try again.',
    });
  }
});

// V2: Generate structured brief from planning conversation
router.post('/v2/brief', async (req, res) => {
  try {
    const { messages, fileContext, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const brief = await generateBrief({ messages, fileContext, model });
    res.json(brief);
  } catch (error) {
    console.error('V2 Brief generation error:', error.message);
    const status = error.code === 'BRIEF_PARSE_ERROR' ? 422 : 500;
    res.status(status).json({
      error: error.message || 'Failed to generate brief. Please try again.',
      retryable: error.retryable || false,
    });
  }
});

// V2: Readiness review — analyze brief for gaps before generation
router.post('/v2/readiness', async (req, res) => {
  try {
    const { brief, docType, model } = req.body;

    if (!brief) {
      return res.status(400).json({ error: 'brief is required' });
    }

    const result = await reviewReadiness({ brief, docType: docType || brief.docType, model });

    if (!result) {
      // Agent config says skip readiness (e.g., brainstorm)
      return res.json({ status: 'green', issues: [], summary: 'Ready to generate.', skipped: true });
    }

    res.json(result);
  } catch (error) {
    console.error('V2 Readiness review error:', error.message);
    res.status(500).json({ error: 'Readiness review failed.' });
  }
});

// V2: Pipeline with narration events (uses existing pipeline but adds narration SSE events)
router.post('/v2/pipeline', async (req, res) => {
  try {
    const { brief, fileContext, confirmedSections, uploadedDocuments, planningMessages, model } = req.body;

    if (!brief) {
      return res.status(400).json({ error: 'brief is required' });
    }

    // Convert brief to answers format for pipeline compatibility
    const answers = {
      doc_type: brief.docType || 'RFP',
      project_title: brief.projectTitle || '',
      project_description: brief.projectDescription || '',
      requirements: Array.isArray(brief.requirements) ? brief.requirements.join('\n') : '',
      evaluation_criteria: Array.isArray(brief.evaluationCriteria) ? brief.evaluationCriteria.join('\n') : '',
      deadline: brief.timeline || '',
      additional_sections: brief.additionalContext || '',
    };

    const docType = brief.docType || 'RFP';

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Get the right agent for narration personality
    const agent = getAgent(docType);

    // Generate contextual narrations upfront (non-blocking — use defaults on failure)
    let contextualNarrations = {};
    try {
      res.write(`data: ${JSON.stringify({ type: 'narration', content: agent.narration.handoffToWriter, agent: agent.name.toLowerCase(), narrationStyle: 'handover' })}\n\n`);
      contextualNarrations = await generateNarrations({ brief, messages: planningMessages || [], model });
    } catch (err) {
      console.warn('Contextual narration generation failed, using defaults:', err.message);
    }

    // Track async results
    let asyncPending = 2;
    if (uploadedDocuments && uploadedDocuments.length > 0) asyncPending++;

    const tryClose = () => {
      asyncPending--;
      if (asyncPending <= 0 && !res.writableEnded) {
        res.end();
      }
    };

    await runPipeline(
      { answers, fileContext, docType, confirmedSections, uploadedDocuments, model },
      {
        onStage: (stage) => {
          res.write(`data: ${JSON.stringify({ type: 'stage', stage })}\n\n`);
        },
        onSectionStart: (title, index, total) => {
          // Use contextual narration if available, fall back to generic
          const narration = contextualNarrations[title]
            || `Writing section ${index + 1} of ${total}: **${title}**`;
          res.write(`data: ${JSON.stringify({ type: 'narration', content: narration, agent: 'writer' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'section_start', title, index, total })}\n\n`);
        },
        onText: (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
        },
        onSectionDone: (title, content) => {
          res.write(`data: ${JSON.stringify({ type: 'section_done', title, content })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'narration', content: `✓ Completed **${title}**`, agent: 'writer' })}\n\n`);
        },
        onDone: (fullDocument) => {
          res.write(`data: ${JSON.stringify({ type: 'narration', content: agent.narration.reviewHandoff || 'All sections written. Running quality review...', agent: agent.name.toLowerCase(), narrationStyle: 'handover' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', content: fullDocument })}\n\n`);
        },
        onReview: (reviewResult) => {
          if (!res.writableEnded) {
            if (reviewResult) {
              const reviewMsg = agent.narration.reviewDone
                ? agent.narration.reviewDone(reviewResult.score)
                : `Quality review complete — score: ${reviewResult.score}/100`;
              res.write(`data: ${JSON.stringify({ type: 'narration', content: reviewMsg, agent: agent.name.toLowerCase() })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'review', content: reviewResult })}\n\n`);
            }
            // Always send 'complete' stage — even if review failed
            res.write(`data: ${JSON.stringify({ type: 'stage', stage: 'complete' })}\n\n`);
          }
          tryClose();
        },
        onCompetitiveIntel: (intelResult) => {
          if (intelResult && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'narration', content: agent.narration.intelDone || 'Competitive intelligence analysis complete', agent: agent.name.toLowerCase() })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'competitive_intel', content: intelResult })}\n\n`);
          }
          tryClose();
        },
        onDocumentAnalysis: (analysisResult) => {
          if (analysisResult && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'document_analysis', content: analysisResult })}\n\n`);
          }
          tryClose();
        },
        onError: (errorMessage) => {
          res.write(`data: ${JSON.stringify({ type: 'error', content: errorMessage })}\n\n`);
          res.end();
        },
      }
    );

    setTimeout(() => {
      if (!res.writableEnded) {
        res.end();
      }
    }, 60000);
  } catch (error) {
    console.error('V2 Pipeline API error:', error.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Pipeline failed. Please try again.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to run pipeline. Please try again.' });
    }
  }
});

module.exports = router;
