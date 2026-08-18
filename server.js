const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const { sequelize } = require('./src/models');
const apiRoutes = require('./src/routes/api');
const { setIo } = require('./src/socket');
const { runAutoMigrations } = require('./src/migrations/autoMigrations');

// ── Validate required environment variables ──────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('[FATAL] JWT_SECRET environment variable is not set. Refusing to start.');
  process.exit(1);
}

// ── Allowed CORS origins ──────────────────────────────────────────────────────
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:3001'];

// ── Rate limiters ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests from this IP. Please try again after 15 minutes.' }
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down.' }
});

const app = express();
const PORT = process.env.PORT || 5003;

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// ── Socket.IO authentication via httpOnly cookie ──────────────────────────────
const { parse: parseCookie } = require('cookie');
io.use((socket, next) => {
  try {
    const raw = socket.handshake.headers.cookie || '';
    const cookies = parseCookie(raw);
    const token = cookies.token;
    if (!token) return next(new Error('Socket: Unauthorized — no session cookie'));
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.data.user = decoded;
    next();
  } catch (err) {
    next(new Error('Socket: Unauthorized — invalid or expired token'));
  }
});

// Register io in the shared socket singleton so controllers can use it
setIo(io);

// Socket.io: auto-join per-user room based on verified token payload
io.on('connection', (socket) => {
  if (socket.data.user && socket.data.user.id) {
    socket.join(`user_${socket.data.user.id}`);
  }
});

// Attach socket server to request object
app.use((req, res, next) => {
  req.io = io;
  
  // Intercept response to emit socket events on successful mutations
  const originalJson = res.json;
  res.json = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const path = req.originalUrl || req.path;
      const isRead = path.includes('/list') || path.includes('/details');
      if (!isRead) {
        setTimeout(() => {
          if (path.includes('/onboarding') || path.includes('/email-requests') || path.includes('/users/offboard')) {
            io.emit('onboarding_change');
          }
          if (path.includes('/assets/requests')) {
            io.emit('asset_request_change');
          }
          if (path.includes('/licenses')) {
            io.emit('license_change');
          }
          if (path.includes('/tickets')) {
            io.emit('ticket_change');
          }
        }, 50);
      }
    }
    return originalJson.call(this, body);
  };
  
  const originalSend = res.send;
  res.send = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const path = req.originalUrl || req.path;
      const isRead = path.includes('/list') || path.includes('/details');
      if (!isRead) {
        setTimeout(() => {
          if (path.includes('/onboarding') || path.includes('/email-requests') || path.includes('/users/offboard')) {
            io.emit('onboarding_change');
          }
          if (path.includes('/assets/requests')) {
            io.emit('asset_request_change');
          }
          if (path.includes('/licenses')) {
            io.emit('license_change');
          }
          if (path.includes('/tickets')) {
            io.emit('ticket_change');
          }
        }, 50);
      }
    }
    return originalSend.call(this, body);
  };
  
  next();
});

// 1. Trust the first proxy (correct IP detection behind nginx/load balancer)
app.set('trust proxy', 1);

// 2. Security headers via Helmet
app.use(helmet({
  contentSecurityPolicy: false // Disable CSP here; Next.js frontend handles its own
}));

// 3. CORS — restrict to explicit origin allowlist
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// 4. Rate limiting
app.use('/api/auth', authLimiter);   // strict limit on auth endpoints
app.use('/api', apiLimiter);          // general limit on all API routes

// 5. Mount API Routes
app.use('/api', apiRoutes);

app.get('/api/heartBeat', async (req, res) => {
    res.status(200).send('Aux Asset Care API working...!');
});

// 3. 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// 4. Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

// 5. Connect database and start server
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('[DATABASE] Database connection established successfully via Sequelize.');
    
    // Run auto migrations
    await runAutoMigrations();

    // Start cron jobs
    const { startLicenseExpiryJob } = require('./src/cron/licenseExpiryJob');
    const { startReportScheduleJob } = require('./src/cron/reportScheduleJob');

    startLicenseExpiryJob();
    startReportScheduleJob();

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`==================================================`);
      console.log(` Aux AssetCare REST & Socket Server Running on http://localhost:${PORT}`);
      console.log(` Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(` Database Host: ${process.env.DB_HOST || '127.0.0.1'}`);
      console.log(` Allowed Origins: ${allowedOrigins.join(', ')}`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('[DATABASE ERROR] Failed to connect to MySQL database:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
