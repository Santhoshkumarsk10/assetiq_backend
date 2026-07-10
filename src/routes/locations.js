const express = require('express');
const router = express.Router();
const locationController = require('../controllers/locationController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/list', authenticate, requirePermission('location.list'), locationController.listLocations);
router.post('/add', authenticate, requirePermission('location.add'), locationController.addLocation);
router.post('/edit', authenticate, requirePermission('location.edit'), locationController.editLocation);
router.post('/delete', authenticate, requirePermission('location.delete'), locationController.deleteLocation);

module.exports = router;
