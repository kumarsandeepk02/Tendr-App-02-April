const {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  varchar,
  pgEnum,
  numeric,
  inet,
  uniqueIndex,
  index,
} = require('drizzle-orm/pg-core');
const { sql } = require('drizzle-orm');

// ── Enums ───────────────────────────────────────────────────────────────────
const documentTypeEnum = pgEnum('document_type', ['rfp', 'rfi', 'brainstorm']);

const v2PhaseEnum = pgEnum('v2_phase', [
  'intake',
  'scope_lock',
  'requirements',
  'eval_pricing',
  'question_design',
  'exploring',
  'readiness',
  'generating',
  'handoff',
  'done',
]);

const projectStatusEnum = pgEnum('project_status', [
  'in_progress',
  'generated',
  'exported',
]);

const teamRoleEnum = pgEnum('team_role', ['owner', 'admin', 'editor', 'viewer']);

const invitationStatusEnum = pgEnum('invitation_status', [
  'pending',
  'accepted',
  'expired',
  'revoked',
]);

const usageEventTypeEnum = pgEnum('usage_event_type', [
  'document_generated',
  'section_regenerated',
  'brief_generated',
  'planning_message',
  'copilot_edit',
  'export_docx',
  'export_pdf',
  'file_uploaded',
]);

const chatPlatformEnum = pgEnum('chat_platform', ['slack', 'teams']);

// ── Profiles ────────────────────────────────────────────────────────────────
const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  workosUserId: text('workos_user_id').unique().notNull(),
  fullName: text('full_name').notNull().default(''),
  avatarUrl: text('avatar_url'),
  role: text('role').default('procurement_manager'),
  industry: text('industry').default('General'),
  preferences: jsonb('preferences')
    .default(sql`'{"default_model": "sonnet", "default_doc_type": "rfp"}'::jsonb`)
    .notNull(),
  onboarded: boolean('onboarded').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ── Teams ───────────────────────────────────────────────────────────────────
const teams = pgTable(
  'teams',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    industry: text('industry'),
    description: text('description'),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    monthlySpendCapUsd: numeric('monthly_spend_cap_usd', {
      precision: 10,
      scale: 2,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_teams_owner').on(table.ownerId)]
);

// ── Team Memberships ────────────────────────────────────────────────────────
const teamMemberships = pgTable(
  'team_memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: teamRoleEnum('role').notNull().default('editor'),
    invitedBy: uuid('invited_by').references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_team_memberships').on(table.teamId, table.userId),
    index('idx_team_memberships_user').on(table.userId),
    index('idx_team_memberships_team').on(table.teamId),
  ]
);

// ── Team Invitations ────────────────────────────────────────────────────────
const teamInvitations = pgTable(
  'team_invitations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: teamRoleEnum('role').notNull().default('editor'),
    token: text('token')
      .unique()
      .notNull()
      .default(sql`replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '')`),
    invitedBy: uuid('invited_by')
      .notNull()
      .references(() => profiles.id),
    status: invitationStatusEnum('status').default('pending'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).default(
      sql`now() + interval '7 days'`
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_team_invitations_token').on(table.token),
    index('idx_team_invitations_email').on(table.email),
  ]
);

// ── Project Folders (what users call "Projects" — organizational grouping) ──
const projectFolders = pgTable(
  'project_folders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_project_folders_user').on(table.userId),
    index('idx_project_folders_team').on(table.teamId),
    index('idx_project_folders_updated').on(table.updatedAt),
  ]
);

// ── Projects (individual documents — RFPs, RFIs, brainstorms) ──────────────
const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    folderId: uuid('folder_id').references(() => projectFolders.id, { onDelete: 'set null' }),
    title: text('title').notNull().default('Untitled Document'),
    documentType: documentTypeEnum('document_type').default('rfp'),
    phase: v2PhaseEnum('phase').default('intake'),
    status: projectStatusEnum('status').default('in_progress'),
    briefData: jsonb('brief_data'),
    planningMessages: jsonb('planning_messages'),
    fileContext: text('file_context'),
    model: text('model').default('sonnet'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_projects_user').on(table.userId),
    index('idx_projects_team').on(table.teamId),
    index('idx_projects_folder').on(table.folderId),
    index('idx_projects_updated').on(table.updatedAt),
  ]
);

// ── Document Sections ───────────────────────────────────────────────────────
const documentSections = pgTable(
  'document_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull().default(''),
    sectionType: varchar('section_type', { length: 20 }).default('informational'),
    order: integer('order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_sections_project').on(table.projectId),
    index('idx_sections_order').on(table.projectId, table.order),
  ]
);

// ── Document Versions ───────────────────────────────────────────────────────
const documentVersions = pgTable(
  'document_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    changeDescription: text('change_description'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => profiles.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_version_project_number').on(table.projectId, table.versionNumber),
    index('idx_versions_project').on(table.projectId),
  ]
);

// ── Quality Reviews ─────────────────────────────────────────────────────────
const qualityReviews = pgTable(
  'quality_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => documentVersions.id),
    score: integer('score').notNull(),
    issues: jsonb('issues').default(sql`'[]'::jsonb`),
    consistencyNotes: jsonb('consistency_notes').default(sql`'[]'::jsonb`),
    missingElements: jsonb('missing_elements').default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_reviews_project').on(table.projectId)]
);

// ── Competitive Intel ───────────────────────────────────────────────────────
const competitiveIntel = pgTable(
  'competitive_intel',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => documentVersions.id),
    benchmarks: jsonb('benchmarks').default(sql`'[]'::jsonb`),
    standards: jsonb('standards').default(sql`'[]'::jsonb`),
    riskFactors: jsonb('risk_factors').default(sql`'[]'::jsonb`),
    suggestions: jsonb('suggestions').default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_intel_project').on(table.projectId)]
);

// ── Document Analyses ───────────────────────────────────────────────────────
const documentAnalyses = pgTable(
  'document_analyses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    versionId: uuid('version_id').references(() => documentVersions.id),
    gaps: jsonb('gaps').default(sql`'[]'::jsonb`),
    conflicts: jsonb('conflicts').default(sql`'[]'::jsonb`),
    enrichments: jsonb('enrichments').default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_analyses_project').on(table.projectId)]
);

// ── Uploaded Files ──────────────────────────────────────────────────────────
const uploadedFiles = pgTable(
  'uploaded_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(),
    fileSize: integer('file_size').notNull(),
    extractedText: text('extracted_text'),
    storagePath: text('storage_path'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('idx_files_project').on(table.projectId)]
);

// ── Usage Events ────────────────────────────────────────────────────────────
const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
    projectId: uuid('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    eventType: usageEventTypeEnum('event_type').notNull(),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    tokensInput: integer('tokens_input').default(0),
    tokensOutput: integer('tokens_output').default(0),
    model: text('model'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_usage_user').on(table.userId, table.createdAt),
    index('idx_usage_team').on(table.teamId, table.createdAt),
    index('idx_usage_type').on(table.eventType, table.createdAt),
  ]
);

// ── Audit Logs ──────────────────────────────────────────────────────────────
const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorId: uuid('actor_id')
      .notNull()
      .references(() => profiles.id),
    actorEmail: text('actor_email').notNull(),
    actorIp: inet('actor_ip'),
    actorSessionId: text('actor_session_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: uuid('resource_id'),
    orgId: uuid('org_id'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    checksum: text('checksum'),
  },
  (table) => [
    index('idx_audit_actor').on(table.actorId, table.createdAt),
    index('idx_audit_org').on(table.orgId, table.createdAt),
    index('idx_audit_resource').on(table.resourceType, table.resourceId, table.createdAt),
    index('idx_audit_action').on(table.action, table.createdAt),
  ]
);

// ── External Identities (Slack/Teams → Tendr profile) ──────────────────────
const externalIdentities = pgTable(
  'external_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    provider: chatPlatformEnum('provider').notNull(),
    externalUserId: varchar('external_user_id', { length: 255 }).notNull(),
    externalWorkspaceId: varchar('external_workspace_id', { length: 255 }).notNull(),
    accessToken: text('access_token'),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_external_identity').on(table.provider, table.externalUserId, table.externalWorkspaceId),
    index('idx_external_identities_profile').on(table.profileId),
  ]
);

// ── Chat Conversations (Slack/Teams thread → project) ──────────────────────
const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    platform: chatPlatformEnum('platform').notNull(),
    channelId: varchar('channel_id', { length: 255 }).notNull(),
    threadId: varchar('thread_id', { length: 255 }).notNull(),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    phase: v2PhaseEnum('phase').default('intake'),
    lastActivity: timestamp('last_activity', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata').default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_chat_conversation').on(table.platform, table.channelId, table.threadId),
    index('idx_chat_conversations_user').on(table.userId, table.lastActivity),
    index('idx_chat_conversations_project').on(table.projectId),
  ]
);

module.exports = {
  // Enums
  documentTypeEnum,
  v2PhaseEnum,
  projectStatusEnum,
  teamRoleEnum,
  invitationStatusEnum,
  usageEventTypeEnum,
  chatPlatformEnum,
  // Tables
  profiles,
  teams,
  teamMemberships,
  teamInvitations,
  projectFolders,
  projects,
  documentSections,
  documentVersions,
  qualityReviews,
  competitiveIntel,
  documentAnalyses,
  uploadedFiles,
  usageEvents,
  auditLogs,
  externalIdentities,
  chatConversations,
};
