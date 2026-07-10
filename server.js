const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { sequelize } = require('./src/models');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 5003;

// 1. Parsing and CORS Middlewares
app.use(cors({
  origin: true, // or specify frontend URL
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// 2. Mount API Routes
app.use('/api', apiRoutes);

// 3. 404 handler
app.use((req, res, next) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// 4. Global Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Exception:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred.' });
});

async function runAutoMigrations() {
  const queryInterface = sequelize.getQueryInterface();
  try {
    // 1. Alter users status enum to support 'resigned'
    console.log('[MIGRATION] Checking/Altering users status enum...');
    await queryInterface.changeColumn('users', 'status', {
      type: sequelize.Sequelize.ENUM('active', 'inactive', 'onboarding', 'resigned'),
      defaultValue: 'active',
      allowNull: false
    });

    // 2. Add columns to asset_allocations if missing
    const tableInfo = await queryInterface.describeTable('asset_allocations');
    
    if (!tableInfo.verified_by_location_admin) {
      console.log('[MIGRATION] Adding verified_by_location_admin column to asset_allocations...');
      await queryInterface.addColumn('asset_allocations', 'verified_by_location_admin', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
    
    if (!tableInfo.verified_by_general_admin) {
      console.log('[MIGRATION] Adding verified_by_general_admin column to asset_allocations...');
      await queryInterface.addColumn('asset_allocations', 'verified_by_general_admin', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }

    // 3. Add columns to users if missing
    const userTableInfo = await queryInterface.describeTable('users');
    if (!userTableInfo.mfa_enabled) {
      console.log('[MIGRATION] Adding mfa_enabled column to users...');
      await queryInterface.addColumn('users', 'mfa_enabled', {
        type: sequelize.Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
    if (!userTableInfo.mfa_secret) {
      console.log('[MIGRATION] Adding mfa_secret column to users...');
      await queryInterface.addColumn('users', 'mfa_secret', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true
      });
    }
    if (!userTableInfo.reset_token) {
      console.log('[MIGRATION] Adding reset_token column to users...');
      await queryInterface.addColumn('users', 'reset_token', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true
      });
    }
    if (!userTableInfo.reset_token_expiry) {
      console.log('[MIGRATION] Adding reset_token_expiry column to users...');
      await queryInterface.addColumn('users', 'reset_token_expiry', {
        type: sequelize.Sequelize.DATE,
        allowNull: true
      });
    }
  } catch (error) {
    console.error('[MIGRATION ERROR] Failed to run auto-migrations:', error.message);
  }
}

// 5. Connect database and start server
async function startServer() {
  try {
    await sequelize.authenticate();
    console.log('[DATABASE] Database connection established successfully via Sequelize.');
    
    // Run auto migrations
    await runAutoMigrations();
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`==================================================`);
      console.log(` AssetIQ REST API Server Running on http://localhost:${PORT}`);
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
