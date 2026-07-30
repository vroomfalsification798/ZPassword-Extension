/*
 * ZPassword — Copyright (C) 2026 TheHolyOneZ
 * Licensed under the GNU General Public License v3 or later. See LICENSE.
 */

/**
 * Packages ZPassword into installable zips, one per engine.
 *
 *   node build.mjs      -> dist/zpassword-chromium-<version>.zip
 *                          dist/zpassword-firefox-<version>.zip
 *
 * Runs the same on Windows, macOS and Linux with nothing installed but Node —
 * hence the small ZIP writer below rather than shelling out to `zip`, which
 * Windows does not have. There is no bundler or transpiler either: the archive
 * contains exactly the source in this folder, which is what makes a security
 * tool reviewable.
 */
import { deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));

/** Everything the extension actually loads at runtime. */
const PAYLOAD = [
  'background',
  'popup',
  'src',
  'icons/icon-16.png',
  'icons/icon-32.png',
  'icons/icon-48.png',
  'icons/icon-128.png',
  'LICENSE',
];

const TARGETS = [
  { name: 'chromium', manifest: 'manifest.json' },
  { name: 'firefox', manifest: 'manifest.firefox.json' },
];

/* --------------------------------------------------------------- zip ----- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// A fixed timestamp keeps builds byte-identical, so two people building the
// same commit can compare hashes.
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (2020 - 1980) << 9 | (1 << 5) | 1; // 2020-01-01

function zip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');
    const deflated = deflateRawSync(data, { level: 9 });
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    parts.push(local, nameBuf, body);

    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt16LE(0, 8);
    record.writeUInt16LE(method, 10);
    record.writeUInt16LE(DOS_TIME, 12);
    record.writeUInt16LE(DOS_DATE, 14);
    record.writeUInt32LE(crc, 16);
    record.writeUInt32LE(body.length, 20);
    record.writeUInt32LE(data.length, 24);
    record.writeUInt16LE(nameBuf.length, 28);
    record.writeUInt32LE(0, 30); // extra + comment lengths
    record.writeUInt16LE(0, 34); // disk number
    record.writeUInt16LE(0, 36); // internal attributes
    record.writeUInt32LE(0, 38); // external attributes
    record.writeUInt32LE(offset, 42);
    central.push(record, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...parts, directory, end]);
}

/* -------------------------------------------------------------- build ---- */

/** Collects one payload entry, recursing into directories. Paths use `/`. */
function collect(item, into) {
  const full = resolve(ROOT, item);
  if (statSync(full).isDirectory()) {
    for (const child of readdirSync(full).sort()) collect(join(item, child), into);
    return;
  }
  into.push({
    name: relative(ROOT, full).split(/[\\/]/).join(posix.sep),
    data: readFileSync(full),
  });
}

const version = JSON.parse(readFileSync(resolve(ROOT, 'manifest.json'), 'utf8')).version;

rmSync(resolve(ROOT, 'dist'), { recursive: true, force: true });
mkdirSync(resolve(ROOT, 'dist'), { recursive: true });

console.log(`ZPassword ${version}`);

for (const { name, manifest } of TARGETS) {
  const entries = [];
  for (const item of PAYLOAD) collect(item, entries);
  entries.push({ name: 'manifest.json', data: readFileSync(resolve(ROOT, manifest)) });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  const out = resolve(ROOT, 'dist', `zpassword-${name}-${version}.zip`);
  const archive = zip(entries);
  writeFileSync(out, archive);
  console.log(
    `  dist/zpassword-${name}-${version}.zip  (${(archive.length / 1024).toFixed(0)} KB, ${entries.length} files)`,
  );
}
