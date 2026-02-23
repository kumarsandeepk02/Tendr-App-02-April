# RFI/RFP Builder

AI-powered chat tool for procurement teams to generate professional RFI and RFP documents.

## Quick Start

### Prerequisites

- Node.js 16+ (18+ recommended)
- Anthropic API key ([get one here](https://console.anthropic.com/))

### 1. Backend Setup

```bash
cd server
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
node server.js
```

Server runs at `http://localhost:3001`.

### 2. Frontend Setup

```bash
cd rfp-builder
cp .env.example .env
npm start
```

App runs at `http://localhost:3000`.

## Architecture

```
rfp-builder/          React frontend (TypeScript + Tailwind)
  src/
    components/       UI components (Chat, DocumentPreview, etc.)
    hooks/            useChat, useDocument, useLocalStorage
    utils/            Export (DOCX/PDF), prompt templates
    types/            Shared TypeScript interfaces

server/               Express backend
  routes/             /api/chat, /api/upload
  services/           Claude API wrapper, document parser
```

## Features

- **Guided Mode** — Step-by-step questions to build your document
- **Freeform Mode** — Describe your project in plain language
- **Document Upload** — Upload PDF/DOCX to seed sections
- **Live Preview** — Real-time document preview with inline editing
- **Export** — Download as Word (.docx) or PDF
- **Autosave** — Draft saved to localStorage, restorable on return

## Tech Stack

- React + TypeScript + Tailwind CSS
- Express + Anthropic Claude API (claude-sonnet-4-6)
- docx + jspdf for document export
- mammoth + pdf-parse for document parsing
