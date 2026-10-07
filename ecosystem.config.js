module.exports = {
  apps: [
    {
      name: "payday-backend",
      script: "dist/src/main.js",
 
      // Cluster mode
      instances: 2,
      exec_mode: "cluster",
 
      // Restart settings
      autorestart: true,
      watch: false,
      min_uptime: "10s",
      max_restarts: 50,
      restart_delay: 5000,
 
      // Memory management
      max_memory_restart: "1G",
 
      env: {
        PORT: 4002
      }
    }
  ]
};