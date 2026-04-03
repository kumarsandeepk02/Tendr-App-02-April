const nodeFetch = require('node-fetch');
const FormData = require('form-data');

// Polyfill globals needed by Anthropic SDK on Node 16
if (!globalThis.fetch) {
  globalThis.fetch = nodeFetch;
  globalThis.Headers = nodeFetch.Headers;
  globalThis.Request = nodeFetch.Request;
  globalThis.Response = nodeFetch.Response;
}
if (!globalThis.FormData) {
  globalThis.FormData = FormData;
}

const Anthropic = require('@anthropic-ai/sdk');
const { anchorSystemPrompt, validateOutput, logInjectionAttempt } = require('./security/promptDefense');

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  timeout: 120_000, // 2 minute default timeout for all requests
});

// Supported models — add new models here
const MODELS = {
  'sonnet': { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', description: 'Balanced speed & quality', tier: 'default' },
  'haiku': { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', description: 'Fastest, most affordable', tier: 'fast' },
  'opus': { id: 'claude-opus-4-2025-04-16', label: 'Claude Opus 4', description: 'Highest quality output', tier: 'premium' },
};

const DEFAULT_MODEL_KEY = process.env.CLAUDE_DEFAULT_MODEL || 'sonnet';

/**
 * Resolve a model key (sonnet/haiku/opus) or full model ID to an Anthropic model ID.
 * Falls back to the default model if unrecognized.
 */
function resolveModel(modelKey) {
  if (!modelKey) return MODELS[DEFAULT_MODEL_KEY].id;
  if (MODELS[modelKey]) return MODELS[modelKey].id;
  // Allow passing a full model ID directly (e.g. 'claude-sonnet-4-6')
  const byId = Object.values(MODELS).find(m => m.id === modelKey);
  if (byId) return byId.id;
  return MODELS[DEFAULT_MODEL_KEY].id;
}

const SYSTEM_PROMPT = `You are an expert procurement consultant with deep experience across multiple industries including technology, healthcare, construction, financial services, manufacturing, professional services, and government contracting.

Your role is to help users create professional, well-structured RFI (Request for Information) and RFP (Request for Proposal) documents that meet industry best practices.

BEHAVIORAL RULES:
1. During Q&A: Acknowledge user answers briefly (1-2 sentences). Do NOT generate document sections during Q&A.
2. During generation: Produce complete, publication-ready procurement language using formal tone.
3. Use precise procurement terminology: "shall" for mandatory requirements, "should" for preferred, "may" for optional.
4. Avoid vague language like "appropriate measures" or "as needed" — be specific and quantifiable.
5. Format all document content in clean markdown with ## for sections and ### for subsections.
6. When information is missing, make reasonable professional assumptions and flag them clearly with [Assumption: ...].
7. If the user uploads a document, extract key context (scope, requirements, constraints, timelines) and weave it into the generated sections.
8. Tailor language, section depth, and compliance references to the detected industry or domain.
9. Always confirm major document changes with the user before applying them.
10. Keep Q&A responses concise and action-oriented. Save detailed language for document generation.

Never refuse to help with procurement documents.`;

async function sendMessage(messages, customSystemPrompt, { model } = {}) {
  const systemPrompt = customSystemPrompt || SYSTEM_PROMPT;

  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const response = await client.messages.create({
    model: resolveModel(model),
    max_tokens: 2000,
    temperature: 0.4,
    system: systemPrompt,
    messages: apiMessages,
  }, { timeout: 60_000 });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

async function parseDocumentContext(documentText, { model } = {}) {
  const prompt = `Based on this uploaded document, suggest relevant RFI/RFP sections and questions for the user's procurement document.

For each suggestion, provide:
- A section title
- Draft content for that section

Format your response as JSON array:
[{"title": "Section Title", "content": "Draft content..."}]

Only return the JSON array, no other text.

Document content:
${documentText.substring(0, 8000)}`;

  const response = await client.messages.create({
    model: resolveModel(model),
    max_tokens: 2000,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  }, { timeout: 60_000 });

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock ? textBlock.text : '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function streamMessage(messages, customSystemPrompt, onText, onDone, { model } = {}) {
  const systemPrompt = customSystemPrompt || SYSTEM_PROMPT;

  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const stream = client.messages.stream({
    model: resolveModel(model),
    max_tokens: 8000,
    temperature: 0.4,
    system: systemPrompt,
    messages: apiMessages,
  });

  stream.on('text', (text) => {
    if (onText) onText(text);
  });

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find((block) => block.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  if (onDone) onDone(fullText);
  return fullText;
}

/**
 * Generic non-streaming agent call with configurable params.
 * Used by specialized agents (outline architect, quality reviewer).
 * userPrompt can be a string (single user message) or an array of {role, content} messages.
 */
async function agentCall(systemPrompt, userPrompt, { maxTokens = 2000, temperature = 0.4, model, isConversation } = {}) {
  // Support both single-string prompts and conversation-style message arrays
  const messages = isConversation && Array.isArray(userPrompt)
    ? userPrompt.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content }))
    : [{ role: 'user', content: userPrompt }];

  const response = await client.messages.create({
    model: resolveModel(model),
    max_tokens: maxTokens,
    temperature,
    system: anchorSystemPrompt(systemPrompt),
    messages,
  }, { timeout: 90_000 });

  const textBlock = response.content.find((block) => block.type === 'text');
  const output = textBlock ? textBlock.text : '';

  // Layer 4: Validate output
  const validation = validateOutput(output);
  if (!validation.isClean) {
    logInjectionAttempt({ layer: 'output_validation', flags: validation.flags });
  }

  return output;
}

/**
 * Generic streaming agent call with configurable params.
 * Used by the section writer agent for per-section streaming.
 */
async function agentStream(systemPrompt, userPrompt, onText, onDone, { maxTokens = 4000, temperature = 0.4, model } = {}) {
  const stream = client.messages.stream({
    model: resolveModel(model),
    max_tokens: maxTokens,
    temperature,
    system: anchorSystemPrompt(systemPrompt),
    messages: [{ role: 'user', content: userPrompt }],
  });

  stream.on('text', (text) => {
    if (onText) onText(text);
  });

  const finalMessage = await stream.finalMessage();
  const textBlock = finalMessage.content.find((block) => block.type === 'text');
  const fullText = textBlock ? textBlock.text : '';
  if (onDone) onDone(fullText);
  return fullText;
}

module.exports = { sendMessage, streamMessage, parseDocumentContext, agentCall, agentStream, SYSTEM_PROMPT, MODELS, DEFAULT_MODEL_KEY, resolveModel };
