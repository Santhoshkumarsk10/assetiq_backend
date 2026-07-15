const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Ticket = sequelize.define('Ticket', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  ticket_no: {
    type: DataTypes.STRING(50),
    unique: true,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  asset_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  raised_by: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('hardware_malfunction', 'software_issue', 'lost_stolen', 'physical_damage', 'general_it'),
    allowNull: false
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'critical'),
    defaultValue: 'medium',
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'in_progress', 'resolved', 'closed', 'cancelled'),
    defaultValue: 'pending',
    allowNull: false
  },
  assigned_to: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  resolution_type: {
    type: DataTypes.ENUM('repaired', 'replaced', 'retired', 'no_issue_found', 'rejected'),
    allowNull: true
  },
  resolution_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'tickets'
});

Ticket.associate = (models) => {
  Ticket.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
  Ticket.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'asset' });
  Ticket.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  Ticket.belongsTo(models.User, { foreignKey: 'raised_by', as: 'reporter' });
  Ticket.belongsTo(models.User, { foreignKey: 'assigned_to', as: 'assignee' });
  Ticket.hasMany(models.TicketComment, { foreignKey: 'ticket_id', as: 'comments' });
};

module.exports = Ticket;
