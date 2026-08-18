const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  employee_id: {
    type: DataTypes.STRING(50),
    allowNull: true,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  email: {
    type: DataTypes.STRING(255),
    allowNull: false,
    unique: true
  },
  phone: {
    type: DataTypes.STRING(20),
    allowNull: true,
    unique: true
  },
  password: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  role_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  department: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  designation: {
    type: DataTypes.STRING(100),
    allowNull: true
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
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'onboarding', 'resigned'),
    defaultValue: 'active'
  },
  mfa_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    allowNull: false
  },
  mfa_secret: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  mfa_pending_secret: {
    type: DataTypes.STRING(255),
    allowNull: true
    // Temporary storage for TOTP secret during first-time setup.
    // Cleared after the user successfully verifies the first OTP.
  },
  reset_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  reset_token_expiry: {
    type: DataTypes.DATE,
    allowNull: true
  },
  reporting_manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  general_manager_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  fcm_token: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'users'
});

User.associate = (models) => {
  User.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
  User.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
  User.belongsTo(models.User, { foreignKey: 'reporting_manager_id', as: 'reportingManager' });
  User.belongsTo(models.User, { foreignKey: 'general_manager_id', as: 'generalManager' });
  User.hasMany(models.User, { foreignKey: 'reporting_manager_id', as: 'reportees' });
  User.hasMany(models.AssetAllocation, { foreignKey: 'user_id', as: 'allocations' });
  User.hasMany(models.AssetAllocation, { foreignKey: 'allocated_by', as: 'allocationsMade' });
  User.hasMany(models.OnboardingRequest, { foreignKey: 'created_by', as: 'onboardingRequestsCreated' });
  User.hasMany(models.EmailCreationRequest, { foreignKey: 'processed_by', as: 'emailRequestsProcessed' });
  User.hasMany(models.OnboardingApproval, { foreignKey: 'approved_by', as: 'onboardingApprovalsMade' });
  User.hasMany(models.AuditLog, { foreignKey: 'user_id', as: 'auditLogs' });
};

module.exports = User;
