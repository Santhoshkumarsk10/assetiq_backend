const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/list', authenticate, requirePermission('asset.list'), assetController.listAssets);
router.post('/add', authenticate, requirePermission('asset.add'), assetController.addAsset);
router.post('/edit', authenticate, requirePermission('asset.edit'), assetController.editAsset);
router.post('/delete', authenticate, requirePermission('asset.delete'), assetController.deleteAsset);
router.post('/allocate', authenticate, requirePermission('asset.allocate'), assetController.allocateAsset);
router.post('/return', authenticate, requirePermission('asset.return'), assetController.returnAsset);
router.post('/import', authenticate, requirePermission('asset.import'), assetController.importAssets);
router.post('/next-code', authenticate, requirePermission('asset.add'), assetController.getNextCode);

module.exports = router;
