const express = require('express');
const router = express.Router();
const roleController = require('../controllers/roleController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

router.post('/roles/list', authenticate, requirePermission('role.list'), roleController.listRoles);
router.post('/roles/update-permissions', authenticate, requirePermission('role.edit'), roleController.updateRolePermissions);
router.post('/roles/add', authenticate, requirePermission('role.add'), roleController.addRole);
router.post('/roles/edit', authenticate, requirePermission('role.edit'), roleController.editRole);
router.post('/roles/delete', authenticate, requirePermission('role.delete'), roleController.deleteRole);

router.post('/permissions/add', authenticate, requirePermission('role.add'), roleController.addPermission);
router.post('/permissions/edit', authenticate, requirePermission('role.edit'), roleController.editPermission);
router.post('/permissions/delete', authenticate, requirePermission('role.delete'), roleController.deletePermission);

module.exports = router;
