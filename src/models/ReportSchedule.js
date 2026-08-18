const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ReportSchedule = sequelize.define('ReportSchedule', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  report_id: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  report_title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  frequency: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  run_time: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  recipients: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  format: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  },
  last_run: {
    type: DataTypes.STRING(100),
    defaultValue: 'Never',
    allowNull: true
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  run_day: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  run_date: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'report_schedules'
});

ReportSchedule.associate = (models) => {
  ReportSchedule.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
};

module.exports = ReportSchedule;
