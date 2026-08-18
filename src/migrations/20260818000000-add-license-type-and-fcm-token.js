'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Add fcm_token to users table if not exists
    const userTable = await queryInterface.describeTable('users');
    if (!userTable.fcm_token) {
      await queryInterface.addColumn('users', 'fcm_token', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }

    // Add license_type to software_licenses table if not exists
    const licenseTable = await queryInterface.describeTable('software_licenses');
    if (!licenseTable.license_type) {
      await queryInterface.addColumn('software_licenses', 'license_type', {
        type: Sequelize.ENUM('subscription', 'validity'),
        defaultValue: 'validity',
        allowNull: false
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const userTable = await queryInterface.describeTable('users');
    if (userTable.fcm_token) {
      await queryInterface.removeColumn('users', 'fcm_token');
    }

    const licenseTable = await queryInterface.describeTable('software_licenses');
    if (licenseTable.license_type) {
      await queryInterface.removeColumn('software_licenses', 'license_type');
      // Note: dropping enum types varies by database dialact, but removeColumn is standard.
    }
  }
};
