module.exports = {
  apps: [
    {
      name: "bundles-v2",
      script: "server.js",
      cwd: "/var/www/bundles-v2",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};
