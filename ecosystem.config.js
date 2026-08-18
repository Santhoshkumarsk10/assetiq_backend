module.exports = {
  apps: [
    {
      name: 'assetiq-backend',
      script: 'server.js',
      cwd: '/home/devteam/asset/assetiq_backend',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5003
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/devteam/asset/logs/error.log',
      out_file: '/home/devteam/asset/logs/out.log',
      merge_logs: true
    }
  ]
};
