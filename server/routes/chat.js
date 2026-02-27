const express = require('express');
const router = express.Router();
const { sendMessage, streamMessage, MODELS, DEFAULT_MODEL_KEY } = require('../services/claudeService');
const { runPipeline } = require('../services/agentPipeline');
const { regenerateSection } = require('../services/agents/sectionWriter');
const { analyzeDocuments } = require('../services/agents/documentAnalyzer');
const { generateCompetitiveIntel } = require('../services/agents/competitiveIntelAgent');
const { planningChat, generateBrief, generateNarrations } = require('../services/agents/planningAgent');

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

// SSE streaming endpoint for freeform document generation
router.post('/stream', async (req, res) => {
  try {
    const { messages, systemPrompt, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await streamMessage(
      messages,
      systemPrompt,
      (textChunk) => {
        res.write(`data: ${JSON.stringify({ type: 'text', content: textChunk })}\n\n`);
      },
      (fullText) => {
        res.write(`data: ${JSON.stringify({ type: 'done', content: fullText })}\n\n`);
        res.end();
      },
      { model }
    );
  } catch (error) {
    console.error('Stream API error:', error.message);
    // If headers already sent, send error as SSE event
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Stream failed. Please try again.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({
        error: 'Failed to generate response. Please try again.',
      });
    }
  }
});

// Multi-agent pipeline SSE endpoint
router.post('/pipeline', async (req, res) => {
  try {
    const { answers, fileContext, docType, confirmedSections, uploadedDocuments, model } = req.body;

    if (!answers || !docType) {
      return res.status(400).json({ error: 'answers and docType are required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Track how many async results we expect (review + intel + optionally analysis)
    let asyncPending = 2; // review + competitive intel
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
        onSectionStart: (title, index, total) => {
          res.write(`data: ${JSON.stringify({ type: 'section_start', title, index, total })}\n\n`);
        },
        onText: (chunk) => {
          res.write(`data: ${JSON.stringify({ type: 'text', content: chunk })}\n\n`);
        },
        onSectionDone: (title, content) => {
          res.write(`data: ${JSON.stringify({ type: 'section_done', title, content })}\n\n`);
        },
        onDone: (fullDocument) => {
          res.write(`data: ${JSON.stringify({ type: 'done', content: fullDocument })}\n\n`);
        },
        onReview: (reviewResult) => {
          if (reviewResult && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'review', content: reviewResult })}\n\n`);
          }
          tryClose();
        },
        onCompetitiveIntel: (intelResult) => {
          if (intelResult && !res.writableEnded) {
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

    // If review doesn't arrive within 60s, close the connection
    setTimeout(() => {
      if (!res.writableEnded) {
        res.end();
      }
    }, 60000);

  } catch (error) {
    console.error('Pipeline API error:', error.message);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Pipeline failed. Please try again.' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to run pipeline. Please try again.' });
    }
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
router.post('/v2/planning', async (req, res) => {
  try {
    const { messages, fileContext, model } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const content = await planningChat({ messages, fileContext, model });
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
    res.status(500).json({
      error: 'Failed to generate brief. Please try again.',
    });
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

    // Generate contextual narrations upfront (non-blocking — use defaults on failure)
    let contextualNarrations = {};
    try {
      res.write(`data: ${JSON.stringify({ type: 'narration', content: '📋 Planning complete. Handing off to the Writing Team...', agent: 'research', narrationStyle: 'handover' })}\n\n`);
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
          res.write(`data: ${JSON.stringify({ type: 'narration', content: 'All sections written. Handing off to Quality Reviewer...', agent: 'writer', narrationStyle: 'handover' })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'done', content: fullDocument })}\n\n`);
        },
        onReview: (reviewResult) => {
          if (reviewResult && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'narration', content: `✅ Quality review complete — score: ${reviewResult.score}/100`, agent: 'reviewer' })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'review', content: reviewResult })}\n\n`);
          }
          tryClose();
        },
        onCompetitiveIntel: (intelResult) => {
          if (intelResult && !res.writableEnded) {
            res.write(`data: ${JSON.stringify({ type: 'narration', content: '🔍 Competitive intelligence analysis complete', agent: 'research' })}\n\n`);
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
