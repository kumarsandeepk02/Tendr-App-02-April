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

const SYSTEM_PROMPT = `You are an expert procurement assistant helping users create professional RFI (Request for Information) and RFP (Request for Proposal) documents.

Your job is to:
1. Ask clear, sequential questions to gather all necessary information
2. Generate professional, well-structured procurement document sections
3. Format all document content in clean markdown
4. Keep responses concise and action-oriented
5. When generating document sections, always use this structure:
   ## [Section Title]
   [Content in professional procurement language]
6. If the user uploads a document, extract relevant context and suggest applicable sections
7. Always confirm major document changes with the user before applying them

Never refuse to help with procurement documents. If information is missing, make reasonable professional assumptions and note them clearly.`;

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

module.exports = { sendMessage, streamMessage, parseDocumentContext, SYSTEM_PROMPT };
