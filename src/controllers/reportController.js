const { Asset, AssetAllocation, User, Location, Ticket, SoftwareLicense, AuditLog, sequelize } = require('../models');
const { Op } = require('sequelize');

/**
 * Get Asset Inventory Report
 */
async function getInventoryReport(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const isRegularUser = req.user.role_name === 'User';
    const myLocId = req.user.location_id;
    const myUserId = req.user.id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const { search, location_id, type, status, startDate, endDate } = req.body;

    let queryOptions = {
      include: [
        { model: Location, as: 'location' },
        {
          model: AssetAllocation,
          as: 'allocations',
          where: { status: 'active' },
          required: false,
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
        }
      ],
      order: [['asset_tag', 'ASC']]
    };

    const whereClause = {};

    if (isRegularUser) {
      whereClause['$allocations.user_id$'] = myUserId;
      queryOptions.include[1].required = true;
    } else if (isLocationAdmin) {
      whereClause.location_id = myLocId;
    } else if (location_id) {
      whereClause.location_id = location_id;
    }

    if (type) {
      whereClause.type = type;
    }

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { asset_tag: { [Op.like]: `%${search}%` } },
        { brand: { [Op.like]: `%${search}%` } },
        { serial_number: { [Op.like]: `%${search}%` } }
      ];
    }

    if (startDate || endDate) {
      whereClause.created_at = {};
      if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
      if (endDate) whereClause.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    queryOptions.where = whereClause;

    let assets, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await Asset.findAndCountAll(queryOptions);
      assets = result.rows;
      total = result.count;
    } else {
      assets = await Asset.findAll(queryOptions);
      total = assets.length;
    }

    const flattedAssets = assets.map(a => {
      const activeAllocation = a.allocations && a.allocations[0];
      return {
        ...a.toJSON(),
        allocated_user_name: activeAllocation && activeAllocation.user ? activeAllocation.user.name : null,
        allocated_user_id: activeAllocation && activeAllocation.user ? activeAllocation.user.id : null
      };
    });

    let locations = [];
    if (isLocationAdmin) {
      locations = await Location.findAll({ where: { id: myLocId } });
    } else {
      locations = await Location.findAll({ order: [['name', 'ASC']] });
    }

    return res.json({
      success: true,
      assets: flattedAssets,
      locations,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating inventory report:', error);
    return res.status(500).json({ error: 'Database error generating asset inventory report.' });
  }
}

/**
 * Get Asset In/Out Allocations Report
 */
async function getAllocationReport(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const isRegularUser = req.user.role_name === 'User';
    const myLocId = req.user.location_id;
    const myUserId = req.user.id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const { search, status, startDate, endDate, location_id } = req.body;

    const allocationWhere = {};
    const assetWhere = {};

    if (isRegularUser) {
      allocationWhere.user_id = myUserId;
    } else if (isLocationAdmin) {
      assetWhere.location_id = myLocId;
    } else if (location_id) {
      assetWhere.location_id = location_id;
    }

    if (status) {
      allocationWhere.status = status;
    }

    if (startDate || endDate) {
      allocationWhere.allocated_at = {};
      if (startDate) allocationWhere.allocated_at[Op.gte] = new Date(startDate);
      if (endDate) allocationWhere.allocated_at[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    if (search) {
      allocationWhere[Op.or] = [
        { notes: { [Op.like]: `%${search}%` } },
        { '$asset.asset_tag$': { [Op.like]: `%${search}%` } },
        { '$asset.name$': { [Op.like]: `%${search}%` } },
        { '$user.name$': { [Op.like]: `%${search}%` } },
        { '$allocator.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const queryOptions = {
      where: allocationWhere,
      include: [
        {
          model: Asset,
          as: 'asset',
          where: assetWhere,
          required: isLocationAdmin || !!location_id || (search && (search.includes('AST-') || search.includes('AST')))
        },
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'allocator',
          attributes: ['id', 'name', 'email']
        }
      ],
      order: [['id', 'DESC']]
    };

    let allocations, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await AssetAllocation.findAndCountAll(queryOptions);
      allocations = result.rows;
      total = result.count;
    } else {
      allocations = await AssetAllocation.findAll(queryOptions);
      total = allocations.length;
    }

    return res.json({
      success: true,
      allocations,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating allocation report:', error);
    return res.status(500).json({ error: 'Database error generating asset allocation report.' });
  }
}

/**
 * Get Tickets Support Report
 */
async function getTicketReport(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const isRegularUser = req.user.role_name === 'User';
    const myLocId = req.user.location_id;
    const myUserId = req.user.id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const { search, category, priority, status, location_id, startDate, endDate } = req.body;

    const whereClause = {};

    if (isRegularUser) {
      whereClause.user_id = myUserId;
    } else if (isLocationAdmin) {
      whereClause.location_id = myLocId;
    } else if (location_id) {
      whereClause.location_id = location_id;
    }

    if (category) whereClause.category = category;
    if (priority) whereClause.priority = priority;
    if (status) whereClause.status = status;

    if (startDate || endDate) {
      whereClause.created_at = {};
      if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
      if (endDate) whereClause.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    if (search) {
      whereClause[Op.or] = [
        { ticket_no: { [Op.like]: `%${search}%` } },
        { title: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { '$reporter.name$': { [Op.like]: `%${search}%` } },
        { '$assignee.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const queryOptions = {
      where: whereClause,
      include: [
        { model: Location, as: 'location', attributes: ['id', 'name'] },
        { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'name', 'type'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    };

    let tickets, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await Ticket.findAndCountAll(queryOptions);
      tickets = result.rows;
      total = result.count;
    } else {
      tickets = await Ticket.findAll(queryOptions);
      total = tickets.length;
    }

    return res.json({
      success: true,
      tickets,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating ticket report:', error);
    return res.status(500).json({ error: 'Database error generating ticket report.' });
  }
}

/**
 * Get Software License Report
 */
async function getLicenseReport(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const isRegularUser = req.user.role_name === 'User';
    const myLocId = req.user.location_id;
    const myUserId = req.user.id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const { search, status, startDate, endDate, location_id } = req.body;

    const whereClause = {};

    if (isRegularUser) {
      whereClause.assigned_user_id = myUserId;
    } else if (isLocationAdmin) {
      const localUserIds = (await User.findAll({
        where: { location_id: myLocId },
        attributes: ['id']
      })).map(u => u.id);
      whereClause.assigned_user_id = localUserIds;
    } else if (location_id) {
      const targetUserIds = (await User.findAll({
        where: { location_id },
        attributes: ['id']
      })).map(u => u.id);
      whereClause.assigned_user_id = targetUserIds;
    }

    if (status) whereClause.status = status;

    if (startDate || endDate) {
      whereClause.valid_until = {};
      if (startDate) whereClause.valid_until[Op.gte] = startDate;
      if (endDate) whereClause.valid_until[Op.lte] = endDate;
    }

    if (search) {
      whereClause[Op.or] = [
        { software_name: { [Op.like]: `%${search}%` } },
        { license_key: { [Op.like]: `%${search}%` } },
        { '$user.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const queryOptions = {
      where: whereClause,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'location_id'],
          include: [{ model: Location, as: 'location', attributes: ['id', 'name'] }]
        }
      ],
      order: [['created_at', 'DESC']]
    };

    let licenses, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await SoftwareLicense.findAndCountAll(queryOptions);
      licenses = result.rows;
      total = result.count;
    } else {
      licenses = await SoftwareLicense.findAll(queryOptions);
      total = licenses.length;
    }

    return res.json({
      success: true,
      licenses,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating license report:', error);
    return res.status(500).json({ error: 'Database error generating software license report.' });
  }
}

/**
 * Get Audit Trail Report
 */
async function getAuditReport(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const isRegularUser = req.user.role_name === 'User';
    const myLocId = req.user.location_id;
    const myUserId = req.user.id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const { search, action, startDate, endDate } = req.body;

    const whereClause = {};

    if (isRegularUser) {
      whereClause.user_id = myUserId;
    } else if (isLocationAdmin) {
      const localUserIds = (await User.findAll({
        where: { location_id: myLocId },
        attributes: ['id']
      })).map(u => u.id);
      whereClause.user_id = localUserIds;
    }

    if (action) {
      whereClause.action = { [Op.like]: `%${action}%` };
    }

    if (startDate || endDate) {
      whereClause.created_at = {};
      if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
      if (endDate) whereClause.created_at[Op.lte] = new Date(endDate + 'T23:59:59');
    }

    if (search) {
      whereClause[Op.or] = [
        { action: { [Op.like]: `%${search}%` } },
        { details: { [Op.like]: `%${search}%` } },
        { '$user.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    const queryOptions = {
      where: whereClause,
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    };

    let logs, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await AuditLog.findAndCountAll(queryOptions);
      logs = result.rows;
      total = result.count;
    } else {
      logs = await AuditLog.findAll(queryOptions);
      total = logs.length;
    }

    return res.json({
      success: true,
      logs,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error generating audit report:', error);
    return res.status(500).json({ error: 'Database error generating audit report.' });
  }
}

module.exports = {
  getInventoryReport,
  getAllocationReport,
  getTicketReport,
  getLicenseReport,
  getAuditReport
};
