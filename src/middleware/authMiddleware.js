const jwt = require('jsonwebtoken');
const { User, Role, Permission, Location } = require('../models');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'assetiq-super-secret-jwt-key-2026!@#';

async function authenticate(req, res, next) {
  let token = null;

  // 1. Extract from Authorization Header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } 
  // 2. Extract from cookies as fallback
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token is missing.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Fetch latest user status and permissions from DB
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
      return res.status(403).json({ error: 'Your account is currently inactive.' });
    }

    // Attach user profile with permission array
    const permissions = user.role && user.role.permissions 
      ? user.role.permissions.map(p => p.name) 
      : [];

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role_name: user.role ? user.role.name : 'User',
      location_id: user.location_id,
      location_name: user.location ? user.location.name : null,
      permissions
    };

    next();
  } catch (error) {
    console.error('[AUTH MIDDLEWARE ERROR]', error.message);
    return res.status(401).json({ error: 'Access token is invalid or expired.' });
  }
}

module.exports = { authenticate };
