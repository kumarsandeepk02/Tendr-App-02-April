const { z } = require('zod');

/**
 * Express middleware factory: validates req.body against a Zod schema.
 * Returns 400 with structured errors on failure.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data;
    next();
  };
}

// ── Shared schemas ─────────────────────────────────────────────────────────

const messageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
});

const chatSchema = z.object({
  messages: z.array(messageSchema).min(1),
  systemPrompt: z.string().optional(),
  model: z.string().optional(),
});

const toolChatSchema = chatSchema.extend({
  documentState: z.object({}).passthrough(),
});

const planningChatSchema = z.object({
  messages: z.array(messageSchema).min(1),
  fileContext: z.string().optional(),
  model: z.string().optional(),
  docType: z.string().optional(),
});

const briefSchema = z.object({
  messages: z.array(messageSchema).min(1),
  fileContext: z.string().optional(),
  model: z.string().optional(),
});

const pipelineSchema = z.object({
  brief: z.object({
    docType: z.string().optional(),
    projectTitle: z.string().optional(),
    projectDescription: z.string().optional(),
    requirements: z.union([z.array(z.string()), z.string()]).optional(),
    evaluationCriteria: z.union([z.array(z.string()), z.string()]).optional(),
    timeline: z.string().optional(),
    additionalContext: z.string().optional(),
    suggestedSections: z.array(z.object({}).passthrough()).optional(),
  }).passthrough(),
  fileContext: z.string().optional(),
  confirmedSections: z.array(z.object({}).passthrough()).optional(),
  uploadedDocuments: z.array(z.object({}).passthrough()).optional(),
  planningMessages: z.array(z.object({}).passthrough()).optional(),
  model: z.string().optional(),
});

const regenerateSectionSchema = z.object({
  sectionTitle: z.string().min(1),
  instruction: z.string().min(1),
  currentContent: z.string().optional(),
  docType: z.string().optional(),
  answers: z.object({}).passthrough().optional(),
  fileContext: z.string().optional(),
  model: z.string().optional(),
});

const createProjectSchema = z.object({
  title: z.string().optional(),
  documentType: z.string().optional(),
  folderId: z.string().uuid().optional().nullable(),
});

const updateProjectSchema = z.object({
  title: z.string().optional(),
  documentType: z.string().optional(),
  phase: z.string().optional(),
  status: z.string().optional(),
  briefData: z.object({}).passthrough().optional(),
  planningMessages: z.array(z.object({}).passthrough()).optional(),
  fileContext: z.string().optional(),
  model: z.string().optional(),
  folderId: z.string().uuid().optional().nullable(),
});

const updateSectionsSchema = z.object({
  sections: z.array(
    z.object({
      title: z.string(),
      content: z.string().optional().default(''),
      sectionType: z.string().optional().default('informational'),
    })
  ),
});

module.exports = {
  validate,
  chatSchema,
  toolChatSchema,
  planningChatSchema,
  briefSchema,
  pipelineSchema,
  regenerateSectionSchema,
  createProjectSchema,
  updateProjectSchema,
  updateSectionsSchema,
};
