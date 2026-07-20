const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const TicketComment = sequelize.define('TicketComment', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  ticket_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('comment', 'status_change', 'assignment', 'resolution'),
    defaultValue: 'comment',
    allowNull: false
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'ticket_comments'
});

TicketComment.associate = (models) => {
  TicketComment.belongsTo(models.Ticket, { foreignKey: 'ticket_id', as: 'ticket' });
  TicketComment.belongsTo(models.User, { foreignKey: 'user_id', as: 'author' });
};

module.exports = TicketComment;
