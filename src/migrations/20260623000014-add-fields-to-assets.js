'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('assets');
    
    // Add specification column if not exists
    if (!tableInfo.specification) {
      await queryInterface.addColumn('assets', 'specification', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    // Add mac_address column if not exists
    if (!tableInfo.mac_address) {
      await queryInterface.addColumn('assets', 'mac_address', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }

    // Add warranty column if not exists
    if (!tableInfo.warranty) {
      await queryInterface.addColumn('assets', 'warranty', {
        type: Sequelize.STRING(100),
        allowNull: true
      });
    }

    // Add remarks column if not exists
    if (!tableInfo.remarks) {
      await queryInterface.addColumn('assets', 'remarks', {
        type: Sequelize.TEXT,
        allowNull: true
      });
    }

    // Change type column enum list if applicable
    // Note: To be safe on MySQL, we will alter the ENUM list using changeColumn
    await queryInterface.changeColumn('assets', 'type', {
      type: Sequelize.ENUM('Laptop', 'Mobile', 'Desktop', 'Accessories', 'Monitor', 'Mobile Device', 'Other'),
      allowNull: false
    });
  },

  async down(queryInterface, Sequelize) {
    const tableInfo = await queryInterface.describeTable('assets');
    if (tableInfo.specification) {
      await queryInterface.removeColumn('assets', 'specification');
    }
    if (tableInfo.mac_address) {
      await queryInterface.removeColumn('assets', 'mac_address');
    }
    if (tableInfo.warranty) {
      await queryInterface.removeColumn('assets', 'warranty');
    }
    if (tableInfo.remarks) {
      await queryInterface.removeColumn('assets', 'remarks');
    }
    // Revert enum list if desired (although usually not necessary unless strict rollback is needed)
    await queryInterface.changeColumn('assets', 'type', {
      type: Sequelize.ENUM('Laptop', 'Desktop', 'Monitor', 'Mobile Device', 'Accessories', 'Other'),
      allowNull: false
    });
  }
};
