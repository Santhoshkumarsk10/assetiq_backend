const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/list', authenticate, requirePermission('user.list'), userController.listUsers);
router.post('/add', authenticate, requirePermission('user.add'), userController.addUser);
router.post('/edit', authenticate, requirePermission('user.edit'), userController.editUser);
router.post('/delete', authenticate, requirePermission('user.delete'), userController.deleteUser);
router.post('/resign', authenticate, requirePermission('user.resign'), userController.resignUser);
router.post('/offboard-verify', authenticate, requirePermission('onboarding.edit'), userController.verifyOffboardReturn);
router.post('/offboard-list', authenticate, requirePermission('onboarding.list'), userController.listOffboardingQueue);
router.post('/mfa-toggle', authenticate, userController.toggleMfa);
router.post('/managers', authenticate, userController.listManagers);
router.post('/update-fcm-token', authenticate, userController.updateFcmToken);

module.exports = router;
