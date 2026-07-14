const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authMiddleware');
const { listNotifications, markAsRead } = require('../controllers/notificationController');

router.post('/list', authenticate, listNotifications);
router.post('/mark-read', authenticate, markAsRead);

module.exports = router;
