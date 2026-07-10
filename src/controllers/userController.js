const { User, Role, Location, Asset, AssetAllocation } = require('../models');
const { logAction } = require('../utils/auditLogger');
const { hasLocationAccess } = require('../middleware/rbacMiddleware');
const bcrypt = require('bcryptjs');

/**
 * List all users (scoped by location if Location Admin)
 */
async function listUsers(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const myLocId = req.user.location_id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.body.search;

    let queryOptions = {
      include: [
        { model: Role, as: 'role' },
        { model: Location, as: 'location' }
      ],
      order: [['name', 'ASC']]
    };

    const { Op } = User.sequelize.Sequelize;
    let whereClause = {};

    if (isLocationAdmin) {
      whereClause.location_id = myLocId;
    } else if (req.body.location_id) {
      whereClause.location_id = req.body.location_id;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { department: { [Op.like]: `%${search}%` } }
      ];
    }

    queryOptions.where = whereClause;

    let users, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await User.findAndCountAll(queryOptions);
      users = result.rows;
      total = result.count;
    } else {
      users = await User.findAll(queryOptions);
      total = users.length;
    }

    const roles = await Role.findAll({ order: [['name', 'ASC']] });
    
    // Scoped locations list
    let locations = [];
    if (isLocationAdmin) {
      locations = await Location.findAll({ where: { id: myLocId } });
    } else {
      locations = await Location.findAll({ order: [['name', 'ASC']] });
    }

    const safeUsers = users.map(u => {
      const uJson = u.toJSON();
      delete uJson.password;
      uJson.mfa_configured = !!uJson.mfa_secret;
      delete uJson.mfa_secret;
      return uJson;
    });

    return res.json({
      users: safeUsers,
      roles,
      locations,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error listing users:', error);
    return res.status(500).json({ error: 'Database error fetching users list.' });
  }
}

/**
 * Add User
 */
async function addUser(req, res) {
  const { employee_id, name, email, phone, password, role_id, location_id, department, designation } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!name || !email || !password || !role_id) {
    return res.status(400).json({ error: 'Name, email, password, and role_id are required fields.' });
  }

  // Location scoping checks
  const targetLocId = isLocationAdmin ? myLocId : (location_id || null);
  
  if (!hasLocationAccess(req.user, targetLocId)) {
    return res.status(403).json({ error: 'Unauthorized. You do not have access to create users for this location.' });
  }

  if (isLocationAdmin) {
    // Location admin can only create "User" (role_id 4) in their location
    if (parseInt(role_id) !== 4) {
      return res.status(403).json({ error: 'Location Admins can only create regular User accounts.' });
    }
  }

  try {
    // Check duplicates
    const emailExists = await User.findOne({ where: { email } });
    if (emailExists) {
      return res.status(409).json({ error: `User with email "${email}" already exists.` });
    }

    if (employee_id) {
      const empExists = await User.findOne({ where: { employee_id } });
      if (empExists) {
        return res.status(409).json({ error: `User with Employee ID "${employee_id}" already exists.` });
      }
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
      employee_id: employee_id || null,
      name,
      email,
      phone: phone || null,
      password: hashedPassword,
      role_id,
      location_id: targetLocId,
      department: department || null,
      designation: designation || null,
      status: 'active'
    });

    await logAction({
      userId: req.user.id,
      action: 'USER_CREATE',
      entityType: 'User',
      entityId: newUser.id,
      details: `Created user profile: ${name} (${email})`,
      req
    });

    // Strip password in response
    const userResponse = newUser.toJSON();
    delete userResponse.password;

    return res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    return res.status(500).json({ error: 'Failed to create user.' });
  }
}

/**
 * Edit User
 */
async function editUser(req, res) {
  const id = req.body.id || req.params.id;
  const { employee_id, name, email, phone, password, role_id, location_id, department, designation, status } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, user.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to manage users in this location.' });
    }

    if (isLocationAdmin) {
      if (parseInt(role_id) && parseInt(role_id) !== 4) {
        return res.status(403).json({ error: 'Location Admins can only assign the regular User role.' });
      }
    }

    // Duplicate check on email if changed
    if (email && email !== user.email) {
      const duplicateEmail = await User.findOne({ where: { email } });
      if (duplicateEmail) {
        return res.status(409).json({ error: `Email "${email}" is already registered.` });
      }
    }

    // Update fields
    user.name = name || user.name;
    user.email = email || user.email;
    user.phone = phone !== undefined ? phone : user.phone;
    user.employee_id = employee_id !== undefined ? employee_id : user.employee_id;
    user.department = department !== undefined ? department : user.department;
    user.designation = designation !== undefined ? designation : user.designation;
    user.status = status || user.status;

    if (!isLocationAdmin) {
      user.role_id = role_id || user.role_id;
      user.location_id = location_id !== undefined ? location_id : user.location_id;
    } else {
      user.location_id = myLocId;
      user.role_id = 4; // Force User role
    }

    if (password && password.trim() !== '') {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();

    await logAction({
      userId: req.user.id,
      action: 'USER_UPDATE',
      entityType: 'User',
      entityId: user.id,
      details: `Updated user profile details for: ${user.name} (${user.email})`,
      req
    });

    const userResponse = user.toJSON();
    delete userResponse.password;

    return res.json({
      message: 'User updated successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return res.status(500).json({ error: 'Failed to update user profile.' });
  }
}

/**
 * Delete User
 */
async function deleteUser(req, res) {
  const id = req.body.id || req.params.id;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, user.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to manage users in this location.' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own active session profile.' });
    }

    const name = user.name;
    const email = user.email;
    await user.destroy();

    await logAction({
      userId: req.user.id,
      action: 'USER_DELETE',
      entityType: 'User',
      entityId: id,
      details: `Deleted user profile: ${name} (${email})`,
      req
    });

    return res.json({ message: `User "${name}" has been deleted.` });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ error: 'Failed to delete user.' });
  }
}

/**
 * Resign User (Set inactive & return all active assets)
 */
async function resignUser(req, res) {
  const id = req.body.id || req.params.id;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'User ID is required.' });
  }

  try {
    const user = await User.findByPk(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, user.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to manage users in this location.' });
    }

    if (user.id === req.user.id) {
      return res.status(400).json({ error: 'You cannot resign your own active session profile.' });
    }

    // Wrap in Sequelize Transaction
    await User.sequelize.transaction(async (t) => {
      // Find all active asset allocations
      const activeAllocations = await AssetAllocation.findAll({
        where: { user_id: user.id, status: 'active' },
        transaction: t
      });

      if (activeAllocations.length === 0) {
        // No assets to return, make inactive immediately
        user.status = 'inactive';
      } else {
        // Mark user as resigned (pending offboarding/verification)
        user.status = 'resigned';
        
        // Mark verification flags to false (default state for offboarding process)
        for (const allocation of activeAllocations) {
          allocation.verified_by_location_admin = false;
          allocation.verified_by_general_admin = false;
          await allocation.save({ transaction: t });
        }
      }
      await user.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'USER_RESIGNED',
      entityType: 'User',
      entityId: user.id,
      details: `Resigned user: ${user.name} (${user.email}). Placed assets in return verification queue.`,
      req
    });

    return res.json({ message: `User "${user.name}" has been marked as resigned. Assets must be verified by Location Admin and Admin to complete offboarding.` });
  } catch (error) {
    console.error('Error resigning user:', error);
    return res.status(500).json({ error: 'Failed to process user resignation.' });
  }
}

/**
 * Verify Offboard Return of an asset
 */
async function verifyOffboardReturn(req, res) {
  const { allocation_id } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const isGeneralAdmin = req.user.role_name === 'Admin';
  const myLocId = req.user.location_id;

  if (!allocation_id) {
    return res.status(400).json({ error: 'Allocation ID is required.' });
  }

  try {
    const allocation = await AssetAllocation.findByPk(allocation_id, {
      include: [
        { model: Asset, as: 'asset' },
        { model: User, as: 'user' }
      ]
    });

    if (!allocation) {
      return res.status(404).json({ error: 'Asset allocation not found.' });
    }

    if (allocation.status !== 'active') {
      return res.status(400).json({ error: 'This asset allocation is not active.' });
    }

    // Role checks & location scoping
    if (!hasLocationAccess(req.user, allocation.user.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to verify returns for users in this location.' });
    }

    if (isLocationAdmin) {
      allocation.verified_by_location_admin = true;
    } else {
      // General Admin/Super Admin
      allocation.verified_by_general_admin = true;
    }

    await AssetAllocation.sequelize.transaction(async (t) => {
      // Save verification flags
      await allocation.save({ transaction: t });

      // If both verified, complete the return
      if (allocation.verified_by_location_admin && allocation.verified_by_general_admin) {
        allocation.status = 'returned';
        allocation.returned_at = new Date();
        await allocation.save({ transaction: t });

        if (allocation.asset) {
          allocation.asset.status = 'available';
          await allocation.asset.save({ transaction: t });
        }

        // Audit log for asset return
        await logAction({
          userId: req.user.id,
          action: 'ASSET_RETURN_VERIFIED',
          entityType: 'Asset',
          entityId: allocation.asset.id,
          details: `Return of asset ${allocation.asset.asset_tag} verified by both Admins. Status set to available.`,
          req
        });

        // Check if user has any other active allocations remaining
        const remainingActiveCount = await AssetAllocation.count({
          where: { user_id: allocation.user_id, status: 'active' },
          transaction: t
        });

        if (remainingActiveCount === 0) {
          // All assets returned, set user to inactive
          const user = await User.findByPk(allocation.user_id, { transaction: t });
          if (user && user.status === 'resigned') {
            user.status = 'inactive';
            await user.save({ transaction: t });

            await logAction({
              userId: req.user.id,
              action: 'USER_OFFBOARD_COMPLETE',
              entityType: 'User',
              entityId: user.id,
              details: `Offboarding complete for ${user.name}. All assets verified and returned.`,
              req
            });
          }
        }
      }
    });

    return res.json({
      message: 'Asset return verification updated successfully.',
      allocation
    });
  } catch (error) {
    console.error('Error verifying asset return:', error);
    return res.status(500).json({ error: 'Failed to verify asset return.' });
  }
}

/**
 * List all users in resigned status with their active asset allocations for dual verification
 */
async function listOffboardingQueue(req, res) {
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  try {
    let whereClause = {
      status: 'resigned'
    };

    if (isLocationAdmin) {
      whereClause.location_id = myLocId;
    }

    const resignedUsers = await User.findAll({
      where: whereClause,
      include: [
        {
          model: AssetAllocation,
          as: 'allocations',
          where: { status: 'active' },
          required: false,
          include: [
            {
              model: Asset,
              as: 'asset'
            }
          ]
        },
        {
          model: Location,
          as: 'location'
        }
      ],
      order: [['name', 'ASC']]
    });

    return res.json({
      success: true,
      queue: resignedUsers
    });
  } catch (error) {
    console.error('Error listing offboarding queue:', error);
    return res.status(500).json({ error: 'Failed to retrieve offboarding queue.' });
  }
}

/**
 * Toggle or reset MFA for a user (Super Admin only)
 */
async function toggleMfa(req, res) {
  if (req.user.role_name !== 'Super Admin') {
    return res.status(403).json({ error: 'Unauthorized. Only Super Admins can configure MFA settings.' });
  }

  const { userId, action } = req.body;

  if (!userId || !action) {
    return res.status(400).json({ error: 'User ID and Action are required.' });
  }

  try {
    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    if (action === 'enable') {
      user.mfa_enabled = true;
      user.mfa_secret = null; // force initial QR setup
    } else if (action === 'disable') {
      user.mfa_enabled = false;
      user.mfa_secret = null;
    } else if (action === 'reset') {
      user.mfa_enabled = true;
      user.mfa_secret = null; // reset to force re-scanning
    } else {
      return res.status(400).json({ error: 'Invalid action. Must be enable, disable, or reset.' });
    }

    await user.save();

    await logAction({
      userId: req.user.id,
      action: `USER_MFA_${action.toUpperCase()}`,
      entityType: 'User',
      entityId: user.id,
      details: `Super Admin ${action}d MFA for user: ${user.email}`,
      req
    });

    return res.json({
      message: `MFA successfully ${action}d for user ${user.name}.`,
      user: {
        id: user.id,
        name: user.name,
        mfa_enabled: user.mfa_enabled,
        mfa_pending_setup: !user.mfa_secret
      }
    });

  } catch (error) {
    console.error('Error toggling MFA:', error);
    return res.status(500).json({ error: 'Failed to update MFA settings.' });
  }
}

module.exports = {
  listUsers,
  addUser,
  editUser,
  deleteUser,
  resignUser,
  verifyOffboardReturn,
  listOffboardingQueue,
  toggleMfa
};
