const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Location = sequelize.define('Location', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  address: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  country_code: {
    type: DataTypes.STRING(10),
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'locations'
});

Location.associate = (models) => {
  Location.hasMany(models.User, { foreignKey: 'location_id', as: 'users' });
  Location.hasMany(models.Asset, { foreignKey: 'location_id', as: 'assets' });
  Location.hasMany(models.OnboardingRequest, { foreignKey: 'location_id', as: 'onboardingRequests' });
};

module.exports = Location;
