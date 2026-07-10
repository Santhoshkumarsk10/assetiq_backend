'use strict';
const bcrypt = require('bcryptjs');
const xlsx = require('xlsx');
const path = require('path');

module.exports = {
  async up(queryInterface, Sequelize) {
    // Disable foreign key checks to allow truncating/clearing all tables
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');

    // Clear all existing records
    await queryInterface.bulkDelete('asset_allocations', null, {});
    await queryInterface.bulkDelete('onboarding_approvals', null, {});
    await queryInterface.bulkDelete('email_creation_requests', null, {});
    await queryInterface.bulkDelete('onboarding_requests', null, {});
    await queryInterface.bulkDelete('audit_logs', null, {});
    await queryInterface.bulkDelete('assets', null, {});
    await queryInterface.bulkDelete('users', null, {});
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
    await queryInterface.bulkDelete('locations', null, {});

    // Re-enable foreign key checks
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

    // 1. Seed Locations
    const locationsData = [
      { id: 1, name: 'Chennai', address: '123 Mount Road, Chennai, Tamil Nadu', country_code: '+91', created_at: new Date(), updated_at: new Date() },
      { id: 2, name: 'Mumbai', address: '456 Nariman Point, Mumbai, Maharashtra', country_code: '+91', created_at: new Date(), updated_at: new Date() },
      { id: 3, name: 'DIFC', address: 'DIFC Office, Dubai, UAE', country_code: '+971', created_at: new Date(), updated_at: new Date() },
      { id: 4, name: 'kenya', address: 'Nairobi Office, Kenya', country_code: '+254', created_at: new Date(), updated_at: new Date() },
      { id: 5, name: 'KL Malaysia', address: 'Kuala Lumpur Office, Malaysia', country_code: '+60', created_at: new Date(), updated_at: new Date() },
      { id: 6, name: 'Labuan Malaysia', address: 'Labuan Office, Malaysia', country_code: '+60', created_at: new Date(), updated_at: new Date() },
      { id: 7, name: 'London', address: 'London Office, UK', country_code: '+44', created_at: new Date(), updated_at: new Date() }
    ];
    await queryInterface.bulkInsert('locations', locationsData);

    // 2. Seed Roles
    await queryInterface.bulkInsert('roles', [
      { id: 1, name: 'Super Admin', description: 'Global administrator with full control', created_at: new Date(), updated_at: new Date() },
      { id: 2, name: 'Admin', description: 'General administrator with high permissions', created_at: new Date(), updated_at: new Date() },
      { id: 3, name: 'Location Admin', description: 'Facility-level localized administrator', created_at: new Date(), updated_at: new Date() },
      { id: 4, name: 'User', description: 'Regular employee with limited access', created_at: new Date(), updated_at: new Date() }
    ]);

    // 3. Seed Permissions
    const permissionsData = [
      { id: 1, name: 'location.list', description: 'List locations' },
      { id: 2, name: 'location.add', description: 'Add new locations' },
      { id: 3, name: 'location.edit', description: 'Edit existing locations' },
      { id: 4, name: 'location.delete', description: 'Delete locations' },
      { id: 5, name: 'user.list', description: 'List users' },
      { id: 6, name: 'user.add', description: 'Add new users' },
      { id: 7, name: 'user.edit', description: 'Edit existing users' },
      { id: 8, name: 'user.delete', description: 'Delete users' },
      { id: 9, name: 'user.resign', description: 'Mark user as resigned' },
      { id: 10, name: 'asset.list', description: 'List assets' },
      { id: 11, name: 'asset.add', description: 'Add new assets' },
      { id: 12, name: 'asset.edit', description: 'Edit existing assets' },
      { id: 13, name: 'asset.delete', description: 'Delete assets' },
      { id: 14, name: 'asset.allocate', description: 'Allocate assets to users' },
      { id: 15, name: 'asset.return', description: 'Process asset returns' },
      { id: 16, name: 'asset.import', description: 'Import assets bulk' },
      { id: 17, name: 'email_request.list', description: 'List email requests' },
      { id: 18, name: 'email_request.process', description: 'Approve/Reject email requests' },
      { id: 19, name: 'auditlog.list', description: 'List audit logs' },
      { id: 20, name: 'onboarding.list', description: 'List onboardings' },
      { id: 21, name: 'onboarding.show', description: 'View onboarding details' },
      { id: 22, name: 'onboarding.add', description: 'Add new onboarding' },
      { id: 23, name: 'onboarding.edit', description: 'Edit onboarding progress' },
      { id: 24, name: 'onboarding.approve', description: 'Approve onboarding requests' },
      { id: 25, name: 'role.list', description: 'List roles' },
      { id: 26, name: 'role.add', description: 'Add new roles' },
      { id: 27, name: 'role.edit', description: 'Edit roles and permissions mapping' },
      { id: 28, name: 'role.delete', description: 'Delete roles' },
      { id: 29, name: 'role.restore', description: 'Restore roles' },
      { id: 30, name: 'role.trashlist', description: 'List trashed roles' },
      { id: 31, name: 'role.show', description: 'View role details' }
    ].map(p => ({ ...p, created_at: new Date(), updated_at: new Date() }));

    await queryInterface.bulkInsert('permissions', permissionsData);

    // 4. Seed Role Permissions Mapping
    const rolePermissions = [];
    
    // Super Admin: IDs 1 to 31
    for (let i = 1; i <= 31; i++) {
      rolePermissions.push({ role_id: 1, permission_id: i });
    }

    // Admin: IDs 1 to 24
    for (let i = 1; i <= 24; i++) {
      rolePermissions.push({ role_id: 2, permission_id: i });
    }

    // Location Admin: location.list, user.list, asset.list, onboarding.*
    const locationAdminPerms = [1, 5, 10, 20, 21, 22, 23, 24];
    locationAdminPerms.forEach(pId => {
      rolePermissions.push({ role_id: 3, permission_id: pId });
    });

    await queryInterface.bulkInsert('role_permissions', rolePermissions);

    // Hashed Passwords
    const crypto = require('crypto');
    const sha256 = (str) => crypto.createHash('sha256').update(str).digest('hex');
    const hashedSuperAdmin = await bcrypt.hash(sha256('admin123'), 10);
    const hashedLocAdmin = await bcrypt.hash(sha256('admin123'), 10);
    const hashedUser = await bcrypt.hash(sha256('user123'), 10);

    // 5. Seed Default Super Admin User
    await queryInterface.bulkInsert('users', [
      {
        id: 1,
        employee_id: 'EMP001',
        name: 'Super Administrator',
        email: 'superadmin@assetiq.com',
        phone: '+91 9999999999',
        password: hashedSuperAdmin,
        role_id: 1, // Super Admin
        location_id: null, // Global
        department: 'Operations',
        designation: 'Chief Technology Officer',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // 6. Seed Location Admin for each location
    const locAdmins = [
      { id: 2, employee_id: 'EMP-ADM-CHE', name: 'Chennai Admin', email: 'chennai_admin@assetiq.com', phone: '+91 9000000001', password: hashedLocAdmin, role_id: 3, location_id: 1, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() },
      { id: 3, employee_id: 'EMP-ADM-MUM', name: 'Mumbai Admin', email: 'mumbai_admin@assetiq.com', phone: '+91 9000000002', password: hashedLocAdmin, role_id: 3, location_id: 2, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() },
      { id: 4, employee_id: 'EMP-ADM-DIF', name: 'DIFC Admin', email: 'difc_admin@assetiq.com', phone: '+971 50 000 0001', password: hashedLocAdmin, role_id: 3, location_id: 3, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() },
      { id: 5, employee_id: 'EMP-ADM-KEN', name: 'Kenya Admin', email: 'kenya_admin@assetiq.com', phone: '+254 700 000001', password: hashedLocAdmin, role_id: 3, location_id: 4, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() },
      { id: 6, employee_id: 'EMP-ADM-KLM', name: 'KL Malaysia Admin', email: 'klmalaysia_admin@assetiq.com', phone: '+60 10 000 0001', password: hashedLocAdmin, role_id: 3, location_id: 5, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() },
      { id: 7, employee_id: 'EMP-ADM-LAB', name: 'Labuan Malaysia Admin', email: 'labuanmalaysia_admin@assetiq.com', phone: '+60 10 000 0002', password: hashedLocAdmin, role_id: 3, location_id: 6, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() },
      { id: 8, employee_id: 'EMP-ADM-LON', name: 'London Admin', email: 'london_admin@assetiq.com', phone: '+44 7000 000001', password: hashedLocAdmin, role_id: 3, location_id: 7, department: 'Operations', designation: 'Location Administrator', status: 'active', created_at: new Date(), updated_at: new Date() }
    ];
    await queryInterface.bulkInsert('users', locAdmins);

    // Helper to format/clean phone numbers
    function formatPhone(phoneVal, countryCode) {
      if (!phoneVal) return null;
      let str = String(phoneVal).trim();
      if (str.startsWith('+')) {
        return str.replace(/\s+/g, ' '); // normalize spaces
      }
      // strip non-digits and prepend countryCode
      const digits = str.replace(/\D/g, '');
      return `${countryCode} ${digits}`;
    }

    // Helper to resolve location ID
    function getLocIdByName(locName) {
      const nameLower = String(locName).toLowerCase().trim();
      if (nameLower === 'chennai') return 1;
      if (nameLower === 'mumbai') return 2;
      if (nameLower === 'difc') return 3;
      if (nameLower === 'kenya') return 4;
      if (nameLower === 'kl malaysia') return 5;
      if (nameLower === 'labuan malaysia') return 6;
      if (nameLower === 'london') return 7;
      return null;
    }

    // Helper to resolve country code
    function getCountryCodeByLocId(locId) {
      const loc = locationsData.find(l => l.id === locId);
      return loc ? loc.country_code : '';
    }

    // 7. Load and Parse Excel sheet
    const filePath = '/home/santhoshkumar/Downloads/Nithin_Employee List_26 June 2026.xlsx';
    const workbook = xlsx.readFile(filePath);
    
    let userIdCounter = 9; // Start after superadmin and locadmins
    const usersToInsert = [];

    const sheetMapping = {
      'India': 'IND',
      'DIFC': 'DIFC',
      'Kenya': 'KEN',
      'Malaysia': 'MAL',
      'UK': 'UK'
    };

    workbook.SheetNames.forEach(sheetName => {
      const worksheet = workbook.Sheets[sheetName];
      const data = xlsx.utils.sheet_to_json(worksheet);
      const prefix = sheetMapping[sheetName] || 'EMP';

      data.forEach(row => {
        const rawLoc = row.Location;
        const locId = getLocIdByName(rawLoc);
        if (!locId) {
          console.warn(`Could not resolve location for: ${row.Name} (${rawLoc})`);
          return;
        }

        const countryCode = getCountryCodeByLocId(locId);
        const formattedPhone = formatPhone(row['Phone Num'], countryCode);
        const remarksLower = row.Remarks ? String(row.Remarks).toLowerCase() : '';
        const isResigned = remarksLower.includes('resigned');

        const slNo = row['Sl. No'] || (userIdCounter - 8);

        usersToInsert.push({
          id: userIdCounter++,
          employee_id: `EMP-${prefix}-${String(slNo).padStart(2, '0')}`,
          name: String(row.Name).trim(),
          email: String(row['Email ID']).toLowerCase().trim(),
          phone: formattedPhone,
          password: hashedUser,
          role_id: 4, // Regular User
          location_id: locId,
          department: 'Operations',
          designation: 'Associate',
          status: isResigned ? 'resigned' : 'active',
          created_at: new Date(),
          updated_at: new Date()
        });
      });
    });

    if (usersToInsert.length > 0) {
      await queryInterface.bulkInsert('users', usersToInsert);
    }

    // 8. Seed Sample Assets for all locations
    const assetsData = [
      // Chennai
      { id: 1, asset_tag: 'AST-CHE-LPT-101', name: 'MacBook Pro 16"', brand: 'Apple', type: 'Laptop', serial_number: 'SN-MAC-101', status: 'available', location_id: 1, created_at: new Date(), updated_at: new Date() },
      { id: 2, asset_tag: 'AST-CHE-LPT-102', name: 'Dell Latitude 5420', brand: 'Dell', type: 'Laptop', serial_number: 'SN-DEL-102', status: 'available', location_id: 1, created_at: new Date(), updated_at: new Date() },
      { id: 3, asset_tag: 'AST-CHE-MNT-201', name: 'LG 27" 4K Monitor', brand: 'LG', type: 'Monitor', serial_number: 'SN-LG-201', status: 'available', location_id: 1, created_at: new Date(), updated_at: new Date() },
      
      // Mumbai
      { id: 4, asset_tag: 'AST-MUM-LPT-301', name: 'Lenovo ThinkPad T14', brand: 'Lenovo', type: 'Laptop', serial_number: 'SN-LEN-301', status: 'available', location_id: 2, created_at: new Date(), updated_at: new Date() },
      { id: 5, asset_tag: 'AST-MUM-MOB-401', name: 'Samsung Galaxy S22', brand: 'Samsung', type: 'Mobile Device', serial_number: 'SN-SAM-401', status: 'available', location_id: 2, created_at: new Date(), updated_at: new Date() },
      
      // DIFC
      { id: 6, asset_tag: 'AST-DIF-LPT-103', name: 'MacBook Air M2', brand: 'Apple', type: 'Laptop', serial_number: 'SN-MAC-103', status: 'available', location_id: 3, created_at: new Date(), updated_at: new Date() },
      { id: 7, asset_tag: 'AST-DIF-MOB-402', name: 'iPhone 14 Pro', brand: 'Apple', type: 'Mobile Device', serial_number: 'SN-IPH-402', status: 'available', location_id: 3, created_at: new Date(), updated_at: new Date() },

      // Kenya
      { id: 8, asset_tag: 'AST-KEN-LPT-501', name: 'HP ProBook 450', brand: 'HP', type: 'Laptop', serial_number: 'SN-HP-501', status: 'available', location_id: 4, created_at: new Date(), updated_at: new Date() },
      { id: 9, asset_tag: 'AST-KEN-MNT-202', name: 'Asus 24" Monitor', brand: 'Asus', type: 'Monitor', serial_number: 'SN-ASU-202', status: 'available', location_id: 4, created_at: new Date(), updated_at: new Date() },

      // KL Malaysia
      { id: 10, asset_tag: 'AST-KLM-LPT-104', name: 'MacBook Pro 14"', brand: 'Apple', type: 'Laptop', serial_number: 'SN-MAC-104', status: 'available', location_id: 5, created_at: new Date(), updated_at: new Date() },
      { id: 11, asset_tag: 'AST-KLM-MOB-403', name: 'Samsung Galaxy A53', brand: 'Samsung', type: 'Mobile Device', serial_number: 'SN-SAM-403', status: 'available', location_id: 5, created_at: new Date(), updated_at: new Date() },

      // Labuan Malaysia
      { id: 12, asset_tag: 'AST-LAB-LPT-302', name: 'Lenovo ThinkPad E14', brand: 'Lenovo', type: 'Laptop', serial_number: 'SN-LEN-302', status: 'available', location_id: 6, created_at: new Date(), updated_at: new Date() },
      { id: 13, asset_tag: 'AST-LAB-MNT-203', name: 'HP 24" Monitor', brand: 'HP', type: 'Monitor', serial_number: 'SN-HP-203', status: 'available', location_id: 6, created_at: new Date(), updated_at: new Date() },

      // London
      { id: 14, asset_tag: 'AST-LON-LPT-105', name: 'MacBook Pro 16" M2', brand: 'Apple', type: 'Laptop', serial_number: 'SN-MAC-105', status: 'available', location_id: 7, created_at: new Date(), updated_at: new Date() },
      { id: 15, asset_tag: 'AST-LON-MNT-204', name: 'LG 34" UltraWide', brand: 'LG', type: 'Monitor', serial_number: 'SN-LG-204', status: 'available', location_id: 7, created_at: new Date(), updated_at: new Date() }
    ];
    await queryInterface.bulkInsert('assets', assetsData);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    await queryInterface.bulkDelete('assets', null, {});
    await queryInterface.bulkDelete('users', null, {});
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
    await queryInterface.bulkDelete('locations', null, {});
    await queryInterface.sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
  }
};