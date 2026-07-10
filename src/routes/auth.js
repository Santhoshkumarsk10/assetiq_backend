const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authMiddleware');

router.post('/login', authController.login);
router.post('/logout', authenticate, authController.logout);
router.post('/me', authenticate, authController.me);
router.post('/mfa/verify', authController.verifyMfa);
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/change-password', authenticate, authController.changePassword);
router.post('/update-profile', authenticate, authController.updateProfile);

module.exports = router;
