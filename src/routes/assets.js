const express = require('express');
const router = express.Router();
const assetController = require('../controllers/assetController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

const assetRequestController = require('../controllers/assetRequestController');

router.post('/list', authenticate, requirePermission('asset.list'), assetController.listAssets);
router.post('/add', authenticate, requirePermission('asset.add'), assetController.addAsset);
router.post('/edit', authenticate, requirePermission('asset.edit'), assetController.editAsset);
router.post('/delete', authenticate, requirePermission('asset.delete'), assetController.deleteAsset);
router.post('/allocate', authenticate, requirePermission('asset.allocate'), assetController.allocateAsset);
router.post('/return', authenticate, requirePermission('asset.return'), assetController.returnAsset);
router.post('/import', authenticate, requirePermission('asset.import'), assetController.importAssets);
router.post('/next-code', authenticate, requirePermission('asset.add'), assetController.getNextCode);

router.post('/requests/add', authenticate, requirePermission('asset.add'), assetRequestController.addAssetRequest);
router.post('/requests/list', authenticate, requirePermission('asset.list'), assetRequestController.listAssetRequests);
router.post('/requests/purchase', authenticate, requirePermission('asset.edit'), assetRequestController.purchaseAssetRequest);
router.post('/requests/complete', authenticate, requirePermission('asset.add'), assetRequestController.addToInventoryAndAllocate);

module.exports = router;
