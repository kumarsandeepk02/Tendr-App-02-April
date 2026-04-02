require('dotenv').config({ override: true });

// Sentry must init before other imports
const { initSentry } = require('./services/sentry');
initSentry();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// ── Fail fast if SESSION_SECRET is missing ─────────────────────────────────
if (!process.env.SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET is required. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
  process.exit(1);
}

const chatRoutes = require('./routes/chat');
const uploadRoutes = require('./routes/upload');
const authRoutes = require('./routes/auth');
const projectRoutes = require('./routes/projects');
const { authMiddleware } = require('./middleware/auth');
const { promptDefenseMiddleware } = require('./services/security/promptDefense');

const app = express();
const PORT = process.env.PORT || 3001;
const IS_PROD = process.env.NODE_ENV === 'production';

// ── Security Headers ────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: IS_PROD ? undefined : false, // Disable CSP in dev
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else if (IS_PROD) {
      callback(new Error('Not allowed by CORS'));
    } else {
      callback(null, true); // Permissive in dev
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));

// ── Rate Limiting ───────────────────────────────────────────────────────────

// General API rate limit: 60 req/min
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', apiLimiter);

// AI-specific rate limit: 10 req/min (pipeline, planning, brief, regenerate)
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  message: { error: 'AI request limit reached. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit per user (auth required on these routes)
    return req.auth?.profileId || 'anonymous';
  },
});

// ── Auth routes (public — no middleware) ─────────────────────────────────────
app.use('/api/auth', authRoutes);

// ── Health check (public) ───────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// ── Protected routes — auth required ────────────────────────────────────────
app.use('/api/projects', authMiddleware, projectRoutes);
app.use('/api/upload', authMiddleware, uploadRoutes);

// AI rate limit on heavy endpoints — MUST be mounted before chat routes
app.use('/api/chat/v2/pipeline', aiLimiter);
app.use('/api/chat/v2/planning', aiLimiter);
app.use('/api/chat/v2/brief', aiLimiter);
app.use('/api/chat/v2/readiness', aiLimiter);
app.use('/api/chat/regenerate-section', aiLimiter);
app.use('/api/chat/pipeline', aiLimiter);

// Chat routes: auth + prompt defense
app.use('/api/chat', authMiddleware, promptDefenseMiddleware, chatRoutes);

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (${IS_PROD ? 'production' : 'development'})`);
});
