// pm2 config: `npm run build` once, then `pm2 start ecosystem.config.js`
module.exports = {
  apps: [{
    name: 'claude-usage',
    script: 'node_modules/next/dist/bin/next',
    args: 'start -p 4747 -H 127.0.0.1', // -H 0.0.0.0 to reach it from other devices
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      // CLAUDE_HOME: 'C:\\Users\\you\\.claude',   // override if needed (default ~/.claude)
      RESCAN_SECONDS: 30,                         // re-check transcript files for changes at most this often
    },
    autorestart: true,
    watch: false,
    max_memory_restart: '600M',
  }],
};
