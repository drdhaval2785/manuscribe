// Writes the list of the app's files into app/sw.js, with a version made from their contents, and the version of
// Manuscribe into app/version.json: run it after changing any file of the app.
//
//   node tools/precache.mjs           write them
//   node tools/precache.mjs --check   only say whether they are up to date (exit code 1 if not)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const APP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app');
const SKIP = new Set(['sw.js', '.DS_Store']);
const files = [];
(function walk(dir) {
  for (const n of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, n);
    if (SKIP.has(n) || n.startsWith('.')) continue;
    if (fs.statSync(p).isDirectory()) walk(p); else files.push(path.relative(APP, p).split(path.sep).join('/'));
  }
})(APP);

const version = /ME\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(APP, 'js', 'util.js'), 'utf8'))[1];
const versionJson = JSON.stringify({ version }, null, 2) + '\n';
if (!files.includes('version.json')) files.push('version.json');
files.sort();
// the contents of every file (version.json as it is to be written)
const hash = crypto.createHash('sha256');
for (const f of files) { hash.update(f + '\0'); hash.update(f === 'version.json' ? versionJson : fs.readFileSync(path.join(APP, f))); }
const stamp = version + '-' + hash.digest('hex').slice(0, 10);

const block = '// precache:start (written by tools/precache.mjs)\n'
  + 'const VERSION = ' + JSON.stringify(stamp) + ';\n'
  + 'const FILES = [\n  \'./\',\n' + files.map((f) => '  ' + JSON.stringify(f) + ',').join('\n') + '\n];\n'
  + '// precache:end';
const swPath = path.join(APP, 'sw.js');
const sw = fs.readFileSync(swPath, 'utf8');
const next = sw.replace(/\/\/ precache:start[\s\S]*?\/\/ precache:end/, block);
const vPath = path.join(APP, 'version.json');
const same = next === sw && fs.existsSync(vPath) && fs.readFileSync(vPath, 'utf8') === versionJson;

if (process.argv.includes('--check')) {
  if (same) { console.log('up to date: ' + stamp + ', ' + files.length + ' files'); process.exit(0); }
  console.log('out of date: run node tools/precache.mjs'); process.exit(1);
}
fs.writeFileSync(swPath, next);
fs.writeFileSync(vPath, versionJson);
console.log((same ? 'already up to date: ' : 'written: ') + stamp + ', ' + files.length + ' files');
