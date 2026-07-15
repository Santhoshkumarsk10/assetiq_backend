const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const OnboardingRequest = sequelize.define('OnboardingRequest', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  employee_id: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  personal_email: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: false
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  designation: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  state: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  city: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  step: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  status: {
    type: DataTypes.ENUM('draft', 'pending_assets', 'pending_email_request', 'pending_approval', 'approved', 'completed'),
    defaultValue: 'draft'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  reporting_manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'onboarding_requests'
});

OnboardingRequest.associate = (models) => {
  OnboardingRequest.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
  OnboardingRequest.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  OnboardingRequest.belongsTo(models.User, { foreignKey: 'reporting_manager_id', as: 'reportingManager' });
  OnboardingRequest.belongsToMany(models.Asset, {
    through: 'onboarding_assets',
    foreignKey: 'onboarding_id',
    otherKey: 'asset_id',
    as: 'assets',
    timestamps: false
  });
  OnboardingRequest.hasOne(models.EmailCreationRequest, { foreignKey: 'onboarding_id', as: 'emailRequest' });
  OnboardingRequest.hasOne(models.OnboardingApproval, { foreignKey: 'onboarding_id', as: 'approval' });
};

module.exports = OnboardingRequest;
