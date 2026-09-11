import {
  buildDigitalOceanSpacesPublicUrl,
  createDigitalOceanSpacesBrowserUploadTarget,
  deleteDigitalOceanSpacesAssetByPublicId,
  deleteDigitalOceanSpacesAssetByUrl,
  type DigitalOceanSpacesBrowserUploadTarget,
  type UploadedDigitalOceanSpacesAsset,
  uploadBufferToDigitalOceanSpaces,
  type VerifiedDigitalOceanSpacesObject,
  verifyDigitalOceanSpacesUploadedObject,
} from '@/lib/utils/digitalOceanSpaces';
import type {
  BrowserUploadTargetOptions,
  UploadBufferOptions,
  VerifyUploadedObjectOptions,
} from './mediaTypes';

export class SpacesAdapter {
  isConfigured(): boolean {
    return Boolean(
      process.env.DIGITALOCEAN_SPACES_ACCESS_KEY?.trim() &&
        process.env.DIGITALOCEAN_SPACES_SECRET_KEY?.trim() &&
        process.env.DIGITALOCEAN_SPACES_BUCKET?.trim() &&
        process.env.DIGITALOCEAN_SPACES_REGION?.trim()
    );
  }

  async uploadBuffer(
    buffer: Buffer,
    options?: UploadBufferOptions
  ): Promise<UploadedDigitalOceanSpacesAsset> {
    return uploadBufferToDigitalOceanSpaces(buffer, options);
  }

  createBrowserUploadTarget(
    options: BrowserUploadTargetOptions
  ): DigitalOceanSpacesBrowserUploadTarget {
    return createDigitalOceanSpacesBrowserUploadTarget(options);
  }

  async verifyUploadedObject(
    options: VerifyUploadedObjectOptions
  ): Promise<VerifiedDigitalOceanSpacesObject> {
    return verifyDigitalOceanSpacesUploadedObject(options);
  }

  async deleteAssetByPublicId(publicId: string): Promise<void> {
    await deleteDigitalOceanSpacesAssetByPublicId(publicId);
  }

  async deleteAssetByUrl(url: string): Promise<void> {
    await deleteDigitalOceanSpacesAssetByUrl(url);
  }

  buildPublicUrl(publicId: string): string {
    return buildDigitalOceanSpacesPublicUrl(publicId);
  }
}

export const spacesAdapter = new SpacesAdapter();
