'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // 1. Alter users status enum
    await queryInterface.changeColumn('users', 'status', {
      type: Sequelize.ENUM('active', 'inactive', 'onboarding', 'resigned'),
      defaultValue: 'active',
      allowNull: false
    }).catch(() => {});

    // 2. Add columns to users if missing
    const userTableInfo = await queryInterface.describeTable('users');
    if (!userTableInfo.reset_token) {
      await queryInterface.addColumn('users', 'reset_token', {
        type: Sequelize.STRING(255),
        allowNull: true
      });
    }
    if (!userTableInfo.reset_token_expiry) {
      await queryInterface.addColumn('users', 'reset_token_expiry', {
        type: Sequelize.DATE,
        allowNull: true
      });
    }
    if (!userTableInfo.reporting_manager_id) {
      await queryInterface.addColumn('users', 'reporting_manager_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }

    // 3. Add columns to asset_allocations if missing
    const allocationTableInfo = await queryInterface.describeTable('asset_allocations');
    if (!allocationTableInfo.verified_by_location_admin) {
      await queryInterface.addColumn('asset_allocations', 'verified_by_location_admin', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }
    if (!allocationTableInfo.verified_by_general_admin) {
      await queryInterface.addColumn('asset_allocations', 'verified_by_general_admin', {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        allowNull: false
      });
    }

    // 4. Add reporting_manager_id to onboarding_requests if missing
    const onboardingTableInfo = await queryInterface.describeTable('onboarding_requests');
    if (!onboardingTableInfo.reporting_manager_id) {
      await queryInterface.addColumn('onboarding_requests', 'reporting_manager_id', {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      });
    }
  },

  async down(queryInterface, Sequelize) {
    // Revert columns
    const userTableInfo = await queryInterface.describeTable('users');
    if (userTableInfo.reset_token) await queryInterface.removeColumn('users', 'reset_token');
    if (userTableInfo.reset_token_expiry) await queryInterface.removeColumn('users', 'reset_token_expiry');
    if (userTableInfo.reporting_manager_id) await queryInterface.removeColumn('users', 'reporting_manager_id');

    const allocationTableInfo = await queryInterface.describeTable('asset_allocations');
    if (allocationTableInfo.verified_by_location_admin) await queryInterface.removeColumn('asset_allocations', 'verified_by_location_admin');
    if (allocationTableInfo.verified_by_general_admin) await queryInterface.removeColumn('asset_allocations', 'verified_by_general_admin');

    const onboardingTableInfo = await queryInterface.describeTable('onboarding_requests');
    if (onboardingTableInfo.reporting_manager_id) await queryInterface.removeColumn('onboarding_requests', 'reporting_manager_id');
  }
};
