// Include local JS/JSON dependencies when freezing a new offline study.
// This avoids reports that copy a model but omit its shared arithmetic/config.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../../..');

function sourceFiles(entries) {
  const found = new Set();
  function visit(relative) {
    const absolute = path.resolve(root, relative);
    if (!absolute.startsWith(root + path.sep)) throw Error('Study input is outside the project.');
    const file = path.relative(root, absolute).split(path.sep).join('/');
    if (found.has(file)) return;
    if (!fs.existsSync(absolute)) throw Error(`Study source is missing: ${file}`);
    found.add(file);
    if (!file.endsWith('.js')) return;
    const text = fs.readFileSync(absolute, 'utf8');
    for (const match of text.matchAll(/require\((['"])(\.[^'"\r\n]+)\1\)/g)) {
      let target = path.resolve(path.dirname(absolute), match[2]);
      if (!path.extname(target)) target += '.js';
      if (!/\.(js|json)$/.test(target)) continue;
      visit(path.relative(root, target));
    }
  }
  for (const file of entries) visit(file);
  return [...found];
}
module.exports = { sourceFiles };
