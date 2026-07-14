const express = require('express');
const router = express.Router();

// Import modular route files
const authRoutes = require('./auth');
const dashboardRoutes = require('./dashboard');
const locationRoutes = require('./locations');
const userRoutes = require('./users');
const assetRoutes = require('./assets');
const onboardingRoutes = require('./onboarding');
const emailRequestsRoutes = require('./emailRequests');
const rolesRoutes = require('./roles');
const licenseRoutes = require('./license');
const notificationsRoutes = require('./notifications');

// Mount routes
router.use('/auth', authRoutes);
router.use('/', dashboardRoutes);
router.use('/locations', locationRoutes);
router.use('/users', userRoutes);
router.use('/assets', assetRoutes);
router.use('/onboarding', onboardingRoutes);
router.use('/email-requests', emailRequestsRoutes);
router.use('/licenses', licenseRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/', rolesRoutes);

module.exports = router;
