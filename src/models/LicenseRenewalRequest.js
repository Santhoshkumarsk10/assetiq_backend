const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const LicenseRenewalRequest = sequelize.define('LicenseRenewalRequest', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  license_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  requested_by: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  approved_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    defaultValue: 'pending',
    allowNull: false
  },
  // New validity end date the IT Admin is proposing
  proposed_valid_until: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  renewal_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Admin's response notes
  response_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'license_renewal_requests'
});

LicenseRenewalRequest.associate = (models) => {
  LicenseRenewalRequest.belongsTo(models.SoftwareLicense, { foreignKey: 'license_id', as: 'license' });
  LicenseRenewalRequest.belongsTo(models.User, { foreignKey: 'requested_by', as: 'requester' });
  LicenseRenewalRequest.belongsTo(models.User, { foreignKey: 'approved_by', as: 'approver' });
};

module.exports = LicenseRenewalRequest;
