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

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

async function sendMessage(messages, customSystemPrompt) {
  const systemPrompt = customSystemPrompt || SYSTEM_PROMPT;

  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    temperature: 0.4,
    system: systemPrompt,
    messages: apiMessages,
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

async function parseDocumentContext(documentText) {
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
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    temperature: 0.4,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock ? textBlock.text : '[]';

  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    return [];
  }
}

async function streamMessage(messages, customSystemPrompt, onText, onDone) {
  const systemPrompt = customSystemPrompt || SYSTEM_PROMPT;

  const apiMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role,
      content: m.content,
    }));

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
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
 */
async function agentCall(systemPrompt, userPrompt, { maxTokens = 2000, temperature = 0.4 } = {}) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const textBlock = response.content.find((block) => block.type === 'text');
  return textBlock ? textBlock.text : '';
}

/**
 * Generic streaming agent call with configurable params.
 * Used by the section writer agent for per-section streaming.
 */
async function agentStream(systemPrompt, userPrompt, onText, onDone, { maxTokens = 4000, temperature = 0.4 } = {}) {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    temperature,
    system: systemPrompt,
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

module.exports = { sendMessage, streamMessage, parseDocumentContext, agentCall, agentStream, SYSTEM_PROMPT };
