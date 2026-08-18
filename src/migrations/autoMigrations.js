const { sequelize, Permission, Role, SoftwareLicense } = require('../models');

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
    if (!userTableInfo.mfa_pending_secret) {
      console.log('[MIGRATION] Adding mfa_pending_secret column to users...');
      await queryInterface.addColumn('users', 'mfa_pending_secret', {
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

    if (!userTableInfo.general_manager_id) {
      console.log('[MIGRATION] Adding general_manager_id column to users...');
      await queryInterface.addColumn('users', 'general_manager_id', {
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

    // 6. Add reporting_manager_id, role_id, general_manager_id columns to onboarding_requests if missing
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
    if (!onboardingTableInfo.role_id) {
      console.log('[MIGRATION] Adding role_id column to onboarding_requests...');
      await queryInterface.addColumn('onboarding_requests', 'role_id', {
        type: sequelize.Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'roles',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
    if (!onboardingTableInfo.general_manager_id) {
      console.log('[MIGRATION] Adding general_manager_id column to onboarding_requests...');
      await queryInterface.addColumn('onboarding_requests', 'general_manager_id', {
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
        }]).catch(() => {});
      }

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
      if (adminRole)      await assignPerms(adminRole.id,      [32,33,34,35,36,37]);
      if (itAdminRole)    await assignPerms(itAdminRole.id,    [32,33,34,35,36]);
      if (locAdminRole)   await assignPerms(locAdminRole.id,   [32,38]);

      console.log('[MIGRATION] License permissions seeded and assigned to roles.');
    }

    // 10. Seed sample software licenses if table is empty
    const licenseCount = await SoftwareLicense.count();
    if (licenseCount === 0) {
      console.log('[MIGRATION] Seeding sample software licenses...');
      await queryInterface.bulkInsert('software_licenses', [
        {
          software_name: 'Microsoft Office 365',
          license_key: 'MOFF-365A-XK91-PRO2-2024',
          valid_from: '2024-01-01',
          valid_until: '2026-12-31',
          assigned_user_id: 2,
          status: 'active',
          notes: 'Enterprise subscription — 50 seats. Includes Word, Excel, PowerPoint, Teams.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Adobe Creative Cloud',
          license_key: 'ADCC-CREC-7X2M-ENT5-2025',
          valid_from: '2025-01-15',
          valid_until: '2026-01-14',
          assigned_user_id: 3,
          status: 'active',
          notes: 'All-apps plan. Includes Photoshop, Illustrator, InDesign, Premiere Pro.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Slack Business+',
          license_key: 'SLCK-BIZ+-4RT9-MNQ1-2025',
          valid_from: '2025-03-01',
          valid_until: '2026-02-28',
          assigned_user_id: 4,
          status: 'active',
          notes: 'Business+ plan — 25 users. Includes unlimited message history and advanced workflows.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Zoom Business',
          license_key: 'ZOOM-BIZ2-9PL7-KWR3-2025',
          valid_from: '2025-02-01',
          valid_until: '2026-01-31',
          assigned_user_id: 5,
          status: 'active',
          notes: '10-host license. Includes cloud recording, webinar add-on, and SSO.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'AutoCAD 2025',
          license_key: 'ACAD-2025-LTM1-SUB9-ADESK',
          valid_from: '2025-04-01',
          valid_until: '2026-03-31',
          assigned_user_id: 6,
          status: 'active',
          notes: 'Single-user named license. Annual subscription via Autodesk account.',
          created_at: new Date(), updated_at: new Date()
        },
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
        {
          software_name: 'Kaspersky Endpoint Security',
          license_key: 'KASP-ENDP-SEC3-XP01-2023',
          valid_from: '2023-01-01',
          valid_until: '2024-12-31',
          assigned_user_id: 7,
          status: 'expired',
          notes: 'Endpoint protection — 30 devices. Annual renewal required.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Salesforce CRM Professional',
          license_key: 'SFDC-PRO-CRM-7TZ2-2024',
          valid_from: '2024-01-01',
          valid_until: '2024-12-31',
          assigned_user_id: 8,
          status: 'expired',
          notes: 'Professional edition — 10 users. Includes Sales Cloud, reports, and mobile app.',
          created_at: new Date(), updated_at: new Date()
        },
        {
          software_name: 'Tableau Creator',
          license_key: 'TABL-CRT-2022-LN5X-ANLT',
          valid_from: '2022-06-01',
          valid_until: '2024-05-31',
          assigned_user_id: 2,
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

    // 11. Create tickets table if missing
    const currentTables = await queryInterface.showAllTables();
    if (!currentTables.includes('tickets')) {
      console.log('[MIGRATION] Creating tickets table...');
      await queryInterface.createTable('tickets', {
        id: { type: sequelize.Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        ticket_no: { type: sequelize.Sequelize.STRING(50), unique: true, allowNull: false },
        location_id: { type: sequelize.Sequelize.INTEGER, allowNull: false, references: { model: 'locations', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        asset_id: { type: sequelize.Sequelize.INTEGER, allowNull: true, references: { model: 'assets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        user_id: { type: sequelize.Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        raised_by: { type: sequelize.Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        title: { type: sequelize.Sequelize.STRING(255), allowNull: false },
        description: { type: sequelize.Sequelize.TEXT, allowNull: false },
        category: { type: sequelize.Sequelize.ENUM('hardware_malfunction', 'software_issue', 'lost_stolen', 'physical_damage', 'general_it'), allowNull: false },
        priority: { type: sequelize.Sequelize.ENUM('low', 'medium', 'high', 'critical'), defaultValue: 'medium', allowNull: false },
        status: { type: sequelize.Sequelize.ENUM('pending', 'in_progress', 'resolved', 'closed', 'cancelled'), defaultValue: 'pending', allowNull: false },
        assigned_to: { type: sequelize.Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        resolution_type: { type: sequelize.Sequelize.ENUM('repaired', 'replaced', 'retired', 'no_issue_found', 'rejected'), allowNull: true },
        resolution_notes: { type: sequelize.Sequelize.TEXT, allowNull: true },
        created_at: { type: sequelize.Sequelize.DATE, allowNull: false, defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: sequelize.Sequelize.DATE, allowNull: false, defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      console.log('[MIGRATION] tickets table created.');
    }

    // 12. Create ticket_comments table if missing
    const tablesAfterTickets = await queryInterface.showAllTables();
    if (!tablesAfterTickets.includes('ticket_comments')) {
      console.log('[MIGRATION] Creating ticket_comments table...');
      await queryInterface.createTable('ticket_comments', {
        id: { type: sequelize.Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        ticket_id: { type: sequelize.Sequelize.INTEGER, allowNull: false, references: { model: 'tickets', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        user_id: { type: sequelize.Sequelize.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
        type: { type: sequelize.Sequelize.ENUM('comment', 'status_change', 'assignment', 'resolution'), defaultValue: 'comment', allowNull: false },
        message: { type: sequelize.Sequelize.TEXT, allowNull: false },
        metadata: { type: sequelize.Sequelize.JSON, allowNull: true },
        created_at: { type: sequelize.Sequelize.DATE, allowNull: false, defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: sequelize.Sequelize.DATE, allowNull: false, defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      console.log('[MIGRATION] ticket_comments table created.');
    }

    // 13. Seed ticket permissions if not already present
    const existingTicketPerm = await Permission.findOne({ where: { name: 'ticket.list' } });
    if (!existingTicketPerm) {
      console.log('[MIGRATION] Seeding ticket permissions...');
      const ticketPerms = [
        { id: 39, name: 'ticket.list', description: 'View tickets' },
        { id: 40, name: 'ticket.add',  description: 'Raise tickets' },
        { id: 41, name: 'ticket.edit', description: 'Assign, resolve, close, cancel tickets' },
      ];
      for (const p of ticketPerms) {
        await queryInterface.bulkInsert('permissions', [{ ...p, created_at: new Date(), updated_at: new Date() }]).catch(() => {});
      }

      const superAdminRole = await Role.findOne({ where: { name: 'Super Admin' } });
      const adminRole      = await Role.findOne({ where: { name: 'Admin' } });
      const locAdminRole   = await Role.findOne({ where: { name: 'Location Admin' } });
      const userRole       = await Role.findOne({ where: { name: 'User' } });

      const assignPerms = async (roleId, permIds) => {
        for (const pid of permIds) {
          await queryInterface.bulkInsert('role_permissions', [{ role_id: roleId, permission_id: pid }]).catch(() => {});
        }
      };

      if (superAdminRole) await assignPerms(superAdminRole.id, [39, 40, 41]);
      if (adminRole)      await assignPerms(adminRole.id,      [39, 40, 41]);
      if (locAdminRole)   await assignPerms(locAdminRole.id,   [39, 40, 41]);
      if (userRole)       await assignPerms(userRole.id,       [39, 40]);

      console.log('[MIGRATION] Ticket permissions seeded and assigned to roles.');
    }

    // 14. Add license_type to software_licenses and fcm_token to users if missing
    const userTableInfoForFcm = await queryInterface.describeTable('users');
    if (!userTableInfoForFcm.fcm_token) {
      console.log('[MIGRATION] Adding fcm_token column to users...');
      await queryInterface.addColumn('users', 'fcm_token', {
        type: sequelize.Sequelize.STRING(255),
        allowNull: true
      });
    }

    const licenseTableInfoForType = await queryInterface.describeTable('software_licenses');
    if (!licenseTableInfoForType.license_type) {
      console.log('[MIGRATION] Adding license_type column to software_licenses...');
      await queryInterface.addColumn('software_licenses', 'license_type', {
        type: sequelize.Sequelize.ENUM('subscription', 'validity'),
        defaultValue: 'validity',
        allowNull: false
      });
    }

    // 15. Create report_schedules table if missing
    const tablesAfterAudit = await queryInterface.showAllTables();
    if (!tablesAfterAudit.includes('report_schedules')) {
      console.log('[MIGRATION] Creating report_schedules table...');
      await queryInterface.createTable('report_schedules', {
        id: { type: sequelize.Sequelize.INTEGER, autoIncrement: true, primaryKey: true, allowNull: false },
        report_id: { type: sequelize.Sequelize.STRING(100), allowNull: false },
        report_title: { type: sequelize.Sequelize.STRING(255), allowNull: false },
        name: { type: sequelize.Sequelize.STRING(255), allowNull: false },
        frequency: { type: sequelize.Sequelize.STRING(50), allowNull: false },
        run_time: { type: sequelize.Sequelize.STRING(50), allowNull: false },
        recipients: { type: sequelize.Sequelize.TEXT, allowNull: false },
        format: { type: sequelize.Sequelize.STRING(50), allowNull: false },
        active: { type: sequelize.Sequelize.BOOLEAN, defaultValue: true, allowNull: false },
        last_run: { type: sequelize.Sequelize.STRING(100), defaultValue: 'Never', allowNull: true },
        user_id: { type: sequelize.Sequelize.INTEGER, allowNull: true, references: { model: 'users', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
        run_day: { type: sequelize.Sequelize.STRING(50), allowNull: true },
        run_date: { type: sequelize.Sequelize.INTEGER, allowNull: true },
        created_at: { type: sequelize.Sequelize.DATE, allowNull: false, defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP') },
        updated_at: { type: sequelize.Sequelize.DATE, allowNull: false, defaultValue: sequelize.Sequelize.literal('CURRENT_TIMESTAMP') }
      });
      console.log('[MIGRATION] report_schedules table created.');
    } else {
      const scheduleTableInfo = await queryInterface.describeTable('report_schedules');
      if (!scheduleTableInfo.run_day) {
        console.log('[MIGRATION] Adding run_day column to report_schedules...');
        await queryInterface.addColumn('report_schedules', 'run_day', {
          type: sequelize.Sequelize.STRING(50),
          allowNull: true
        });
      }
      if (!scheduleTableInfo.run_date) {
        console.log('[MIGRATION] Adding run_date column to report_schedules...');
        await queryInterface.addColumn('report_schedules', 'run_date', {
          type: sequelize.Sequelize.INTEGER,
          allowNull: true
        });
      }
    }

  } catch (error) {
    console.error('[MIGRATION ERROR] Failed to run auto-migrations:', error.message);
  }
}

module.exports = { runAutoMigrations };
