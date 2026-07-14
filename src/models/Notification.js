const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Notification = sequelize.define('Notification', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  type: {
    // e.g. 'license_expired', 'renewal_submitted', 'renewal_approved', 'renewal_rejected', 'user_notify'
    type: DataTypes.STRING(100),
    defaultValue: 'info'
  },
  reference_id: {
    // ID of the related entity (license id, renewal request id, etc.)
    type: DataTypes.INTEGER,
    allowNull: true
  },
  is_read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'notifications'
});

Notification.associate = (models) => {
  Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'recipient' });
};

module.exports = Notification;
