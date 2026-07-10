const express = require('express');
const router = express.Router();
const onboardingController = require('../controllers/onboardingController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/list', authenticate, requirePermission('onboarding.list'), onboardingController.listOnboarding);
router.post('/details', authenticate, requirePermission('onboarding.show'), onboardingController.getOnboarding);
router.post('/step1', authenticate, requirePermission('onboarding.add'), onboardingController.step1);
router.post('/next-code', authenticate, requirePermission('onboarding.add'), onboardingController.getNextEmployeeCode);
router.post('/step2', authenticate, requirePermission('onboarding.edit'), onboardingController.step2);
router.post('/step3', authenticate, requirePermission('onboarding.edit'), onboardingController.step3);
router.post('/step4', authenticate, requirePermission('onboarding.edit'), onboardingController.step4);
router.post('/step5', authenticate, requirePermission('onboarding.edit'), onboardingController.step5);
router.post('/step6', authenticate, requirePermission('onboarding.edit'), onboardingController.step6);
router.get('/email-action', onboardingController.processEmailAction);

module.exports = router;
