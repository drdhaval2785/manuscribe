// Runs every test file in this folder, one after another, and says which failed.
// Usage: node tests/run.js [name ...]   e.g. node tests/run.js stemma
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const want = process.argv.slice(2);
const files = fs.readdirSync(__dirname).filter((f) => /^t-.*\.js$/.test(f)).filter((f) => !want.length || want.some((w) => f.includes(w))).sort();
const failed = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(__dirname, f)], { stdio: 'inherit', timeout: 15 * 60 * 1000 });
  console.log('  (' + f + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)\n');
  if (r.status !== 0) failed.push(f);
}
console.log(failed.length ? 'FAILED: ' + failed.join(', ') : 'All ' + files.length + ' test files passed.');
process.exitCode = failed.length ? 1 : 0;
