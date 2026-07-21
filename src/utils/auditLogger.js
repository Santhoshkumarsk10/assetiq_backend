const { AuditLog } = require('../models');

async function logAction({ userId, action, entityType, entityId, details, req }) {
  try {
    let ipAddress = '127.0.0.1';
    if (req) {
      // req.ip honours the Express 'trust proxy' setting, preventing X-Forwarded-For spoofing
      ipAddress = req.ip || req.socket.remoteAddress || '127.0.0.1';
      if (ipAddress === '::1') ipAddress = '127.0.0.1';
    }

    await AuditLog.create({
      user_id: userId || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || null,
      ip_address: ipAddress
    });
  } catch (error) {
    console.error('[AUDIT LOGGER ERROR] Failed to write audit log entry:', error);
  }
}

module.exports = { logAction };
