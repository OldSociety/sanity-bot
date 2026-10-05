// ecosystem.config.js

const SUFFIX = process.argv.indexOf('--env') === -1 ? '' :
      '-' + process.argv[process.argv.indexOf('--env')+1]

module.exports = {
    apps: [
        {
            name: 'SB' + SUFFIX,
            script: 'app.js',
            cwd: SUFFIX === '-production'
                ? require('node:path').join(__dirname, '.runtime', 'production')
                : __dirname,
            env: {
                NODE_ENV: 'development',
                PORT: 3000
            },
            env_production: {
                NODE_ENV: 'production',
                PORT: 3001
            },
            env_development: {
                NODE_ENV: 'development',
                PORT: 3000
            }
        }
    ]
}
