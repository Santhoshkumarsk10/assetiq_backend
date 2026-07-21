const { Asset, AssetAllocation, User, Location, sequelize } = require('../models');
const { logAction } = require('../utils/auditLogger');
const { hasLocationAccess } = require('../middleware/rbacMiddleware');
const xlsx = require('xlsx');
const bcrypt = require('bcryptjs');

/**
 * List Assets
 */
async function listAssets(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const myLocId = req.user.location_id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = Math.min(parseInt(req.body.limit) || 10, 200);
    const offset = (page - 1) * limit;

    const search = req.body.search;
    const typeFilter = req.body.type;
    const statusFilter = req.body.status;

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

    const { Op } = sequelize.Sequelize;
    let whereClause = {};

    if (isLocationAdmin) {
      whereClause.location_id = myLocId;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { asset_tag: { [Op.like]: `%${search}%` } }
      ];
    }

    if (typeFilter) {
      whereClause.type = typeFilter;
    }

    if (statusFilter) {
      whereClause.status = statusFilter;
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

    // Map list to include flat active user names
    const flattedAssets = assets.map(a => {
      const activeAllocation = a.allocations && a.allocations[0];
      return {
        ...a.toJSON(),
        allocated_user_name: activeAllocation && activeAllocation.user ? activeAllocation.user.name : null,
        allocated_user_id: activeAllocation && activeAllocation.user ? activeAllocation.user.id : null
      };
    });

    // Fetch allocation history logs
    let historyQuery = {
      include: [
        { model: Asset, as: 'asset', attributes: ['id', 'asset_tag'] },
        { model: User, as: 'user', attributes: ['id', 'name'] },
        { model: User, as: 'allocator', attributes: ['id', 'name'] }
      ],
      order: [['id', 'DESC']]
    };

    if (isLocationAdmin) {
      historyQuery.include[0].where = { location_id: myLocId };
    }

    const allocationHistory = await AssetAllocation.findAll(historyQuery);

    // Filter list of users for allocations select options
    let userOptionsQuery = { order: [['name', 'ASC']] };
    if (isLocationAdmin) {
      userOptionsQuery.where = { location_id: myLocId };
    }
    const users = await User.findAll(userOptionsQuery);

    let locations = [];
    if (isLocationAdmin) {
      locations = await Location.findAll({ where: { id: myLocId } });
    } else {
      locations = await Location.findAll({ order: [['name', 'ASC']] });
    }

    return res.json({
      assets: flattedAssets,
      allocationHistory,
      users,
      locations,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });

  } catch (error) {
    console.error('Error listing assets:', error);
    return res.status(500).json({ error: 'Database error fetching assets list.' });
  }
}

/**
 * Helper to generate next asset code based on location
 */
async function generateAssetCode(locationId) {
  if (!locationId) return null;
  const loc = await Location.findByPk(locationId);
  if (!loc) return null;

  const match = loc.name.match(/\(([^)]+)\)/);
  let base = match ? match[1] : loc.name;
  base = base.toUpperCase().replace(/[^A-Z0-9]/g, '');

  let prefix = 'AST';
  if (base.startsWith('CHENNAI')) prefix = 'CHE';
  else if (base.startsWith('BANGALORE')) prefix = 'BLR';
  else if (base.startsWith('DELHI')) prefix = 'DEL';
  else prefix = base.substring(0, 3) || 'AST';

  const { Op } = sequelize.Sequelize;
  const lastAsset = await Asset.findOne({
    where: {
      asset_tag: {
        [Op.like]: `${prefix}-%`
      }
    },
    order: [['id', 'DESC']]
  });

  let nextNum = 1;
  if (lastAsset) {
    const parts = lastAsset.asset_tag.split('-');
    const lastNumStr = parts[parts.length - 1];
    const parsedNum = parseInt(lastNumStr, 10);
    if (!isNaN(parsedNum)) {
      nextNum = parsedNum + 1;
    }
  }

  const paddedNum = String(nextNum).padStart(4, '0');
  return `${prefix}-${paddedNum}`;
}

/**
 * Route handler for getting next asset code
 */
async function getNextCode(req, res) {
  const { location_id } = req.body;
  if (!location_id) {
    return res.status(400).json({ error: 'location_id is required' });
  }
  try {
    const code = await generateAssetCode(location_id);
    if (!code) {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.json({ next_code: code });
  } catch (error) {
    console.error('Error generating next asset code:', error);
    return res.status(500).json({ error: 'Failed to generate next asset code' });
  }
}

/**
 * Add Asset
 */
async function addAsset(req, res) {
  const { asset_tag, name, type, serial_number, location_id, brand, specification, mac_address, warranty, remarks, status } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  const targetLocId = isLocationAdmin ? myLocId : location_id;
  if (!name || !type || !targetLocId) {
    return res.status(400).json({ error: 'Name, type, and location_id are required fields.' });
  }

  // Location scoping check
  if (!hasLocationAccess(req.user, targetLocId)) {
    return res.status(403).json({ error: 'Unauthorized. You do not have access to create assets for this location.' });
  }

  try {
    let finalAssetTag = asset_tag ? String(asset_tag).trim() : null;
    if (!finalAssetTag) {
      finalAssetTag = await generateAssetCode(targetLocId);
    }

    if (!finalAssetTag) {
      return res.status(400).json({ error: 'Failed to generate asset code.' });
    }

    const existing = await Asset.findOne({ where: { asset_tag: finalAssetTag } });
    if (existing) {
      return res.status(409).json({ error: `Asset tag "${finalAssetTag}" already exists.` });
    }

    const newAsset = await Asset.create({
      asset_tag: finalAssetTag,
      name,
      type,
      serial_number: serial_number || null,
      brand: brand || null,
      specification: specification || null,
      mac_address: mac_address || null,
      warranty: warranty || null,
      remarks: remarks || null,
      status: status || 'available',
      location_id: targetLocId
    });

    await logAction({
      userId: req.user.id,
      action: 'ASSET_CREATE',
      entityType: 'Asset',
      entityId: newAsset.id,
      details: `Added asset to inventory: ${name} (${finalAssetTag})`,
      req
    });

    return res.status(201).json({
      message: 'Asset created successfully',
      asset: newAsset
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    return res.status(500).json({ error: 'Failed to create asset.' });
  }
}

/**
 * Edit Asset
 */
async function editAsset(req, res) {
  const id = req.body.id || req.params.id;
  const { name, type, serial_number, status, location_id, brand, specification, mac_address, warranty, remarks } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Asset ID is required.' });
  }

  try {
    const asset = await Asset.findByPk(id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, asset.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to manage assets in this location.' });
    }

    asset.name = name || asset.name;
    asset.type = type || asset.type;
    asset.serial_number = serial_number !== undefined ? serial_number : asset.serial_number;
    asset.brand = brand !== undefined ? brand : asset.brand;
    asset.specification = specification !== undefined ? specification : asset.specification;
    asset.mac_address = mac_address !== undefined ? mac_address : asset.mac_address;
    asset.warranty = warranty !== undefined ? warranty : asset.warranty;
    asset.remarks = remarks !== undefined ? remarks : asset.remarks;
    asset.status = status || asset.status;
    
    if (!isLocationAdmin && location_id) {
      asset.location_id = location_id;
    }

    await asset.save();

    await logAction({
      userId: req.user.id,
      action: 'ASSET_UPDATE',
      entityType: 'Asset',
      entityId: asset.id,
      details: `Updated asset tag details for: ${asset.asset_tag}`,
      req
    });

    return res.json({
      message: 'Asset updated successfully',
      asset
    });
  } catch (error) {
    console.error('Error updating asset:', error);
    return res.status(500).json({ error: 'Failed to update asset details.' });
  }
}

/**
 * Delete Asset
 */
async function deleteAsset(req, res) {
  const id = req.body.id || req.params.id;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Asset ID is required.' });
  }

  try {
    const asset = await Asset.findByPk(id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, asset.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to delete assets from this location.' });
    }

    const tag = asset.asset_tag;
    await asset.destroy();

    await logAction({
      userId: req.user.id,
      action: 'ASSET_DELETE',
      entityType: 'Asset',
      entityId: id,
      details: `Deleted asset: ${tag} (ID: ${id})`,
      req
    });

    return res.json({ message: `Asset "${tag}" deleted successfully.` });
  } catch (error) {
    console.error('Error deleting asset:', error);
    return res.status(500).json({ error: 'Failed to delete asset.' });
  }
}

/**
 * Allocate Asset
 */
async function allocateAsset(req, res) {
  const { asset_id, user_id, notes } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!asset_id || !user_id) {
    return res.status(400).json({ error: 'asset_id and user_id are required fields.' });
  }

  try {
    const asset = await Asset.findByPk(asset_id);
    if (!asset) {
      return res.status(404).json({ error: 'Asset not found.' });
    }

    // Location Scope verification
    if (!hasLocationAccess(req.user, asset.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to allocate assets for this location.' });
    }

    if (asset.status !== 'available') {
      return res.status(400).json({ error: 'Asset is not available for allocation.' });
    }

    const targetUser = await User.findByPk(user_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Employee not found.' });
    }

    // Verify employee location match
    if (!hasLocationAccess(req.user, targetUser.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. Employee belongs to another location.' });
    }

    // Wrap in Sequelize Transaction
    await Asset.sequelize.transaction(async (t) => {
      // 1. Create Allocation record
      await AssetAllocation.create({
        asset_id,
        user_id,
        allocated_by: req.user.id,
        notes: notes || null,
        status: 'active'
      }, { transaction: t });

      // 2. Set Asset status to allocated
      asset.status = 'allocated';
      await asset.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'ASSET_ALLOCATED',
      entityType: 'Asset',
      entityId: asset.id,
      details: `Allocated asset ${asset.asset_tag} to employee ${targetUser.email}`,
      req
    });

    return res.json({ message: `Asset "${asset.asset_tag}" allocated successfully.` });
  } catch (error) {
    console.error('Error allocating asset:', error);
    return res.status(500).json({ error: 'Failed to complete asset allocation.' });
  }
}

/**
 * Return Asset
 */
async function returnAsset(req, res) {
  const id = req.body.id || req.params.id; // allocation id
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Allocation ID is required.' });
  }

  try {
    const allocation = await AssetAllocation.findByPk(id, {
      include: [{ model: Asset, as: 'asset' }]
    });

    if (!allocation || allocation.status !== 'active') {
      return res.status(404).json({ error: 'Active allocation log not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, allocation.asset.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. Asset belongs to another location.' });
    }

    const asset = allocation.asset;

    // Wrap in Sequelize Transaction
    await Asset.sequelize.transaction(async (t) => {
      // 1. Set allocation to returned
      allocation.status = 'returned';
      allocation.returned_at = new Date();
      await allocation.save({ transaction: t });

      // 2. Set asset status back to available
      asset.status = 'available';
      await asset.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'ASSET_RETURNED',
      entityType: 'Asset',
      entityId: asset.id,
      details: `Returned asset ${asset.asset_tag} back to available inventory.`,
      req
    });

    return res.json({ message: `Asset "${asset.asset_tag}" was returned successfully.` });
  } catch (error) {
    console.error('Error returning asset:', error);
    return res.status(500).json({ error: 'Failed to process asset return.' });
  }
}

/**
 * Import Assets from Excel
 */
async function importAssets(req, res) {
  const { fileData, locationId } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!fileData) {
    return res.status(400).json({ error: 'Excel file data is required.' });
  }

  const targetLocId = isLocationAdmin ? myLocId : parseInt(locationId);
  if (!targetLocId) {
    return res.status(400).json({ error: 'Target location is required.' });
  }

  try {
    const buffer = Buffer.from(fileData, 'base64');
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet);

    if (rows.length === 0) {
      return res.status(400).json({ error: 'The uploaded Excel file has no data.' });
    }

    let createdCount = 0;
    let updatedCount = 0;
    let usersCreatedCount = 0;

    // Fetch all locations to perform fast in-memory lookup
    const allLocations = await Location.findAll();

    // Pre-calculate next sequence number per location for auto-generation
    const nextSequenceMap = {};
    for (const loc of allLocations) {
      const match = loc.name.match(/\(([^)]+)\)/);
      let base = match ? match[1] : loc.name;
      base = base.toUpperCase().replace(/[^A-Z0-9]/g, '');

      let prefix = 'AST';
      if (base.startsWith('CHENNAI')) prefix = 'CHE';
      else if (base.startsWith('BANGALORE')) prefix = 'BLR';
      else if (base.startsWith('DELHI')) prefix = 'DEL';
      else prefix = base.substring(0, 3) || 'AST';

      const { Op } = sequelize.Sequelize;
      const lastAsset = await Asset.findOne({
        where: {
          asset_tag: {
            [Op.like]: `${prefix}-%`
          }
        },
        order: [['id', 'DESC']]
      });

      let nextNum = 1;
      if (lastAsset) {
        const parts = lastAsset.asset_tag.split('-');
        const lastNumStr = parts[parts.length - 1];
        const parsedNum = parseInt(lastNumStr, 10);
        if (!isNaN(parsedNum)) {
          nextNum = parsedNum + 1;
        }
      }
      nextSequenceMap[loc.id] = { prefix, nextNum };
    }

    await sequelize.transaction(async (t) => {
      for (const row of rows) {
        // 1. Determine Location
        const rawLocationName = row['Location'] || row['LOCATION'] || row['Location Name'] || row['LOCATION NAME'];
        let rowLocId = targetLocId;
        if (rawLocationName) {
          const locNameClean = String(rawLocationName).trim().toLowerCase();
          const matchedLoc = allLocations.find(l => l.name.toLowerCase() === locNameClean);
          if (matchedLoc) {
            rowLocId = matchedLoc.id;
          }
        }

        // 2. Determine Asset Code / Tag
        const rawAssetCode = row['Asset Code'] || row['ASSET CODE'] || row['Asset ID'] || row['ASSET ID'] || row['Asset Tag'] || row['ASSET TAG'];
        let asset_tag = rawAssetCode ? String(rawAssetCode).trim() : null;

        if (!asset_tag) {
          // Auto-generate based on row location
          const seqInfo = nextSequenceMap[rowLocId];
          if (seqInfo) {
            const paddedNum = String(seqInfo.nextNum).padStart(4, '0');
            asset_tag = `${seqInfo.prefix}-${paddedNum}`;
            seqInfo.nextNum++; // Increment the counter for this location
          } else {
            // Fallback general prefix
            const paddedNum = String(Math.floor(1000 + Math.random() * 9000));
            asset_tag = `AST-${paddedNum}`;
          }
        }

        if (!asset_tag) continue;

        // 3. Map Fields
        const brand = row['Brand'] || row['BRAND'] || row['Make'] || row['MAKE'] || null;
        const makeModelName = `${row['Make'] || ''} ${row['Model'] || ''}`.trim();
        const name = row['Asset Name'] || row['ASSET NAME'] || row['Name'] || row['NAME'] || (makeModelName ? `${makeModelName} Asset` : 'Asset');
        
        let type = row['Asset Type'] || row['ASSET TYPE'] || row['Type'] || row['TYPE'] || 'Other';
        // Normalize type enum
        const typeClean = String(type).trim();
        const allowedTypes = ['Laptop', 'Mobile', 'Desktop', 'Accessories', 'Monitor', 'Mobile Device', 'Other'];
        let matchedType = allowedTypes.find(at => at.toLowerCase() === typeClean.toLowerCase());
        if (!matchedType) {
          if (typeClean.toLowerCase().includes('laptop')) matchedType = 'Laptop';
          else if (typeClean.toLowerCase().includes('desktop')) matchedType = 'Desktop';
          else if (typeClean.toLowerCase().includes('mobile') || typeClean.toLowerCase().includes('phone')) matchedType = 'Mobile';
          else if (typeClean.toLowerCase().includes('accessories') || typeClean.toLowerCase().includes('mouse') || typeClean.toLowerCase().includes('keyboard')) matchedType = 'Accessories';
          else if (typeClean.toLowerCase().includes('monitor')) matchedType = 'Monitor';
          else matchedType = 'Other';
        }

        const serial_number = row['Serial Number'] || row['SERIAL NUMBER'] || row['Serial No'] || row['SERIAL NO'] || null;
        const mac_address = row['MAC Address'] || row['MAC ADDRESS'] || row['Mac Address'] || row['MAC ID'] || row['Mac ID'] || null;
        const specification = row['Specification'] || row['SPECIFICATION'] || null;
        const warranty = row['Warranty'] || row['WARRANTY'] || null;
        const status = row['Status'] || row['STATUS'] || 'available';
        const remarks = row['Remarks'] || row['REMARKS'] || null;

        // 4. Find or Create Asset
        let asset = await Asset.findOne({ where: { asset_tag }, transaction: t });
        
        if (asset) {
          asset.name = name;
          asset.type = matchedType;
          asset.serial_number = serial_number ? String(serial_number).trim() : asset.serial_number;
          asset.brand = brand ? String(brand).trim() : asset.brand;
          asset.mac_address = mac_address ? String(mac_address).trim() : asset.mac_address;
          asset.specification = specification ? String(specification).trim() : asset.specification;
          asset.warranty = warranty ? String(warranty).trim() : asset.warranty;
          asset.remarks = remarks ? String(remarks).trim() : asset.remarks;
          asset.status = status || asset.status;
          asset.location_id = rowLocId;
          await asset.save({ transaction: t });
          updatedCount++;
        } else {
          asset = await Asset.create({
            asset_tag,
            name,
            type: matchedType,
            serial_number: serial_number ? String(serial_number).trim() : null,
            brand: brand ? String(brand).trim() : null,
            mac_address: mac_address ? String(mac_address).trim() : null,
            specification: specification ? String(specification).trim() : null,
            warranty: warranty ? String(warranty).trim() : null,
            remarks: remarks ? String(remarks).trim() : null,
            status: status || 'available',
            location_id: rowLocId
          }, { transaction: t });
          createdCount++;
        }

        // 5. Handle Assignment/Allocation
        const rawAssigned = row['ASSIGNED'] || row['Assigned'];
        const assigned = rawAssigned ? String(rawAssigned).trim() : '';
        const assignedUpper = assigned.toUpperCase();

        if (assigned && assignedUpper !== 'NO' && assignedUpper !== 'OFFICE' && assignedUpper !== 'AVAILABLE') {
          // Look up user case-insensitively
          let user = await User.findOne({
            where: sequelize.where(
              sequelize.fn('LOWER', sequelize.col('name')),
              assigned.toLowerCase()
            ),
            transaction: t
          });

          if (!user) {
            // C-03 Security Fix: Do NOT auto-create user accounts with default passwords.
            // Skip this assignment and record it as a warning in the import results.
            errors.push(`Row ${rowIndex}: Assigned user "${assigned}" not found in the system. Please add the user via the Users module first, then re-import.`);
          } else {
            // Check for existing active allocation for this asset
            const existingAlloc = await AssetAllocation.findOne({
              where: { asset_id: asset.id, status: 'active' },
              transaction: t
            });

            if (!existingAlloc) {
              await AssetAllocation.create({
                asset_id: asset.id,
                user_id: user.id,
                allocated_by: req.user.id,
                status: 'active',
                notes: `Imported from Excel - assigned to ${assigned}`
              }, { transaction: t });

              asset.status = 'allocated';
              await asset.save({ transaction: t });
            } else if (existingAlloc.user_id !== user.id) {
              // Re-allocate
              existingAlloc.status = 'returned';
              existingAlloc.returned_at = new Date();
              await existingAlloc.save({ transaction: t });

              await AssetAllocation.create({
                asset_id: asset.id,
                user_id: user.id,
                allocated_by: req.user.id,
                status: 'active',
                notes: `Imported from Excel - reassigned to ${assigned}`
              }, { transaction: t });

              asset.status = 'allocated';
              await asset.save({ transaction: t });
            }
          }
        } else {
          // If not assigned to a user, release any active allocation
          const existingAlloc = await AssetAllocation.findOne({
            where: { asset_id: asset.id, status: 'active' },
            transaction: t
          });

          if (existingAlloc) {
            existingAlloc.status = 'returned';
            existingAlloc.returned_at = new Date();
            await existingAlloc.save({ transaction: t });

            asset.status = 'available';
            await asset.save({ transaction: t });
          }
        }
      }
    });

    await logAction({
      userId: req.user.id,
      action: 'ASSETS_IMPORT',
      entityType: 'Asset',
      entityId: null,
      details: `Imported assets from Excel: created ${createdCount}, updated ${updatedCount}, auto-created ${usersCreatedCount} user profiles.`,
      req
    });

    return res.json({
      message: 'Excel import completed successfully',
      createdCount,
      updatedCount,
      usersCreatedCount
    });

  } catch (error) {
    console.error('Error importing assets:', error);
    return res.status(500).json({ error: 'Failed to parse Excel file and import assets. Ensure the format is valid.' });
  }
}

module.exports = {
  listAssets,
  addAsset,
  editAsset,
  deleteAsset,
  allocateAsset,
  returnAsset,
  importAssets,
  getNextCode
};
