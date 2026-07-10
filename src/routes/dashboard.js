const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/dashboard/stats', authenticate, dashboardController.getStats);
router.post('/audit-logs', authenticate, requirePermission('auditlog.list'), dashboardController.getAuditLogs);

module.exports = router;
