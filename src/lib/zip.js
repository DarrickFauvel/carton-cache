/**
 * Minimal in-memory ZIP writer (deflate, no ZIP64), enough to package small
 * file sets like the Chrome extension download without a dependency.
 */

import { crc32, deflateRawSync } from "node:zlib";

/**
 * @typedef {object} ZipEntry
 * @property {string} name  Path inside the archive, forward slashes.
 * @property {Buffer} data
 */

/**
 * @param {ZipEntry[]} entries
 * @returns {Buffer}
 */
export function createZip(entries) {
  /** @type {Buffer[]} */
  const parts = [];
  /** @type {Buffer[]} */
  const central = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // flags: UTF-8 names
    local.writeUInt16LE(8, 8);           // method: deflate
    local.writeUInt32LE(0, 10);          // mod time/date (unset)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);          // extra field length

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0); // central directory signature
    header.writeUInt16LE(20, 4);         // version made by
    header.writeUInt16LE(20, 6);         // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt32LE(0, 12);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressed.length, 20);
    header.writeUInt32LE(data.length, 24);
    header.writeUInt16LE(nameBuf.length, 28);
    // extra/comment length, disk number, internal/external attrs stay 0
    header.writeUInt32LE(offset, 42);

    parts.push(local, nameBuf, compressed);
    central.push(header, nameBuf);
    offset += local.length + nameBuf.length + compressed.length;
  }

  const centralSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);      // end of central directory signature
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...parts, ...central, end]);
}
