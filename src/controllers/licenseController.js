const { SoftwareLicense, LicenseRenewalRequest, Notification, User, Role, sequelize } = require('../models');
const { logAction } = require('../utils/auditLogger');
const { sendEmail } = require('../utils/mail');
const { getIo } = require('../socket');
const { Op } = require('sequelize');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Create an in-app notification for a user and emit via socket
 */
async function createNotification({ userId, title, message, type = 'info', referenceId = null }) {
  try {
    const notif = await Notification.create({
      user_id: userId,
      title,
      message,
      type,
      reference_id: referenceId,
      is_read: false
    });

    const io = getIo();
    if (io) {
      io.to(`user_${userId}`).emit('new_notification', notif);
    }

    return notif;
  } catch (err) {
    console.error('[NOTIFICATION ERROR]', err.message);
  }
}

/**
 * Fetch all Admin and IT Admin users to notify
 */
async function getAdminUsers() {
  return User.findAll({
    include: [{ model: Role, as: 'role', where: { name: ['Admin', 'Super Admin', 'IT Admin'] } }],
    where: { status: 'active' }
  });
}

/**
 * Run license expiry check:
 *  1. Mark overdue licenses as 'expired'
 *  2. Send in-app + email alerts to Admins, IT Admins, and the Location Admin of the assigned user
 */
async function checkAndMarkExpiredLicenses() {
  try {
    const today = new Date().toISOString().split('T')[0];

    // Find all licenses that are past valid_until but not yet marked expired
    const expiredLicenses = await SoftwareLicense.findAll({
      where: {
        valid_until: { [Op.lt]: today },
        status: { [Op.ne]: 'expired' }
      },
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'email', 'location_id'],
          required: false
        }
      ]
    });

    if (!expiredLicenses.length) return;

    // Get all admin-level users once
    const adminUsers = await getAdminUsers();

    for (const license of expiredLicenses) {
      // 1. Mark as expired
      await license.update({ status: 'expired' });

      const licenseInfo = `${license.software_name} (Key: ${license.license_key.substring(0, 8)}...)`;
      const title = `⚠️ License Expired: ${license.software_name}`;
      const message = `The software license "${license.software_name}" expired on ${license.valid_until}. Please initiate a renewal request.`;

      // 2. Notify all Admins / IT Admins
      for (const adminUser of adminUsers) {
        await createNotification({
          userId: adminUser.id,
          title,
          message,
          type: 'license_expired',
          referenceId: license.id
        });

        sendEmail({
          to: adminUser.email,
          subject: title,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
              <h2 style="color: #dc2626;">⚠️ Software License Expired</h2>
              <p>Hello <strong>${adminUser.name}</strong>,</p>
              <p>The following software license has <strong>expired</strong> and requires renewal:</p>
              <table style="border-collapse: collapse; width: 100%;">
                <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Software</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.software_name}</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>License Key</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.license_key.substring(0, 8)}...</td></tr>
                <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Expired On</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #dc2626;">${license.valid_until}</td></tr>
                ${license.user ? `<tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Assigned User</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.user.name} (${license.user.email})</td></tr>` : ''}
              </table>
              <p style="margin-top: 16px;">Please log in to <strong>Aux AssetCare</strong> and submit a renewal request for this license.</p>
            </div>
          `
        }).catch(() => {});
      }

      // 3. Also notify Location Admin of the assigned user's location (if applicable)
      if (license.user && license.user.location_id) {
        const locationAdmins = await User.findAll({
          include: [{ model: Role, as: 'role', where: { name: 'Location Admin' } }],
          where: { location_id: license.user.location_id, status: 'active' }
        });

        for (const la of locationAdmins) {
          await createNotification({
            userId: la.id,
            title,
            message: `The software license "${license.software_name}" assigned to ${license.user.name} has expired. The IT Admin will initiate a renewal.`,
            type: 'license_expired',
            referenceId: license.id
          });

          sendEmail({
            to: la.email,
            subject: title,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
                <h2 style="color: #dc2626;">⚠️ Software License Expired</h2>
                <p>Hello <strong>${la.name}</strong>,</p>
                <p>A software license assigned to a user at your location has <strong>expired</strong>:</p>
                <table style="border-collapse: collapse; width: 100%;">
                  <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Software</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.software_name}</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Assigned User</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.user.name} (${license.user.email})</td></tr>
                  <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Expired On</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #dc2626;">${license.valid_until}</td></tr>
                </table>
                <p style="margin-top: 16px;">The IT Admin has been notified and will process a renewal request.</p>
              </div>
            `
          }).catch(() => {});
        }
      }

      console.log(`[LICENSE EXPIRY] Marked license #${license.id} (${license.software_name}) as expired and sent alerts.`);
    }
  } catch (err) {
    console.error('[LICENSE EXPIRY CHECK ERROR]', err.message);
  }
}

// ─── License CRUD ──────────────────────────────────────────────────────────────

/**
 * List Software Licenses
 */
async function listLicenses(req, res) {
  try {
    // Run expiry check on each list load (lightweight for small datasets)
    checkAndMarkExpiredLicenses().catch(console.error);

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = parseInt(req.body.limit) || 10;
    const offset = (page - 1) * limit;

    const search = req.body.search;
    const statusFilter = req.body.status;

    let queryOptions = {
      include: [
        { model: User, as: 'user', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    };

    let whereClause = {};

    if (search) {
      whereClause[Op.or] = [
        { software_name: { [Op.like]: `%${search}%` } },
        { license_key: { [Op.like]: `%${search}%` } }
      ];
    }

    if (statusFilter) {
      whereClause.status = statusFilter;
    }

    queryOptions.where = whereClause;

    let licenses, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await SoftwareLicense.findAndCountAll(queryOptions);
      licenses = result.rows;
      total = result.count;
    } else {
      licenses = await SoftwareLicense.findAll(queryOptions);
      total = licenses.length;
    }

    // Fetch list of users for assignment dropdown
    const users = await User.findAll({ attributes: ['id', 'name', 'email'], order: [['name', 'ASC']] });

    return res.json({
      licenses,
      users,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error listing licenses:', error);
    return res.status(500).json({ error: 'Database error fetching licenses.' });
  }
}

/**
 * Add Software License
 */
async function addLicense(req, res) {
  const { software_name, license_key, valid_from, valid_until, assigned_user_id, status, notes } = req.body;

  if (!software_name || !license_key) {
    return res.status(400).json({ error: 'Software Name and License Key are required.' });
  }

  try {
    const newLicense = await SoftwareLicense.create({
      software_name,
      license_key,
      valid_from: valid_from || null,
      valid_until: valid_until || null,
      assigned_user_id: assigned_user_id ? parseInt(assigned_user_id) : null,
      status: status || 'available',
      notes: notes || null
    });

    await logAction({
      userId: req.user.id,
      action: 'LICENSE_CREATE',
      entityType: 'SoftwareLicense',
      entityId: newLicense.id,
      details: `Added software license: ${software_name} (${license_key.substring(0, 8)}...)`,
      req
    });

    return res.status(201).json({
      message: 'License created successfully',
      license: newLicense
    });
  } catch (error) {
    console.error('Error adding license:', error);
    return res.status(500).json({ error: 'Failed to create software license.' });
  }
}

/**
 * Edit Software License
 */
async function editLicense(req, res) {
  const id = req.body.id || req.params.id;
  const { software_name, license_key, valid_from, valid_until, assigned_user_id, status, notes } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'License ID is required.' });
  }

  try {
    const license = await SoftwareLicense.findByPk(id);
    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }

    license.software_name = software_name || license.software_name;
    license.license_key = license_key || license.license_key;
    license.valid_from = valid_from !== undefined ? (valid_from || null) : license.valid_from;
    license.valid_until = valid_until !== undefined ? (valid_until || null) : license.valid_until;
    license.assigned_user_id = assigned_user_id !== undefined ? (assigned_user_id ? parseInt(assigned_user_id) : null) : license.assigned_user_id;
    license.status = status || license.status;
    license.notes = notes !== undefined ? notes : license.notes;

    await license.save();

    await logAction({
      userId: req.user.id,
      action: 'LICENSE_UPDATE',
      entityType: 'SoftwareLicense',
      entityId: license.id,
      details: `Updated software license: ${license.software_name}`,
      req
    });

    return res.json({
      message: 'License updated successfully',
      license
    });
  } catch (error) {
    console.error('Error editing license:', error);
    return res.status(500).json({ error: 'Failed to update software license.' });
  }
}

/**
 * Delete Software License
 */
async function deleteLicense(req, res) {
  const id = req.body.id || req.params.id;

  if (!id) {
    return res.status(400).json({ error: 'License ID is required.' });
  }

  try {
    const license = await SoftwareLicense.findByPk(id);
    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }

    const name = license.software_name;
    await license.destroy();

    await logAction({
      userId: req.user.id,
      action: 'LICENSE_DELETE',
      entityType: 'SoftwareLicense',
      entityId: id,
      details: `Deleted software license for ${name}`,
      req
    });

    return res.json({ message: `Software license for "${name}" deleted successfully.` });
  } catch (error) {
    console.error('Error deleting license:', error);
    return res.status(500).json({ error: 'Failed to delete software license.' });
  }
}

// ─── Renewal Workflow ──────────────────────────────────────────────────────────

/**
 * IT Admin: Submit a renewal request for an expired license
 */
async function submitRenewalRequest(req, res) {
  const { license_id, proposed_valid_until, renewal_notes } = req.body;

  if (!license_id) {
    return res.status(400).json({ error: 'license_id is required.' });
  }

  if (!['Super Admin', 'Admin', 'IT Admin'].includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Only IT Admin or Admins can submit renewal requests.' });
  }

  try {
    const license = await SoftwareLicense.findByPk(license_id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'location_id'] }]
    });

    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }

    // Check for duplicate pending request
    const existing = await LicenseRenewalRequest.findOne({
      where: { license_id, status: 'pending' }
    });
    if (existing) {
      return res.status(400).json({ error: 'A renewal request for this license is already pending approval.' });
    }

    const renewalRequest = await LicenseRenewalRequest.create({
      license_id,
      requested_by: req.user.id,
      status: 'pending',
      proposed_valid_until: proposed_valid_until || null,
      renewal_notes: renewal_notes || null
    });

    await logAction({
      userId: req.user.id,
      action: 'LICENSE_RENEWAL_REQUESTED',
      entityType: 'LicenseRenewalRequest',
      entityId: renewalRequest.id,
      details: `Renewal request submitted for license: ${license.software_name}`,
      req
    });

    // Notify Admins that a renewal request needs approval
    const adminUsers = await getAdminUsers();
    const title = `🔄 Renewal Request: ${license.software_name}`;
    const message = `${req.user.name} submitted a renewal request for "${license.software_name}". Please review and approve or reject.`;

    for (const adminUser of adminUsers) {
      // Don't re-notify the person who submitted (if they happen to be admin too)
      if (adminUser.id === req.user.id) continue;

      await createNotification({
        userId: adminUser.id,
        title,
        message,
        type: 'renewal_submitted',
        referenceId: renewalRequest.id
      });

      sendEmail({
        to: adminUser.email,
        subject: title,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
            <h2 style="color: #2563eb;">🔄 License Renewal Request</h2>
            <p>Hello <strong>${adminUser.name}</strong>,</p>
            <p><strong>${req.user.name}</strong> has submitted a renewal request for the following license:</p>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Software</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.software_name}</td></tr>
              <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Current Status</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #dc2626;">Expired</td></tr>
              ${proposed_valid_until ? `<tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Proposed New Validity</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${proposed_valid_until}</td></tr>` : ''}
              ${renewal_notes ? `<tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Notes</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${renewal_notes}</td></tr>` : ''}
            </table>
            <p style="margin-top: 16px;">Please log in to <strong>Aux AssetCare</strong> to review this request.</p>
          </div>
        `
      }).catch(() => {});
    }

    return res.status(201).json({
      message: 'Renewal request submitted successfully. Admins have been notified.',
      renewalRequest
    });
  } catch (error) {
    console.error('Error submitting renewal request:', error);
    return res.status(500).json({ error: 'Failed to submit renewal request.' });
  }
}

/**
 * List Renewal Requests (Admin sees all; IT Admin sees their own)
 */
async function listRenewalRequests(req, res) {
  try {
    const whereClause = {};

    // IT Admins only see their own requests unless Super Admin / Admin
    if (req.user.role_name === 'IT Admin') {
      whereClause.requested_by = req.user.id;
    }

    if (req.body.status) {
      whereClause.status = req.body.status;
    }

    const renewalRequests = await LicenseRenewalRequest.findAll({
      where: whereClause,
      include: [
        {
          model: SoftwareLicense,
          as: 'license',
          attributes: ['id', 'software_name', 'license_key', 'valid_until', 'status']
        },
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'approver', attributes: ['id', 'name', 'email'] }
      ],
      order: [['created_at', 'DESC']]
    });

    return res.json({ renewalRequests });
  } catch (error) {
    console.error('Error listing renewal requests:', error);
    return res.status(500).json({ error: 'Failed to fetch renewal requests.' });
  }
}

/**
 * Admin: Approve or Reject a renewal request
 */
async function approveRenewalRequest(req, res) {
  const { renewal_request_id, decision, response_notes } = req.body;

  if (!renewal_request_id || !decision) {
    return res.status(400).json({ error: 'renewal_request_id and decision (approved/rejected) are required.' });
  }

  if (!['approved', 'rejected'].includes(decision)) {
    return res.status(400).json({ error: 'decision must be "approved" or "rejected".' });
  }

  if (!['Super Admin', 'Admin'].includes(req.user.role_name)) {
    return res.status(403).json({ error: 'Only Admin or Super Admin can approve/reject renewal requests.' });
  }

  try {
    const renewalRequest = await LicenseRenewalRequest.findByPk(renewal_request_id, {
      include: [
        {
          model: SoftwareLicense,
          as: 'license',
          include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'location_id'] }]
        },
        { model: User, as: 'requester', attributes: ['id', 'name', 'email'] }
      ]
    });

    if (!renewalRequest) {
      return res.status(404).json({ error: 'Renewal request not found.' });
    }

    if (renewalRequest.status !== 'pending') {
      return res.status(400).json({ error: `This renewal request has already been ${renewalRequest.status}.` });
    }

    // Update renewal request
    renewalRequest.status = decision;
    renewalRequest.approved_by = req.user.id;
    renewalRequest.response_notes = response_notes || null;
    await renewalRequest.save();

    const license = renewalRequest.license;
    const isApproved = decision === 'approved';

    // If approved, update the license
    if (isApproved) {
      await license.update({
        status: 'active',
        valid_until: renewalRequest.proposed_valid_until || license.valid_until,
        valid_from: new Date().toISOString().split('T')[0]
      });
    }

    await logAction({
      userId: req.user.id,
      action: `LICENSE_RENEWAL_${decision.toUpperCase()}`,
      entityType: 'LicenseRenewalRequest',
      entityId: renewalRequest.id,
      details: `${decision.charAt(0).toUpperCase() + decision.slice(1)} renewal request for license: ${license.software_name}`,
      req
    });

    // Notify the IT Admin who submitted
    const notifTitle = isApproved
      ? `✅ Renewal Approved: ${license.software_name}`
      : `❌ Renewal Rejected: ${license.software_name}`;
    const notifMessage = isApproved
      ? `Your renewal request for "${license.software_name}" has been approved by ${req.user.name}. The license is now active.`
      : `Your renewal request for "${license.software_name}" was rejected by ${req.user.name}. ${response_notes ? 'Reason: ' + response_notes : ''}`;

    await createNotification({
      userId: renewalRequest.requester.id,
      title: notifTitle,
      message: notifMessage,
      type: isApproved ? 'renewal_approved' : 'renewal_rejected',
      referenceId: license.id
    });

    sendEmail({
      to: renewalRequest.requester.email,
      subject: notifTitle,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: ${isApproved ? '#059669' : '#dc2626'};">${notifTitle}</h2>
          <p>Hello <strong>${renewalRequest.requester.name}</strong>,</p>
          <p>${notifMessage}</p>
          ${isApproved ? `<p>The license is now valid until: <strong>${renewalRequest.proposed_valid_until || 'updated'}</strong></p>` : ''}
        </div>
      `
    }).catch(() => {});

    // If approved, also notify the Location Admin so they can follow up with the assigned user
    if (isApproved && license.user && license.user.location_id) {
      const locationAdmins = await User.findAll({
        include: [{ model: Role, as: 'role', where: { name: 'Location Admin' } }],
        where: { location_id: license.user.location_id, status: 'active' }
      });

      for (const la of locationAdmins) {
        await createNotification({
          userId: la.id,
          title: `✅ License Renewed: ${license.software_name}`,
          message: `The license "${license.software_name}" assigned to ${license.user.name} has been renewed. Please notify the user accordingly.`,
          type: 'renewal_approved',
          referenceId: license.id
        });
      }
    }

    return res.json({
      message: `Renewal request ${decision} successfully.`,
      renewalRequest
    });
  } catch (error) {
    console.error('Error approving/rejecting renewal request:', error);
    return res.status(500).json({ error: 'Failed to process renewal decision.' });
  }
}

/**
 * Location Admin: Notify the assigned user that their license has been renewed
 */
async function notifyAssignedUser(req, res) {
  const { license_id } = req.body;

  if (!license_id) {
    return res.status(400).json({ error: 'license_id is required.' });
  }

  try {
    const license = await SoftwareLicense.findByPk(license_id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'location_id'] }]
    });

    if (!license) {
      return res.status(404).json({ error: 'License not found.' });
    }

    if (!license.user) {
      return res.status(400).json({ error: 'This license has no assigned user to notify.' });
    }

    // Location Admins can only notify users in their location
    if (req.user.role_name === 'Location Admin' && req.user.location_id !== license.user.location_id) {
      return res.status(403).json({ error: 'You can only notify users in your location.' });
    }

    const title = `✅ Your Software License Has Been Renewed: ${license.software_name}`;
    const message = `Your software license "${license.software_name}" has been successfully renewed and is now active. It is valid until ${license.valid_until}.`;

    // In-app notification
    await createNotification({
      userId: license.user.id,
      title,
      message,
      type: 'user_notify',
      referenceId: license.id
    });

    // Email notification
    await sendEmail({
      to: license.user.email,
      subject: title,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto;">
          <h2 style="color: #059669;">✅ Software License Renewed</h2>
          <p>Hello <strong>${license.user.name}</strong>,</p>
          <p>Your software license has been successfully renewed. Here are the updated details:</p>
          <table style="border-collapse: collapse; width: 100%;">
            <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Software</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.software_name}</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Status</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0; color: #059669;">Active</td></tr>
            <tr><td style="padding: 8px; border: 1px solid #e2e8f0;"><strong>Valid Until</strong></td><td style="padding: 8px; border: 1px solid #e2e8f0;">${license.valid_until}</td></tr>
          </table>
          <p style="margin-top: 16px;">If you have any questions, please contact your Location Administrator.</p>
        </div>
      `
    });

    await logAction({
      userId: req.user.id,
      action: 'LICENSE_USER_NOTIFIED',
      entityType: 'SoftwareLicense',
      entityId: license.id,
      details: `Notified user ${license.user.name} (${license.user.email}) about renewed license: ${license.software_name}`,
      req
    });

    return res.json({ message: `${license.user.name} has been notified about the renewed license.` });
  } catch (error) {
    console.error('Error notifying assigned user:', error);
    return res.status(500).json({ error: 'Failed to notify assigned user.' });
  }
}

module.exports = {
  listLicenses,
  addLicense,
  editLicense,
  deleteLicense,
  checkAndMarkExpiredLicenses,
  submitRenewalRequest,
  listRenewalRequests,
  approveRenewalRequest,
  notifyAssignedUser
};
