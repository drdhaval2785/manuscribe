'use strict';
/* ZIP files for edition packages, using only what the browser has. Entries carry a fixed date, so
   that the same files always give the same archive. */
(function (ME) {
  const Zip = {};
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  const CRC = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  async function through(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }

  const DOS_TIME = 0, DOS_DATE = 0x0021; // 1980-01-01

  // files: [{name, data: string | Uint8Array}] -> Blob
  Zip.write = async function (files) {
    const parts = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      let body = raw, method = 0;
      if (typeof CompressionStream === 'function' && raw.length > 256) {
        const packed = await through(raw, new CompressionStream('deflate-raw'));
        if (packed.length < raw.length) { body = packed; method = 8; }
      }
      const crc = crc32(raw);
      const common = (v) => {
        v.setUint16(0, 20, true); v.setUint16(2, 0x0800, true); v.setUint16(4, method, true);
        v.setUint16(6, DOS_TIME, true); v.setUint16(8, DOS_DATE, true);
        v.setUint32(10, crc, true); v.setUint32(14, body.length, true); v.setUint32(18, raw.length, true);
        v.setUint16(22, name.length, true);
      };
      const local = new Uint8Array(30);
      const lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true);
      common(new DataView(local.buffer, 4));
      parts.push(local, name, body);
      const cen = new Uint8Array(46);
      const cv = new DataView(cen.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      common(new DataView(cen.buffer, 6));
      cv.setUint32(42, offset, true);
      central.push(cen, name);
      offset += local.length + name.length + body.length;
    }
    const size = central.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array(22);
    const ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true); ev.setUint16(10, files.length, true);
    ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end], { type: 'application/zip' });
  };

  // Blob -> Map(name -> Uint8Array)
  Zip.read = async function (blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const v = new DataView(buf.buffer, buf.byteOffset, buf.length);
    let e = buf.length - 22;
    while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) throw new Error('this is not a ZIP file');
    const count = v.getUint16(e + 10, true);
    let p = v.getUint32(e + 16, true);
    const out = new Map();
    for (let n = 0; n < count; n++) {
      if (v.getUint32(p, true) !== 0x02014b50) throw new Error('the ZIP file is damaged');
      const method = v.getUint16(p + 10, true);
      const packed = v.getUint32(p + 20, true);
      const nameLen = v.getUint16(p + 28, true), extra = v.getUint16(p + 30, true), note = v.getUint16(p + 32, true);
      const at = v.getUint32(p + 42, true);
      const name = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
      const start = at + 30 + v.getUint16(at + 26, true) + v.getUint16(at + 28, true);
      const body = buf.subarray(start, start + packed);
      if (method === 0) out.set(name, body.slice());
      else if (method === 8) {
        if (typeof DecompressionStream !== 'function') throw new Error('this browser cannot unpack ZIP files');
        out.set(name, await through(body, new DecompressionStream('deflate-raw')));
      } else throw new Error('unsupported compression in ' + name);
      p += 46 + nameLen + extra + note;
    }
    return out;
  };

  Zip.text = (bytes) => dec.decode(bytes);

  ME.Zip = Zip;
})(window.ME);
