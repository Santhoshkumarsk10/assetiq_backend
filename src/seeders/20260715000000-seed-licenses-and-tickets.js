'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Seed license permissions (32-38) and ticket permissions (39-41)
    const permissions = [
      { id: 32, name: 'license.list',           description: 'View software license list', created_at: new Date(), updated_at: new Date() },
      { id: 33, name: 'license.add',            description: 'Add new software licenses', created_at: new Date(), updated_at: new Date() },
      { id: 34, name: 'license.edit',           description: 'Edit software licenses', created_at: new Date(), updated_at: new Date() },
      { id: 35, name: 'license.delete',         description: 'Delete software licenses', created_at: new Date(), updated_at: new Date() },
      { id: 36, name: 'license.renewal.submit', description: 'Submit a license renewal request (IT Admin)', created_at: new Date(), updated_at: new Date() },
      { id: 37, name: 'license.renewal.decide', description: 'Approve or reject a renewal request (Admin)', created_at: new Date(), updated_at: new Date() },
      { id: 38, name: 'license.notify',         description: 'Notify assigned user after license renewal (Location Admin)', created_at: new Date(), updated_at: new Date() },
      { id: 39, name: 'ticket.list',             description: 'View tickets', created_at: new Date(), updated_at: new Date() },
      { id: 40, name: 'ticket.add',              description: 'Raise tickets', created_at: new Date(), updated_at: new Date() },
      { id: 41, name: 'ticket.edit',             description: 'Assign, resolve, close, cancel tickets', created_at: new Date(), updated_at: new Date() }
    ];

    for (const p of permissions) {
      await queryInterface.bulkInsert('permissions', [p]).catch(() => {});
    }

    // 2. Assign permissions to roles
    // Role IDs (based on initial-seed):
    // Super Admin: 1, Admin: 2, Location Admin: 3, User: 4, IT Admin: we find dynamically or fallback to ID
    const [roles] = await queryInterface.sequelize.query(`SELECT id, name FROM roles;`);
    const superAdmin = roles.find(r => r.name === 'Super Admin');
    const admin = roles.find(r => r.name === 'Admin');
    const locAdmin = roles.find(r => r.name === 'Location Admin');
    const userRole = roles.find(r => r.name === 'User');
    const itAdmin = roles.find(r => r.name === 'IT Admin');

    const assignPerms = async (roleId, permIds) => {
      if (!roleId) return;
      for (const pid of permIds) {
        await queryInterface.bulkInsert('role_permissions', [{ role_id: roleId, permission_id: pid }]).catch(() => {});
      }
    };

    if (superAdmin) await assignPerms(superAdmin.id, [32, 33, 34, 35, 36, 37, 38, 39, 40, 41]);
    if (admin)      await assignPerms(admin.id,      [32, 33, 34, 35, 36, 37, 39, 40, 41]);
    if (itAdmin)    await assignPerms(itAdmin.id,    [32, 33, 34, 35, 36]);
    if (locAdmin)   await assignPerms(locAdmin.id,   [32, 38, 39, 40, 41]);
    if (userRole)   await assignPerms(userRole.id,   [39, 40]);

    // 3. Seed sample software licenses if empty
    const [[{ count }]] = await queryInterface.sequelize.query(`SELECT COUNT(*) as count FROM software_licenses;`);
    if (count === 0) {
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
        }
      ]);
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert role permissions assignment and sample data
    await queryInterface.bulkDelete('role_permissions', {
      permission_id: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41]
    }).catch(() => {});
    
    await queryInterface.bulkDelete('permissions', {
      id: [32, 33, 34, 35, 36, 37, 38, 39, 40, 41]
    }).catch(() => {});
    
    await queryInterface.bulkDelete('software_licenses', {
      license_key: [
        'MOFF-365A-XK91-PRO2-2024',
        'ADCC-CREC-7X2M-ENT5-2025',
        'SLCK-BIZ+-4RT9-MNQ1-2025',
        'ZOOM-BIZ2-9PL7-KWR3-2025',
        'ACAD-2025-LTM1-SUB9-ADESK',
        'JBIJ-IDEA-ENT7-FLT2-2025',
        'FGMA-ORG9-D5HY-2K3X-2025',
        'GHUB-ENT-CLD-4VW8-ORG1',
        'KASP-ENDP-SEC3-XP01-2023',
        'SFDC-PRO-CRM-7TZ2-2024',
        'TABL-CRT-2022-LN5X-ANLT',
        'SOPH-INTX-ADV-8MR4-2023'
      ]
    }).catch(() => {});
  }
};
