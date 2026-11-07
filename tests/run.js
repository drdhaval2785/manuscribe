// Runs every test file in this folder, one after another, showing each check as it happens and a running count,
// with a line every 20 seconds while a file is still at work, and a limit on how long a file may take.
// Usage: node tests/run.js [name ...]   e.g. node tests/run.js stemma
//        node tests/run.js --all           also the long surveys (OCCASIONAL below)
//        MANUSCRIBE_TEST_LIMIT=600 node tests/run.js   (seconds a file may take; 300 by default)
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Long surveys, worth running when collation, normalisation or the fonts change, not every time: only with --all, or
// when named (node tests/run.js scripts).
const OCCASIONAL = ['t-scripts.js'];
const args = process.argv.slice(2);
const all = args.includes('--all');
const want = args.filter((a) => a !== '--all');
const files = fs.readdirSync(__dirname).filter((f) => /^t-.*\.js$/.test(f))
  .filter((f) => (want.length ? want.some((w) => f.includes(w)) : all || !OCCASIONAL.includes(f))).sort();
const left = want.length || all ? [] : OCCASIONAL.filter((f) => fs.existsSync(path.join(__dirname, f)));
if (left.length) console.log('(Left out, as surveys to run now and then: ' + left.join(', ') + '. Run them with --all, or by name.)');
const LIMIT = (+process.env.MANUSCRIBE_TEST_LIMIT || 300) * 1000;
const total = { pass: 0, fail: 0, skip: 0 };
const failed = [];
const stamp = () => new Date().toTimeString().slice(0, 8);

function runOne(f, k) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const mine = { pass: 0, fail: 0, skip: 0 };
    let last = '';
    console.log('[' + stamp() + '] ' + (k + 1) + '/' + files.length + ' ' + f);
    const child = spawn(process.execPath, [path.join(__dirname, f)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = '';
    let crashed = null;
    const onData = (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (/^\s+PASS /.test(line)) { mine.pass++; total.pass++; }
        else if (/^\s+FAIL /.test(line)) { mine.fail++; total.fail++; }
        else if (/^\s+SKIP /.test(line)) { mine.skip++; total.skip++; }
        if (line.trim()) last = line.trim().slice(0, 100);
        console.log(line);
        // a test that crashed may leave its browser open, which keeps it alive: end it
        if (/FAIL crashed/.test(line) && !crashed) { crashed = setTimeout(() => { console.log('  (ended: it crashed and did not exit)'); child.kill('SIGKILL'); }, 5000); }
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    const beat = setInterval(() => {
      console.log('    … ' + f + ' still running, ' + Math.round((Date.now() - t0) / 1000) + ' s: ' + mine.pass + ' passed, ' + mine.fail + ' failed so far; last: ' + (last || '(nothing yet)'));
    }, 20000);
    const limit = setTimeout(() => {
      console.log('  FAIL timed out after ' + LIMIT / 1000 + ' s; the last line was: ' + (last || '(nothing)'));
      total.fail++; mine.fail++;
      child.kill('SIGKILL');
    }, LIMIT);
    child.on('exit', (code) => {
      clearInterval(beat); clearTimeout(limit); clearTimeout(crashed);
      if (buf.trim()) onData('\n');
      console.log('  (' + f + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; so far in all: ' + total.pass + ' passed, ' + total.fail + ' failed' + (total.skip ? ', ' + total.skip + ' skipped' : '') + ')\n');
      if (code !== 0 || mine.fail) failed.push(f);
      resolve();
    });
  });
}

(async () => {
  for (let k = 0; k < files.length; k++) await runOne(files[k], k);
  console.log((failed.length ? 'FAILED: ' + failed.join(', ') : 'All ' + files.length + ' test files passed.') + ' ' + total.pass + ' checks passed, ' + total.fail + ' failed' + (total.skip ? ', ' + total.skip + ' skipped' : '') + '.');
  process.exitCode = failed.length ? 1 : 0;
})();
