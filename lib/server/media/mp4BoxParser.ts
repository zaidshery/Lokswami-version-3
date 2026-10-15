export interface Mp4Metadata {
  container: 'mp4';
  majorBrand?: string;
  compatibleBrands?: string[];
  timescale?: number;
  durationSeconds?: number;
  width?: number;
  height?: number;
  aspectRatio?: '9:16' | '16:9' | '1:1' | 'unknown';
  codec?: string;
}

function deriveAspectRatio(width: number, height: number): '9:16' | '16:9' | '1:1' | 'unknown' {
  if (width <= 0 || height <= 0) return 'unknown';
  const ratio = width / height;
  if (Math.abs(ratio - 9 / 16) <= 0.05) return '9:16';
  if (Math.abs(ratio - 16 / 9) <= 0.05) return '16:9';
  if (Math.abs(ratio - 1.0) <= 0.05) return '1:1';
  return 'unknown';
}

function readAscii(bytes: Uint8Array, start: number, length: number): string {
  if (start + length > bytes.length) return '';
  let str = '';
  for (let i = 0; i < length; i++) {
    const code = bytes[start + i];
    if (code >= 32 && code <= 126) {
      str += String.fromCharCode(code);
    }
  }
  return str.trim();
}

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.length) return 0;
  return (
    ((bytes[offset] << 24) >>> 0) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function readUint64(bytes: Uint8Array, offset: number): number {
  if (offset + 8 > bytes.length) return 0;
  const high = readUint32(bytes, offset);
  const low = readUint32(bytes, offset + 4);
  return high * 4294967296 + low;
}

export function parseMp4Header(bytes: Uint8Array): Mp4Metadata | null {
  if (bytes.length < 16) return null;

  const result: Mp4Metadata = { container: 'mp4' };
  let offset = 0;

  while (offset + 8 <= bytes.length) {
    let size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > bytes.length) break;
      size = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = bytes.length - offset;
    }

    if (size < headerSize) break;
    const boxEnd = Math.min(offset + size, bytes.length);

    if (type === 'ftyp') {
      result.majorBrand = readAscii(bytes, offset + 8, 4);
      const brands: string[] = [];
      for (let b = offset + 16; b + 4 <= boxEnd; b += 4) {
        const brand = readAscii(bytes, b, 4);
        if (brand) brands.push(brand);
      }
      result.compatibleBrands = brands;
    } else if (type === 'moov') {
      parseMoovChildren(bytes, offset + headerSize, boxEnd, result);
    }

    offset += size;
  }

  if (!result.majorBrand && !result.durationSeconds && !result.width) {
    // If no recognizable atoms were found
    if (readAscii(bytes, 4, 4) === 'ftyp') {
      result.majorBrand = readAscii(bytes, 8, 4);
    } else {
      return null;
    }
  }

  return result;
}

function parseMoovChildren(
  bytes: Uint8Array,
  start: number,
  end: number,
  result: Mp4Metadata
) {
  let offset = start;

  while (offset + 8 <= end) {
    let size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      size = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize) break;
    const boxEnd = Math.min(offset + size, end);

    if (type === 'mvhd') {
      const version = bytes[offset + headerSize];
      let timescale = 0;
      let duration = 0;

      if (version === 0) {
        // v0: version(1) + flags(3) + creation(4) + mod(4) + timescale(4) + duration(4)
        timescale = readUint32(bytes, offset + headerSize + 12);
        duration = readUint32(bytes, offset + headerSize + 16);
      } else if (version === 1) {
        // v1: version(1) + flags(3) + creation(8) + mod(8) + timescale(4) + duration(8)
        timescale = readUint32(bytes, offset + headerSize + 20);
        duration = readUint64(bytes, offset + headerSize + 24);
      }

      if (timescale > 0) {
        result.timescale = timescale;
        result.durationSeconds = Math.round((duration / timescale) * 100) / 100;
      }
    } else if (type === 'trak') {
      parseTrakChildren(bytes, offset + headerSize, boxEnd, result);
    }

    offset += size;
  }
}

function parseTrakChildren(
  bytes: Uint8Array,
  start: number,
  end: number,
  result: Mp4Metadata
) {
  let offset = start;

  while (offset + 8 <= end) {
    let size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    let headerSize = 8;

    if (size === 1) {
      if (offset + 16 > end) break;
      size = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize) break;
    const boxEnd = Math.min(offset + size, end);

    if (type === 'tkhd') {
      const version = bytes[offset + headerSize];
      let widthOffset = 0;
      let heightOffset = 0;

      if (version === 0) {
        // version(1) + flags(3) + ctime(4) + mtime(4) + track_id(4) + res(4) + duration(4)
        // + res(8) + layer(2) + alt_group(2) + volume(2) + res(2) + matrix(36) = 76 bytes
        // width at 76 + 8 = 84
        widthOffset = offset + headerSize + 76;
        heightOffset = widthOffset + 4;
      } else if (version === 1) {
        // version(1) + flags(3) + ctime(8) + mtime(8) + track_id(4) + res(4) + duration(8)
        // + res(8) + layer(2) + alt_group(2) + volume(2) + res(2) + matrix(36) = 88 bytes
        // width at 88 + 8 = 96
        widthOffset = offset + headerSize + 88;
        heightOffset = widthOffset + 4;
      }

      const w = readUint32(bytes, widthOffset) >> 16;
      const h = readUint32(bytes, heightOffset) >> 16;

      if (w > 0 && h > 0 && (!result.width || !result.height)) {
        result.width = w;
        result.height = h;
        result.aspectRatio = deriveAspectRatio(w, h);
      }
    } else if (type === 'mdia') {
      parseMdiaChildren(bytes, offset + headerSize, boxEnd, result);
    }

    offset += size;
  }
}

function parseMdiaChildren(
  bytes: Uint8Array,
  start: number,
  end: number,
  result: Mp4Metadata
) {
  let offset = start;

  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    if (size < 8) break;
    const boxEnd = Math.min(offset + size, end);

    if (type === 'minf') {
      parseMinfChildren(bytes, offset + 8, boxEnd, result);
    }

    offset += size;
  }
}

function parseMinfChildren(
  bytes: Uint8Array,
  start: number,
  end: number,
  result: Mp4Metadata
) {
  let offset = start;

  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    if (size < 8) break;
    const boxEnd = Math.min(offset + size, end);

    if (type === 'stbl') {
      parseStblChildren(bytes, offset + 8, boxEnd, result);
    }

    offset += size;
  }
}

function parseStblChildren(
  bytes: Uint8Array,
  start: number,
  end: number,
  result: Mp4Metadata
) {
  let offset = start;

  while (offset + 8 <= end) {
    const size = readUint32(bytes, offset);
    const type = readAscii(bytes, offset + 4, 4);
    if (size < 8) break;
    const boxEnd = Math.min(offset + size, end);

    if (type === 'stsd') {
      // version(1) + flags(3) + entry_count(4)
      if (offset + 16 <= boxEnd) {
        const codec = readAscii(bytes, offset + 16 + 4, 4);
        if (codec && !result.codec) {
          result.codec = codec;
        }
      }
    }

    offset += size;
  }
}
