'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('locations');
    if (!tableInfo.country_code) {
      await queryInterface.addColumn('locations', 'country_code', {
        type: Sequelize.STRING(10),
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('locations');
    if (tableInfo.country_code) {
      await queryInterface.removeColumn('locations', 'country_code');
    }
  }
};
