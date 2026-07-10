const { Asset, OnboardingRequest, User, AuditLog, Location } = require('../models');

/**
 * Fetch Dashboard statistics and metrics (scoped if Location Admin)
 */
async function getStats(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const myLocId = req.user.location_id;

    // Scoping setups
    let assetWhere = {};
    let onboardingWhere = {};
    let userWhere = {};
    let auditWhere = {};

    if (isLocationAdmin) {
      assetWhere.location_id = myLocId;
      onboardingWhere.location_id = myLocId;
      userWhere.location_id = myLocId;
      
      // Filter audit logs for actions performed by users at this location or containing this location
      // To keep it simple, we filter audit logs by user_id belonging to this location
      const localUserIds = (await User.findAll({
        where: { location_id: myLocId },
        attributes: ['id']
      })).map(u => u.id);
      
      auditWhere.user_id = localUserIds;
    }

    // Counts
    const totalAssets = await Asset.count({ where: assetWhere });
    const allocatedAssets = await Asset.count({ where: { ...assetWhere, status: 'allocated' } });
    const availableAssets = await Asset.count({ where: { ...assetWhere, status: 'available' } });
    const maintenanceAssets = await Asset.count({ where: { ...assetWhere, status: 'maintenance' } });

    const activeUsers = await User.count({ where: { ...userWhere, status: 'active' } });
    const pendingOnboardings = await OnboardingRequest.count({
      where: {
        ...onboardingWhere,
        status: { [OnboardingRequest.sequelize.Sequelize.Op.ne]: 'completed' }
      }
    });

    // Recent items lists
    const recentOnboardings = await OnboardingRequest.findAll({
      where: onboardingWhere,
      include: [{ model: Location, as: 'location' }],
      limit: 5,
      order: [['created_at', 'DESC']]
    });

    const recentAuditLogs = await AuditLog.findAll({
      where: auditWhere,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      limit: 10,
      order: [['created_at', 'DESC']]
    });

    // Location-wise breakdown of assets
    let locationBreakdown = [];
    if (!isLocationAdmin) {
      const locations = await Location.findAll({
        include: [{ model: Asset, as: 'assets', attributes: ['id'] }]
      });
      locationBreakdown = locations.map(loc => ({
        location_name: loc.name,
        asset_count: loc.assets ? loc.assets.length : 0
      }));
    } else {
      const myLoc = await Location.findByPk(myLocId, {
        include: [{ model: Asset, as: 'assets', attributes: ['id'] }]
      });
      if (myLoc) {
        locationBreakdown.push({
          location_name: myLoc.name,
          asset_count: myLoc.assets ? myLoc.assets.length : 0
        });
      }
    }

    return res.json({
      metrics: {
        totalAssets,
        allocatedAssets,
        availableAssets,
        maintenanceAssets,
        activeUsers,
        pendingOnboardings
      },
      recentOnboardings,
      recentAuditLogs,
      locationBreakdown
    });

  } catch (error) {
    console.error('Error fetching dashboard statistics:', error);
    return res.status(500).json({ error: 'Database error fetching dashboard metrics.' });
  }
}

/**
 * Fetch all audit logs (scoped if Location Admin)
 */
async function getAuditLogs(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const myLocId = req.user.location_id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.body.search;
    const actionFilter = req.body.action;

    let queryOptions = {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'DESC']]
    };

    const { Op } = AuditLog.sequelize.Sequelize;
    let whereClause = {};

    if (isLocationAdmin) {
      const localUserIds = (await User.findAll({
        where: { location_id: myLocId },
        attributes: ['id']
      })).map(u => u.id);

      whereClause.user_id = localUserIds;
    }

    if (actionFilter) {
      whereClause.action = { [Op.like]: `%${actionFilter}%` };
    }

    if (search) {
      whereClause[Op.or] = [
        { action: { [Op.like]: `%${search}%` } },
        { details: { [Op.like]: `%${search}%` } },
        { '$user.name$': { [Op.like]: `%${search}%` } }
      ];
    }

    queryOptions.where = whereClause;

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
      logs,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({ error: 'Database error fetching audit logs.' });
  }
}

module.exports = {
  getStats,
  getAuditLogs
};
