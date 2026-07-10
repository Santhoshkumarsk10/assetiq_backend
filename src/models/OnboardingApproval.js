const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const OnboardingApproval = sequelize.define('OnboardingApproval', {
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
  approval_type: {
    type: DataTypes.ENUM('physical', 'virtual'),
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending'
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  approved_at: {
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
  tableName: 'onboarding_approvals'
});

OnboardingApproval.associate = (models) => {
  OnboardingApproval.belongsTo(models.OnboardingRequest, { foreignKey: 'onboarding_id', as: 'onboardingRequest' });
  OnboardingApproval.belongsTo(models.User, { foreignKey: 'approved_by', as: 'approver' });
};

module.exports = OnboardingApproval;
