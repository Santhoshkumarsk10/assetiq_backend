'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('onboarding_approvals', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: false
      },
      onboarding_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'onboarding_requests',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      approval_type: {
        type: Sequelize.ENUM('physical', 'virtual'),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        defaultValue: 'pending'
      },
      approved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      remarks: {
        type: Sequelize.TEXT,
        allowNull: true
      }
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('onboarding_approvals');
  }
};
