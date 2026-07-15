const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { User, Role, Permission, Location } = require('../models');
const { logAction } = require('../utils/auditLogger');
const { authenticator } = require('otplib');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { sendEmail } = require('../utils/mail');
const {
  isValidEmail,
  isValidPhone,
  isValidName,
  isValidSha256,
  isValidResetToken
} = require('../utils/validators');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'assetiq-super-secret-jwt-key-2026!@#';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '15m';

function getExpiryMs(expiryStr) {
  const match = String(expiryStr).match(/^(\d+)([smhd])$/i);
  if (!match) return 15 * 60 * 1000;
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  switch (unit) {
    case 's': return value * 1000;
    case 'm': return value * 60 * 1000;
    case 'h': return value * 60 * 60 * 1000;
    case 'd': return value * 24 * 60 * 60 * 1000;
    default: return 15 * 60 * 1000;
  }
}

/**
 * Handle API Login
 */
async function login(req, res) {
  const { loginIdentifier, password } = req.body;

  if (!loginIdentifier || !password) {
    return res.status(400).json({ error: 'Email/Phone and Password are required.' });
  }

  if (!isValidEmail(loginIdentifier) && !isValidPhone(loginIdentifier)) {
    return res.status(400).json({ error: 'Invalid email or phone format.' });
  }

  if (!isValidSha256(password)) {
    return res.status(400).json({ error: 'Invalid credentials format.' });
  }

  try {
    // Find user by email or phone
    const user = await User.findOne({
      where: {
        [User.sequelize.Sequelize.Op.or]: [
          { email: loginIdentifier },
          { phone: loginIdentifier }
        ]
      },
      include: [
        {
          model: Role,
          as: 'role',
          include: [{ model: Permission, as: 'permissions' }]
        },
        {
          model: Location,
          as: 'location'
        }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is inactive. Please contact support.' });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    // Check if MFA is enabled
    if (user.mfa_enabled) {
      const tempToken = jwt.sign({ id: user.id, mfaPending: true }, JWT_SECRET, { expiresIn: '5m' });
      
      if (!user.mfa_secret) {
        // Needs initial setup
        const secret = authenticator.generateSecret();
        const keyuri = authenticator.keyuri(user.email, 'Aux AssetCare', secret);
        const qrCode = await qrcode.toDataURL(keyuri);
        return res.json({
          mfaRequired: true,
          mfaSetup: true,
          qrCode,
          secret,
          tempToken
        });
      } else {
        // Simple OTP verification prompt
        return res.json({
          mfaRequired: true,
          mfaSetup: false,
          tempToken
        });
      }
    }

    // Prepare token payload
    const permissions = user.role && user.role.permissions 
      ? user.role.permissions.map(p => p.name) 
      : [];

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role_name: user.role ? user.role.name : 'User',
      location_id: user.location_id,
      permissions
    };

    // Sign JWT
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    // Set cookie for browser sessions
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: getExpiryMs(JWT_EXPIRY)
    });

    // Write audit log entry
    await logAction({
      userId: user.id,
      action: 'USER_LOGIN_API',
      entityType: 'User',
      entityId: user.id,
      details: `Successful API login for user: ${user.email}`,
      req
    });

    // Return JSON response
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role ? user.role.name : 'User',
        location: user.location ? user.location.name : null,
        location_id: user.location_id,
        permissions
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
}

/**
 * Handle API Logout
 */
async function logout(req, res) {
  try {
    if (req.user) {
      await logAction({
        userId: req.user.id,
        action: 'USER_LOGOUT_API',
        entityType: 'User',
        entityId: req.user.id,
        details: `Successful API logout for user: ${req.user.email}`,
        req
      });
    }

    res.clearCookie('token');
    return res.json({ message: 'Logout successful' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ error: 'Internal server error during logout.' });
  }
}

/**
 * Handle GET current session profile (me)
 */
async function me(req, res) {
  return res.json({ user: req.user });
}

/**
 * Verify MFA Challenge (during login setup/verification)
 */
async function verifyMfa(req, res) {
  const { tempToken, otp, mfaSecret } = req.body;

  if (!tempToken || !otp) {
    return res.status(400).json({ error: 'Temporary token and OTP code are required.' });
  }

  try {
    const decoded = jwt.verify(tempToken, JWT_SECRET);
    if (!decoded.mfaPending) {
      return res.status(401).json({ error: 'Invalid authentication context.' });
    }

    const user = await User.findByPk(decoded.id, {
      include: [
        {
          model: Role,
          as: 'role',
          include: [{ model: Permission, as: 'permissions' }]
        },
        {
          model: Location,
          as: 'location'
        }
      ]
    });

    if (!user) {
      return res.status(401).json({ error: 'User account not found.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Your account is inactive. Please contact support.' });
    }

    // Determine target secret
    let secretToVerify = user.mfa_secret;
    const isFirstSetup = !user.mfa_secret;

    if (isFirstSetup) {
      if (!mfaSecret) {
        return res.status(400).json({ error: 'MFA setup secret is missing.' });
      }
      secretToVerify = mfaSecret;
    }

    const isValid = authenticator.verify({ token: otp, secret: secretToVerify });
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid authenticator code. Please try again.' });
    }

    if (isFirstSetup) {
      user.mfa_secret = mfaSecret;
      await user.save();
    }

    // Prepare token payload
    const permissions = user.role && user.role.permissions 
      ? user.role.permissions.map(p => p.name) 
      : [];

    const tokenPayload = {
      id: user.id,
      email: user.email,
      role_name: user.role ? user.role.name : 'User',
      location_id: user.location_id,
      permissions
    };

    // Sign JWT
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: JWT_EXPIRY });

    // Set cookie for browser sessions
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: getExpiryMs(JWT_EXPIRY)
    });

    // Write audit log entry
    await logAction({
      userId: user.id,
      action: 'USER_LOGIN_MFA_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      details: `Successful MFA login for user: ${user.email}`,
      req
    });

    // Return JSON response
    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role ? user.role.name : 'User',
        location: user.location ? user.location.name : null,
        location_id: user.location_id,
        permissions
      }
    });

  } catch (error) {
    console.error('MFA verification error:', error);
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'MFA session expired. Please log in again.' });
    }
    return res.status(500).json({ error: 'Internal server error during MFA verification.' });
  }
}

/**
 * Request Password Reset (Forgot Password)
 */
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Invalid email format.' });
  }

  try {
    const user = await User.findOne({ where: { email } });
    if (!user) {
      // To prevent user enumeration, return 200 even if the user isn't found
      return res.json({ message: 'If that email exists in our system, a password reset link has been sent.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This user account is inactive.' });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');
    const expiry = new Date(Date.now() + 3600000); // 1 hour

    user.reset_token = token;
    user.reset_token_expiry = expiry;
    await user.save();

    // Prepare email content
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    const mailHtml = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #0f172a;">Reset Your Aux AssetCare Password</h2>
        <p style="color: #475569;">You are receiving this email because you requested a password reset for your Aux AssetCare account.</p>
        <p style="color: #475569;">Click the button below to reset your password. This link is valid for 1 hour.</p>
        <div style="margin: 24px 0;">
          <a href="${resetUrl}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #64748b; font-size: 12px;">If you did not request a password reset, you can safely ignore this email.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject: 'Aux AssetCare Password Reset Request',
      html: mailHtml
    });

    await logAction({
      userId: user.id,
      action: 'USER_PASSWORD_RESET_REQUEST',
      entityType: 'User',
      entityId: user.id,
      details: `Password reset requested for email: ${user.email}`,
      req
    });

    return res.json({ message: 'If that email exists in our system, a password reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Internal server error processing request.' });
  }
}

/**
 * Reset Password using Token
 */
async function resetPassword(req, res) {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token and new password are required.' });
  }

  if (!isValidResetToken(token)) {
    return res.status(400).json({ error: 'Invalid or expired password reset token.' });
  }

  if (!isValidSha256(newPassword)) {
    return res.status(400).json({ error: 'Invalid password format.' });
  }

  try {
    const { Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        reset_token: token,
        reset_token_expiry: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired password reset token.' });
    }

    if (user.status !== 'active') {
      return res.status(403).json({ error: 'This user account is inactive.' });
    }

    // Hash and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.reset_token = null;
    user.reset_token_expiry = null;
    await user.save();

    await logAction({
      userId: user.id,
      action: 'USER_PASSWORD_RESET_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      details: `Password reset successfully via token for user: ${user.email}`,
      req
    });

    return res.json({ message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Internal server error resetting password.' });
  }
}

/**
 * Change Password (Authenticated)
 */
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (!isValidSha256(currentPassword) || !isValidSha256(newPassword)) {
    return res.status(400).json({ error: 'Invalid password format.' });
  }

  try {
    const user = await User.findByPk(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid current password.' });
    }

    // Hash and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    await logAction({
      userId: user.id,
      action: 'USER_PASSWORD_CHANGE_SUCCESS',
      entityType: 'User',
      entityId: user.id,
      details: `Password changed successfully for user: ${user.email}`,
      req
    });

    return res.json({ message: 'Password has been updated successfully.' });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Internal server error changing password.' });
  }
}

/**
 * Update Profile Details (Authenticated)
 */
async function updateProfile(req, res) {
  const { name, phone } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  if (!isValidName(name)) {
    return res.status(400).json({ error: 'Name must be between 2 and 100 characters, containing only letters, spaces, hyphens, and apostrophes.' });
  }

  if (phone && !isValidPhone(phone)) {
    return res.status(400).json({ error: 'Invalid contact phone format. Please use standard characters (+, digits, spaces, hyphens).' });
  }

  try {
    const user = await User.findByPk(req.user.id, {
      include: [
        {
          model: Role,
          as: 'role',
          include: [{ model: Permission, as: 'permissions' }]
        },
        {
          model: Location,
          as: 'location'
        }
      ]
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    // Check if phone is being changed and is already taken
    if (phone && phone !== user.phone) {
      const existingPhone = await User.findOne({ where: { phone } });
      if (existingPhone && existingPhone.id !== user.id) {
        return res.status(400).json({ error: 'This contact phone number is already registered to another user.' });
      }
    }

    user.name = name.trim();
    user.phone = phone || null;
    await user.save();

    await logAction({
      userId: user.id,
      action: 'USER_PROFILE_UPDATE',
      entityType: 'User',
      entityId: user.id,
      details: `Profile details updated for user: ${user.email}`,
      req
    });

    const permissions = user.role && user.role.permissions 
      ? user.role.permissions.map(p => p.name) 
      : [];

    return res.json({
      message: 'Profile updated successfully.',
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role ? user.role.name : 'User',
        location: user.location ? user.location.name : null,
        location_id: user.location_id,
        permissions
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({ error: 'Internal server error updating profile.' });
  }
}

module.exports = {
  login,
  logout,
  me,
  verifyMfa,
  forgotPassword,
  resetPassword,
  changePassword,
  updateProfile
};
