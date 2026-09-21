'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('locations');
    if (!tableInfo.image) {
      await queryInterface.addColumn('locations', 'image', {
        type: Sequelize.TEXT('long'),
        allowNull: true
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('locations');
    if (tableInfo.image) {
      await queryInterface.removeColumn('locations', 'image');
    }
  }
};
