// Makes app/vendor/harfbuzz.wasm.js from harfbuzzjs (MIT, https://github.com/harfbuzz/harfbuzzjs): the WebAssembly
// as base64 in a classic script, since a page opened from disk cannot fetch a .wasm file.
//
//   npm pack harfbuzzjs@1.6.4 && tar xzf harfbuzzjs-1.6.4.tgz
//   node tools/bundle-harfbuzz.mjs package 1.6.4
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const [dir, version] = process.argv.slice(2);
if (!dir || !version) { console.error('usage: node tools/bundle-harfbuzz.mjs <unpacked harfbuzzjs folder> <version>'); process.exit(1); }
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wasm = fs.readFileSync(path.join(dir, 'dist', 'harfbuzz.wasm'));
const licence = fs.readFileSync(path.join(dir, 'LICENSE'), 'utf8').replace(/\*\//g, '* /');
const sha = crypto.createHash('sha256').update(wasm).digest('hex');
fs.writeFileSync(path.join(ROOT, 'app/vendor/harfbuzz.wasm.js'),
  '/* HarfBuzz text shaping engine, compiled to WebAssembly by the harfbuzzjs project, version ' + version + ',\n'
  + '   https://github.com/harfbuzz/harfbuzzjs; dist/harfbuzz.wasm, SHA-256 ' + sha + '.\n'
  + '   Made by tools/bundle-harfbuzz.mjs. Do not edit by hand.\n\n' + licence + '\n'
  + '   HarfBuzz itself is under the "Old MIT" licence: https://github.com/harfbuzz/harfbuzz/blob/main/COPYING */\n'
  + 'window.ME = window.ME || {};\nME.HB_WASM = "' + wasm.toString('base64') + '";\n');
console.log('app/vendor/harfbuzz.wasm.js: ' + wasm.length + ' bytes of WebAssembly, SHA-256 ' + sha);
