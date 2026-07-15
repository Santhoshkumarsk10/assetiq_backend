'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (!tables.includes('notifications')) {
      await queryInterface.createTable('notifications', {
        id: {
          type: Sequelize.INTEGER,
          autoIncrement: true,
          primaryKey: true,
          allowNull: false
        },
        user_id: {
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
        message: {
          type: Sequelize.TEXT,
          allowNull: false
        },
        type: {
          type: Sequelize.STRING(100),
          defaultValue: 'info'
        },
        reference_id: {
          type: Sequelize.INTEGER,
          allowNull: true
        },
        is_read: {
          type: Sequelize.BOOLEAN,
          defaultValue: false
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
    await queryInterface.dropTable('notifications').catch(() => {});
  }
};
