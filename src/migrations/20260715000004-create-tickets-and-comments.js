'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    
    // Create tickets table if missing
    if (!tables.includes('tickets')) {
      await queryInterface.createTable('tickets', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        ticket_no: {
          type: Sequelize.STRING(50),
          unique: true,
          allowNull: false
        },
        location_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'locations', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        asset_id: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'assets', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        raised_by: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        title: {
          type: Sequelize.STRING(255),
          allowNull: false
        },
        description: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        category: {
          type: Sequelize.ENUM('hardware_malfunction', 'software_issue', 'lost_stolen', 'physical_damage', 'general_it'),
          allowNull: false
        },
        priority: {
          type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
          defaultValue: 'medium',
          allowNull: false
        },
        status: {
          type: Sequelize.ENUM('pending', 'in_progress', 'resolved', 'closed', 'cancelled'),
          defaultValue: 'pending',
          allowNull: false
        },
        assigned_to: {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        resolution_type: {
          type: Sequelize.ENUM('repaired', 'replaced', 'retired', 'no_issue_found', 'rejected'),
          allowNull: true
        },
        resolution_notes: {
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

    // Create ticket_comments table if missing
    if (!tables.includes('ticket_comments')) {
      await queryInterface.createTable('ticket_comments', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        ticket_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'tickets', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        user_id: {
          type: Sequelize.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE'
        },
        type: {
          type: Sequelize.ENUM('comment', 'status_change', 'assignment', 'resolution'),
          defaultValue: 'comment',
          allowNull: false
        },
        message: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        metadata: {
          type: Sequelize.JSON,
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
    await queryInterface.dropTable('ticket_comments').catch(() => {});
    await queryInterface.dropTable('tickets').catch(() => {});
  }
};
