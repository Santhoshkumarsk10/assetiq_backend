const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const AssetAllocation = sequelize.define('AssetAllocation', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  asset_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  user_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  allocated_by: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  allocated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  returned_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'returned'),
    defaultValue: 'active'
  },
  verified_by_location_admin: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  verified_by_general_admin: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: false, // Explicit timestamps management
  underscored: true,
  tableName: 'asset_allocations'
});

AssetAllocation.associate = (models) => {
  AssetAllocation.belongsTo(models.Asset, { foreignKey: 'asset_id', as: 'asset' });
  AssetAllocation.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  AssetAllocation.belongsTo(models.User, { foreignKey: 'allocated_by', as: 'allocator' });
};

module.exports = AssetAllocation;
