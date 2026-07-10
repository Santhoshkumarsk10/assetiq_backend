'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('onboarding_assets', {
      onboarding_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'onboarding_requests',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      asset_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        primaryKey: true,
        references: {
          model: 'assets',
          key: 'id'
        },
        onDelete: 'CASCADE'
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('onboarding_assets');
  }
};
