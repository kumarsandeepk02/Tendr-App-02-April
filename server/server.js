require('dotenv').config({ override: true });

// Sentry must init before other imports
const { initSentry, captureError, Sentry } = require('./services/sentry');
const crypto = require('crypto');
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
const folderRoutes = require('./routes/folders');
const adminRoutes = require('./routes/admin');
const { authMiddleware } = require('./middleware/auth');
const { tenantMiddleware, adminRoleCheck } = require('./middleware/tenant');
const { promptDefenseMiddleware } = require('./services/security/promptDefense');

// Slack integration (loaded if signing secret is set — bot token comes after OAuth install)
let slackRouter = null;
if (process.env.SLACK_SIGNING_SECRET) {
  const { slackRouter: router } = require('./routes/slack');
  slackRouter = router;
  console.log('Slack integration enabled' + (process.env.SLACK_BOT_TOKEN?.startsWith('xoxb-') ? '' : ' (bot token not yet configured — OAuth install available)'));
} else {
  console.log('Slack integration disabled (SLACK_SIGNING_SECRET not set)');
}

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

// ── Slack routes (BEFORE express.json — needs raw body for signature verification)
if (slackRouter) {
  app.use('/api/slack', slackRouter);
}

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser(process.env.SESSION_SECRET));

// ── Structured Request Logging ─────────────────────────────────────────────
app.use((req, res, next) => {
  const traceId = crypto.randomBytes(8).toString('hex');
  req.traceId = traceId;
  res.setHeader('X-Trace-Id', traceId);
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const log = {
      traceId,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
      userId: req.auth?.profileId || undefined,
    };
    if (res.statusCode >= 500) {
      console.error(JSON.stringify(log));
    } else if (res.statusCode >= 400 || duration > 5000) {
      console.warn(JSON.stringify(log));
    }
  });
  next();
});

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

// ── Health check (public, with DB ping) ────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    const { sql: rawSql } = require('./db');
    await rawSql`SELECT 1`;
    res.json({ status: 'ok', db: 'ok', timestamp: Date.now() });
  } catch (err) {
    console.error('Health check DB ping failed:', err.message);
    res.status(503).json({ status: 'degraded', db: 'error', timestamp: Date.now() });
  }
});

// ── Admin routes — auth + tenant + admin role ──────────────────────────────
app.use('/api/admin', authMiddleware, tenantMiddleware, adminRoleCheck, adminRoutes);

// ── Protected routes — auth + tenant required ──────────────────────────────
app.use('/api/folders', authMiddleware, tenantMiddleware, folderRoutes);
app.use('/api/projects', authMiddleware, tenantMiddleware, projectRoutes);
app.use('/api/upload', authMiddleware, tenantMiddleware, uploadRoutes);

// Chat routes: auth first, then AI rate limit on heavy endpoints, then prompt defense
app.use('/api/chat', authMiddleware, tenantMiddleware);
app.use('/api/chat/v2/pipeline', aiLimiter);
app.use('/api/chat/v2/planning', aiLimiter);
app.use('/api/chat/v2/brief', aiLimiter);
app.use('/api/chat/v2/readiness', aiLimiter);
app.use('/api/chat/regenerate-section', aiLimiter);
app.use('/api/chat/tools', aiLimiter);
app.use('/api/chat/pipeline', aiLimiter);
app.use('/api/chat', promptDefenseMiddleware, chatRoutes);

// ─�� Global Error Handler (must be last middleware) ─────────────────────────
app.use((err, req, res, _next) => {
  const traceId = req.traceId || 'unknown';
  console.error(JSON.stringify({
    traceId,
    error: err.message,
    stack: IS_PROD ? undefined : err.stack,
    method: req.method,
    path: req.path,
    userId: req.auth?.profileId,
  }));
  captureError(err, { traceId, path: req.path, userId: req.auth?.profileId });
  if (!res.headersSent) {
    res.status(err.status || 500).json({ error: IS_PROD ? 'Internal server error' : err.message });
  }
});

// ── Start + Graceful Shutdown ──────────────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT} (${IS_PROD ? 'production' : 'development'})`);
});

function gracefulShutdown(signal) {
  console.log(`${signal} received — shutting down gracefully`);
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
  // Force exit after 10s if connections don't close
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
