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
  {
    name: 'update_brief',
    description: 'Update a field in the project brief. Use this when the user wants to change project details like title, description, requirements, evaluation criteria, timeline, or industry.',
    input_schema: {
      type: 'object',
      properties: {
        field: {
          type: 'string',
          enum: ['projectTitle', 'projectDescription', 'requirements', 'evaluationCriteria', 'timeline', 'industry', 'additionalContext'],
          description: 'The brief field to update.',
        },
        value: {
          description: 'New value. String for most fields, array of strings for requirements and evaluationCriteria.',
        },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'export_document',
    description: 'Trigger document export to Word (DOCX) or PDF format. The export will be downloaded by the user.',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['docx', 'pdf'], description: 'Export format.' },
      },
      required: ['format'],
    },
  },
  {
    name: 'switch_doc_type',
    description: 'Change the document type between RFP, RFI, and brainstorm. This affects the agent persona and generation strategy.',
    input_schema: {
      type: 'object',
      properties: {
        docType: { type: 'string', enum: ['RFP', 'RFI', 'brainstorm'], description: 'The new document type.' },
      },
      required: ['docType'],
    },
  },
  {
    name: 'recommend_format',
    description: 'Recommend the best output format for a section based on its content type. Use this when creating or rewriting sections that might benefit from a non-prose format (table, checklist, scoring matrix, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        sectionTitle: { type: 'string', description: 'Title of the section to analyze.' },
        contentDescription: { type: 'string', description: 'Brief description of what this section contains.' },
      },
      required: ['sectionTitle'],
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

    case 'update_brief': {
      const field = toolInput.field;
      const value = toolInput.value;
      const validFields = ['projectTitle', 'projectDescription', 'requirements', 'evaluationCriteria', 'timeline', 'industry', 'additionalContext'];
      if (!validFields.includes(field)) {
        return { result: `Invalid brief field "${field}". Valid fields: ${validFields.join(', ')}` };
      }
      return {
        result: `Updated brief field "${field}".`,
        mutation: { type: 'update_brief', field, value },
      };
    }

    case 'export_document': {
      const format = toolInput.format;
      if (!['docx', 'pdf'].includes(format)) {
        return { result: 'Invalid format. Use "docx" or "pdf".' };
      }
      return {
        result: `Export to ${format.toUpperCase()} triggered. The file will download in the user's browser.`,
        mutation: { type: 'trigger_export', format },
      };
    }

    case 'switch_doc_type': {
      const docType = toolInput.docType;
      if (!['RFP', 'RFI', 'brainstorm'].includes(docType)) {
        return { result: 'Invalid document type. Use "RFP", "RFI", or "brainstorm".' };
      }
      return {
        result: `Switched document type to ${docType}.`,
        mutation: { type: 'switch_doc_type', docType },
      };
    }

    case 'recommend_format': {
      const section = findSection(sections, toolInput.sectionTitle);
      const sectionContent = section ? section.content : '';
      const desc = toolInput.contentDescription || section?.title || '';

      // Heuristic format recommendation based on content patterns
      let format = 'narrative';
      let reason = 'Standard prose format works well for this section.';

      const lower = (desc + ' ' + sectionContent).toLowerCase();
      if (/pric(e|ing)|cost|budget|fee|rate/i.test(lower)) {
        format = 'table';
        reason = 'Pricing/cost content is best presented as a structured table for easy comparison.';
      } else if (/evaluat|scor|criteria|weight|rating/i.test(lower)) {
        format = 'scoring_matrix';
        reason = 'Evaluation criteria with weights work best as a scoring matrix.';
      } else if (/checklist|compliance|requirement.*list|must.*have/i.test(lower)) {
        format = 'checklist';
        reason = 'Compliance/requirements lists are clearest as a checklist format.';
      } else if (/timeline|schedule|milestone|phase|deadline/i.test(lower)) {
        format = 'timeline';
        reason = 'Timeline/milestone content is best visualized as a structured timeline.';
      } else if (/compar|versus|vs\.|option|alternative/i.test(lower)) {
        format = 'comparison_table';
        reason = 'Comparison content benefits from a side-by-side table format.';
      }

      return {
        result: `Recommended format for "${toolInput.sectionTitle}": ${format}. ${reason}`,
        mutation: section ? { type: 'set_format', sectionTitle: section.title, format, reason } : null,
      };
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
    case 'update_brief': {
      if (documentState.brief) {
        documentState.brief[mutation.field] = mutation.value;
      }
      break;
    }
    case 'set_format': {
      const idx = sections.findIndex(s => s.title.toLowerCase() === mutation.sectionTitle.toLowerCase());
      if (idx >= 0) sections[idx] = { ...sections[idx], outputFormat: mutation.format };
      break;
    }
    // trigger_export and switch_doc_type are frontend-only mutations — no server state to update
  }
}

module.exports = { TOOL_SCHEMAS, executeTool, applyMutationToState };
