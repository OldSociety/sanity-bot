const fs = require('node:fs'), path = require('node:path')
process.env.PM2_HOME = 'C:/Users/headm/.pm2'
const pm2 = require('C:/Users/headm/AppData/Roaming/npm/node_modules/pm2')
const mode = process.argv[2]
const prefix = process.argv[3] === 'revision' ? 'revision-' : ''
if (!['before', 'after', 'reload', 'reload-production', 'save'].includes(mode)) throw Error('Expected before, after, reload, reload-production or save')
const invoke = (fn, ...args) => new Promise((resolve, reject) => fn.call(pm2, ...args, (error, value) => error ? reject(error) : resolve(value)))
async function main() {
  await invoke(pm2.connect)
  try {
    if (mode === 'reload' || mode === 'reload-production') {
      const environment = mode === 'reload' ? 'development' : 'production', name = `SB-${environment}`
      const list = await invoke(pm2.list), dev = list.find(row => row.name === name)
      if (!dev || dev.pm2_env.NODE_ENV !== environment || path.resolve(dev.pm2_env.pm_cwd) !== path.resolve(__dirname, '../..')) throw Error('Unexpected process target')
      await invoke(pm2.reload, name); console.log(`Reloaded ${name} only`); return
    }
    if (mode === 'save') { await invoke(pm2.dump); console.log('PM2 process list saved'); return }
    const rows = (await invoke(pm2.list)).filter(row => ['SB-development', 'SB-production'].includes(row.name))
    const report = { at: new Date().toISOString(), processes: rows.map(row => {
      const error = fs.statSync(row.pm2_env.pm_err_log_path)
      const outSize = fs.statSync(row.pm2_env.pm_out_log_path).size, outStart = Math.max(0, outSize - 65536)
      const output = Buffer.alloc(outSize - outStart), fd = fs.openSync(row.pm2_env.pm_out_log_path, 'r')
      try { fs.readSync(fd, output, 0, output.length, outStart) } finally { fs.closeSync(fd) }
      const lines = output.toString('utf8').split(/\r?\n/)
      const baseline = mode === 'after' ? JSON.parse(fs.readFileSync(path.join(__dirname, `${prefix}before-processes.json`))).processes.find(item => item.name === row.name) : null
      return { name: row.name, status: row.pm2_env.status, environment: row.pm2_env.NODE_ENV, pid: row.pid,
        restarts: row.pm2_env.restart_time, cwd: row.pm2_env.pm_cwd, startedAt: new Date(row.pm2_env.pm_uptime).toISOString(),
        errorBytes: error.size, lastErrorWrite: error.mtime.toISOString(),
        outBytes: outSize, freshReady: baseline ? output.subarray(Math.max(0, baseline.outBytes - outStart)).toString('utf8').includes('Ready! Logged in') : undefined,
        readyLines: lines.filter(line => /Environment:|Ready! Logged in/.test(line)).slice(-2) }
    }) }
    fs.writeFileSync(path.join(__dirname, `${prefix}${mode}-processes.json`), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally { pm2.disconnect() }
}
main().catch(error => { console.error(error.message); pm2.disconnect(); process.exitCode = 1 })
