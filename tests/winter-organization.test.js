const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { sourceFiles } = require('../services/winter/studies/source-files');
const M = require('../services/winter/game/game');

test('a frozen study includes shared arithmetic/configuration and loads independently of the current tree', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'winter-study-copy-'));
  t.after(() => {
    const target = fs.realpathSync(root);
    assert.equal(path.dirname(target), fs.realpathSync(os.tmpdir()));
    assert(path.basename(target).startsWith('winter-study-copy-'));
    fs.rmSync(target, { recursive: true, force: true });
  });
  const files = sourceFiles(['services/winter/studies/early-progression.js']);
  assert(files.includes('services/winter/balance.js'));
  assert(files.includes('services/winter/snowman-scaling.js'));
  assert(files.includes('config/winter/studies/early-progression.json'));
  for (const file of files) {
    const target = path.join(root, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.resolve(__dirname, '..', file), target);
  }
  const copied = require(path.join(root, 'services/winter/studies/early-progression.js'));
  const current = require('../services/winter/studies/early-progression');
  assert.deepEqual(copied.fresh(), current.fresh());
  assert.equal(copied.passiveRate(25), current.passiveRate(25));
});

test('current game imports no offline study, and S4 has one editable price', () => {
  const files = sourceFiles(['services/winter/game/game.js']);
  assert(!files.some(file => file.startsWith('services/winter/studies/') && !file.endsWith('source-files.js')));
  assert.equal(M.s4.priceDiamonds, M.rules.snowmen[3].snowPrice / M.rules.diamondSnowCost);
  const requirements = require('../config/winter/game/snowman-4.json');
  assert.equal(requirements.priceDiamonds, undefined);
  assert.equal(M.s4.priceDiamonds, 8000);
});
