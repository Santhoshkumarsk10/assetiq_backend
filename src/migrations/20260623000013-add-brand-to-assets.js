'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('assets');
    if (!tableInfo.brand) {
      await queryInterface.addColumn('assets', 'brand', {
        type: Sequelize.STRING(100),
        allowNull: true,
        after: 'name'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('assets');
    if (tableInfo.brand) {
      await queryInterface.removeColumn('assets', 'brand');
    }
  }
};
