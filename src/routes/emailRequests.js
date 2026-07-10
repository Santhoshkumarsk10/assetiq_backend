const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/list', authenticate, requirePermission('email_request.list'), onboardingController.listEmailRequests);
router.post('/process', authenticate, requirePermission('email_request.process'), onboardingController.processEmailRequest);

module.exports = router;
