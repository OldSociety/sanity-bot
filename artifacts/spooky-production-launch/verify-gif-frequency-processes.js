const fs = require('fs'), path = require('path'); let input = ''
process.stdin.setEncoding('utf8'); process.stdin.on('data', value => input += value)
process.stdin.on('end', () => {
  const rows = JSON.parse(input).filter(row => ['SB-development', 'SB-production'].includes(row.name))
  const processes = rows.map(row => ({ name: row.name, status: row.pm2_env.status, environment: row.pm2_env.NODE_ENV,
    restarts: row.pm2_env.restart_time, pid: row.pid, cwd: row.pm2_env.pm_cwd, startedAt: new Date(row.pm2_env.pm_uptime).toISOString() }))
  const logs = rows.map(row => {
    const error = fs.statSync(row.pm2_env.pm_err_log_path), out = fs.statSync(row.pm2_env.pm_out_log_path)
    const lines = fs.readFileSync(row.pm2_env.pm_out_log_path, 'utf8').split(/\r?\n/)
    return { name: row.name, errorBytes: error.size, lastErrorWrite: error.mtime.toISOString(), lastOutputWrite: out.mtime.toISOString(),
      readyLines: lines.filter(line => /Environment:|Ready! Logged in/.test(line)).slice(-2) }
  })
  const report = { at: new Date().toISOString(), branch: 'feature/S-1-spooky', configVersion: require('../../config/spooky-2026.json').version, processes, logs }
  fs.writeFileSync(path.join(__dirname, 'gif-frequency-process-verification.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (processes.length !== 2 || processes.some(row => row.status !== 'online' || row.cwd !== path.resolve(__dirname, '../..'))) process.exitCode = 1
})

