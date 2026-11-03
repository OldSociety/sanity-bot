const { sourceFiles: collectSources } = require('../../services/winter/studies/source-files');
const fs = require('node:fs'),
  path = require('node:path'),
  assert = require('node:assert/strict'),
  crypto = require('node:crypto');
const { run, summarize } = require('./chapter-progression'),
  M = require('../../services/winter/studies/chapter-simulation');
function main() {
  const out = path.resolve(
    process.argv[2] || 'artifacts/winter-chapter-gate-comparison-2026-10-29'
  );
  if (fs.existsSync(out)) throw Error('Preserve old evidence.');
  fs.mkdirSync(out, { recursive: true });
  const results = [],
    summary = [],
    fire = M.defaults.experimentalFireCandidates[1];
  for (const s3Wins of [25, 0])
    for (const visitHours of [1, 4])
      for (const training of visitHours === 4 ? ['strength', 'balanced'] : ['strength']) {
        const rows = Array.from({ length: 32 }, (_, i) => ({
          ...run(1010001 + i, fire, visitHours, training, { s3Wins }),
          s3Wins
        }));
        assert.deepEqual(
          { ...run(1010001, fire, visitHours, training, { s3Wins }), s3Wins },
          rows[0]
        );
        results.push(...rows);
        const sum = { ...summarize(rows), s3Wins };
        summary.push(sum);
        console.log(
          JSON.stringify({
            s3Wins,
            visitHours,
            training,
            milestones: sum.milestones,
            atGolden: sum.atGolden,
            iceAtS3Purchase: sum.iceAtS3Purchase
          })
        );
      }
  const manifest = {};
  for (const file of collectSources([
    'config/winter/game/balance.json',
    'services/winter/studies/chapter-simulation.js',
    'scripts/winter/chapter-progression.js',
    'scripts/winter/chapter-gate-comparison.js'
  ])) {
    const b = fs.readFileSync(file),
      dest = path.join(out, 'model', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, b);
    manifest[file] = crypto.createHash('sha256').update(b).digest('hex');
  }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results));
  fs.writeFileSync(
    path.join(out, 'summary.json'),
    JSON.stringify(
      {
        status:
          'Experimental gate alternatives only. Do not change locked prices or promote these gate choices without owner selection.',
        manifest,
        histories: results.length,
        replays: summary.length,
        summary
      },
      null,
      2
    )
  );
}
if (require.main === module) main();
