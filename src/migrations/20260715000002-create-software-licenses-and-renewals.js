'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    
    // Create software_licenses table if missing
    if (!tables.includes('software_licenses')) {
      await queryInterface.createTable('software_licenses', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        software_name: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        license_key: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        valid_from: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        valid_until: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        assigned_user_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        mapped_asset_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'assets', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        status: {
          type: Sequelize.ENUM('available', 'active', 'expired'),
          defaultValue: 'available',
          allowNull: false
        },
        notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }

    // Create license_renewal_requests table if missing
    if (!tables.includes('license_renewal_requests')) {
      await queryInterface.createTable('license_renewal_requests', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        license_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'software_licenses', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        requested_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        approved_by: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        status: {
          type: Sequelize.ENUM('pending', 'approved', 'rejected'),
          defaultValue: 'pending',
          allowNull: false
        },
        proposed_valid_until: {
          type: Sequelize.DATEONLY,
          allowNull: true
        },
        renewal_notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        response_notes: {
          type: Sequelize.TEXT,
          allowNull: true
        },
        created_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        },
        updated_at: {
          type: Sequelize.DATE,
          allowNull: false,
          defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
        }
      });
    }
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('license_renewal_requests').catch(() => {});
    await queryInterface.dropTable('software_licenses').catch(() => {});
  }
};
