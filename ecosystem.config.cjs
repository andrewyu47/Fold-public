module.exports = {
  apps: [
    {
      name: "fold",
      script: "npm",
      args: "start",
      cwd: __dirname,
      env: { NODE_ENV: "production", PORT: 3000 },
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
