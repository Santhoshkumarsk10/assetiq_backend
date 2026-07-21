const { Asset, OnboardingRequest, User, AuditLog, Location, Ticket, AssetRequest, SoftwareLicense, LicenseRenewalRequest } = require('../models');

/**
 * Fetch Dashboard statistics and metrics (scoped if Location Admin)
 */
async function getStats(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const roleName = req.user.role_name;
    const myLocId = req.user.location_id;

    // Scoping setups
    let assetWhere = {};
    let onboardingWhere = {};
    let userWhere = {};
    let auditWhere = {};

    let ticketWhere = {};
    let assetReqWhere = {};
    let licenseWhere = {};
    let renewalWhere = {};

    // Retrieve local user IDs once if Location Admin
    let localUserIds = [];
    if (isLocationAdmin) {
      localUserIds = (await User.findAll({
        where: { location_id: myLocId },
        attributes: ['id']
      })).map(u => u.id);
    }

    if (roleName === 'User') {
      ticketWhere.user_id = req.user.id;
      assetReqWhere.requested_by = req.user.id;
      licenseWhere.assigned_user_id = req.user.id;
      renewalWhere.requested_by = req.user.id;
      
      assetWhere.id = -1; // Normal users shouldn't see global asset statistics
      onboardingWhere.created_by = req.user.id;
      userWhere.id = req.user.id;
      auditWhere.user_id = req.user.id;
    } else if (roleName === 'Location Admin') {
      assetWhere.location_id = myLocId;
      onboardingWhere.location_id = myLocId;
      userWhere.location_id = myLocId;
      auditWhere.user_id = localUserIds;

      ticketWhere.location_id = myLocId;
      assetReqWhere.location_id = myLocId;
      licenseWhere.assigned_user_id = localUserIds;

      // Renewals for licenses assigned to users at this location
      const localLicenseIds = (await SoftwareLicense.findAll({
        where: { assigned_user_id: localUserIds },
        attributes: ['id']
      })).map(l => l.id);
      renewalWhere.license_id = localLicenseIds;
    } else if (roleName === 'IT Admin') {
      // IT Admin has global visibility for assets, tickets, licenses, asset requests
      // But renewal requests are scoped to their submissions
      renewalWhere.requested_by = req.user.id;
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

    // Request & lifecycle statistics
    const ticketsTotal = await Ticket.count({ where: ticketWhere });
    const ticketsClosed = await Ticket.count({ where: { ...ticketWhere, status: ['resolved', 'closed', 'cancelled'] } });
    const ticketsPending = await Ticket.count({ where: { ...ticketWhere, status: ['pending', 'in_progress'] } });

    const assetRequestsTotal = await AssetRequest.count({ where: assetReqWhere });
    const assetRequestsClosed = await AssetRequest.count({ where: { ...assetReqWhere, status: ['completed', 'purchased'] } });
    const assetRequestsPending = await AssetRequest.count({ where: { ...assetReqWhere, status: 'pending' } });

    const licensesTotal = await SoftwareLicense.count({ where: licenseWhere });
    const licensesClosed = await SoftwareLicense.count({ where: { ...licenseWhere, status: 'active' } } );
    const licensesPending = await SoftwareLicense.count({ where: { ...licenseWhere, status: ['available', 'expired'] } });

    const renewalsTotal = await LicenseRenewalRequest.count({ where: renewalWhere });
    const renewalsClosed = await LicenseRenewalRequest.count({ where: { ...renewalWhere, status: ['approved', 'rejected'] } });
    const renewalsPending = await LicenseRenewalRequest.count({ where: { ...renewalWhere, status: 'pending' } });

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

    const recentTickets = await Ticket.findAll({
      where: ticketWhere,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      limit: 5,
      order: [['created_at', 'DESC']]
    });

    const recentAssetRequests = await AssetRequest.findAll({
      where: assetReqWhere,
      include: [{ model: User, as: 'requester', attributes: ['id', 'name', 'email'] }],
      limit: 5,
      order: [['created_at', 'DESC']]
    });

    const recentLicenses = await SoftwareLicense.findAll({
      where: licenseWhere,
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }],
      limit: 5,
      order: [['created_at', 'DESC']]
    });

    const recentRenewals = await LicenseRenewalRequest.findAll({
      where: renewalWhere,
      include: [
        { model: SoftwareLicense, as: 'license' },
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] }
      ],
      limit: 5,
      order: [['created_at', 'DESC']]
    });

    // Location-wise breakdown of assets
    let locationBreakdown = [];
    if (roleName !== 'User') {
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
      detailedStats: {
        tickets: {
          total: ticketsTotal,
          closed: ticketsClosed,
          pending: ticketsPending
        },
        assetRequests: {
          total: assetRequestsTotal,
          closed: assetRequestsClosed,
          pending: assetRequestsPending
        },
        licenseRequests: {
          total: licensesTotal,
          closed: licensesClosed, // Active
          pending: licensesPending // Available + Expired
        },
        renewalRequests: {
          total: renewalsTotal,
          closed: renewalsClosed, // Approved + Rejected
          pending: renewalsPending // Pending
        }
      },
      recentOnboardings,
      recentAuditLogs,
      locationBreakdown,
      recentTickets,
      recentAssetRequests,
      recentLicenses,
      recentRenewals
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
    const limit = Math.min(parseInt(req.body.limit) || 10, 200);
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
