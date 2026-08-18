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
router.post('/send-email', authenticate, reportController.sendReportEmail);

// Report scheduling endpoints
router.post('/schedules/list', authenticate, reportController.listSchedules);
router.post('/schedules', authenticate, reportController.createSchedule);
router.put('/schedules/:id', authenticate, reportController.updateSchedule);
router.delete('/schedules/:id', authenticate, reportController.deleteSchedule);
router.post('/schedules/:id/run', authenticate, reportController.runSchedule);

module.exports = router;
