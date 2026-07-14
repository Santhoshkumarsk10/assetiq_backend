const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/licenseController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

// Core license CRUD – now using dedicated license.* permissions
router.post('/list',   authenticate, requirePermission('license.list'),   licenseController.listLicenses);
router.post('/add',    authenticate, requirePermission('license.add'),    licenseController.addLicense);
router.post('/edit',   authenticate, requirePermission('license.edit'),   licenseController.editLicense);
router.post('/delete', authenticate, requirePermission('license.delete'), licenseController.deleteLicense);

// Renewal workflow
router.post('/renewal/submit',      authenticate, requirePermission('license.renewal.submit'), licenseController.submitRenewalRequest);
router.post('/renewal/list',        authenticate, requirePermission('license.list'),           licenseController.listRenewalRequests);
router.post('/renewal/decide',      authenticate, requirePermission('license.renewal.decide'), licenseController.approveRenewalRequest);
router.post('/renewal/notify-user', authenticate, requirePermission('license.notify'),         licenseController.notifyAssignedUser);

module.exports = router;
