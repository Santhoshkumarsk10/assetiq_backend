const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const AssetRequest = sequelize.define('AssetRequest', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  location_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  requested_by: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  asset_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  asset_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM('pending', 'purchased', 'completed'),
    defaultValue: 'pending',
    allowNull: false
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'asset_requests'
});

AssetRequest.associate = (models) => {
  AssetRequest.belongsTo(models.Location, { foreignKey: 'location_id', as: 'location' });
  AssetRequest.belongsTo(models.User, { foreignKey: 'requested_by', as: 'requester' });
};

module.exports = AssetRequest;
