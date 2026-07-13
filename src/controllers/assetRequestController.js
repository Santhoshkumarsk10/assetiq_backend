const { AssetRequest, Asset, AssetAllocation, User, Location } = require('../models');
const { logAction } = require('../utils/auditLogger');

/**
 * Raise a new asset request (Location Admin)
 */
async function addAssetRequest(req, res) {
  const { asset_name, asset_type, quantity, notes } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';

  if (!asset_name || !asset_type) {
    return res.status(400).json({ error: 'Asset Name and Asset Type are required.' });
  }

  try {
    const request = await AssetRequest.create({
      location_id: req.user.location_id,
      requested_by: req.user.id,
      asset_name,
      asset_type,
      quantity: quantity || 1,
      notes: notes || null,
      status: 'pending'
    });

    await logAction({
      userId: req.user.id,
      action: 'ASSET_REQUEST_CREATE',
      entityType: 'AssetRequest',
      entityId: request.id,
      details: `Raised asset request for: ${asset_name} (${asset_type})`,
      req
    });

    return res.status(201).json({
      message: 'Asset request raised successfully.',
      request
    });
  } catch (error) {
    console.error('Error raising asset request:', error);
    return res.status(500).json({ error: 'Failed to raise asset request.' });
  }
}

/**
 * List all asset requests (scoped or global)
 */
async function listAssetRequests(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';

    let whereClause = {};
    if (isLocationAdmin) {
      whereClause.location_id = req.user.location_id;
    }

    const requests = await AssetRequest.findAll({
      where: whereClause,
      include: [
        { model: Location, as: 'location' },
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json({ success: true, requests });
  } catch (error) {
    console.error('Error listing asset requests:', error);
    return res.status(500).json({ error: 'Failed to list asset requests.' });
  }
}

/**
 * Mark request as purchased (Admin / IT Admin)
 */
async function purchaseAssetRequest(req, res) {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Asset Request ID is required.' });
  }

  try {
    const request = await AssetRequest.findByPk(id);
    if (!request) {
      return res.status(404).json({ error: 'Asset request not found.' });
    }

    request.status = 'purchased';
    await request.save();

    await logAction({
      userId: req.user.id,
      action: 'ASSET_REQUEST_PURCHASE',
      entityType: 'AssetRequest',
      entityId: request.id,
      details: `Marked asset request for "${request.asset_name}" as purchased.`,
      req
    });

    return res.json({ message: 'Asset request status updated to purchased.', request });
  } catch (error) {
    console.error('Error updating asset request to purchased:', error);
    return res.status(500).json({ error: 'Failed to update asset request.' });
  }
}

/**
 * Add purchased asset to inventory and automatically allocate it to requesting Location Admin
 */
async function addToInventoryAndAllocate(req, res) {
  const { request_id, asset_tag, brand, serial_number, mac_address, specification, warranty, remarks } = req.body;

  if (!request_id || !asset_tag) {
    return res.status(400).json({ error: 'Request ID and Asset Tag are required.' });
  }

  try {
    const request = await AssetRequest.findByPk(request_id);
    if (!request) {
      return res.status(404).json({ error: 'Asset request not found.' });
    }

    if (request.status !== 'purchased') {
      return res.status(400).json({ error: 'Asset request must be marked as purchased before adding to inventory.' });
    }

    // Verify asset tag is not already taken
    const existingAsset = await Asset.findOne({ where: { asset_tag } });
    if (existingAsset) {
      return res.status(409).json({ error: `Asset with Tag "${asset_tag}" already exists.` });
    }

    let newAsset;
    await AssetRequest.sequelize.transaction(async (t) => {
      // 1. Create the Asset with allocated status
      newAsset = await Asset.create({
        location_id: request.location_id,
        asset_tag,
        name: request.asset_name,
        type: request.asset_type,
        brand: brand || null,
        serial_number: serial_number || null,
        mac_address: mac_address || null,
        specification: specification || null,
        warranty: warranty || null,
        status: 'allocated',
        remarks: remarks || null
      }, { transaction: t });

      // 2. Allocate the asset to the requesting Location Admin
      await AssetAllocation.create({
        asset_id: newAsset.id,
        user_id: request.requested_by,
        allocated_by: req.user.id,
        notes: `Automatically allocated from asset request #${request.id}`,
        status: 'active'
      }, { transaction: t });

      // 3. Mark the AssetRequest as completed
      request.status = 'completed';
      await request.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'ASSET_REQUEST_COMPLETE',
      entityType: 'AssetRequest',
      entityId: request.id,
      details: `Completed asset request. Added asset ${asset_tag} to inventory and allocated to requester.`,
      req
    });

    return res.status(201).json({
      message: 'Asset successfully added to inventory and allocated to the Location Admin.',
      asset: newAsset,
      request
    });
  } catch (error) {
    console.error('Error completing asset request:', error);
    return res.status(500).json({ error: 'Failed to add asset to inventory.' });
  }
}

module.exports = {
  addAssetRequest,
  listAssetRequests,
  purchaseAssetRequest,
  addToInventoryAndAllocate
};
