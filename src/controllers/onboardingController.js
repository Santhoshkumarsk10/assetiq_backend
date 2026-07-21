const { OnboardingRequest, Asset, EmailCreationRequest, OnboardingApproval, User, Location, AssetAllocation, Role } = require('../models');
const { logAction } = require('../utils/auditLogger');
const { sendEmail } = require('../utils/mail');
const { hasLocationAccess } = require('../middleware/rbacMiddleware');
const bcrypt = require('bcryptjs');

/**
 * List Onboarding requests (scoped if Location Admin)
 */
async function listOnboarding(req, res) {
  try {
    const isLocationAdmin = req.user.role_name === 'Location Admin';
    const myLocId = req.user.location_id;

    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = Math.min(parseInt(req.body.limit) || 10, 200);
    const offset = (page - 1) * limit;

    const search = req.body.search;
    const status = req.body.status;

    let queryOptions = {
      order: [['created_at', 'DESC']],
      include: [
        {
          model: Location,
          as: 'location'
        },
        {
          model: Role,
          as: 'role',
          attributes: ['id', 'name']
        },
        {
          model: User,
          as: 'reportingManager',
          attributes: ['id', 'name', 'email']
        },
        {
          model: User,
          as: 'generalManager',
          attributes: ['id', 'name', 'email']
        },
        {
          model: EmailCreationRequest,
          as: 'emailRequest'
        }
      ]
    };

    const { Op } = OnboardingRequest.sequelize.Sequelize;
    let whereClause = {};

    if (isLocationAdmin) {
      whereClause.location_id = myLocId;
    }

    if (status === 'completed') {
      whereClause.status = 'completed';
    } else if (status === 'active') {
      whereClause.status = { [Op.ne]: 'completed' };
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { employee_id: { [Op.like]: `%${search}%` } },
        { department: { [Op.like]: `%${search}%` } }
      ];
    }

    queryOptions.where = whereClause;

    let requests, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await OnboardingRequest.findAndCountAll(queryOptions);
      requests = result.rows;
      total = result.count;
    } else {
      requests = await OnboardingRequest.findAll(queryOptions);
      total = requests.length;
    }

    let locations = [];
    if (isLocationAdmin) {
      locations = await Location.findAll({ where: { id: myLocId } });
    } else {
      locations = await Location.findAll({ order: [['name', 'ASC']] });
    }

    const roles = await Role.findAll({ order: [['name', 'ASC']] });

    return res.json({
      requests,
      locations,
      roles,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error listing onboardings:', error);
    return res.status(500).json({ error: 'Database error fetching onboarding pipeline.' });
  }
}

/**
 * Fetch a single Onboarding request details (with its step status)
 */
async function getOnboarding(req, res) {
  const id = req.body.id || req.params.id;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Onboarding ID is required.' });
  }

  try {
    const request = await OnboardingRequest.findByPk(id, {
      include: [
        { model: Location, as: 'location' },
        { model: Role, as: 'role' },
        { model: Asset, as: 'assets' },
        { model: User, as: 'reportingManager', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'generalManager', attributes: ['id', 'name', 'email'] },
        { model: EmailCreationRequest, as: 'emailRequest', include: [{ model: User, as: 'processor', attributes: ['id', 'name'] }] },
        { model: OnboardingApproval, as: 'approval', include: [{ model: User, as: 'approver', attributes: ['id', 'name'] }] }
      ]
    });

    if (!request) {
      return res.status(404).json({ error: 'Onboarding request not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, request.location_id)) {
      return res.status(403).json({ error: 'Unauthorized. You do not have access to view onboarding details for this location.' });
    }

    // Fetch available assets for Step 2 select options
    const availableAssets = await Asset.findAll({
      where: {
        location_id: request.location_id,
        status: 'available'
      },
      order: [['asset_tag', 'ASC']]
    });

    return res.json({ request, availableAssets });
  } catch (error) {
    console.error('Error fetching onboarding request:', error);
    return res.status(500).json({ error: 'Database error fetching details.' });
  }
}

/**
 * Helper to generate next employee code based on location
 */
async function generateEmployeeCode(locationId) {
  if (!locationId) return null;
  const loc = await Location.findByPk(locationId);
  if (!loc) return null;

  let base = loc.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  let prefix = 'IND';
  if (base.startsWith('INDIA')) prefix = 'IND';
  else if (base.startsWith('UAE')) prefix = 'UAE';
  else if (base.startsWith('KENYA')) prefix = 'KEN';
  else if (base.startsWith('MALAYSIA')) prefix = 'MAL';
  else if (base.startsWith('UK')) prefix = 'UK';
  else prefix = base.substring(0, 3) || 'EMP';

  const { Op } = OnboardingRequest.sequelize.Sequelize;

  const lastRequest = await OnboardingRequest.findOne({
    where: {
      employee_id: {
        [Op.like]: `EMP-${prefix}-%`
      }
    },
    order: [['id', 'DESC']]
  });

  const lastUser = await User.findOne({
    where: {
      employee_id: {
        [Op.like]: `EMP-${prefix}-%`
      }
    },
    order: [['id', 'DESC']]
  });

  let nextNum = 1;

  const parseNum = (empId) => {
    if (!empId) return 0;
    const parts = empId.split('-');
    const lastNumStr = parts[parts.length - 1];
    const parsedNum = parseInt(lastNumStr, 10);
    return isNaN(parsedNum) ? 0 : parsedNum;
  };

  const num1 = lastRequest ? parseNum(lastRequest.employee_id) : 0;
  const num2 = lastUser ? parseNum(lastUser.employee_id) : 0;
  nextNum = Math.max(num1, num2) + 1;

  const paddedNum = String(nextNum).padStart(2, '0');
  return `EMP-${prefix}-${paddedNum}`;
}

/**
 * Route handler for getting next employee code
 */
async function getNextEmployeeCode(req, res) {
  const { location_id } = req.body;
  if (!location_id) {
    return res.status(400).json({ error: 'location_id is required' });
  }
  try {
    const code = await generateEmployeeCode(location_id);
    if (!code) {
      return res.status(404).json({ error: 'Location not found' });
    }
    return res.json({ next_code: code });
  } catch (error) {
    console.error('Error generating next employee code:', error);
    return res.status(500).json({ error: 'Failed to generate next employee code' });
  }
}

/**
 * Step 1: Create Onboarding Wizard Draft
 */
async function step1(req, res) {
  const { employee_id, name, personal_email, phone, department, designation, location_id, state, city, address, reporting_manager_id, role_id, general_manager_id } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!employee_id || !name || !personal_email || !phone || !department || !designation || (!location_id && !isLocationAdmin) || !state || !city || !address) {
    return res.status(400).json({ error: 'All fields including State, City, and Address are required to start the onboarding.' });
  }

  const targetLocId = isLocationAdmin ? myLocId : location_id;

  if (!hasLocationAccess(req.user, targetLocId)) {
    return res.status(403).json({ error: 'Unauthorized location action.' });
  }

  // Field Custom Validations
  if (!/^[a-zA-Z\s]+$/.test(name)) {
    return res.status(400).json({ error: 'Full Name must contain only letters and spaces.' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal_email)) {
    return res.status(400).json({ error: 'Please enter a valid personal email.' });
  }
  if (!/^[a-zA-Z\s-]+$/.test(state)) {
    return res.status(400).json({ error: 'State must contain only letters, spaces, and hyphens.' });
  }
  if (!/^[a-zA-Z\s-]+$/.test(city)) {
    return res.status(400).json({ error: 'City must contain only letters, spaces, and hyphens.' });
  }
  if (address.trim().length < 10) {
    return res.status(400).json({ error: 'Address must be at least 10 characters long.' });
  }

  try {
    // Check duplicates in onboarding or active users
    const existsInOnboarding = await OnboardingRequest.findOne({ where: { employee_id } });
    const existsInUsers = await User.findOne({ where: { employee_id } });

    if (existsInOnboarding || existsInUsers) {
      return res.status(409).json({ error: `Employee ID "${employee_id}" already exists.` });
    }

    const request = await OnboardingRequest.create({
      employee_id,
      name,
      personal_email,
      phone,
      department,
      designation,
      location_id: targetLocId,
      state,
      city,
      address,
      role_id: role_id || null,
      reporting_manager_id: reporting_manager_id || null,
      general_manager_id: general_manager_id || null,
      step: 2,
      status: 'pending_assets',
      created_by: req.user.id
    });

    await logAction({
      userId: req.user.id,
      action: 'ONBOARD_STEP1_CREATE',
      entityType: 'OnboardingRequest',
      entityId: request.id,
      details: `Started onboarding for: ${name} (Employee ID: ${employee_id})`,
      req
    });

    return res.status(201).json({
      message: 'Onboarding step 1 completed. Onboarding request created.',
      onboarding_id: request.id,
      request
    });
  } catch (error) {
    console.error('Error in step 1:', error);
    return res.status(500).json({ error: 'Failed to initialize onboarding request.' });
  }
}

/**
 * Step 2: Allocate Onboarding Assets
 */
async function step2(req, res) {
  const id = req.body.id || req.params.id;
  const { asset_ids } = req.body; // Array of asset IDs
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Onboarding ID is required.' });
  }

  try {
    const request = await OnboardingRequest.findByPk(id);
    if (!request) {
      return res.status(404).json({ error: 'Onboarding request not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, request.location_id)) {
      return res.status(403).json({ error: 'Unauthorized location action.' });
    }

    const targetAssetIds = Array.isArray(asset_ids) ? asset_ids : [];

    if (targetAssetIds.length === 0) {
      return res.status(400).json({ error: 'At least one asset must be selected for allocation.' });
    }

    // Verify all selected assets belong to location and are available
    if (targetAssetIds.length > 0) {
      const assetsCount = await Asset.count({
        where: {
          id: targetAssetIds,
          location_id: request.location_id,
          status: 'available'
        }
      });

      if (assetsCount !== targetAssetIds.length) {
        return res.status(400).json({ error: 'One or more selected assets are invalid, unavailable, or belong to a different location.' });
      }
    }

    // Wrap in Sequelize Transaction
    await OnboardingRequest.sequelize.transaction(async (t) => {
      // Clear previous mapping if any
      await request.setAssets(targetAssetIds, { transaction: t });

      // Update step status
      request.step = 3;
      request.status = 'pending_email_request';
      await request.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'ONBOARD_STEP2_ASSETS',
      entityType: 'OnboardingRequest',
      entityId: request.id,
      details: `Allocated ${targetAssetIds.length} onboarding assets to ${request.name}`,
      req
    });

    return res.json({
      message: 'Onboarding step 2 completed. Assets allocated.',
      request
    });
  } catch (error) {
    console.error('Error in step 2:', error);
    return res.status(500).json({ error: 'Failed to save onboarding assets.' });
  }
}

/**
 * Step 3: Submit Official Email Creation Request
 */
async function step3(req, res) {
  const id = req.body.id || req.params.id;
  const { suggested_email } = req.body;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Onboarding ID is required.' });
  }

  if (!suggested_email || !suggested_email.includes('@')) {
    return res.status(400).json({ error: 'A valid corporate email format is required.' });
  }

  try {
    const request = await OnboardingRequest.findByPk(id);
    if (!request) {
      return res.status(404).json({ error: 'Onboarding request not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, request.location_id)) {
      return res.status(403).json({ error: 'Unauthorized location action.' });
    }

    // Check duplicate in User table
    const emailTaken = await User.findOne({ where: { email: suggested_email } });
    if (emailTaken) {
      return res.status(409).json({ error: `Corporate email "${suggested_email}" is already in use by another active user.` });
    }

    // Check duplicate in Email Requests table
    const requestExists = await EmailCreationRequest.findOne({ where: { suggested_email } });
    if (requestExists) {
      return res.status(409).json({ error: `An email request for "${suggested_email}" is already pending processing.` });
    }

    // Create Email Request
    await OnboardingRequest.sequelize.transaction(async (t) => {
      // 1. Create request record
      await EmailCreationRequest.create({
        onboarding_id: id,
        suggested_email,
        status: 'pending'
      }, { transaction: t });

      // 2. Progress step
      request.step = 4;
      request.status = 'pending_approval';
      await request.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'ONBOARD_STEP3_EMAIL_SUBMIT',
      entityType: 'OnboardingRequest',
      entityId: request.id,
      details: `Submitted corporate email request: ${suggested_email} for ${request.name}`,
      req
    });

    return res.json({
      message: 'Onboarding step 3 completed. Email request submitted to IT queue.',
      request
    });
  } catch (error) {
    console.error('Error in step 3:', error);
    return res.status(500).json({ error: 'Failed to process corporate email request.' });
  }
}

/**
 * Step 4: Onboarding Approval Decision (Location/General Admin action)
 */
async function step4(req, res) {
  const id = req.body.id || req.params.id;
  const { decision, remarks } = req.body; // decision: 'Approve Onboarding' or 'Reject'
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Onboarding ID is required.' });
  }

  if (!decision) {
    return res.status(400).json({ error: 'Decision is required (Approve Onboarding / Reject).' });
  }

  try {
    const request = await OnboardingRequest.findByPk(id, {
      include: [{ model: EmailCreationRequest, as: 'emailRequest' }]
    });

    if (!request) {
      return res.status(404).json({ error: 'Onboarding request not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, request.location_id)) {
      return res.status(403).json({ error: 'Unauthorized location action.' });
    }

    // Validation check: Did IT Admin approve corporate email?
    const emailReqStatus = request.emailRequest ? request.emailRequest.status : null;
    if (decision === 'Approve Onboarding' && emailReqStatus !== 'approved') {
      return res.status(400).json({ error: 'Cannot approve onboarding. IT Admin must approve corporate email request first.' });
    }

    // Transactional processing
    await OnboardingRequest.sequelize.transaction(async (t) => {
      // 1. Log OnboardingApproval
      const isApproved = decision === 'Approve Onboarding';
      await OnboardingApproval.create({
        onboarding_id: id,
        approval_type: 'physical',
        status: isApproved ? 'approved' : 'rejected',
        approved_by: req.user.id,
        approved_at: new Date(),
        remarks: remarks || null
      }, { transaction: t });

      // 2. Set Status
      if (isApproved) {
        request.step = 5;
        request.status = 'approved';
      } else {
        request.status = 'pending_approval'; // reset or set rejected state
      }
      await request.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: decision === 'Approve Onboarding' ? 'ONBOARD_STEP4_APPROVE' : 'ONBOARD_STEP4_REJECT',
      entityType: 'OnboardingRequest',
      entityId: request.id,
      details: `Processed onboarding approval: ${decision}. Remarks: ${remarks}`,
      req
    });

    return res.json({
      message: `Onboarding decision "${decision}" recorded successfully.`,
      request
    });
  } catch (error) {
    console.error('Error in step 4:', error);
    return res.status(500).json({ error: 'Failed to record onboarding approval decision.' });
  }
}

/**
 * Step 5: Activate Employee Account (Creates User and allocates physical assets)
 */
async function step5(req, res) {
  const id = req.body.id || req.params.id;
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Onboarding ID is required.' });
  }

  try {
    const request = await OnboardingRequest.findByPk(id, {
      include: [
        { model: Asset, as: 'assets' },
        { model: EmailCreationRequest, as: 'emailRequest' }
      ]
    });

    if (!request) {
      return res.status(404).json({ error: 'Onboarding request not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, request.location_id)) {
      return res.status(403).json({ error: 'Unauthorized location action.' });
    }

    if (request.status !== 'approved') {
      return res.status(400).json({ error: 'Cannot activate. Onboarding must be approved first.' });
    }

    const officialEmail = request.emailRequest ? request.emailRequest.suggested_email : null;
    if (!officialEmail) {
      return res.status(400).json({ error: 'No approved corporate email address mapped to this request.' });
    }

    // Generate credentials
    const plainPassword = 'Welcome@' + Math.floor(1000 + Math.random() * 9000);
    const crypto = require('crypto');
    const sha256Password = crypto.createHash('sha256').update(plainPassword).digest('hex');
    const hashedPassword = await bcrypt.hash(sha256Password, 10);

    const isSelfReporting = request.reporting_manager_id === 'self';
    const parsedReportingManagerId = isSelfReporting ? null : (request.reporting_manager_id || null);

    // Run transaction: user creation, asset status changes, asset_allocations logs
    await OnboardingRequest.sequelize.transaction(async (t) => {
      // 1. Create active User
      const newUser = await User.create({
        employee_id: request.employee_id,
        name: request.name,
        email: officialEmail,
        phone: request.phone,
        password: hashedPassword,
        role_id: request.role_id || 4,
        location_id: request.location_id,
        department: request.department,
        designation: request.designation,
        state: request.state,
        city: request.city,
        address: request.address,
        reporting_manager_id: parsedReportingManagerId,
        general_manager_id: request.general_manager_id || null,
        status: 'active'
      }, { transaction: t });

      if (isSelfReporting || (!request.reporting_manager_id && request.role_id === 3)) {
        newUser.reporting_manager_id = newUser.id;
        await newUser.save({ transaction: t });
      }

      // 2. Allocate the staging assets
      if (request.assets && request.assets.length > 0) {
        for (const asset of request.assets) {
          // Allocate log
          await AssetAllocation.create({
            asset_id: asset.id,
            user_id: newUser.id,
            allocated_by: req.user.id,
            notes: 'Onboarding automated allocation',
            status: 'active'
          }, { transaction: t });

          // Update asset status
          asset.status = 'allocated';
          await asset.save({ transaction: t });
        }
      }

      // 3. Mark Onboarding Request as complete
      request.step = 6;
      request.status = 'completed';
      await request.save({ transaction: t });
    });

    await logAction({
      userId: req.user.id,
      action: 'ONBOARD_STEP5_ACTIVATE',
      entityType: 'OnboardingRequest',
      entityId: request.id,
      details: `Activated employee account for ${request.name}. Setup link generated.`,
      req
    });

    // C-04 Fix: Generate a secure one-time setup token and store it in the DB.
    // Return the setup URL — the plaintext password is NEVER returned to the caller.
    const setupToken = crypto.randomBytes(32).toString('hex');
    const { User: UserModel } = require('../models');
    const createdUser = await UserModel.findOne({ where: { email: officialEmail } });
    if (createdUser) {
      createdUser.reset_token = setupToken;
      createdUser.reset_token_expiry = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 hours
      await createdUser.save();
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const setupUrl = `${frontendUrl}/reset-password?token=${setupToken}`;

    return res.json({
      message: 'Account activated successfully. Step 5 complete.',
      request,
      setup_url: setupUrl,
      official_email: officialEmail
      // Note: plaintext password is intentionally NOT returned here
    });

  } catch (error) {
    console.error('Error in step 5:', error);
    return res.status(500).json({ error: 'Failed to activate employee account.' });
  }
}

/**
 * Step 6: Dispatch Welcoming credentials email
 */
async function step6(req, res) {
  const id = req.body.id || req.params.id;
  const { official_email } = req.body;
  // C-04 Fix: Do NOT accept plaintext password from the client.
  // The setup link is derived from the user's reset_token stored in DB.
  const isLocationAdmin = req.user.role_name === 'Location Admin';
  const myLocId = req.user.location_id;

  if (!id) {
    return res.status(400).json({ error: 'Onboarding ID is required.' });
  }

  if (!official_email) {
    return res.status(400).json({ error: 'Official corporate email address is required.' });
  }

  try {
    const request = await OnboardingRequest.findByPk(id);
    if (!request) {
      return res.status(404).json({ error: 'Onboarding request not found.' });
    }

    // Scoping check
    if (!hasLocationAccess(req.user, request.location_id)) {
      return res.status(403).json({ error: 'Unauthorized location action.' });
    }

    // Fetch the setup token from the newly created user's record
    const { User: UserModel } = require('../models');
    const newUser = await UserModel.findOne({ where: { email: official_email } });
    if (!newUser || !newUser.reset_token) {
      return res.status(400).json({ error: 'Setup link not found. Please complete Step 5 first.' });
    }

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const setupUrl = `${frontendUrl}/reset-password?token=${newUser.reset_token}`;

    // Send the setup link email — employee sets their own password
    const subject = `Welcome to the Team, ${request.name}! Set Up Your Corporate Account`;
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2>Welcome ${request.name},</h2>
        <p>We are excited to have you join our team in the <strong>${request.department}</strong> department!</p>
        <p>Your corporate account has been created. Please click the link below to set your own password and activate your account.</p>
        <p style="margin: 24px 0;">
          <a href="${setupUrl}" style="background:#16a34a;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">
            Set Up My Account
          </a>
        </p>
        <p>Your corporate email address is: <strong>${official_email}</strong></p>
        <p style="color:#888;font-size:12px;">This link will expire in 72 hours. If you did not request this, please contact IT support.</p>
        <p>Best Regards,<br>Onboarding Support Team</p>
      </div>
    `;

    const dispatched = await sendEmail({
      to: request.personal_email,
      subject,
      html: emailHtml
    });

    if (!dispatched) {
      return res.status(500).json({ error: 'Failed to route welcoming email through mail gateways.' });
    }

    await logAction({
      userId: req.user.id,
      action: 'ONBOARD_STEP6_NOTIFY',
      entityType: 'OnboardingRequest',
      entityId: request.id,
      details: `Sent account setup link email to ${request.personal_email}`,
      req
    });

    return res.json({
      message: 'Onboarding pipeline completed! Account setup email sent to employee.',
      request
    });

  } catch (error) {
    console.error('[step6] Error:', error.message);
    return res.status(500).json({ error: 'Failed to process notification transmission.' });
  }
}

/**
 * List IT Admin corporate email provisioning requests queue
 */
async function listEmailRequests(req, res) {
  try {
    const paginate = req.body.paginate !== false;
    const page = parseInt(req.body.page) || 1;
    const limit = Math.min(parseInt(req.body.limit) || 10, 200);
    const offset = (page - 1) * limit;

    let queryOptions = {
      include: [
        {
          model: OnboardingRequest,
          as: 'onboardingRequest',
          include: [{ model: Location, as: 'location' }]
        }
      ],
      order: [['id', 'DESC']]
    };

    let requests, total;
    if (paginate) {
      queryOptions.limit = limit;
      queryOptions.offset = offset;
      const result = await EmailCreationRequest.findAndCountAll(queryOptions);
      requests = result.rows;
      total = result.count;
    } else {
      requests = await EmailCreationRequest.findAll(queryOptions);
      total = requests.length;
    }

    return res.json({
      requests,
      pagination: paginate ? {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      } : null
    });
  } catch (error) {
    console.error('Error listing email requests:', error);
    return res.status(500).json({ error: 'Failed to load email request queue.' });
  }
}

/**
 * IT Admin approves/rejects corporate email
 */
async function processEmailRequest(req, res) {
  const id = req.body.id || req.params.id;
  const { status, remarks, suggested_email } = req.body; // status: 'approved' or 'rejected'

  if (!id) {
    return res.status(400).json({ error: 'Email Request ID is required.' });
  }

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Valid action status is required (approved/rejected).' });
  }

  try {
    const request = await EmailCreationRequest.findByPk(id);
    if (!request) {
      return res.status(404).json({ error: 'Email request record not found.' });
    }

    if (status === 'approved' && suggested_email && suggested_email !== request.suggested_email) {
      if (!suggested_email.includes('@')) {
        return res.status(400).json({ error: 'A valid corporate email format is required.' });
      }

      // Check duplicate in User table
      const emailTaken = await User.findOne({ where: { email: suggested_email } });
      if (emailTaken) {
        return res.status(409).json({ error: `Corporate email "${suggested_email}" is already in use by another active user.` });
      }

      // Check duplicate in other Email Requests table (excluding self)
      const { Op } = EmailCreationRequest.sequelize.Sequelize;
      const requestExists = await EmailCreationRequest.findOne({
        where: {
          suggested_email,
          id: { [Op.ne]: id }
        }
      });
      if (requestExists) {
        return res.status(409).json({ error: `An email request for "${suggested_email}" is already pending processing.` });
      }

      request.suggested_email = suggested_email;
    }

    request.status = status;
    request.processed_by = req.user.id;
    request.processed_at = new Date();
    request.remarks = remarks || null;
    await request.save();

    await logAction({
      userId: req.user.id,
      action: `EMAIL_REQ_${status.toUpperCase()}`,
      entityType: 'EmailCreationRequest',
      entityId: id,
      details: `IT Admin processed email request. Status: ${status}. Remarks: ${remarks}`,
      req
    });

    // Send email to General Admin when email request is approved (Assets and Email setup complete)
    if (status === 'approved') {
      const onboardingRequest = await OnboardingRequest.findByPk(request.onboarding_id, {
        include: [{ model: Location, as: 'location' }]
      });
      if (onboardingRequest) {
        // Fetch assigned assets
        const assets = await onboardingRequest.getAssets();
        const assetNames = assets.map(a => `${a.name} (${a.asset_tag})`).join(', ') || 'None';

        const host = req.get('host') || 'localhost:5003';
        const protocol = req.secure ? 'https' : 'http';
        const baseURL = `${protocol}://${host}`;

        const approvalSubject = `Onboarding Approval Required: ${onboardingRequest.name}`;
        const approvalHtml = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <h2 style="color: #0f172a; margin-top: 0;">Onboarding Approval Request</h2>
            <p>The onboarding setup is complete for <strong>${onboardingRequest.name}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
              <tr style="border-b: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold; color: #64748b; width: 40%;">Employee ID:</td><td style="padding: 8px 0; color: #334155;">${onboardingRequest.employee_id}</td></tr>
              <tr style="border-b: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold; color: #64748b;">Department/Designation:</td><td style="padding: 8px 0; color: #334155;">${onboardingRequest.department} / ${onboardingRequest.designation}</td></tr>
              <tr style="border-b: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold; color: #64748b;">Location:</td><td style="padding: 8px 0; color: #334155;">${onboardingRequest.location?.name || 'Global'}</td></tr>
              <tr style="border-b: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold; color: #64748b;">Corporate Email:</td><td style="padding: 8px 0; color: #334155; font-family: monospace; font-weight: bold;">${request.suggested_email}</td></tr>
              <tr style="border-b: 1px solid #e2e8f0;"><td style="padding: 8px 0; font-weight: bold; color: #64748b;">Assigned Assets:</td><td style="padding: 8px 0; color: #334155;">${assetNames}</td></tr>
            </table>

            <div style="margin: 30px 0; text-align: center;">
              <a href="${baseURL}/api/onboarding/email-action?id=${onboardingRequest.id}&decision=approve" style="display: inline-block; padding: 12px 24px; background-color: #059669; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; margin-right: 12px; font-size: 14px;">Approve</a>
              <a href="${baseURL}/api/onboarding/email-action?id=${onboardingRequest.id}&decision=reject" style="display: inline-block; padding: 12px 24px; background-color: #dc2626; color: white; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Reject</a>
            </div>
            
            <p style="color: #64748b; font-size: 12px; border-top: 1px solid #e2e8f0; padding-top: 15px; margin-bottom: 0;">
              This is an automated request from the Aux AssetCare Onboarding System.
            </p>
          </div>
        `;
        
        await sendEmail({
          to: 'admin@assetiq.com',
          subject: approvalSubject,
          html: approvalHtml
        });
      }
    }

    return res.json({
      message: `Email request status updated to "${status}" successfully.`,
      request
    });
  } catch (error) {
    console.error('Error processing email request:', error);
    return res.status(500).json({ error: 'Failed to process email request.' });
  }
}

/**
 * Handle Approve/Reject action links from Onboarding Approval Email
 */
async function processEmailAction(req, res) {
  const { id, decision } = req.query;

  if (!id || !decision) {
    return res.status(400).send('<h1>Invalid Link Parameters</h1>');
  }

  try {
    const onboardingRequest = await OnboardingRequest.findByPk(id, {
      include: [
        { model: Asset, as: 'assets' },
        { model: EmailCreationRequest, as: 'emailRequest' }
      ]
    });

    if (!onboardingRequest) {
      return res.status(404).send('<h1>Onboarding Request Not Found</h1>');
    }

    if (onboardingRequest.status === 'completed') {
      return res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
          <h1 style="color: #0f172a;">Already Actioned</h1>
          <p>This onboarding request has already been approved and completed.</p>
        </div>
      `);
    }

    if (decision === 'approve') {
      const emailReq = onboardingRequest.emailRequest;
      if (!emailReq || emailReq.status !== 'approved') {
        return res.status(400).send('<h1>Cannot Approve. Corporate email request must be approved first.</h1>');
      }

      const officialEmail = emailReq.suggested_email;

      // Generate credentials
      const plainPassword = 'Welcome@' + Math.floor(1000 + Math.random() * 9000);
      const crypto = require('crypto');
      const sha256Password = crypto.createHash('sha256').update(plainPassword).digest('hex');
      const hashedPassword = await bcrypt.hash(sha256Password, 10);

      // Run Transaction
      await OnboardingRequest.sequelize.transaction(async (t) => {
        // 1. Record OnboardingApproval log
        await OnboardingApproval.create({
          onboarding_id: onboardingRequest.id,
          approval_type: 'email',
          status: 'approved',
          approved_by: onboardingRequest.created_by || 1,
          approved_at: new Date(),
          remarks: 'Approved via automated email link'
        }, { transaction: t });

        // 2. Create active User
        const newUser = await User.create({
          employee_id: onboardingRequest.employee_id,
          name: onboardingRequest.name,
          email: officialEmail,
          phone: onboardingRequest.phone,
          password: hashedPassword,
          role_id: 4, // regular User role
          location_id: onboardingRequest.location_id,
          department: onboardingRequest.department,
          designation: onboardingRequest.designation,
          state: onboardingRequest.state,
          city: onboardingRequest.city,
          address: onboardingRequest.address,
          status: 'active'
        }, { transaction: t });

        // 3. Allocate physical assets
        if (onboardingRequest.assets && onboardingRequest.assets.length > 0) {
          for (const asset of onboardingRequest.assets) {
            await AssetAllocation.create({
              asset_id: asset.id,
              user_id: newUser.id,
              allocated_by: onboardingRequest.created_by || 1,
              notes: 'Onboarding automated allocation',
              status: 'active'
            }, { transaction: t });

            asset.status = 'allocated';
            await asset.save({ transaction: t });
          }
        }

        // 4. Mark Onboarding Request as complete (Step 6)
        onboardingRequest.step = 6;
        onboardingRequest.status = 'completed';
        await onboardingRequest.save({ transaction: t });
      });

      // Send credentials Welcome Email
      const subject = `Welcome to the Team, ${onboardingRequest.name}! Your Corporate Credentials`;
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <h2>Welcome ${onboardingRequest.name},</h2>
          <p>We are excited to have you join our team in the <strong>${onboardingRequest.department}</strong> department!</p>
          <p>Below are your official corporate account login credentials. Please log in and change your password immediately.</p>
          <table style="width: 100%; max-width: 500px; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">Official Email:</td>
              <td style="padding: 10px; border: 1px solid #ddd;">${officialEmail}</td>
            </tr>
            <tr>
              <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; background: #f9f9f9;">One-Time Password:</td>
              <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace;">${plainPassword}</td>
            </tr>
          </table>
          <p>Best Regards,<br>Onboarding Support Team</p>
        </div>
      `;

      await sendEmail({
        to: onboardingRequest.personal_email,
        subject,
        html: emailHtml
      });

      await logAction({
        userId: onboardingRequest.created_by || 1,
        action: 'ONBOARD_EMAIL_AUTO_COMPLETE',
        entityType: 'OnboardingRequest',
        entityId: onboardingRequest.id,
        details: `Onboarding auto-completed and credentials dispatched for ${onboardingRequest.name} via email approval.`,
        req
      });

      return res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
          <h1 style="color: #059669;">✓ Onboarding Approved Successfully!</h1>
          <p>User account has been activated, assets allocated, and credentials dispatched to the user's personal email (${onboardingRequest.personal_email}).</p>
          <p style="color: #6b7280; font-size: 14px;">You can close this window now.</p>
        </div>
      `);

    } else if (decision === 'reject') {
      onboardingRequest.status = 'rejected';
      await onboardingRequest.save();

      await OnboardingApproval.create({
        onboarding_id: onboardingRequest.id,
        approval_type: 'email',
        status: 'rejected',
        approved_by: onboardingRequest.created_by || 1,
        approved_at: new Date(),
        remarks: 'Rejected via automated email link'
      });

      await logAction({
        userId: onboardingRequest.created_by || 1,
        action: 'ONBOARD_EMAIL_AUTO_REJECT',
        entityType: 'OnboardingRequest',
        entityId: onboardingRequest.id,
        details: `Onboarding rejected via email link.`,
        req
      });

      return res.send(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 100px;">
          <h1 style="color: #dc2626;">✗ Onboarding Request Rejected</h1>
          <p>The onboarding request for ${onboardingRequest.name} has been rejected.</p>
          <p style="color: #6b7280; font-size: 14px;">You can close this window now.</p>
        </div>
      `);
    } else {
      return res.status(400).send('<h1>Invalid Decision Value</h1>');
    }

  } catch (error) {
    console.error('Error in email action processing:', error);
    return res.status(500).send(`<h1>Failed to process approval action: ${error.message}</h1>`);
  }
}

module.exports = {
  listOnboarding,
  getOnboarding,
  getNextEmployeeCode,
  step1,
  step2,
  step3,
  step4,
  step5,
  step6,
  listEmailRequests,
  processEmailRequest,
  processEmailAction
};
