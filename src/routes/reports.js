const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate } = require('../middleware/authMiddleware');

// Define report endpoints
router.post('/inventory', authenticate, reportController.getInventoryReport);
router.post('/allocations', authenticate, reportController.getAllocationReport);
router.post('/tickets', authenticate, reportController.getTicketReport);
router.post('/licenses', authenticate, reportController.getLicenseReport);
router.post('/audit-logs', authenticate, reportController.getAuditReport);
router.post('/export', authenticate, reportController.exportReport);

module.exports = router;
