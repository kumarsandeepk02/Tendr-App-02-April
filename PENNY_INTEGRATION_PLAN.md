# Penny — Slack/Teams Integration Implementation Plan

## What Is This Document

This is a complete implementation handoff for building "Penny," a Slack/Teams coworker persona that gives users full access to Tendr's RFP/RFI generation workflows without opening the web app. Start here. Read fully before writing any code.

---

## Design Principles (Non-Negotiable)

1. **Penny is a relay, not an agent.** She routes user messages to the existing agents (Nova/Zuno/Zia) and formats their responses for Slack/Teams. She never generates substantive content, never interprets domain questions, never diverges from existing agent workflows. The agents own all intelligence.

2. **Penny's voice is natural and conversational.** No hardcoded templates, no button-driven flows. Users will have full conversations with her. She speaks like a real teammate in Slack — casual, helpful, concise.

3. **Chat = conversation + status. Web UI = editing + review.** Planning conversations and file uploads happen in Slack/Teams. Document generation produces status updates and a deep-link when done. All document editing, brief review, section toggling, and export happens in the Tendr web UI.

4. **Bidirectional edit loop.** After generation, users can either edit in the web UI directly OR return to Penny with natural language instructions ("make the evaluation criteria more detailed"). Penny routes these to `regenerateSection()` and posts a confirmation + deep-link.

5. **Cross-platform continuity.** Users can start a project in Slack and continue in the web UI (or vice versa). Both interfaces read/write to the same `project.planningMessages` as the single source of truth.

6. **Each Slack thread = one project.** Parallel projects use separate threads. Ambiguous top-level DMs default to most recent active project with confirmation. If 3+ active projects, list them and ask.

7. **Minimal narration during generation.** One message when generation starts ("Nova's on it — I'll ping you when done"), silence while the pipeline runs, one message when it's ready with the deep-link. Mirrors the coworker-pinging-you-when-done pattern.

---

## Codebase Orientation

### Tech Stack
| Layer | Technology |
|-------|-----------|
| Backend | Node.js (v22) + Express 5 |
| Database | PostgreSQL (Neon serverless) + Drizzle ORM |
| AI/LLM | Anthropic Claude API via `@anthropic-ai/sdk` |
| Auth | WorkOS (OAuth) |
| Frontend | React 19 + TypeScript + Tailwind CSS |
| Deployment | Docker + AWS App Runner (backend), Vercel (frontend) |

### Key Files You Must Read First

| File | Why |
|------|-----|
| `server/db/schema.js` | Full database schema — all tables, enums, relationships |
| `server/services/agentPipeline.js` | The multi-agent document generation pipeline |
| `server/services/agents/planningAgent.js` | Planning conversation + brief generation |
| `server/services/agents/orchestrators/agentDefinitions.js` | Nova/Zuno/Zia persona configs |
| `server/services/claudeService.js` | All Claude API interaction patterns |
| `server/routes/chat.js` | All chat/generation API routes |
| `server/routes/auth.js` | Auth flow (WorkOS OAuth + dev mode) |
| `server/middleware/auth.js` | Auth middleware + `resolveProfile()` |
| `server/routes/projects.js` | Project CRUD operations |

### Service Layer Functions You Will Call

These are the exact functions Penny will route to. Do NOT create new agent logic — call these directly.

**Planning:**
```
planningAgent.planningChat({messages, fileContext, model, docType}) → Promise<string>
planningAgent.generateBrief({messages, fileContext, model}) → Promise<BriefData>
planningAgent.generateNarrations({brief, messages, model}) → Promise<Object>
```

**Generation:**
```
agentPipeline.runPipeline(config, callbacks) → Promise<void>
  config: {answers, fileContext, docType, confirmedSections, uploadedDocuments, model}
  callbacks: {onSectionStart, onText, onSectionDone, onDone, onReview,
              onDocumentAnalysis, onCompetitiveIntel, onError, onStage}
```

**Post-Generation Editing:**
```
sectionWriter.regenerateSection(config, onText, onDone) → Promise<string>
  config: {sectionTitle, currentContent, instruction, docType, answers, fileContext, model}
```

**Review:**
```
readinessReviewer.reviewReadiness({brief, docType, model}) → Promise<{status, issues, summary}>
```

**Agent Selection:**
```
agentDefinitions.getAgent(docType) → {name, emoji, personality, planning, pipeline, narration}
  docType: 'rfp' → NOVA, 'rfi' → ZUNO, 'brainstorm' → ZIA
```

**Auth:**
```
auth.resolveProfile(workosUserId, userData) → Promise<ProfileRow>
```

### Existing Patterns to Follow

- **Streaming callbacks**: `agentPipeline` and `sectionWriter` use `(onText, onDone)` callback pairs. For Slack, you don't need streaming — just accumulate text and post the final result. Wire `onDone` to your Slack message-posting function, ignore `onText`.

- **Prompt defense**: `server/services/security/promptDefense.js` wraps user input in boundary tags. Apply this to all Slack-originated messages before passing to agents.

- **Model resolution**: `claudeService.resolveModel(modelKey)` converts "sonnet" → full Anthropic model ID. Default is "sonnet".

- **Phase mapping**: `server/routes/projects.js` has `mapPhaseToFrontend()` and `mapPhaseToBackend()` — the DB uses different phase names than the frontend. Use backend phases when writing to DB.

---

## New Database Tables

Add these to `server/db/schema.js`:

### `external_identities`
```
id                      UUID PK default random
profile_id              FK → profiles (cascade delete)
provider                ENUM ('slack', 'teams')
external_user_id        VARCHAR NOT NULL — Slack/Teams user ID
external_workspace_id   VARCHAR NOT NULL — Slack workspace ID / Teams tenant ID
access_token            TEXT — encrypted bot token for this workspace
metadata                JSONB default '{}' — display name, avatar, team name, etc.
created_at              TIMESTAMP WITH TZ default now()
updated_at              TIMESTAMP WITH TZ default now()

UNIQUE (provider, external_user_id, external_workspace_id)
INDEX (profile_id)
```

### `chat_conversations`
```
id              UUID PK default random
platform        ENUM ('slack', 'teams')
channel_id      VARCHAR NOT NULL — Slack channel ID / Teams channel ID
thread_id       VARCHAR NOT NULL — Slack thread_ts / Teams reply chain ID
project_id      FK → projects (nullable, set after project creation)
user_id         FK → profiles NOT NULL
phase           v2_phase ENUM (reuse existing)
last_activity   TIMESTAMP WITH TZ default now()
metadata        JSONB default '{}' — workspace_id, bot_token ref, etc.
created_at      TIMESTAMP WITH TZ default now()
updated_at      TIMESTAMP WITH TZ default now()

UNIQUE (platform, channel_id, thread_id)
INDEX (user_id, last_activity DESC)
INDEX (project_id)
```

### `planningMessages` Schema Extension

Currently `project.planningMessages` stores `[{role, content}]`. Extend each message object:

```json
{
  "role": "user",
  "content": "I need an RFP for a marketing event",
  "source": "slack",
  "sourceMessageId": "1719234567.123456",
  "authorId": "profile-uuid-here",
  "timestamp": "2026-04-02T14:30:00Z"
}
```

This is a JSONB column — no migration needed, just update the write paths. The web UI must also start writing `source: "web"` when saving messages.

---

## New Enum

Add to schema.js enums:
```
const chatPlatformEnum = pgEnum('chat_platform', ['slack', 'teams']);
```

---

## Architecture

```
Slack Event (HTTP POST)
  │
  ├── @slack/bolt verifies signature, parses event
  │
  ▼
server/routes/slack.js (Express route, mounted at /api/slack)
  │
  ├── /api/slack/install        → Slack OAuth install flow
  ├── /api/slack/callback       → OAuth callback, store bot token
  ├── /api/slack/events         → Bolt event handler (messages, commands, actions)
  │
  ▼
server/services/chatPlatform/bridge.js (ChatPlatformBridge)
  │
  ├── resolveUser(platform, externalUserId, workspaceId)
  │     → query external_identities → return profileId or null
  │
  ├── resolveConversation(platform, channelId, threadId)
  │     → query chat_conversations → return {projectId, phase} or null
  │
  ├── handleMessage(profileId, message, conversationContext)
  │     → determine intent (new project? planning message? generate? edit?)
  │     → route to appropriate service function
  │     → return response text
  │
  └── formatForPlatform(response, platform)
        → convert to Block Kit (Slack) or Adaptive Cards (Teams)
        → add deep-link buttons where appropriate
  │
  ▼
Existing Service Layer (NO CHANGES to these files)
  ├── planningAgent.planningChat()
  ├── planningAgent.generateBrief()
  ├── agentPipeline.runPipeline()
  ├── sectionWriter.regenerateSection()
  └── readinessReviewer.reviewReadiness()
```

### New Files to Create

```
server/routes/slack.js                          — Slack event routes + Bolt setup
server/services/chatPlatform/bridge.js          — Platform-agnostic conversation router
server/services/chatPlatform/slackAdapter.js    — Slack-specific message formatting + API calls
server/services/chatPlatform/teamsAdapter.js    — Teams-specific (Phase 4)
server/services/chatPlatform/userResolver.js    — External identity lookup/creation
server/services/chatPlatform/pipelineRunner.js  — Async pipeline wrapper with chat callbacks
server/services/chatPlatform/sectionMatcher.js  — Fuzzy match "the timeline section" → actual section record
```

---

## Penny's System Prompt

Penny needs a thin system prompt for her connective language (inferring doc type, confirming routing, narrating status). She does NOT use this prompt for substantive responses — those come from the agents.

```
You are Penny, a coworker at Tendr who helps teammates build RFPs and RFIs.
You are friendly, casual, and concise — you talk like a real teammate in Slack.

Your job is to:
1. Understand what the user needs (RFP, RFI, or brainstorm)
2. Confirm your understanding before proceeding
3. Connect them with the right specialist (Nova for RFPs, Zuno for RFIs, Zia for brainstorming)
4. Relay status updates during document generation

You NEVER:
- Answer domain questions about procurement, RFPs, or the user's project yourself
- Generate document content
- Diverge from the specialist agent's responses
- Use formal or robotic language

When you infer the document type, always confirm with the user before routing.
Keep your messages short — 1-3 sentences max.
```

This prompt is ONLY used for Penny's own connector messages (greeting, routing confirmation, status updates). All planning conversation goes through `planningAgent.planningChat()` — Penny's prompt is not involved.

---

## Conversation Flow (Implementation Reference)

### Step 1: First Contact + Auth

```
User DMs Penny (or mentions @Penny in a channel)
  │
  ├── resolveUser('slack', slackUserId, workspaceId)
  │     ├── Found → profileId, continue
  │     └── Not found → post auth link message:
  │           "Hey! I don't think we've met. Link your Tendr account so I can
  │            help you out: [Sign in to Tendr → {FRONTEND_URL}/auth?linkSlack={slackUserId}]"
  │           (Frontend auth callback saves externalIdentity record)
  │           Return, wait for next message.
  │
  ▼
Penny responds with greeting (use Penny system prompt + Claude for natural language):
  "Hey {firstName}! What are you working on?"
```

### Step 2: Intent Classification + Agent Routing

```
User: "I need to put together something for a cloud migration vendor evaluation"
  │
  ├── Use Penny system prompt to classify intent:
  │     → Inferred: RFI (vendor evaluation = exploring options)
  │
  ▼
Penny: "Sounds like you're evaluating vendors — want me to get Zuno on an RFI
        for this? Or if you're further along, Nova can build a full RFP."
  │
  ▼
User: "yeah RFI works"
  │
  ├── Create project: POST logic from routes/projects.js
  │     {title: "Cloud Migration Vendor Evaluation", documentType: "rfi", phase: "intake"}
  ├── Create chat_conversations record:
  │     {platform: "slack", channelId, threadId: thread_ts, projectId, userId: profileId}
  ├── Get agent: agentDefinitions.getAgent('rfi') → ZUNO
  │
  ▼
Penny: "Got it — connecting you with Zuno."
  │
  ▼
(From here, all messages route to planningAgent.planningChat())
Zuno (via planningAgent): "Let's figure out what you need..."
```

### Step 3: Planning Conversation

```
Each user message in the Slack thread:
  │
  ├── resolveConversation('slack', channelId, threadTs)
  │     → {projectId, phase: "intake"}
  │
  ├── Load project.planningMessages from DB
  ├── Append new message with source metadata:
  │     {role: "user", content: msg, source: "slack", sourceMessageId: ts,
  │      authorId: profileId, timestamp: ISO8601}
  │
  ├── Call planningAgent.planningChat({
  │     messages: project.planningMessages,
  │     fileContext: project.fileContext,
  │     model: project.model || 'sonnet',
  │     docType: project.documentType
  │   })
  │
  ├── Append assistant response with source metadata
  ├── Save planningMessages back to project record
  │
  └── Post response to Slack thread via chat.postMessage
```

### Step 4: File Uploads

```
User shares a file in the Slack thread:
  │
  ├── Download file via Slack API (files.info → url_private_download)
  │     (Requires bot token with files:read scope)
  │
  ├── Run through existing upload pipeline:
  │     - PDF → pdf-parse → extracted text
  │     - DOCX → mammoth → extracted text
  │     - TXT → raw text
  │
  ├── Save to uploadedFiles table
  ├── Append extracted text to project.fileContext
  │
  └── Post confirmation: "Got it, I've passed that to Zuno — [filename]"
      (Then route to planningAgent with updated fileContext)
```

### Step 5: Brief Generation

```
planningAgent detects readiness (or user says "I'm ready" / "generate"):
  │
  ├── Call planningAgent.generateBrief({
  │     messages: project.planningMessages,
  │     fileContext: project.fileContext,
  │     model: project.model
  │   })
  │
  ├── Save briefData to project record
  │
  ├── Format brief as Slack message:
  │     "Here's what Zuno put together:
  │
  │      *Cloud Migration Vendor Evaluation*
  │      {description}
  │
  │      Sections (8):
  │      1. Background & Objectives
  │      2. Current State Assessment
  │      ... etc
  │
  │      Want me to generate the full document? Or review the brief
  │      in Tendr first? {deep-link to /project/{id}?phase=brief}"
  │
  └── Update project phase to 'readiness'
```

### Step 6: Generation

```
User: "yeah let's generate it" / "go for it" / clicks approve
  │
  ├── Penny: "Zuno's on it — I'll ping you when the document's ready."
  │
  ├── Update project phase to 'generating'
  │
  ├── AsyncPipelineRunner.run({
  │     config: {
  │       answers: brief + planningMessages context,
  │       fileContext: project.fileContext,
  │       docType: project.documentType,
  │       confirmedSections: brief.suggestedSections,
  │       uploadedDocuments: project uploaded docs,
  │       model: project.model
  │     },
  │     onDone: async (fullText) => {
  │       // Save sections to documentSections table
  │       // Update project phase to 'done'
  │       // Post completion message to Slack thread:
  │       "Hey {firstName}, your Cloud Migration RFI is ready — 8 sections.
  │        {deep-link: Open in Tendr → /project/{id}?phase=done}"
  │     },
  │     onError: async (error) => {
  │       // Post error to Slack thread:
  │       "Ran into an issue generating the document. Want to try again?"
  │     }
  │   })
  │
  └── (Pipeline runs 45-120 seconds — no messages during this time)
```

### Step 7: Post-Generation Edits via Penny

```
User (replies in same thread later):
  "can you make the evaluation criteria section more detailed,
   add a scoring methodology"
  │
  ├── resolveConversation → projectId, phase: "done"
  │
  ├── sectionMatcher.match("evaluation criteria", projectId)
  │     → documentSections record: {id, title: "Evaluation Criteria", content: "..."}
  │
  ├── Call sectionWriter.regenerateSection({
  │     sectionTitle: "Evaluation Criteria",
  │     currentContent: section.content,
  │     instruction: "make it more detailed, add a scoring methodology",
  │     docType: project.documentType,
  │     answers: project.planningMessages,
  │     fileContext: project.fileContext,
  │     model: project.model
  │   }, noop, onDone)
  │
  ├── Save updated content to documentSections table
  │
  └── Penny: "Done — Zuno updated the Evaluation Criteria section.
             {deep-link: View changes → /project/{id}?phase=done&section={sectionId}}"
```

---

## Slack App Configuration

### Required Scopes (Bot Token)
```
chat:write          — Post messages
commands            — Slash commands
files:read          — Download shared files
im:history          — Read DM history
im:write            — Open DMs
app_mentions:read   — Respond to @Penny mentions
users:read          — Get user profile info (name, avatar)
```

### Event Subscriptions
```
message.im          — DM messages to Penny
app_mention         — @Penny mentions in channels
file_shared         — Files shared in conversations with Penny
```

### Slash Commands (Optional, for power users)
```
/penny new [rfp|rfi]    — Create new project
/penny list             — List active projects
/penny status           — Status of current project in this thread
```

### SDK
Use `@slack/bolt` (Node.js). It handles signature verification, event acknowledgment, and provides a clean middleware pattern.

**Critical: 3-second acknowledgment.** Slack requires HTTP 200 within 3 seconds. Always `ack()` immediately, then do async work and post results via `chat.postMessage`. Never do Claude API calls synchronously in the event handler.

---

## Deep-Link Routes

The frontend needs to handle these URL patterns:

```
/project/{id}?phase=brief           → Opens BriefReview for this project
/project/{id}?phase=done            → Opens document view for this project
/project/{id}?phase=done&section={sectionId}  → Scrolls to specific section
/auth?linkSlack={slackUserId}       → Auth flow that creates externalIdentity on completion
```

Current frontend routing is in `App.tsx`. These routes need to:
1. Load the project by ID from `GET /api/projects/:id`
2. Set the active project and phase in the app state
3. For section deep-links: scroll to and highlight the target section

---

## Cross-Platform Continuity

### Slack → Web UI
- User has planning conversation in Slack (10 messages)
- All messages written to `project.planningMessages` with `source: "slack"`
- User clicks deep-link or opens Tendr directly
- PlanningChat loads `planningMessages` — all 10 messages visible
- User continues in web UI — messages 11+ have `source: "web"`

### Web UI → Slack
- User starts project in web UI, does some planning
- Opens Slack, messages Penny: "let's keep working on the marketing RFP"
- Penny looks up active projects for user, finds match, confirms
- Creates `chat_conversations` record mapping this thread to the project
- Loads existing `planningMessages`, has full context
- Continues conversation in Slack

### Frontend Changes Required
- `PlanningChat.tsx`: Show `source` indicator on messages (small "via Slack" / "via Teams" label)
- `App.tsx`: Handle deep-link URL params (phase, section)
- `useAuth.ts`: Handle `?linkSlack=` param to trigger identity linking after OAuth

---

## Edge Cases

### Multi-Conversation (Parallel Projects)
- Each Slack thread = one project via `chat_conversations` mapping
- New top-level DM = new project/thread
- Ambiguous top-level message (no thread context):
  - 1 active project → default to it, confirm: "Working on {title} — that the one?"
  - 2 active projects → default to most recent, confirm
  - 3+ active projects → list all, ask which one

### Thread Context Lost
If a user messages in a thread that has no `chat_conversations` record (e.g., after data cleanup), Penny should say: "I've lost context on this thread — want to start fresh or tell me which project this is for?"

### Simultaneous Slack + Web Editing
Not solved in MVP. Both write to `project.planningMessages`. In the unlikely event of simultaneous editing, last-write-wins applies. If this becomes a real problem, implement append-only JSONB writes.

### Slack Free-Tier File Limits
Slack free-tier workspaces limit file access. If file download fails, Penny should say: "I couldn't access that file — try uploading it directly in Tendr instead: {deep-link}"

---

## Environment Variables (New)

Add to `server/.env.example`:
```
# Slack Integration
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_CLIENT_ID=...
SLACK_CLIENT_SECRET=...
SLACK_APP_ID=...
```

---

## NPM Dependencies (New)

```
# Server
@slack/bolt          — Slack app framework (events, commands, interactions)
@slack/web-api       — Slack API client (message posting, file downloads)
```

---

## Implementation Phases

### Phase 1: Foundation [Weeks 1–2]
**Goal:** Penny responds to "hi" in Slack, authenticates users.

Tasks:
1. Add `external_identities` and `chat_conversations` tables to `server/db/schema.js`
2. Add `chatPlatformEnum` to schema enums
3. Run `db:push` to apply migrations
4. Create `server/routes/slack.js` — Bolt event handler with signature verification
5. Create `server/services/chatPlatform/userResolver.js` — lookup/create profiles from Slack users
6. Mount Slack routes in `server/server.js`
7. Create Slack app in api.slack.com, configure scopes and event subscriptions
8. Implement Slack OAuth install flow (`/api/slack/install` → `/api/slack/callback`)
9. Implement greeting handler — DM "hi" → Penny responds naturally
10. Implement auth link flow — unlinked user → deep-link to Tendr auth with `?linkSlack=` param
11. Frontend: handle `?linkSlack=` param in auth callback to create `externalIdentities` record

**Demo:** Install Penny to workspace → DM "hi" → authenticate → she greets you by name.

### Phase 2: Planning Conversation [Weeks 3–4]
**Goal:** Full planning conversation in Slack threads, file uploads, brief generation.

Tasks:
1. Create `server/services/chatPlatform/bridge.js` — intent classification + routing
2. Implement Penny's system prompt for intent inference + confirmation
3. Implement project creation from Slack (reuse `routes/projects.js` logic)
4. Implement thread-based planning conversation (each message → `planningAgent.planningChat()`)
5. Implement message persistence with `source: "slack"` metadata
6. Implement file upload handling (download from Slack → existing parse pipeline)
7. Implement brief generation trigger detection + formatting
8. Implement deep-link generation for brief review
9. Frontend: add deep-link route handling for `?phase=brief`
10. Frontend: add "via Slack" indicators on messages in PlanningChat
11. Update web UI `planningMessages` writes to include `source: "web"` metadata
12. Implement cross-platform pickup (web → Slack: Penny loads existing project context)

**Demo:** Full planning conversation → upload PDF → generate brief → deep-link to Tendr.

### Phase 3: Generation + Edit Loop [Weeks 5–6]
**Goal:** Async document generation with status + deep-links, edit-via-Penny.

Tasks:
1. Create `server/services/chatPlatform/pipelineRunner.js` — async pipeline wrapper
2. Wire pipeline callbacks to Slack message posting (start message, completion message)
3. Implement deep-link to completed document (`?phase=done`)
4. Create `server/services/chatPlatform/sectionMatcher.js` — fuzzy match section names
5. Implement edit-via-Penny flow (natural language → `regenerateSection()` → confirmation)
6. Implement section-level deep-links (`?phase=done&section={id}`)
7. Frontend: handle section deep-link param (scroll + highlight)
8. Implement error handling (pipeline failure → error message + retry)
9. Add audit logging for all Slack interactions (`auditLogs` with `source: "slack"`)

**Demo:** Approve brief → "Zuno's on it" → wait → "Your RFI is ready!" → open link → go back to Slack → "add scoring to eval criteria" → "Done, updated. [View changes]"

### Phase 4: Production Hardening + Teams [Weeks 7–9]
**Goal:** Production-ready Slack. Teams adapter.

Tasks:
1. Create `server/services/chatPlatform/teamsAdapter.js` — Adaptive Cards formatting
2. Create `server/routes/teams.js` — Bot Framework messaging endpoint
3. Register Azure Bot Service, create Teams app manifest
4. Extend rate limiting to cover Slack/Teams interactions (same per-user limits)
5. Add Sentry integration for platform event handlers
6. Implement graceful degradation (Claude API down → friendly error)
7. Implement conversation cleanup (auto-archive after 30 days inactive)
8. Implement install/uninstall lifecycle (token cleanup)
9. Security review: signature verification, token encryption, prompt defense on Slack input
10. Load test: 50 concurrent conversations

---

## Out of Scope (Explicitly Deferred)

- Collaborative threads (multiple users planning in one thread)
- Multi-section edits in one message
- Audit activity view in Tendr UI (data ready from day 1, UI is separate work)
- Append-only writes for simultaneous Slack + web editing
- Slack Home Tab or App Surface
- Proactive Penny (she reaches out first)
- Slash command power-user features beyond basic `/penny new`, `/penny list`, `/penny status`

---

## Key Technical Decisions (Already Made)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Penny's role | Relay/formatter only | Single source of truth for agent logic. No drift. |
| Agent routing | Infer from user message, confirm before routing | Natural conversation, no false starts |
| Slack thread model | 1 thread = 1 project | Simple, maps cleanly to data model |
| Generation narration | Start + done only | Coworker notification pattern, no spam |
| Brief review | Summary in Slack + deep-link to web UI | Chat isn't good for structured editing |
| Section editing | Natural language in Slack → `regenerateSection()` → deep-link | Play to each platform's strengths |
| Cross-platform state | `project.planningMessages` is single source of truth | Both interfaces read/write same record |
| Simultaneous editing race condition | Defer (last-write-wins for now) | Unlikely scenario, solve if observed |
| Channel threads | Single-user for MVP | Collaborative is Phase 5+ |
| Teams implementation | Same bridge, different adapter | Shared logic, platform-specific formatting only |
