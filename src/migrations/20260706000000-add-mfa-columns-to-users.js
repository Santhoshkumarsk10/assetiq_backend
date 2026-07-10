'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('users');
    if (!tableInfo.mfa_enabled) {
      await queryInterface.addColumn('users', 'mfa_enabled', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
    if (!tableInfo.mfa_secret) {
      await queryInterface.addColumn('users', 'mfa_secret', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('users');
    if (tableInfo.mfa_enabled) {
      await queryInterface.removeColumn('users', 'mfa_enabled');
    }
    if (tableInfo.mfa_secret) {
      await queryInterface.removeColumn('users', 'mfa_secret');
    }
  }
};
