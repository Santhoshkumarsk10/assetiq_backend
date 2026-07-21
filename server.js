const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { sequelize } = require('./src/models');
const apiRoutes = require('./src/routes/api');
const { setIo } = require('./src/socket');
const { runAutoMigrations } = require('./src/migrations/autoMigrations');

const app = express();
const PORT = process.env.PORT || 5003;

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Register io in the shared socket singleton so controllers can use it
setIo(io);

// Socket.io: per-user rooms so targeted notifications can be sent
io.on('connection', (socket) => {
  socket.on('join_user_room', (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
    }
  });
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

// 1. Parsing and CORS Middlewares
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// 2. Mount API Routes
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

    // Start hourly license expiry check
    const { checkAndMarkExpiredLicenses } = require('./src/controllers/licenseController');
    checkAndMarkExpiredLicenses().catch(console.error); // Run immediately on start
    setInterval(() => {
      checkAndMarkExpiredLicenses().catch(console.error);
    }, 60 * 60 * 1000); // Every 1 hour

    server.listen(PORT, '0.0.0.0', () => {
      console.log(`==================================================`);
      console.log(` Aux AssetCare REST & Socket Server Running on http://localhost:${PORT}`);
      console.log(` Mode: ${process.env.NODE_ENV || 'development'}`);
      console.log(` Database Host: ${process.env.DB_HOST || '127.0.0.1'}`);
      console.log(`==================================================`);
    });
  } catch (error) {
    console.error('[DATABASE ERROR] Failed to connect to MySQL database:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
