CREATE TYPE "public"."document_type" AS ENUM('rfp', 'rfi', 'brainstorm');--> statement-breakpoint
CREATE TYPE "public"."v2_phase" AS ENUM('intake', 'scope_lock', 'requirements', 'eval_pricing', 'question_design', 'exploring', 'readiness', 'generating', 'handoff', 'done');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('in_progress', 'generated', 'exported');--> statement-breakpoint
CREATE TYPE "public"."team_role" AS ENUM('owner', 'admin', 'editor', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."invitation_status" AS ENUM('pending', 'accepted', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."usage_event_type" AS ENUM('document_generated', 'section_regenerated', 'brief_generated', 'planning_message', 'copilot_edit', 'export_docx', 'export_pdf', 'file_uploaded');--> statement-breakpoint
CREATE TYPE "public"."chat_platform" AS ENUM('slack', 'teams');--> statement-breakpoint
CREATE TYPE "public"."tenant_type" AS ENUM('individual', 'enterprise');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" text NOT NULL,
	"type" "tenant_type" DEFAULT 'individual' NOT NULL,
	"workos_org_id" text,
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug"),
	CONSTRAINT "tenants_workos_org_id_unique" UNIQUE("workos_org_id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workos_user_id" text NOT NULL,
	"tenant_id" uuid,
	"full_name" text DEFAULT '' NOT NULL,
	"avatar_url" text,
	"role" text DEFAULT 'procurement_manager',
	"industry" text DEFAULT 'General',
	"preferences" jsonb DEFAULT '{"default_model": "sonnet", "default_doc_type": "rfp"}'::jsonb NOT NULL,
	"onboarded" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profiles_workos_user_id_unique" UNIQUE("workos_user_id")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"industry" text,
	"description" text,
	"owner_id" uuid NOT NULL,
	"monthly_spend_cap_usd" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "team_role" DEFAULT 'editor' NOT NULL,
	"invited_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "team_role" DEFAULT 'editor' NOT NULL,
	"token" text DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') NOT NULL,
	"invited_by" uuid NOT NULL,
	"status" "invitation_status" DEFAULT 'pending',
	"expires_at" timestamp with time zone DEFAULT now() + interval '7 days',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "project_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"team_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"team_id" uuid,
	"folder_id" uuid,
	"title" text DEFAULT 'Untitled Document' NOT NULL,
	"document_type" "document_type" DEFAULT 'rfp',
	"phase" "v2_phase" DEFAULT 'intake',
	"status" "project_status" DEFAULT 'in_progress',
	"brief_data" jsonb,
	"planning_messages" jsonb,
	"file_context" text,
	"model" text DEFAULT 'sonnet',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"section_type" varchar(20) DEFAULT 'informational',
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_number" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"change_description" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quality_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid,
	"score" integer NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb,
	"consistency_notes" jsonb DEFAULT '[]'::jsonb,
	"missing_elements" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "competitive_intel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid,
	"benchmarks" jsonb DEFAULT '[]'::jsonb,
	"standards" jsonb DEFAULT '[]'::jsonb,
	"risk_factors" jsonb DEFAULT '[]'::jsonb,
	"suggestions" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"version_id" uuid,
	"gaps" jsonb DEFAULT '[]'::jsonb,
	"conflicts" jsonb DEFAULT '[]'::jsonb,
	"enrichments" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"extracted_text" text,
	"storage_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"tenant_id" uuid,
	"team_id" uuid,
	"project_id" uuid,
	"event_type" "usage_event_type" NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"tokens_input" integer DEFAULT 0,
	"tokens_output" integer DEFAULT 0,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_email" text NOT NULL,
	"actor_ip" "inet",
	"actor_session_id" text,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"org_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"checksum" text
);
--> statement-breakpoint
CREATE TABLE "external_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_id" uuid NOT NULL,
	"provider" "chat_platform" NOT NULL,
	"external_user_id" varchar(255) NOT NULL,
	"external_workspace_id" varchar(255) NOT NULL,
	"access_token" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" "chat_platform" NOT NULL,
	"channel_id" varchar(255) NOT NULL,
	"thread_id" varchar(255) NOT NULL,
	"project_id" uuid,
	"user_id" uuid NOT NULL,
	"phase" "v2_phase" DEFAULT 'intake',
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_states" (
	"key" varchar(255) PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_owner_id_profiles_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "team_memberships_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_invited_by_profiles_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folders" ADD CONSTRAINT "project_folders_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_folder_id_project_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "public"."project_folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_reviews" ADD CONSTRAINT "quality_reviews_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_reviews" ADD CONSTRAINT "quality_reviews_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitive_intel" ADD CONSTRAINT "competitive_intel_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "competitive_intel" ADD CONSTRAINT "competitive_intel_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_version_id_document_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."document_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_profiles_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_profile_id_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tenants_slug" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_tenants_workos_org" ON "tenants" USING btree ("workos_org_id");--> statement-breakpoint
CREATE INDEX "idx_teams_owner" ON "teams" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_memberships" ON "team_memberships" USING btree ("team_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_user" ON "team_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_team_memberships_team" ON "team_memberships" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_team_invitations_token" ON "team_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "idx_team_invitations_email" ON "team_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_project_folders_user" ON "project_folders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_project_folders_team" ON "project_folders" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_project_folders_updated" ON "project_folders" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_projects_user" ON "projects" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_projects_team" ON "projects" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "idx_projects_folder" ON "projects" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "idx_projects_updated" ON "projects" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_sections_project" ON "document_sections" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_sections_order" ON "document_sections" USING btree ("project_id","order");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_version_project_number" ON "document_versions" USING btree ("project_id","version_number");--> statement-breakpoint
CREATE INDEX "idx_versions_project" ON "document_versions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_project" ON "quality_reviews" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_intel_project" ON "competitive_intel" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_analyses_project" ON "document_analyses" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_files_project" ON "uploaded_files" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_usage_user" ON "usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_team" ON "usage_events" USING btree ("team_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_usage_type" ON "usage_events" USING btree ("event_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_actor" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_org" ON "audit_logs" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_resource" ON "audit_logs" USING btree ("resource_type","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_action" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_external_identity" ON "external_identities" USING btree ("provider","external_user_id","external_workspace_id");--> statement-breakpoint
CREATE INDEX "idx_external_identities_profile" ON "external_identities" USING btree ("profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_chat_conversation" ON "chat_conversations" USING btree ("platform","channel_id","thread_id");--> statement-breakpoint
CREATE INDEX "idx_chat_conversations_user" ON "chat_conversations" USING btree ("user_id","last_activity");--> statement-breakpoint
CREATE INDEX "idx_chat_conversations_project" ON "chat_conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_oauth_states_expires" ON "oauth_states" USING btree ("expires_at");