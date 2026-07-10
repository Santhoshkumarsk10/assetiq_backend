const { Role, Permission, User } = require('../models');
const { logAction } = require('../utils/auditLogger');

/**
 * List all roles (with their permissions) and all permissions
 */
async function listRoles(req, res) {
  try {
    const paginate = req.body.paginate === true || req.body.page !== undefined;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    let queryOptions = {
      include: [
        {
          model: Permission,
          as: 'permissions',
          through: { attributes: [] } // hide join table details
        }
      ],
      order: [['id', 'ASC']]
    };

    let roles, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await Role.findAndCountAll(queryOptions);
      roles = result.rows;
      total = result.count;
    } else {
      roles = await Role.findAll(queryOptions);
      total = roles.length;
    }

    const permissions = await Permission.findAll({
      order: [['id', 'ASC']]
    });

    return res.json({
      roles,
      permissions,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error listing roles and permissions:', error);
    return res.status(500).json({ error: 'Database error fetching roles and permissions.' });
  }
}

/**
 * Update permission mapping for a specific role
 */
async function updateRolePermissions(req, res) {
  const { roleId, permissionIds } = req.body;

  if (!roleId || !Array.isArray(permissionIds)) {
    return res.status(400).json({ error: 'roleId and permissionIds array are required.' });
  }

  try {
    const role = await Role.findByPk(roleId);
    if (!role) {
      return res.status(404).json({ error: 'Role not found.' });
    }

    // Verify all permissionIds exist
    if (permissionIds.length > 0) {
      const validPermissionsCount = await Permission.count({
        where: { id: permissionIds }
      });
      if (validPermissionsCount !== permissionIds.length) {
        return res.status(400).json({ error: 'One or more permission IDs are invalid.' });
      }
    }

    // Update associations
    await role.setPermissions(permissionIds);

    await logAction({
      userId: req.user.id,
      action: 'ROLE_PERMISSIONS_UPDATE',
      entityType: 'Role',
      entityId: roleId,
      details: `Updated permissions for role "${role.name}" to: [${permissionIds.join(', ')}]`,
      req
    });

    // Fetch updated role to return
    const updatedRole = await Role.findByPk(roleId, {
      include: [
        {
          model: Permission,
          as: 'permissions',
          through: { attributes: [] }
        }
      ]
    });

    return res.json({
      message: `Permissions for role "${role.name}" updated successfully.`,
      role: updatedRole
    });
  } catch (error) {
    console.error('Error updating role permissions:', error);
    return res.status(500).json({ error: 'Database error updating role permissions.' });
  }
}

/**
 * Add a new Role
 */
async function addRole(req, res) {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Role name is required.' });
  }

  // Sanitize name and description: allow letters, numbers, and spaces
  if (/[^a-zA-Z0-9\s]/.test(name)) {
    return res.status(400).json({ error: 'Role name cannot contain special characters.' });
  }
  if (description && /[^a-zA-Z0-9\s]/.test(description)) {
    return res.status(400).json({ error: 'Description cannot contain special characters.' });
  }

  try {
    const existing = await Role.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Role with this name already exists.' });
    }

    const role = await Role.create({ name, description });

    await logAction({
      userId: req.user.id,
      action: 'ROLE_CREATE',
      entityType: 'Role',
      entityId: role.id,
      details: `Created role "${name}"`,
      req
    });

    return res.json({ message: 'Role created successfully.', role });
  } catch (error) {
    console.error('Error creating role:', error);
    return res.status(500).json({ error: 'Database error creating role.' });
  }
}

/**
 * Edit an existing Role
 */
async function editRole(req, res) {
  const { id, name, description } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Role ID and Name are required.' });
  }

  if (/[^a-zA-Z0-9\s]/.test(name)) {
    return res.status(400).json({ error: 'Role name cannot contain special characters.' });
  }
  if (description && /[^a-zA-Z0-9\s]/.test(description)) {
    return res.status(400).json({ error: 'Description cannot contain special characters.' });
  }

  try {
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found.' });
    }

    if (name !== role.name) {
      const existing = await Role.findOne({ where: { name } });
      if (existing) {
        return res.status(400).json({ error: 'Role with this name already exists.' });
      }
    }

    await role.update({ name, description });

    await logAction({
      userId: req.user.id,
      action: 'ROLE_UPDATE',
      entityType: 'Role',
      entityId: id,
      details: `Updated role "${name}"`,
      req
    });

    return res.json({ message: 'Role updated successfully.', role });
  } catch (error) {
    console.error('Error updating role:', error);
    return res.status(500).json({ error: 'Database error updating role.' });
  }
}

/**
 * Delete an existing Role
 */
async function deleteRole(req, res) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Role ID is required.' });
  }

  try {
    const role = await Role.findByPk(id);
    if (!role) {
      return res.status(404).json({ error: 'Role not found.' });
    }

    // Check if any user is using this role
    const userCount = await User.count({ where: { role_id: id } });
    if (userCount > 0) {
      return res.status(400).json({ error: 'Cannot delete role because it is assigned to users.' });
    }

    await role.destroy();

    await logAction({
      userId: req.user.id,
      action: 'ROLE_DELETE',
      entityType: 'Role',
      entityId: id,
      details: `Deleted role "${role.name}"`,
      req
    });

    return res.json({ message: 'Role deleted successfully.' });
  } catch (error) {
    console.error('Error deleting role:', error);
    return res.status(500).json({ error: 'Database error deleting role.' });
  }
}

/**
 * Add a new Permission
 */
async function addPermission(req, res) {
  const { name, description } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Permission name is required.' });
  }

  // Allow letters, numbers, spaces, colons, underscores, and dots in permission name
  if (/[^a-zA-Z0-9\s:_\.]/.test(name)) {
    return res.status(400).json({ error: 'Permission name cannot contain special characters except colons, underscores, and dots.' });
  }
  if (description && /[^a-zA-Z0-9\s]/.test(description)) {
    return res.status(400).json({ error: 'Description cannot contain special characters.' });
  }

  try {
    const existing = await Permission.findOne({ where: { name } });
    if (existing) {
      return res.status(400).json({ error: 'Permission with this name already exists.' });
    }

    const permission = await Permission.create({ name, description });

    await logAction({
      userId: req.user.id,
      action: 'PERMISSION_CREATE',
      entityType: 'Permission',
      entityId: permission.id,
      details: `Created permission "${name}"`,
      req
    });

    return res.json({ message: 'Permission created successfully.', permission });
  } catch (error) {
    console.error('Error creating permission:', error);
    return res.status(500).json({ error: 'Database error creating permission.' });
  }
}

/**
 * Edit an existing Permission
 */
async function editPermission(req, res) {
  const { id, name, description } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'Permission ID and Name are required.' });
  }

  if (/[^a-zA-Z0-9\s:_\.]/.test(name)) {
    return res.status(400).json({ error: 'Permission name cannot contain special characters except colons, underscores, and dots.' });
  }
  if (description && /[^a-zA-Z0-9\s]/.test(description)) {
    return res.status(400).json({ error: 'Description cannot contain special characters.' });
  }

  try {
    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found.' });
    }

    if (name !== permission.name) {
      const existing = await Permission.findOne({ where: { name } });
      if (existing) {
        return res.status(400).json({ error: 'Permission with this name already exists.' });
      }
    }

    await permission.update({ name, description });

    await logAction({
      userId: req.user.id,
      action: 'PERMISSION_UPDATE',
      entityType: 'Permission',
      entityId: id,
      details: `Updated permission "${name}"`,
      req
    });

    return res.json({ message: 'Permission updated successfully.', permission });
  } catch (error) {
    console.error('Error updating permission:', error);
    return res.status(500).json({ error: 'Database error updating permission.' });
  }
}

/**
 * Delete an existing Permission
 */
async function deletePermission(req, res) {
  const { id } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Permission ID is required.' });
  }

  try {
    const permission = await Permission.findByPk(id);
    if (!permission) {
      return res.status(404).json({ error: 'Permission not found.' });
    }

    await permission.destroy();

    await logAction({
      userId: req.user.id,
      action: 'PERMISSION_DELETE',
      entityType: 'Permission',
      entityId: id,
      details: `Deleted permission "${permission.name}"`,
      req
    });

    return res.json({ message: 'Permission deleted successfully.' });
  } catch (error) {
    console.error('Error deleting permission:', error);
    return res.status(500).json({ error: 'Database error deleting permission.' });
  }
}

module.exports = {
  listRoles,
  updateRolePermissions,
  addRole,
  editRole,
  deleteRole,
  addPermission,
  editPermission,
  deletePermission
};
