const express = require('express');
const router = express.Router();
const { sendMessage, streamMessage } = require('../services/claudeService');
const { runPipeline } = require('../services/agentPipeline');

router.post('/', async (req, res) => {
  try {
    const { messages, systemPrompt } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const content = await sendMessage(messages, systemPrompt);
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
    const { messages, systemPrompt } = req.body;

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
      }
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
    const { answers, fileContext, docType, confirmedSections } = req.body;

    if (!answers || !docType) {
      return res.status(400).json({ error: 'answers and docType are required' });
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    await runPipeline(
      { answers, fileContext, docType, confirmedSections },
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
          res.write(`data: ${JSON.stringify({ type: 'review', content: reviewResult })}\n\n`);
          res.end();
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

module.exports = router;
