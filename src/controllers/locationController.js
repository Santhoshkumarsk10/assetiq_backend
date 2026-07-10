const { Location } = require('../models');
const { logAction } = require('../utils/auditLogger');

/**
 * List all Locations
 */
async function listLocations(req, res) {
  try {
    const paginate = req.body.paginate === true || req.body.page !== undefined;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.body.search;

    let queryOptions = {
      order: [['name', 'ASC']]
    };

    const { Op } = Location.sequelize.Sequelize;
    let whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { address: { [Op.like]: `%${search}%` } }
      ];
    }

    queryOptions.where = whereClause;

    let locations, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await Location.findAndCountAll(queryOptions);
      locations = result.rows;
      total = result.count;
    } else {
      locations = await Location.findAll(queryOptions);
      total = locations.length;
    }

    return res.json({
      locations,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error listing locations:', error);
    return res.status(500).json({ error: 'Database error fetching locations list.' });
  }
}

/**
 * Add Location
 */
async function addLocation(req, res) {
  const { name, address, country_code } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Location name is required.' });
  }

  try {
    const existing = await Location.findOne({ where: { name } });
    if (existing) {
      return res.status(409).json({ error: `Location "${name}" already exists.` });
    }

    const location = await Location.create({ name, address, country_code });

    await logAction({
      userId: req.user.id,
      action: 'LOCATION_CREATE',
      entityType: 'Location',
      entityId: location.id,
      details: `Created new location: ${name}`,
      req
    });

    return res.status(201).json({
      message: 'Location created successfully',
      location
    });
  } catch (error) {
    console.error('Error creating location:', error);
    return res.status(500).json({ error: 'Failed to save location details.' });
  }
}

/**
 * Edit Location
 */
async function editLocation(req, res) {
  const id = req.body.id || req.params.id;
  const { name, address, country_code } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Location ID is required.' });
  }

  if (!name) {
    return res.status(400).json({ error: 'Location name is required.' });
  }

  try {
    const location = await Location.findByPk(id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found.' });
    }

    // Check unique constraint on name if changing
    if (name !== location.name) {
      const duplicate = await Location.findOne({ where: { name } });
      if (duplicate) {
        return res.status(409).json({ error: `Location name "${name}" is already taken.` });
      }
    }

    const oldName = location.name;
    location.name = name;
    location.address = address;
    location.country_code = country_code !== undefined ? country_code : location.country_code;
    await location.save();

    await logAction({
      userId: req.user.id,
      action: 'LOCATION_UPDATE',
      entityType: 'Location',
      entityId: location.id,
      details: `Updated location ID: ${id} from "${oldName}" to "${name}"`,
      req
    });

    return res.json({
      message: 'Location updated successfully',
      location
    });
  } catch (error) {
    console.error('Error updating location:', error);
    return res.status(500).json({ error: 'Failed to update location details.' });
  }
}

/**
 * Delete Location
 */
async function deleteLocation(req, res) {
  const id = req.body.id || req.params.id;

  if (!id) {
    return res.status(400).json({ error: 'Location ID is required.' });
  }

  try {
    const location = await Location.findByPk(id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found.' });
    }

    const name = location.name;
    await location.destroy();

    await logAction({
      userId: req.user.id,
      action: 'LOCATION_DELETE',
      entityType: 'Location',
      entityId: id,
      details: `Deleted location: ${name} (ID: ${id})`,
      req
    });

    return res.json({ message: `Location "${name}" was deleted successfully.` });
  } catch (error) {
    console.error('Error deleting location:', error);
    return res.status(500).json({ error: 'Failed to delete location.' });
  }
}

module.exports = {
  listLocations,
  addLocation,
  editLocation,
  deleteLocation
};
