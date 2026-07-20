const express = require('express');
const router = express.Router();
const ticketController = require('../controllers/ticketController');
const { authenticate } = require('../middleware/authMiddleware');
const { requirePermission } = require('../middleware/rbacMiddleware');

// Core ticket operations
router.post('/raise',    authenticate, requirePermission('ticket.add'),  ticketController.raiseTicket);
router.post('/list',     authenticate, requirePermission('ticket.list'), ticketController.listTickets);
router.post('/details',  authenticate, requirePermission('ticket.list'), ticketController.getTicketDetails);
router.post('/assign',   authenticate, requirePermission('ticket.edit'), ticketController.assignTicket);
router.post('/resolve',  authenticate, requirePermission('ticket.edit'), ticketController.resolveTicket);
router.post('/close',    authenticate, requirePermission('ticket.edit'), ticketController.closeTicket);
router.post('/cancel',   authenticate, requirePermission('ticket.edit'), ticketController.cancelTicket);

// Comments
router.post('/comment/add',  authenticate, requirePermission('ticket.list'), ticketController.addComment);
router.post('/comment/list', authenticate, requirePermission('ticket.list'), ticketController.listComments);
router.post('/my-assets',    authenticate, requirePermission('ticket.add'),  ticketController.getUserAssets);

module.exports = router;
