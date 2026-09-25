import type { MediaUploadPurpose } from './mediaTypes';

type DetectedFileType = 'jpeg' | 'png' | 'webp' | 'pdf' | 'mp4' | 'unknown';

const EXTENSION_BY_TYPE: Record<Exclude<DetectedFileType, 'unknown'>, string[]> = {
  jpeg: ['.jpg', '.jpeg'],
  png: ['.png'],
  webp: ['.webp'],
  pdf: ['.pdf'],
  mp4: ['.mp4'],
};

const MIME_BY_TYPE: Record<Exclude<DetectedFileType, 'unknown'>, string[]> = {
  jpeg: ['image/jpeg', 'image/jpg'],
  png: ['image/png'],
  webp: ['image/webp'],
  pdf: ['application/pdf'],
  mp4: ['video/mp4'],
};

function endsWithAllowedExtension(name: string, detected: Exclude<DetectedFileType, 'unknown'>) {
  const normalized = name.trim().toLowerCase();
  return EXTENSION_BY_TYPE[detected].some((extension) => normalized.endsWith(extension));
}

export function detectMediaFileType(bytes: Uint8Array): DetectedFileType {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'webp';
  if (bytes.length >= 5 && String.fromCharCode(...bytes.slice(0, 5)) === '%PDF-') return 'pdf';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp') return 'mp4';
  return 'unknown';
}

export function validateUploadedFileContent(
  file: Pick<File, 'name' | 'type'>,
  purpose: MediaUploadPurpose,
  bytes: Uint8Array
): string | null {
  const detected = detectMediaFileType(bytes);
  const allowed: DetectedFileType[] =
    purpose === 'epaper-paper'
      ? ['pdf']
      : purpose === 'video-thumbnail'
        ? ['jpeg', 'png', 'webp', 'pdf']
        : ['jpeg', 'png', 'webp'];

  if (detected === 'unknown' || !allowed.includes(detected)) {
    return 'File contents do not match an allowed media format.';
  }

  const known = detected as Exclude<DetectedFileType, 'unknown'>;
  const mime = file.type.trim().toLowerCase();
  if (!MIME_BY_TYPE[known].includes(mime) || !endsWithAllowedExtension(file.name, known)) {
    return 'File name, MIME type, and file contents must describe the same format.';
  }

  return null;
}

export function validateMp4Prefix(bytes: Uint8Array): string | null {
  return detectMediaFileType(bytes) === 'mp4'
    ? null
    : 'Uploaded video contents are not a valid MP4 container.';
}
