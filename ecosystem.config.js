// One source folder, two explicit environments and separate SQLite databases.
module.exports = {
  apps: [
    {
      name: 'SB-development',
      script: 'app.js',
      cwd: __dirname,
      env: { NODE_ENV: 'development', PORT: 3000 },
    },
    {
      name: 'SB-production',
      script: 'app.js',
      cwd: __dirname,
      env: { NODE_ENV: 'production', PORT: 3001 },
    },
  ],
}
