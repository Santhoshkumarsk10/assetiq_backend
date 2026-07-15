const express = require('express');
const cookieParser = require('cookie-parser');
const cors = require('cors');
require('dotenv').config();

const { sequelize } = require('./src/models');
const apiRoutes = require('./src/routes/api');
const { setIo } = require('./src/socket');

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
        }, 50);
      }
    }
    return originalSend.call(this, body);
  };
  
  next();
});

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

    if (!userTableInfo.reporting_manager_id) {
      console.log('[MIGRATION] Adding reporting_manager_id column to users...');
      await queryInterface.addColumn('users', 'reporting_manager_id', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // 4. Create asset_requests table if missing
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('asset_requests')) {
      console.log('[MIGRATION] Creating asset_requests table...');
      await queryInterface.createTable('asset_requests', {
        id: {
          type: sequelize.Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        location_id: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'locations',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        requested_by: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        asset_name: {
          type: sequelize.Sequelize.STRING(255),
          allowNull: false
        },
        asset_type: {
          type: sequelize.Sequelize.STRING(50),
          allowNull: false
        },
        quantity: {
          type: sequelize.Sequelize.INTEGER,
          defaultValue: 1,
          allowNull: false
        },
        status: {
          type: sequelize.Sequelize.ENUM('pending', 'purchased', 'completed'),
          defaultValue: 'pending',
          allowNull: false
        },
        notes: {
          type: sequelize.Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    // 5. Create software_licenses table if missing
    if (!tables.includes('software_licenses')) {
      console.log('[MIGRATION] Creating software_licenses table...');
      await queryInterface.createTable('software_licenses', {
        id: {
          type: sequelize.Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        software_name: {
          type: sequelize.Sequelize.STRING(255),
          allowNull: false
        },
        license_key: {
          type: sequelize.Sequelize.STRING(255),
          allowNull: false
        },
        valid_from: {
          type: sequelize.Sequelize.DATEONLY,
          allowNull: true
        },
        valid_until: {
          type: sequelize.Sequelize.DATEONLY,
          allowNull: true
        },
        assigned_user_id: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'users',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        mapped_asset_id: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: true,
          references: {
            model: 'assets',
            key: 'id'
          },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        status: {
          type: sequelize.Sequelize.ENUM('available', 'active', 'expired'),
          defaultValue: 'available',
          allowNull: false
        },
        notes: {
          type: sequelize.Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    // 6. Add reporting_manager_id column to onboarding_requests if missing
    const onboardingTableInfo = await queryInterface.describeTable('onboarding_requests');
    if (!onboardingTableInfo.reporting_manager_id) {
      console.log('[MIGRATION] Adding reporting_manager_id column to onboarding_requests...');
      await queryInterface.addColumn('onboarding_requests', 'reporting_manager_id', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // 7. Create notifications table if missing
    if (!tables.includes('notifications')) {
      console.log('[MIGRATION] Creating notifications table...');
      await queryInterface.createTable('notifications', {
        id: {
          type: sequelize.Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        title: { type: sequelize.Sequelize.STRING(255), allowNull: false },
        message: { type: sequelize.Sequelize.TEXT, allowNull: false },
        type: { type: sequelize.Sequelize.STRING(100), defaultValue: 'info' },
        reference_id: { type: sequelize.Sequelize.INTEGER, allowNull: true },
        is_read: { type: sequelize.Sequelize.BOOLEAN, defaultValue: false },
        created_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    // 8. Create license_renewal_requests table if missing
    if (!tables.includes('license_renewal_requests')) {
      console.log('[MIGRATION] Creating license_renewal_requests table...');
      await queryInterface.createTable('license_renewal_requests', {
        id: {
          type: sequelize.Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        license_id: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'software_licenses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        requested_by: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        approved_by: {
          type: sequelize.Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        status: {
          type: sequelize.Sequelize.ENUM('pending', 'approved', 'rejected'),
          defaultValue: 'pending',
          allowNull: false
        },
        proposed_valid_until: { type: sequelize.Sequelize.DATEONLY, allowNull: true },
        renewal_notes: { type: sequelize.Sequelize.TEXT, allowNull: true },
        response_notes: { type: sequelize.Sequelize.TEXT, allowNull: true },
        created_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: sequelize.Sequelize.DATE,
          allowNull: false,
          defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    // 9. Seed license permissions if not already present
    const { Permission, Role } = require('./src/models');
    const existingLicensePerm = await Permission.findOne({ where: { name: 'license.list' } });
    if (!existingLicensePerm) {
      console.log('[MIGRATION] Seeding license permissions...');
      const licensePerms = [
        { id: 32, name: 'license.list',           description: 'View software license list' },
        { id: 33, name: 'license.add',            description: 'Add new software licenses' },
        { id: 34, name: 'license.edit',           description: 'Edit software licenses' },
        { id: 35, name: 'license.delete',         description: 'Delete software licenses' },
        { id: 36, name: 'license.renewal.submit', description: 'Submit a license renewal request (IT Admin)' },
        { id: 37, name: 'license.renewal.decide', description: 'Approve or reject a renewal request (Admin)' },
        { id: 38, name: 'license.notify',         description: 'Notify assigned user after license renewal (Location Admin)' },
      ];

      for (const p of licensePerms) {
        await queryInterface.bulkInsert('permissions', [{
          ...p,
          created_at: new Date(),
          updated_at: new Date()
        }]).catch(() => {}); // ignore duplicate-key errors on re-runs
      }

      // Assign to roles:
      //  Super Admin (1) & Admin (2): all license permissions
      //  IT Admin — we look up by name since ID may vary
      //  Location Admin (3): only license.list + license.notify

      const superAdminRole = await Role.findOne({ where: { name: 'Super Admin' } });
      const adminRole      = await Role.findOne({ where: { name: 'Admin' } });
      const itAdminRole    = await Role.findOne({ where: { name: 'IT Admin' } });
      const locAdminRole   = await Role.findOne({ where: { name: 'Location Admin' } });

      const assignPerms = async (roleId, permIds) => {
        for (const pid of permIds) {
          await queryInterface.bulkInsert('role_permissions', [{ role_id: roleId, permission_id: pid }]).catch(() => {});
        }
      };

      if (superAdminRole) await assignPerms(superAdminRole.id, [32,33,34,35,36,37,38]);
      if (adminRole)      await assignPerms(adminRole.id,      [32,33,34,35,36,37]);   // Admin doesn't notify (that's Loc Admin)
      if (itAdminRole)    await assignPerms(itAdminRole.id,    [32,33,34,35,36]);       // IT Admin: list/add/edit/delete/submit renewal
      if (locAdminRole)   await assignPerms(locAdminRole.id,   [32,38]);                // Location Admin: list + notify

      console.log('[MIGRATION] License permissions seeded and assigned to roles.');
    }

    // 10. Seed sample software licenses if table is empty
    const { SoftwareLicense } = require('./src/models');
    const licenseCount = await SoftwareLicense.count();
    if (licenseCount === 0) {
      console.log('[MIGRATION] Seeding sample software licenses...');
      await queryInterface.bulkInsert('software_licenses', [
        // Active licenses – assigned to Location Admin users
        {
          software_name: 'Microsoft Office 365',
          license_key: 'MOFF-365A-XK91-PRO2-2024',
          valid_from: '2024-01-01',
          valid_until: '2026-12-31',
          assigned_user_id: 2, // Chennai Admin
          status: 'active',
          notes: 'Enterprise subscription — 50 seats. Includes Word, Excel, PowerPoint, Teams.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Adobe Creative Cloud',
          license_key: 'ADCC-CREC-7X2M-ENT5-2025',
          valid_from: '2025-01-15',
          valid_until: '2026-01-14',
          assigned_user_id: 3, // Mumbai Admin
          status: 'active',
          notes: 'All-apps plan. Includes Photoshop, Illustrator, InDesign, Premiere Pro.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Slack Business+',
          license_key: 'SLCK-BIZ+-4RT9-MNQ1-2025',
          valid_from: '2025-03-01',
          valid_until: '2026-02-28',
          assigned_user_id: 4, // DIFC Admin
          status: 'active',
          notes: 'Business+ plan — 25 users. Includes unlimited message history and advanced workflows.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Zoom Business',
          license_key: 'ZOOM-BIZ2-9PL7-KWR3-2025',
          valid_from: '2025-02-01',
          valid_until: '2026-01-31',
          assigned_user_id: 5, // Kenya Admin
          status: 'active',
          notes: '10-host license. Includes cloud recording, webinar add-on, and SSO.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'AutoCAD 2025',
          license_key: 'ACAD-2025-LTM1-SUB9-ADESK',
          valid_from: '2025-04-01',
          valid_until: '2026-03-31',
          assigned_user_id: 6, // KL Malaysia Admin
          status: 'active',
          notes: 'Single-user named license. Annual subscription via Autodesk account.',
          created_at: new Date(), updated_at: new Date()
        },
        // Available (unassigned) licenses
        {
          software_name: 'JetBrains IntelliJ IDEA',
          license_key: 'JBIJ-IDEA-ENT7-FLT2-2025',
          valid_from: '2025-06-01',
          valid_until: '2026-05-31',
          assigned_user_id: null,
          status: 'available',
          notes: 'Floating license — 5 concurrent users. Covers IntelliJ, PyCharm, WebStorm.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Figma Organization',
          license_key: 'FGMA-ORG9-D5HY-2K3X-2025',
          valid_from: '2025-05-10',
          valid_until: '2026-05-09',
          assigned_user_id: null,
          status: 'available',
          notes: 'Organization plan — unlimited editors & viewers. Includes branching and analytics.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'GitHub Enterprise',
          license_key: 'GHUB-ENT-CLD-4VW8-ORG1',
          valid_from: '2025-01-01',
          valid_until: '2025-12-31',
          assigned_user_id: null,
          status: 'available',
          notes: 'Cloud-hosted plan — 100 developer seats. Includes advanced security and audit log streaming.',
          created_at: new Date(), updated_at: new Date()
        },
        // Expired licenses – for testing renewal workflow
        {
          software_name: 'Kaspersky Endpoint Security',
          license_key: 'KASP-ENDP-SEC3-XP01-2023',
          valid_from: '2023-01-01',
          valid_until: '2024-12-31',
          assigned_user_id: 7, // Labuan Malaysia Admin
          status: 'expired',
          notes: 'Endpoint protection — 30 devices. Annual renewal required.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Salesforce CRM Professional',
          license_key: 'SFDC-PRO-CRM-7TZ2-2024',
          valid_from: '2024-01-01',
          valid_until: '2024-12-31',
          assigned_user_id: 8, // London Admin
          status: 'expired',
          notes: 'Professional edition — 10 users. Includes Sales Cloud, reports, and mobile app.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Tableau Creator',
          license_key: 'TABL-CRT-2022-LN5X-ANLT',
          valid_from: '2022-06-01',
          valid_until: '2024-05-31',
          assigned_user_id: 2, // Chennai Admin
          status: 'expired',
          notes: 'Data visualisation suite. Requires renewal to restore Tableau Server access.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Sophos Intercept X',
          license_key: 'SOPH-INTX-ADV-8MR4-2023',
          valid_from: '2023-03-01',
          valid_until: '2024-02-29',
          assigned_user_id: null,
          status: 'expired',
          notes: 'Advanced endpoint protection. Unassigned — requires reactivation and user assignment.',
          created_at: new Date(), updated_at: new Date()
        },
      ]);
      console.log('[MIGRATION] Sample software licenses seeded (12 records).');
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
