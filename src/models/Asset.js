const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Asset = sequelize.define('Asset', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  asset_tag: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  brand: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('Laptop', 'Mobile', 'Desktop', 'Accessories', 'Monitor', 'Mobile Device', 'Other'),
    allowNull: false
  },
  serial_number: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  mac_address: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  specification: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  warranty: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  remarks: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('available', 'allocated', 'maintenance', 'retired'),
    defaultValue: 'available'
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'assets'
});

Asset.associate = (models) => {
  Asset.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
  Asset.hasMany(models.AssetAllocation, { foreignKey: 'asset_id', as: 'allocations' });
  Asset.belongsToMany(models.OnboardingRequest, {
    through: 'onboarding_assets',
    foreignKey: 'asset_id',
    otherKey: 'onboarding_id',
    as: 'onboardingRequests',
    timestamps: false
  });
};

module.exports = Asset;
