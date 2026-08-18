const { checkAndMarkExpiredLicenses } = require('../controllers/licenseController');

function startLicenseExpiryJob() {
  // Run immediately on start
  checkAndMarkExpiredLicenses().catch(console.error);

  // Run every 1 hour
  setInterval(() => {
    checkAndMarkExpiredLicenses().catch(console.error);
  }, 60 * 60 * 1000);

  console.log('[CRON] License expiry checking job started (Hourly).');
}

module.exports = { startLicenseExpiryJob };
