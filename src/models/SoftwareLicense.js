const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SoftwareLicense = sequelize.define('SoftwareLicense', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  software_name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  license_key: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  valid_from: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  valid_until: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  assigned_user_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('available', 'active', 'expired'),
    defaultValue: 'available'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'software_licenses'
});

SoftwareLicense.associate = (models) => {
  SoftwareLicense.belongsTo(models.User, { foreignKey: 'assigned_user_id', as: 'user' });
};

module.exports = SoftwareLicense;
