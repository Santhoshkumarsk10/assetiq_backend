const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const EmailCreationRequest = sequelize.define('EmailCreationRequest', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  onboarding_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  suggested_email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  processed_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: false,
  underscored: true,
  tableName: 'email_creation_requests'
});

EmailCreationRequest.associate = (models) => {
  EmailCreationRequest.belongsTo(models.OnboardingRequest, { foreignKey: 'onboarding_id', as: 'onboardingRequest' });
  EmailCreationRequest.belongsTo(models.User, { foreignKey: 'processed_by', as: 'processor' });
};

module.exports = EmailCreationRequest;
