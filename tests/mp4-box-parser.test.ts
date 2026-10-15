import { describe, expect, it } from 'vitest';
import { parseMp4Header } from '@/lib/server/media/mp4BoxParser';

function createBox(type: string, payload: Uint8Array): Uint8Array {
  const size = payload.length + 8;
  const buffer = new Uint8Array(size);
  const view = new DataView(buffer.buffer);
  view.setUint32(0, size);
  for (let i = 0; i < 4; i++) {
    buffer[4 + i] = type.charCodeAt(i);
  }
  buffer.set(payload, 8);
  return buffer;
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((acc, curr) => acc + curr.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

describe('MP4 Box Parser', () => {
  it('returns null for buffers too small or without ftyp/moov', () => {
    expect(parseMp4Header(new Uint8Array(10))).toBeNull();
    expect(parseMp4Header(new TextEncoder().encode('not an mp4 file at all'))).toBeNull();
  });

  it('parses ftyp box with major and compatible brands', () => {
    const ftypPayload = new Uint8Array(12);
    // major brand: 'isom'
    ftypPayload.set(new TextEncoder().encode('isom'), 0);
    // minor version: 0x00000200
    new DataView(ftypPayload.buffer).setUint32(4, 512);
    // compatible brands: 'mp41'
    ftypPayload.set(new TextEncoder().encode('mp41'), 8);

    const ftyp = createBox('ftyp', ftypPayload);
    const meta = parseMp4Header(ftyp);
    expect(meta).not.toBeNull();
    expect(meta?.container).toBe('mp4');
    expect(meta?.majorBrand).toBe('isom');
    expect(meta?.compatibleBrands).toEqual(['mp41']);
  });

  it('parses moov with mvhd duration and tkhd 9:16 aspect ratio', () => {
    const ftyp = createBox('ftyp', new TextEncoder().encode('isom\0\0\x02\0mp42'));

    // mvhd v0: version(1) + flags(3) + ctime(4) + mtime(4) + timescale(4) + duration(4)
    const mvhdPayload = new Uint8Array(1 + 3 + 4 + 4 + 4 + 4);
    const mvhdView = new DataView(mvhdPayload.buffer);
    mvhdView.setUint8(0, 0); // version 0
    mvhdView.setUint32(12, 1000); // timescale 1000
    mvhdView.setUint32(16, 60000); // duration 60000 -> 60s
    const mvhd = createBox('mvhd', mvhdPayload);

    // tkhd v0: 84 bytes before width, 4 bytes width, 4 bytes height
    const tkhdPayload = new Uint8Array(84 + 8);
    const tkhdView = new DataView(tkhdPayload.buffer);
    tkhdView.setUint8(0, 0); // version 0
    tkhdView.setUint32(76, 1080 << 16); // width 1080
    tkhdView.setUint32(80, 1920 << 16); // height 1920
    const tkhd = createBox('tkhd', tkhdPayload);

    const trak = createBox('trak', tkhd);
    const moov = createBox('moov', concat(mvhd, trak));

    const fileBytes = concat(ftyp, moov);
    const meta = parseMp4Header(fileBytes);

    expect(meta).not.toBeNull();
    expect(meta?.durationSeconds).toBe(60);
    expect(meta?.width).toBe(1080);
    expect(meta?.height).toBe(1920);
    expect(meta?.aspectRatio).toBe('9:16');
  });

  it('detects 16:9 and 1:1 aspect ratios correctly', () => {
    const ftyp = createBox('ftyp', new TextEncoder().encode('isom\0\0\0\0'));

    const tkhd16x9Payload = new Uint8Array(84 + 8);
    const view16x9 = new DataView(tkhd16x9Payload.buffer);
    view16x9.setUint32(76, 1920 << 16);
    view16x9.setUint32(80, 1080 << 16);
    const moov16x9 = createBox('moov', createBox('trak', createBox('tkhd', tkhd16x9Payload)));

    const meta16x9 = parseMp4Header(concat(ftyp, moov16x9));
    expect(meta16x9?.aspectRatio).toBe('16:9');

    const tkhd1x1Payload = new Uint8Array(84 + 8);
    const view1x1 = new DataView(tkhd1x1Payload.buffer);
    view1x1.setUint32(76, 1080 << 16);
    view1x1.setUint32(80, 1080 << 16);
    const moov1x1 = createBox('moov', createBox('trak', createBox('tkhd', tkhd1x1Payload)));

    const meta1x1 = parseMp4Header(concat(ftyp, moov1x1));
    expect(meta1x1?.aspectRatio).toBe('1:1');
  });
});
