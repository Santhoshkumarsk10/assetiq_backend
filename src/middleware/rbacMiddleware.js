/**
 * RBAC Scoping & Location Isolation Middleware
 */

/**
 * Require a specific permission from the token payload
 */
function requirePermission(requiredPermission) {
  return (req, res, next) => {
    if (!req.user || !req.user.permissions) {
      return res.status(401).json({ error: 'Unauthorized. Permissions not loaded.' });
    }

    if (!req.user.permissions.includes(requiredPermission)) {
      return res.status(403).json({ 
        error: `Forbidden. You do not have the required permission: "${requiredPermission}".` 
      });
    }

    next();
  };
}

/**
 * Checks if the logged-in user can access/modify a resource at a given location_id
 */
function hasLocationAccess(user, targetLocationId) {
  if (!user) return false;

  // Global administrative roles are not bound by location scoping
  if (['Super Admin', 'Admin', 'IT Admin'].includes(user.role_name)) {
    return true;
  }

  // Location Admins are strictly scoped to their assigned facility
  if (user.role_name === 'Location Admin') {
    return parseInt(user.location_id) === parseInt(targetLocationId);
  }

  return false;
}

module.exports = {
  requirePermission,
  hasLocationAccess
};
