const { checkAndRunScheduledReports } = require('../controllers/reportController');

function startReportScheduleJob() {
  // Run immediately on start
  checkAndRunScheduledReports().catch(console.error);

  // Run every 1 minute
  setInterval(() => {
    checkAndRunScheduledReports().catch(console.error);
  }, 60 * 1000);

  console.log('[CRON] Report scheduler checking job started (Every 1 Minute).');
}

module.exports = { startReportScheduleJob };
