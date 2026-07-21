const { Ticket, TicketComment, Asset, AssetAllocation, User, Location, Notification, Role } = require('../models');
const { logAction } = require('../utils/auditLogger');
const { sendEmail } = require('../utils/mail');
const { getIo } = require('../socket');
const { Op } = require('sequelize');

// ── Helper: Location prefix from name ────────────────────────────────────────
function locationPrefix(name) {
  if (!name) return 'GEN';
  const n = name.toUpperCase().trim();
  if (n.includes('CHENNAI')) return 'CHE';
  if (n.includes('MUMBAI')) return 'MUM';
  if (n.includes('DIFC')) return 'DIF';
  if (n.includes('KENYA')) return 'KEN';
  if (n.includes('KL')) return 'KLM';
  if (n.includes('LABUAN')) return 'LAB';
  if (n.includes('LONDON')) return 'LON';
  return n.substring(0, 3);
}

// ── Helper: Send in-app notification + optional email ────────────────────────
async function sendTicketNotification({ userId, title, message, type, referenceId, emailTo, emailSubject, emailHtml }) {
  try {
    const notif = await Notification.create({
      user_id: userId,
      title,
      message,
      type: type || 'ticket_update',
      reference_id: referenceId || null
    });
    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('new_notification', notif);
    }
    if (emailTo && emailSubject && emailHtml) {
      sendEmail({ to: emailTo, subject: emailSubject, html: emailHtml }).catch(console.error);
    }
  } catch (e) {
    console.error('[TICKET NOTIF ERROR]', e.message);
  }
}

// ── Helper: Auto-log a system comment on a ticket ────────────────────────────
async function addSystemComment(ticketId, userId, type, message, metadata) {
  return TicketComment.create({
    ticket_id: ticketId,
    user_id: userId,
    type,
    message,
    metadata: metadata || null
  });
}

// ── 1. Raise Ticket ──────────────────────────────────────────────────────────
async function raiseTicket(req, res) {
  const { asset_id, title, description, category, priority } = req.body;

  if (!title || !description || !category) {
    return res.status(400).json({ error: 'Title, Description, and Category are required.' });
  }

  try {
    const userId = req.user.id;
    const roleName = req.user.role_name;
    let locationId = req.user.location_id;

    // Validate asset ownership for regular users
    if (asset_id) {
      const asset = await Asset.findByPk(asset_id, { include: [{ model: Location, as: 'location' }] });
      if (!asset) return res.status(404).json({ error: 'Asset not found.' });

      if (roleName === 'User') {
        const allocation = await AssetAllocation.findOne({
          where: { asset_id, user_id: userId, status: 'active' }
        });
        if (!allocation) {
          return res.status(403).json({ error: 'You can only raise tickets for assets allocated to you.' });
        }
      }
      locationId = asset.location_id;
    }

    if (!locationId) {
      return res.status(400).json({ error: 'Could not determine location for this ticket.' });
    }

    // Generate ticket number
    const location = await Location.findByPk(locationId);
    const prefix = locationPrefix(location ? location.name : null);
    const lastTicket = await Ticket.findOne({
      where: { location_id: locationId },
      order: [['id', 'DESC']]
    });
    const counter = lastTicket ? (parseInt(lastTicket.ticket_no.split('-').pop()) || 1000) + 1 : 1001;
    const ticketNo = `TKT-${prefix}-${counter}`;

    const ticket = await Ticket.create({
      ticket_no: ticketNo,
      location_id: locationId,
      asset_id: asset_id || null,
      user_id: userId,
      raised_by: userId,
      title,
      description,
      category,
      priority: priority || 'medium',
      status: 'pending'
    });

    // System comment
    await addSystemComment(ticket.id, userId, 'status_change',
      `Ticket raised with priority "${priority || 'medium'}" in category "${category}".`,
      { from_status: null, to_status: 'pending' }
    );

    await logAction({ userId, action: 'TICKET_RAISE', entityType: 'Ticket', entityId: ticket.id, details: `Raised ticket ${ticketNo}: ${title}`, req });

    // Notify location admins + IT Admins + Super Admin / Admin
    const adminsToNotify = await User.findAll({
      where: { status: 'active' },
      include: [{ model: Role, as: 'role' }]
    });

    for (const admin of adminsToNotify) {
      if (admin.id === userId) continue;
      const rName = admin.role ? admin.role.name : '';
      const isLocationAdminOfUser = rName === 'Location Admin' && parseInt(admin.location_id) === parseInt(locationId);
      const isITOrSuperAdmin = ['IT Admin', 'Admin', 'Super Admin'].includes(rName);

      if (isLocationAdminOfUser || isITOrSuperAdmin) {
        await sendTicketNotification({
          userId: admin.id,
          title: `New Ticket: ${ticketNo}`,
          message: `${req.user.name} raised ticket "${title}" (${category}, ${priority || 'medium'} priority).`,
          type: 'ticket_raised',
          referenceId: ticket.id,
          emailTo: admin.email,
          emailSubject: `[Aux AssetCare] New Ticket ${ticketNo}: ${title}`,
          emailHtml: `<p>Hi ${admin.name},</p><p><strong>${req.user.name}</strong> has raised a new support ticket.</p><p><strong>Ticket:</strong> ${ticketNo}<br/><strong>Title:</strong> ${title}<br/><strong>Category:</strong> ${category}<br/><strong>Priority:</strong> ${priority || 'medium'}</p><p><strong>Description:</strong><br/>${description}</p><p>Please log in to Aux AssetCare to review and assign this ticket.</p>`
        });
      }
    }

    return res.status(201).json({ message: 'Ticket raised successfully.', ticket });
  } catch (error) {
    console.error('Error raising ticket:', error);
    return res.status(500).json({ error: 'Failed to raise ticket.' });
  }
}

// ── 2. List Tickets ──────────────────────────────────────────────────────────
async function listTickets(req, res) {
  try {
    const { page = 1, search, status, priority, category } = req.body;
    const limit = Math.min(parseInt(req.body.limit) || 15, 200); // M-08: cap at 200
    const roleName = req.user.role_name;
    const offset = (page - 1) * limit;

    let whereClause = {};

    // Role-based scoping
    if (roleName === 'User') {
      whereClause.user_id = req.user.id;
    } else if (roleName === 'Location Admin') {
      whereClause.location_id = req.user.location_id;
    }
    // Super Admin / Admin: no filter (global)

    if (status) whereClause.status = status;
    if (priority) whereClause.priority = priority;
    if (category) whereClause.category = category;
    if (search) {
      whereClause[Op.or] = [
        { ticket_no: { [Op.like]: `%${search}%` } },
        { title: { [Op.like]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Ticket.findAndCountAll({
      where: whereClause,
      include: [
        { model: Location, as: 'location', attributes: ['id', 'name'] },
        { model: Asset, as: 'asset', attributes: ['id', 'asset_tag', 'name', 'type'] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Also return IT Admins / Admins list for assignment dropdown
    let admins = [];
    if (['Super Admin', 'Admin', 'Location Admin', 'IT Admin'].includes(roleName)) {
      admins = await User.findAll({
        where: { status: 'active' },
        include: [{
          model: Role,
          as: 'role',
          where: { name: ['IT Admin', 'Admin', 'Super Admin'] }
        }],
        attributes: ['id', 'name', 'email']
      });
    }

    return res.json({
      success: true,
      tickets: rows,
      admins,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(count / limit) }
    });
  } catch (error) {
    console.error('Error listing tickets:', error);
    return res.status(500).json({ error: 'Failed to list tickets.' });
  }
}

// ── 3. Get Ticket Details ────────────────────────────────────────────────────
async function getTicketDetails(req, res) {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  try {
    const ticket = await Ticket.findByPk(id, {
      include: [
        { model: Location, as: 'location' },
        { model: Asset, as: 'asset', include: [{ model: Location, as: 'location' }] },
        { model: User, as: 'user', attributes: ['id', 'name', 'email', 'employee_id'] },
        { model: User, as: 'reporter', attributes: ['id', 'name', 'email', 'employee_id'] },
        { model: User, as: 'assignee', attributes: ['id', 'name', 'email', 'employee_id'] },
        {
          model: TicketComment, as: 'comments',
          include: [{ model: User, as: 'author', attributes: ['id', 'name', 'email'] }],
          order: [['created_at', 'ASC']]
        }
      ]
    });

    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    // Scope check
    const roleName = req.user.role_name;
    if (roleName === 'User' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this ticket.' });
    }
    if (roleName === 'Location Admin' && parseInt(ticket.location_id) !== parseInt(req.user.location_id)) {
      return res.status(403).json({ error: 'This ticket belongs to a different location.' });
    }

    // Fetch available assets at ticket location (for replacement during resolve)
    let availableAssets = [];
    if (['Super Admin', 'Admin', 'Location Admin'].includes(roleName)) {
      availableAssets = await Asset.findAll({
        where: { location_id: ticket.location_id, status: 'available' },
        attributes: ['id', 'asset_tag', 'name', 'type', 'brand']
      });
    }

    return res.json({ success: true, ticket, availableAssets });
  } catch (error) {
    console.error('Error getting ticket details:', error);
    return res.status(500).json({ error: 'Failed to get ticket details.' });
  }
}

// ── 4. Assign Ticket ─────────────────────────────────────────────────────────
async function assignTicket(req, res) {
  const { id, assigned_to } = req.body;
  if (!id || !assigned_to) return res.status(400).json({ error: 'Ticket ID and Assigned To are required.' });

  try {
    const ticket = await Ticket.findByPk(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    const roleName = req.user.role_name;
    if (roleName === 'IT Admin') {
      return res.status(403).json({ error: 'IT Admins cannot assign tickets; assignment must be performed by the Location Admin.' });
    }
    if (roleName === 'Location Admin' && parseInt(ticket.location_id) !== parseInt(req.user.location_id)) {
      return res.status(403).json({ error: 'Location Admins can only assign tickets belonging to their location.' });
    }

    if (!['pending', 'in_progress'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Ticket cannot be assigned in its current status.' });
    }

    const assignee = await User.findByPk(assigned_to, { attributes: ['id', 'name', 'email'] });
    if (!assignee) return res.status(404).json({ error: 'Assignee user not found.' });

    const prevStatus = ticket.status;
    ticket.assigned_to = assigned_to;
    ticket.status = 'in_progress';
    await ticket.save();

    await addSystemComment(ticket.id, req.user.id, 'assignment',
      `Ticket assigned to ${assignee.name} by ${req.user.name}.`,
      { assigned_to: assigned_to, assigned_by: req.user.id, from_status: prevStatus, to_status: 'in_progress' }
    );

    await logAction({ userId: req.user.id, action: 'TICKET_ASSIGN', entityType: 'Ticket', entityId: ticket.id, details: `Assigned ticket ${ticket.ticket_no} to ${assignee.name}`, req });

    if (assigned_to !== req.user.id) {
      await sendTicketNotification({
        userId: assigned_to,
        title: `Ticket Assigned: ${ticket.ticket_no}`,
        message: `${req.user.name} has assigned you ticket "${ticket.title}".`,
        type: 'ticket_assigned',
        referenceId: ticket.id,
        emailTo: assignee.email,
        emailSubject: `[Aux AssetCare] Ticket ${ticket.ticket_no} Assigned to You`,
        emailHtml: `<p>Hi ${assignee.name},</p><p><strong>${req.user.name}</strong> has assigned you a support ticket.</p><p><strong>Ticket:</strong> ${ticket.ticket_no}<br/><strong>Title:</strong> ${ticket.title}</p><p>Please log in to review and resolve this ticket.</p>`
      });
    }

    return res.json({ message: 'Ticket assigned successfully.', ticket });
  } catch (error) {
    console.error('Error assigning ticket:', error);
    return res.status(500).json({ error: 'Failed to assign ticket.' });
  }
}

// ── 5. Resolve Ticket ────────────────────────────────────────────────────────
async function resolveTicket(req, res) {
  const { id, resolution_type, resolution_notes, replacement_asset_id } = req.body;
  if (!id || !resolution_type) return res.status(400).json({ error: 'Ticket ID and Resolution Type are required.' });

  try {
    const ticket = await Ticket.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    const roleName = req.user.role_name;
    if (roleName === 'Location Admin') {
      return res.status(403).json({ error: 'Location Admins cannot resolve tickets directly. Tickets must be assigned to an IT Admin.' });
    }
    if (roleName === 'IT Admin') {
      if (!ticket.assigned_to) {
        return res.status(403).json({ error: 'IT Admin cannot take action until the ticket is assigned by the Location Admin.' });
      }
      if (parseInt(ticket.assigned_to) !== parseInt(req.user.id)) {
        return res.status(403).json({ error: 'You can only resolve tickets that are assigned to you.' });
      }
    }

    if (ticket.status !== 'in_progress') {
      return res.status(400).json({ error: 'Only in-progress tickets can be resolved.' });
    }

    await Ticket.sequelize.transaction(async (t) => {
      ticket.resolution_type = resolution_type;
      ticket.resolution_notes = resolution_notes || null;
      ticket.status = 'resolved';
      await ticket.save({ transaction: t });

      // Handle asset status changes based on resolution type
      if (ticket.asset_id) {
        const asset = await Asset.findByPk(ticket.asset_id, { transaction: t });
        if (asset) {
          if (resolution_type === 'repaired') {
            asset.status = 'allocated';
            await asset.save({ transaction: t });
          } else if (resolution_type === 'retired') {
            asset.status = 'retired';
            await asset.save({ transaction: t });
            await AssetAllocation.update(
              { status: 'returned', returned_at: new Date() },
              { where: { asset_id: asset.id, status: 'active' }, transaction: t }
            );
          } else if (resolution_type === 'replaced' && replacement_asset_id) {
            // Retire old asset
            asset.status = 'retired';
            await asset.save({ transaction: t });
            await AssetAllocation.update(
              { status: 'returned', returned_at: new Date() },
              { where: { asset_id: asset.id, status: 'active' }, transaction: t }
            );
            // Allocate replacement
            const newAsset = await Asset.findByPk(replacement_asset_id, { transaction: t });
            if (newAsset && newAsset.status === 'available') {
              newAsset.status = 'allocated';
              await newAsset.save({ transaction: t });
              await AssetAllocation.create({
                asset_id: newAsset.id,
                user_id: ticket.user_id,
                allocated_by: req.user.id,
                notes: `Replacement via ticket ${ticket.ticket_no}`,
                status: 'active'
              }, { transaction: t });
            }
          }
        }
      }
    });

    await addSystemComment(ticket.id, req.user.id, 'resolution',
      `Ticket resolved as "${resolution_type}" by ${req.user.name}.${resolution_notes ? ' Notes: ' + resolution_notes : ''}`,
      { resolution_type, from_status: 'in_progress', to_status: 'resolved' }
    );

    await logAction({ userId: req.user.id, action: 'TICKET_RESOLVE', entityType: 'Ticket', entityId: ticket.id, details: `Resolved ticket ${ticket.ticket_no} as ${resolution_type}`, req });

    // Notify reporter
    if (ticket.user && ticket.user.id !== req.user.id) {
      await sendTicketNotification({
        userId: ticket.user.id,
        title: `Ticket Resolved: ${ticket.ticket_no}`,
        message: `Your ticket "${ticket.title}" has been resolved as "${resolution_type}".`,
        type: 'ticket_resolved',
        referenceId: ticket.id,
        emailTo: ticket.user.email,
        emailSubject: `[Aux AssetCare] Ticket ${ticket.ticket_no} Resolved`,
        emailHtml: `<p>Hi ${ticket.user.name},</p><p>Your support ticket has been resolved.</p><p><strong>Ticket:</strong> ${ticket.ticket_no}<br/><strong>Resolution:</strong> ${resolution_type}<br/>${resolution_notes ? '<strong>Notes:</strong> ' + resolution_notes : ''}</p><p>Please log in to confirm and close the ticket, or reopen if the issue persists.</p>`
      });
    }

    return res.json({ message: 'Ticket resolved successfully.', ticket });
  } catch (error) {
    console.error('Error resolving ticket:', error);
    return res.status(500).json({ error: 'Failed to resolve ticket.' });
  }
}

// ── 6. Close Ticket ──────────────────────────────────────────────────────────
async function closeTicket(req, res) {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  try {
    const ticket = await Ticket.findByPk(id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    const roleName = req.user.role_name;
    if (roleName === 'User') {
      if (ticket.user_id !== req.user.id) return res.status(403).json({ error: 'You can only close your own tickets.' });
      if (ticket.status !== 'resolved') return res.status(400).json({ error: 'You can only close tickets that have been resolved.' });
    } else if (roleName === 'Location Admin') {
      return res.status(403).json({ error: 'Location Admins cannot close tickets directly. Tickets must be assigned to and handled by an IT Admin.' });
    } else if (roleName === 'IT Admin') {
      if (!ticket.assigned_to) {
        return res.status(403).json({ error: 'IT Admin cannot take action until the ticket is assigned by the Location Admin.' });
      }
      if (parseInt(ticket.assigned_to) !== parseInt(req.user.id) && !['Super Admin', 'Admin'].includes(roleName)) {
        return res.status(403).json({ error: 'You can only close tickets assigned to you.' });
      }
    } else {
      if (!['resolved', 'in_progress', 'pending'].includes(ticket.status)) {
        return res.status(400).json({ error: 'Ticket cannot be closed in its current status.' });
      }
    }

    const prevStatus = ticket.status;
    ticket.status = 'closed';
    await ticket.save();

    await addSystemComment(ticket.id, req.user.id, 'status_change',
      `Ticket closed by ${req.user.name}.`,
      { from_status: prevStatus, to_status: 'closed' }
    );

    await logAction({ userId: req.user.id, action: 'TICKET_CLOSE', entityType: 'Ticket', entityId: ticket.id, details: `Closed ticket ${ticket.ticket_no}`, req });

    // Notify assignee if closed by reporter
    if (ticket.assigned_to && ticket.assigned_to !== req.user.id) {
      await sendTicketNotification({
        userId: ticket.assigned_to,
        title: `Ticket Closed: ${ticket.ticket_no}`,
        message: `Ticket "${ticket.title}" has been closed by ${req.user.name}.`,
        type: 'ticket_closed',
        referenceId: ticket.id
      });
    }

    return res.json({ message: 'Ticket closed successfully.', ticket });
  } catch (error) {
    console.error('Error closing ticket:', error);
    return res.status(500).json({ error: 'Failed to close ticket.' });
  }
}

// ── 7. Cancel Ticket ─────────────────────────────────────────────────────────
async function cancelTicket(req, res) {
  const { id, reason } = req.body;
  if (!id) return res.status(400).json({ error: 'Ticket ID is required.' });

  try {
    const ticket = await Ticket.findByPk(id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    const roleName = req.user.role_name;
    if (roleName === 'IT Admin' && !ticket.assigned_to) {
      return res.status(403).json({ error: 'IT Admin cannot cancel tickets until assigned by the Location Admin.' });
    }
    if (['closed', 'cancelled'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Ticket is already closed or cancelled.' });
    }

    const prevStatus = ticket.status;
    ticket.status = 'cancelled';
    await ticket.save();

    await addSystemComment(ticket.id, req.user.id, 'status_change',
      `Ticket cancelled by ${req.user.name}.${reason ? ' Reason: ' + reason : ''}`,
      { from_status: prevStatus, to_status: 'cancelled', reason }
    );

    await logAction({ userId: req.user.id, action: 'TICKET_CANCEL', entityType: 'Ticket', entityId: ticket.id, details: `Cancelled ticket ${ticket.ticket_no}`, req });

    // Notify reporter
    if (ticket.user && ticket.user.id !== req.user.id) {
      await sendTicketNotification({
        userId: ticket.user.id,
        title: `Ticket Cancelled: ${ticket.ticket_no}`,
        message: `Your ticket "${ticket.title}" has been cancelled by ${req.user.name}.${reason ? ' Reason: ' + reason : ''}`,
        type: 'ticket_cancelled',
        referenceId: ticket.id,
        emailTo: ticket.user.email,
        emailSubject: `[Aux AssetCare] Ticket ${ticket.ticket_no} Cancelled`,
        emailHtml: `<p>Hi ${ticket.user.name},</p><p>Your support ticket <strong>${ticket.ticket_no}</strong> ("${ticket.title}") has been cancelled by ${req.user.name}.</p>${reason ? '<p><strong>Reason:</strong> ' + reason + '</p>' : ''}<p>If you believe this was in error, please raise a new ticket.</p>`
      });
    }

    return res.json({ message: 'Ticket cancelled successfully.', ticket });
  } catch (error) {
    console.error('Error cancelling ticket:', error);
    return res.status(500).json({ error: 'Failed to cancel ticket.' });
  }
}

// ── 8. Add Comment ───────────────────────────────────────────────────────────
async function addComment(req, res) {
  const { ticket_id, message } = req.body;
  if (!ticket_id || !message) return res.status(400).json({ error: 'Ticket ID and Message are required.' });

  try {
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    if (['closed', 'cancelled'].includes(ticket.status)) {
      return res.status(400).json({ error: 'Cannot add comments to a closed or cancelled ticket.' });
    }

    // Scope check
    const roleName = req.user.role_name;
    if (roleName === 'User' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to this ticket.' });
    }

    const comment = await TicketComment.create({
      ticket_id,
      user_id: req.user.id,
      type: 'comment',
      message
    });

    // Notify other participants
    const participantIds = new Set([ticket.user_id, ticket.raised_by, ticket.assigned_to].filter(Boolean));
    participantIds.delete(req.user.id);

    for (const pid of participantIds) {
      await sendTicketNotification({
        userId: pid,
        title: `Comment on ${ticket.ticket_no}`,
        message: `${req.user.name}: "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`,
        type: 'ticket_comment',
        referenceId: ticket.id
      });
    }

    const fullComment = await TicketComment.findByPk(comment.id, {
      include: [{ model: User, as: 'author', attributes: ['id', 'name', 'email'] }]
    });

    return res.status(201).json({ message: 'Comment added.', comment: fullComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    return res.status(500).json({ error: 'Failed to add comment.' });
  }
}

// ── 9. List Comments ─────────────────────────────────────────────────────────
async function listComments(req, res) {
  const { ticket_id } = req.body;
  if (!ticket_id) return res.status(400).json({ error: 'Ticket ID is required.' });

  try {
    // M-03 Fix: Verify the requesting user has access to this ticket before returning comments
    const ticket = await Ticket.findByPk(ticket_id);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });

    const roleName = req.user.role_name;
    if (roleName === 'User' && ticket.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You do not have access to comments on this ticket.' });
    }
    if (roleName === 'Location Admin' && parseInt(ticket.location_id) !== parseInt(req.user.location_id)) {
      return res.status(403).json({ error: 'This ticket belongs to a different location.' });
    }

    const comments = await TicketComment.findAll({
      where: { ticket_id },
      include: [{ model: User, as: 'author', attributes: ['id', 'name', 'email'] }],
      order: [['created_at', 'ASC']]
    });

    return res.json({ success: true, comments });
  } catch (error) {
    console.error('[listComments] Error:', error.message);
    return res.status(500).json({ error: 'Failed to list comments.' });
  }
}

// ── 10. Get User Assets ──────────────────────────────────────────────────────
async function getUserAssets(req, res) {
  try {
    const userId = req.user.id;
    const roleName = req.user.role_name;

    let assets = [];
    if (roleName === 'User') {
      const allocations = await AssetAllocation.findAll({
        where: { user_id: userId, status: 'active' },
        include: [{ model: Asset, as: 'asset' }]
      });
      assets = allocations.map(a => a.asset).filter(Boolean);
    } else {
      const isLocationAdmin = roleName === 'Location Admin';
      const whereClause = isLocationAdmin ? { location_id: req.user.location_id } : {};
      assets = await Asset.findAll({
        where: whereClause,
        attributes: ['id', 'asset_tag', 'name', 'type', 'brand']
      });
    }

    return res.json({ success: true, assets });
  } catch (error) {
    console.error('Error fetching user assets:', error);
    return res.status(500).json({ error: 'Failed to fetch assets.' });
  }
}

module.exports = {
  raiseTicket,
  listTickets,
  getTicketDetails,
  assignTicket,
  resolveTicket,
  closeTicket,
  cancelTicket,
  addComment,
  listComments,
  getUserAssets
};
