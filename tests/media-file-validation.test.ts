import { describe, expect, it } from 'vitest';
import { detectMediaFileType, validateUploadedFileContent } from '@/lib/server/media/mediaFileValidation';

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0x00]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('server media signature validation', () => {
  it('accepts matching allowed image signatures', () => {
    expect(validateUploadedFileContent({ name: 'photo.jpg', type: 'image/jpeg' }, 'image', jpeg)).toBeNull();
    expect(validateUploadedFileContent({ name: 'photo.png', type: 'image/png' }, 'story-thumbnail', png)).toBeNull();
  });

  it.each([
    [{ name: 'photo.png', type: 'image/jpeg' }, png],
    [{ name: 'photo.jpg', type: 'image/jpeg' }, new TextEncoder().encode('<html>')],
    [{ name: 'vector.svg', type: 'image/svg+xml' }, new TextEncoder().encode('<svg>')],
    [{ name: '../run.exe', type: 'application/octet-stream' }, new Uint8Array([0x4d, 0x5a])],
    [{ name: 'script.js', type: 'application/javascript' }, new TextEncoder().encode('alert(1)')],
  ])('rejects mismatches and active/executable formats', (file, bytes) => {
    expect(validateUploadedFileContent(file, 'image', bytes)).not.toBeNull();
  });

  it('detects MP4 only from an ftyp container prefix', () => {
    const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
    expect(detectMediaFileType(mp4)).toBe('mp4');
    expect(detectMediaFileType(new TextEncoder().encode('video-bytes'))).toBe('unknown');
  });
});
