// Turns the aligner of Saktumiva 2.0 (Charles Li, GPL-3.0) into one classic script, because a page opened
// from disk cannot load ES modules and a Worker there can only start from a Blob.
// Usage: node tools/bundle-aligner.mjs <saktumiva checkout> app/vendor/saktumiva-aligner.js <commit>
import fs from 'node:fs'; import path from 'node:path';
const [, , srcDir, outFile, commit] = process.argv;
const seen = new Map();
const convert = (rel) => {
  if (seen.has(rel)) return; seen.set(rel, '');
  let s = fs.readFileSync(path.join(srcDir, rel), 'utf8');
  const after = [];
  const dep = (p) => { const r = path.normalize(path.join(path.dirname(rel), p)); if (!r.endsWith('fflate.mjs') && !r.endsWith('EwtsConverter.mjs')) convert(r); return JSON.stringify(r); };
  s = s.replace(/^\s*import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, (m, a, p) => `const ${a} = __r(${dep(p)});`);
  s = s.replace(/^\s*import\s+(\w+)\s+from\s+['"]([^'"]+)['"];?/gm, (m, a, p) => `const ${a} = __r(${dep(p)}).default;`);
  s = s.replace(/^\s*import\s*\{([\s\S]*?)\}\s*from\s+['"]([^'"]+)['"];?/gm, (m, a, p) => `const {${a.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+as\s+/g, ': ')}} = __r(${dep(p)});`);
  s = s.replace(/^\s*export\s+default\s+/gm, '__e.default = ');
  s = s.replace(/^\s*export\s*\{([\s\S]*?)\};?/gm, (m, a) => a.split(',').map((x) => x.trim()).filter(Boolean).map((x) => { const [n, as] = x.split(/\s+as\s+/); return `__e.${as || n} = ${n};`; }).join(' '));
  s = s.replace(/^\s*export\s+(function|class)\s+(\w+)/gm, (m, k, n) => { after.push(`__e.${n} = ${n};`); return `${k} ${n}`; });
  s = s.replace(/^\s*export\s+(const|let|var)\s+(\w+)/gm, (m, k, n) => { after.push(`__e.${n} = ${n};`); return `${k} ${n}`; });
  s = s.replace(/^\/\/# sourceMappingURL.*$/gm, '');
  seen.set(rel, `__m[${JSON.stringify(rel)}] = function (__e) {\n${s}\n${after.join('\n')}\n};\n`);
};
convert('lib/multialign.mjs');
const body = [...seen.values()].join('');
const out = `/* Generated from Saktumiva 2.0 by Charles Li (GPL-3.0), https://github.com/chchch/saktumiva, commit ${commit}.
   Made by tools/bundle-aligner.mjs. Do not edit by hand. */
window.ME = window.ME || {};
ME.collateEngineSource = function (global) {
  'use strict';
  const __m = {}, __c = {};
  const __r = (n) => { if (__c[n]) return __c[n]; if (!__m[n]) return (__c[n] = {}); const e = (__c[n] = {}); __m[n](e); return e; };
${body}
  global.CollateEngine = { MultiAligner: __r('lib/multialign.mjs').default };
};
`;
fs.writeFileSync(outFile, out); console.log('modules', [...seen.keys()].join(' '), '| bytes', out.length);
