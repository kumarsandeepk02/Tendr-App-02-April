const express = require('express');
const router = express.Router();
const { sendMessage, streamMessage } = require('../services/claudeService');

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

module.exports = router;
