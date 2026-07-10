const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Role = sequelize.define('Role', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  timestamps: true,
  underscored: true,
  tableName: 'roles'
});

Role.associate = (models) => {
  Role.hasMany(models.User, { foreignKey: 'role_id', as: 'users' });
  Role.belongsToMany(models.Permission, {
    through: 'role_permissions',
    foreignKey: 'role_id',
    otherKey: 'permission_id',
    as: 'permissions',
    timestamps: false
  });
};

module.exports = Role;
