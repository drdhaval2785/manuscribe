// Makes the downloadable copy of Manuscribe: dist/Manuscribe.zip, one folder "Manuscribe" holding Manuscribe.html
// (to double-click), app/, LICENSE, README.md and "Start here.txt". Used by the Release workflow
// (.github/workflows/release.yml) for each version tagged, and by tests/t-package.js.
//
//   node tools/package.mjs [folder for the zip, dist]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'dist'));
const version = /ME\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'app', 'js', 'util.js'), 'utf8'))[1];
// where Manuscribe is published (app/js/site.js)
const home = /home: '([^']+)'/.exec(fs.readFileSync(path.join(ROOT, 'app', 'js', 'site.js'), 'utf8'))[1];

const START = `Manuscribe ${version}
==========

1. Unzip this file first. On Windows: right-click Manuscribe.zip and choose "Extract All".
   (Opened inside the zip without unzipping, Manuscribe cannot find its files.)

2. Open the Manuscribe folder and double-click Manuscribe.html. It opens in your web browser.
   Chrome or Edge is best tested.

3. The first time you work in a script that needs a font of its own (Devanagari, for one), be
   connected to the internet once: the font is fetched and then kept.

Your work is kept by your browser, on this computer. Nothing is uploaded. Save a backup file now
and then (Ctrl+S, or Cmd+S on a Mac): clearing the browser's data deletes your work, and a backup
file also takes your work to another computer.

Use the same browser each time: each browser keeps its own work.

When a newer version is out, Manuscribe says so (when you are online). Download it, and unzip it
in place of this folder, so that it opens from the same place: your work stays in the browser.

With the internet, Manuscribe also runs from its website, and can be installed from there:
  ${home}

Manuscribe is free software, under the GNU General Public License 3.0 (LICENSE).
`;

// the files, under one folder
const entries = [];
const add = (name, data) => entries.push({ name: 'Manuscribe/' + name, data: Buffer.isBuffer(data) ? data : Buffer.from(data) });
(function walk(dir, rel) {
  for (const n of fs.readdirSync(dir).sort()) {
    if (n.startsWith('.')) continue;
    const p = path.join(dir, n), r = rel ? rel + '/' + n : n;
    if (fs.statSync(p).isDirectory()) walk(p, r); else add(r, fs.readFileSync(p));
  }
})(path.join(ROOT, 'app'), 'app');
for (const f of ['Manuscribe.html', 'LICENSE', 'README.md']) add(f, fs.readFileSync(path.join(ROOT, f)));
add('Start here.txt', START.replace(/\n/g, '\r\n'));

// a ZIP file, deflated, with nothing but what every unzip reads
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const now = new Date();
const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
const parts = [], central = [];
let offset = 0;
for (const e of entries) {
  const name = Buffer.from(e.name, 'utf8');
  const packed = zlib.deflateRawSync(e.data, { level: 9 });
  const crc = crc32(e.data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt16LE(dosTime, 10); local.writeUInt16LE(dosDate, 12); local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
  parts.push(local, name, packed);
  const c = Buffer.alloc(46);
  c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(0x0314, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(8, 10);
  c.writeUInt16LE(dosTime, 12); c.writeUInt16LE(dosDate, 14); c.writeUInt32LE(crc, 16); c.writeUInt32LE(packed.length, 20); c.writeUInt32LE(e.data.length, 24);
  c.writeUInt16LE(name.length, 28); c.writeUInt32LE((0o100644 << 16) >>> 0, 38); c.writeUInt32LE(offset, 42);
  central.push(c, name);
  offset += 30 + name.length + packed.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
fs.mkdirSync(OUT, { recursive: true });
const zip = path.join(OUT, 'Manuscribe.zip');
fs.writeFileSync(zip, Buffer.concat([...parts, cd, end]));
console.log('Manuscribe ' + version + ': ' + entries.length + ' files, ' + (fs.statSync(zip).size / 1048576).toFixed(2) + ' MB, in ' + zip);
