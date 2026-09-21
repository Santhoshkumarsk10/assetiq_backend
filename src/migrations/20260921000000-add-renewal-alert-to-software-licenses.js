'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const licenseTable = await queryInterface.describeTable('software_licenses');
    if (!licenseTable.renewal_alert) {
      await queryInterface.addColumn('software_licenses', 'renewal_alert', {
        type: Sequelize.STRING(50),
        defaultValue: '30 days',
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const licenseTable = await queryInterface.describeTable('software_licenses');
    if (licenseTable.renewal_alert) {
      await queryInterface.removeColumn('software_licenses', 'renewal_alert');
    }
  }
};
