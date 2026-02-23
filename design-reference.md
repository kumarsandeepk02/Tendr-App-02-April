# UI/UX Design Reference — ChatPRD.ai

This document captures the design patterns, visual style, and UX workflows from app.chatprd.ai to guide the RFP/RFI Generator UI.

---

## Visual Design System

### Color Palette
- **Background:** Near-black `#0d0d0d` / `#111111` — deep dark base
- **Surface / Cards:** Dark charcoal `#1a1a1a` / `#1e1e1e` with very subtle borders
- **Sidebar:** Slightly lighter dark `#161616`
- **Primary CTA (Start New Chat):** Vivid purple-to-pink gradient — `linear-gradient(to right, #7c3aed, #ec4899)`
- **Secondary CTA (Create Template, buttons):** Solid purple `#7c3aed`
- **Accent / highlight text:** Pink/coral `#f472b6` used for emphasis in headings ("help you today?")
- **Active nav item:** Blue tint `#3b82f6` on icon; text stays white
- **Pro badge:** Small pill, purple `#7c3aed` background, white text
- **Diff REPLACE block:** Deep red/maroon background with strikethrough text
- **Diff WITH block:** Normal dark background, clean text
- **Border color:** Very subtle `rgba(255,255,255,0.08)` dividers between cards/rows
- **Muted text:** `#6b7280` gray for subtitles, hints, timestamps

### Typography
- **Font:** Clean sans-serif (appears to be Inter or similar)
- **Heading (hero):** ~28–32px, white, normal weight — with gradient-colored accent word
- **Section titles:** 16–18px, white, medium weight
- **Body / chat text:** 14px, light gray `#d1d5db`
- **Sidebar nav labels:** 14px, white, with icon
- **Badge/pill text:** 11–12px, uppercase or sentence case
- **Code/monospace:** Used in document diff views

### Iconography
- Outlined/stroke icons, white at 80% opacity
- Each action category on home screen has a distinct colored icon background (dark purple, dark orange, dark teal)
- Icon size: ~20px in nav, ~28px in action cards

---

## Layout Architecture

### Overall Structure
```
┌─────────────────┬──────────────────────────────────────┐
│   Left Sidebar  │         Main Content Area            │
│   (250px fixed) │    (chat / document / list view)     │
└─────────────────┴──────────────────────────────────────┘
```

### Left Sidebar
- **Fixed width ~250px**, full height, dark background
- Top: App logo (top-left corner, ~32px icon)
- Account switcher dropdown (avatar + name + chevron)
- **"Start New Chat" CTA** — full-width pill button, purple→pink gradient, `[+]` icon
- **Nav items** (icon + label + optional count badge):
  - Chats `(8)`
  - Documents `(11)`
  - Projects
  - Products + Competitors
  - Templates
- **Recent section** — "Recent" label + "All chats" dropdown filter
  - Keyboard shortcut hint: `⌘K to search`
  - Grouped by time: Today / Previous 7 Days / Previous 30 Days
  - Each item: truncated title + `⋯` context menu on hover
- **Bottom:** User avatar + name + plan tier ("Pro - Annual")

### Main Content — Chat Home (Empty State)
- Centered vertically in content area
- Logo mark + headline: **"How can I [help you today]?"** — accent word in pink gradient
- **Action cards** — full-width rounded cards stacked vertically, each with:
  - Left: colored icon in rounded square
  - Center: bold title + subtitle description
  - Right: `>` chevron arrow
  - Pro badge on gated features
- Bottom hint text about templates with inline link
- **Chat input bar** pinned to bottom (see below)

### Main Content — Chat Thread View
- Header bar: `[≡]` sidebar toggle | breadcrumb `Project / Thread Title` | `Share` button | `Open in ▾` dropdown
- **Message stream** — full-width scrollable, bottom-anchored
  - AI messages: plain text, left-aligned, no bubble background
  - User messages: right-aligned, subtle dark card background
  - **Tool call cards**: rounded card with icon + label + status badge (`✓ Completed`) + collapse chevron — e.g. "Read Document ✓ Completed"
  - Inside tool cards: document reference with title, version, char count + `View` button
  - **Diff blocks**: REPLACE (red bg, strikethrough) / WITH (normal bg, new text) — clearly labeled
  - Message actions (bottom of each AI message): `♡ 👍 👎 ⧉` icon row

### Main Content — Document Editor Panel (Slide-in)
- Opens as a right panel overlay (~580px wide) over the chat
- **Header:** Document title + `✕` close button
- **Sub-toolbar row 1:** Version dropdown (`v2 ▾`) | Save icon | Download icon | AI magic wand icon | User avatar (right)
- **Sub-toolbar row 2 (rich text):** Undo | Redo | Heading style picker | AI button (pink sparkle) | **B** | *I* | ~~S~~ | Align (4 options) | Lists (bullet, numbered, blockquote) | Checkbox | Table | Code block `<>`
- **Content area:** Clean white-space document, large heading, body prose, bullet lists with bold keywords

### Main Content — Documents List View
- Page title: "Documents"
- **Table layout** with columns: Document | Thread | Project | Score | Created
- Each row: truncated doc name | linked thread | linked project | score | date
- Row hover: subtle highlight
- No heavy borders — thin dividers only

### Main Content — Projects View
- Page title: "Projects" + `Create Project` button (purple, top-right)
- Tabs: **Projects** | **Files**
- Project cards: title | description | left colored accent bar | `Open` button | `⋯` menu
- "Default" project has a badge label

### Main Content — Templates View (Settings > Customize)
- Settings tabs: Profile | **Customize** | Integrations | Account | Billing
- "Custom Templates" section — empty state with centered icon + description + `+ Create Template` button
- "ChatPRD Templates" section — table list of built-in templates: name + description + `⋯` menu

---

## Key UX Patterns

### Chat Input Bar (Bottom)
Pinned to bottom, full-width rounded input area:
```
[ Send a message..                                    📎  ▶ ]
[ No Project ▾ ]  [ 📄 Writing ON ▾ ]  [ 🔧 ▾ ]  [ 🧠 Auto ▾ ]
```
- **Project selector** — contextual dropdown
- **Writing mode toggle** — green "ON" pill when active
- **Tools dropdown** — model/tool selection
- **Model selector** — "Auto" with dropdown
- **Attachment icon** (paperclip) — file upload
- **Send button** — dark rounded circle with arrow icon

### Action Cards (Home Screen)
- Large, full-width, tappable rows
- Icon + Title (large) + Subtitle (muted) + Chevron `>`
- Subtle card borders, rounded corners `~12px`
- Hover: slight background lighten

### "Open in" Integration Dropdown
Clicking "Open in ▾" shows a list of external tools:
- v0.app, Lovable, Bolt, Magic Patterns, Replit, Linear Issue, Cursor
- Each with their brand icon, plain list style

### Document Tool Call Cards
When AI reads/writes a document mid-conversation:
- Compact card with book icon + "Read Document" label + green `✓ Completed` badge
- Expandable/collapsible with `^` chevron
- Inside: "DOCUMENT" label + doc title + version + char count + `View` button

### Diff View (Document Edits)
- **REPLACE block:** Red/maroon background, strikethrough text showing what's being removed
- **WITH block:** Normal dark background, clean text showing replacement
- Clearly labeled with "REPLACE" / "WITH" uppercase labels

### Navigation Feedback
- Active sidebar item: icon turns blue/accent, text stays white
- Selected nav item: no heavy highlight — just icon color change
- Recent chat items: truncated with `...` + hover shows `⋯` menu

---

## UX Flows to Replicate

### 1. New Chat / Document Creation
1. Click "Start New Chat" (gradient CTA in sidebar)
2. Home screen shows action cards
3. User picks a mode or types freely in input bar
4. Chat begins, document builds in real time

### 2. Document View
1. Mid-chat: AI generates doc → "Read Document" tool card appears
2. User clicks `View` → slide-in document editor panel
3. Editor has rich-text toolbar, version history, download, AI edit button
4. Close panel → returns to chat

### 3. Project Organization
- Chats are organized under Projects
- Breadcrumb in header: `Project / Thread Title`
- Project switcher in chat input bar

---

## Design Principles Observed

1. **Dark-first:** Deep blacks with no harsh contrast — easy on eyes for long sessions
2. **Content-first:** Minimal chrome, maximum content space
3. **Gradient accents sparingly:** Only on primary CTA and key headline words — not overused
4. **Icons as wayfinding:** Every nav item and action has a distinct icon for quick scanning
5. **Inline AI actions:** AI tool calls are shown inline in chat as collapsible cards — not modal popups
6. **Progressive disclosure:** Details hidden until needed (collapsible tool cards, slide-in doc panel)
7. **Persistent input:** Chat input always visible and accessible
8. **Subtle typography hierarchy:** Bold titles, muted subtitles — no heavy color overload
9. **Tabular document management:** Documents/templates in clean table view with sortable columns
10. **Keyboard-first hints:** `⌘K` search hint visible in sidebar

---

## Components to Build for RFP Generator

Based on ChatPRD patterns, prioritize these components:

| Component | ChatPRD Equivalent | Notes |
|---|---|---|
| Left sidebar | Sidebar with nav + recent chats | Fixed 250px, dark |
| Home action cards | "Help me write a document" cards | 2 cards: Guided / Freeform |
| Chat message stream | AI + user messages | Include tool call cards |
| Document slide-in panel | Rich text editor panel | With version, download, AI toolbar |
| Chat input bar | Bottom input with context controls | Project, Writing mode, Model, Attach |
| Document list | Table with columns | Title, Date, Status |
| Template library | ChatPRD Templates list | RFP/RFI specific templates |
| Diff view | REPLACE/WITH blocks | For showing document edits |
| "Open in" / Export | Download dropdown | PDF, Word export |
