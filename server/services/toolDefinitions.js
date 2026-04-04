const { regenerateSection } = require('./agents/sectionWriter');

// ── Tool Schemas (Anthropic tool_use format) ───────────────────────────────

const TOOL_SCHEMAS = [
  {
    name: 'read_section',
    description: 'Read the full content of one or all document sections.',
    input_schema: {
      type: 'object',
      properties: {
        sectionTitle: { type: 'string', description: 'Title of the section to read. Omit to read all sections.' },
      },
      required: [],
    },
  },
  {
    name: 'rewrite_section',
    description: 'Rewrite a document section with a specific instruction. Use this when the user asks to modify, improve, expand, shorten, or change the tone of a section.',
    input_schema: {
      type: 'object',
      properties: {
        sectionTitle: { type: 'string', description: 'Exact title of the section to rewrite.' },
        instruction: { type: 'string', description: 'What to change about the section.' },
      },
      required: ['sectionTitle', 'instruction'],
    },
  },
  {
    name: 'create_section',
    description: 'Create a new document section with the given title and content.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string', description: 'Markdown content for the section body.' },
        position: { type: 'integer', description: 'Zero-based index to insert at. Omit to append at end.' },
      },
      required: ['title', 'content'],
    },
  },
  {
    name: 'delete_section',
    description: 'Delete a document section by title.',
    input_schema: {
      type: 'object',
      properties: {
        sectionTitle: { type: 'string' },
      },
      required: ['sectionTitle'],
    },
  },
  {
    name: 'reorder_sections',
    description: 'Reorder all document sections. Provide the full list of section titles in the desired new order.',
    input_schema: {
      type: 'object',
      properties: {
        sectionTitles: {
          type: 'array',
          items: { type: 'string' },
          description: 'All section titles in the desired order.',
        },
      },
      required: ['sectionTitles'],
    },
  },
  {
    name: 'update_section_title',
    description: 'Rename a section.',
    input_schema: {
      type: 'object',
      properties: {
        currentTitle: { type: 'string' },
        newTitle: { type: 'string' },
      },
      required: ['currentTitle', 'newTitle'],
    },
  },
  {
    name: 'read_document_context',
    description: 'Read the project brief, quality review summary, and list of uploaded reference documents.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
];

// ── Fuzzy section title matcher ────────────────────────────────────────────

function findSection(sections, query) {
  if (!query || !sections) return null;
  const q = query.toLowerCase().trim();

  // Exact match (case-insensitive)
  const exact = sections.find(s => s.title.toLowerCase() === q);
  if (exact) return exact;

  // Title contains query
  const contains = sections.find(s => s.title.toLowerCase().includes(q));
  if (contains) return contains;

  // Query contains title
  const reverse = sections.find(s => q.includes(s.title.toLowerCase()));
  if (reverse) return reverse;

  return null;
}

// ── Tool Executor ──────────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, documentState, config) {
  const sections = documentState.sections || [];
  const brief = documentState.brief || {};

  switch (toolName) {
    case 'read_section': {
      if (!toolInput.sectionTitle) {
        const listing = sections.map(s => `## ${s.title}\n${s.content}`).join('\n\n---\n\n');
        return { result: listing || 'No sections in the document yet.' };
      }
      const section = findSection(sections, toolInput.sectionTitle);
      if (!section) return { result: `Section "${toolInput.sectionTitle}" not found. Available: ${sections.map(s => s.title).join(', ')}` };
      return { result: `## ${section.title}\n${section.content}` };
    }

    case 'rewrite_section': {
      const section = findSection(sections, toolInput.sectionTitle);
      if (!section) return { result: `Section "${toolInput.sectionTitle}" not found. Available: ${sections.map(s => s.title).join(', ')}` };

      const rewritten = await regenerateSection(
        {
          sectionTitle: section.title,
          currentContent: section.content,
          instruction: toolInput.instruction,
          docType: brief.docType || config.docType || 'RFP',
          answers: brief,
          fileContext: documentState.fileContext || '',
          model: config.model,
        },
        () => {},
        () => {}
      );

      return {
        result: `Rewrote "${section.title}" successfully.`,
        mutation: { type: 'update_section', sectionTitle: section.title, content: rewritten },
      };
    }

    case 'create_section': {
      return {
        result: `Created section "${toolInput.title}".`,
        mutation: {
          type: 'create_section',
          title: toolInput.title,
          content: toolInput.content,
          position: toolInput.position,
        },
      };
    }

    case 'delete_section': {
      const section = findSection(sections, toolInput.sectionTitle);
      if (!section) return { result: `Section "${toolInput.sectionTitle}" not found. Available: ${sections.map(s => s.title).join(', ')}` };
      return {
        result: `Deleted section "${section.title}".`,
        mutation: { type: 'delete_section', sectionTitle: section.title },
      };
    }

    case 'reorder_sections': {
      const titles = toolInput.sectionTitles || [];
      const missing = titles.filter(t => !findSection(sections, t));
      if (missing.length > 0) {
        return { result: `Could not find sections: ${missing.join(', ')}. Available: ${sections.map(s => s.title).join(', ')}` };
      }
      return {
        result: `Reordered sections: ${titles.join(', ')}`,
        mutation: { type: 'reorder_sections', sectionTitles: titles },
      };
    }

    case 'update_section_title': {
      const section = findSection(sections, toolInput.currentTitle);
      if (!section) return { result: `Section "${toolInput.currentTitle}" not found. Available: ${sections.map(s => s.title).join(', ')}` };
      return {
        result: `Renamed "${section.title}" to "${toolInput.newTitle}".`,
        mutation: { type: 'update_section_title', currentTitle: section.title, newTitle: toolInput.newTitle },
      };
    }

    case 'read_document_context': {
      let context = '';
      if (brief.projectTitle) context += `Project: ${brief.projectTitle}\n`;
      if (brief.docType) context += `Type: ${brief.docType}\n`;
      if (brief.projectDescription) context += `Description: ${brief.projectDescription}\n`;
      if (brief.industry) context += `Industry: ${brief.industry}\n`;
      if (brief.timeline) context += `Timeline: ${brief.timeline}\n`;
      if (brief.requirements?.length) context += `Requirements: ${brief.requirements.join('; ')}\n`;
      if (brief.evaluationCriteria?.length) context += `Evaluation Criteria: ${brief.evaluationCriteria.join('; ')}\n`;

      const qr = documentState.qualityReview;
      if (qr) context += `\nQuality Score: ${qr.score}/100\n`;

      const docs = documentState.uploadedDocuments || [];
      if (docs.length) context += `\nUploaded Documents: ${docs.map(d => d.name).join(', ')}\n`;

      return { result: context || 'No document context available.' };
    }

    default:
      return { result: `Unknown tool: ${toolName}` };
  }
}

// ── Apply mutation to in-memory state (for multi-tool loops) ───────────────

function applyMutationToState(documentState, mutation) {
  if (!mutation) return;
  const sections = documentState.sections || [];

  switch (mutation.type) {
    case 'update_section': {
      const idx = sections.findIndex(s => s.title.toLowerCase() === mutation.sectionTitle.toLowerCase());
      if (idx >= 0) sections[idx] = { ...sections[idx], content: mutation.content };
      break;
    }
    case 'create_section': {
      const newSection = { id: `tool-${Date.now()}`, title: mutation.title, content: mutation.content, order: sections.length };
      if (mutation.position !== undefined && mutation.position < sections.length) {
        sections.splice(mutation.position, 0, newSection);
      } else {
        sections.push(newSection);
      }
      break;
    }
    case 'delete_section': {
      const idx = sections.findIndex(s => s.title.toLowerCase() === mutation.sectionTitle.toLowerCase());
      if (idx >= 0) sections.splice(idx, 1);
      break;
    }
    case 'reorder_sections': {
      const reordered = mutation.sectionTitles
        .map(t => sections.find(s => s.title.toLowerCase() === t.toLowerCase()))
        .filter(Boolean);
      documentState.sections = reordered;
      break;
    }
    case 'update_section_title': {
      const idx = sections.findIndex(s => s.title.toLowerCase() === mutation.currentTitle.toLowerCase());
      if (idx >= 0) sections[idx] = { ...sections[idx], title: mutation.newTitle };
      break;
    }
  }
}

module.exports = { TOOL_SCHEMAS, executeTool, applyMutationToState };
