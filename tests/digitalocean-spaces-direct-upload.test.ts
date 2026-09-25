import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDigitalOceanSpacesBrowserUploadTarget,
  isValidDigitalOceanSpacesObjectKey,
} from '@/lib/utils/digitalOceanSpaces';

describe('DigitalOcean Spaces browser upload targets', () => {
  const originalEnv = {
    accessKey: process.env.DIGITALOCEAN_SPACES_ACCESS_KEY,
    secretKey: process.env.DIGITALOCEAN_SPACES_SECRET_KEY,
    bucket: process.env.DIGITALOCEAN_SPACES_BUCKET,
    region: process.env.DIGITALOCEAN_SPACES_REGION,
    cdn: process.env.DIGITALOCEAN_SPACES_CDN_BASE_URL,
  };

  beforeEach(() => {
    process.env.DIGITALOCEAN_SPACES_ACCESS_KEY = 'access-key';
    process.env.DIGITALOCEAN_SPACES_SECRET_KEY = 'secret-key';
    process.env.DIGITALOCEAN_SPACES_BUCKET = 'lokswami-storage-2026';
    process.env.DIGITALOCEAN_SPACES_REGION = 'sgp1';
    process.env.DIGITALOCEAN_SPACES_CDN_BASE_URL =
      'https://lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com';
  });

  afterEach(() => {
    process.env.DIGITALOCEAN_SPACES_ACCESS_KEY = originalEnv.accessKey;
    process.env.DIGITALOCEAN_SPACES_SECRET_KEY = originalEnv.secretKey;
    process.env.DIGITALOCEAN_SPACES_BUCKET = originalEnv.bucket;
    process.env.DIGITALOCEAN_SPACES_REGION = originalEnv.region;
    process.env.DIGITALOCEAN_SPACES_CDN_BASE_URL = originalEnv.cdn;
  });

  it('marks direct browser uploads public-read so CDN image URLs can render', () => {
    const target = createDigitalOceanSpacesBrowserUploadTarget({
      key: 'lokswami/epapers/indore/2026-05-05/pages/001-page.jpg',
      contentType: 'image/jpeg',
    });

    expect(target.uploadHeaders).toEqual({
      'Content-Type': 'image/jpeg',
      'x-amz-acl': 'public-read',
    });
    expect(decodeURIComponent(target.uploadUrl)).toContain(
      'X-Amz-SignedHeaders=host;x-amz-acl'
    );
    expect(target.secureUrl).toBe(
      'https://lokswami-storage-2026.sgp1.cdn.digitaloceanspaces.com/lokswami/epapers/indore/2026-05-05/pages/001-page.jpg'
    );
  });

  it.each([
    '../secret',
    'safe/../secret',
    '/absolute/file.jpg',
    'safe\\file.jpg',
    'safe/%2e%2e/file.jpg',
    'safe/%2Fadmin.jpg',
    'safe/%5cadmin.jpg',
    'safe//file.jpg',
  ])('rejects unsafe or encoded object key %s', (key) => {
    expect(isValidDigitalOceanSpacesObjectKey(key)).toBe(false);
    expect(() => createDigitalOceanSpacesBrowserUploadTarget({
      key, contentType: 'image/jpeg',
    })).toThrow('Invalid DigitalOcean Spaces object key');
  });
});
