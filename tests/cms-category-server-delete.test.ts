import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isDefaultCategorySlug,
} from '@/lib/constants/newsCategories';

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  mongo: vi.fn(),
  findById: vi.fn(),
  findByIdAndDelete: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readFile: mocks.readFile,
    writeFile: mocks.writeFile,
    mkdir: mocks.mkdir,
  },
}));

vi.mock('@/lib/db/mongoAvailability', () => ({
  isMongoAvailable: mocks.mongo,
}));

vi.mock('@/lib/models/Category', () => ({
  default: {
    findById: mocks.findById,
    findByIdAndDelete: mocks.findByIdAndDelete,
  },
}));

import {
  deleteAdminCategory,
} from '@/lib/server/content/adminTaxonomyService';

describe('deleteAdminCategory system category server-side protection', () => {
  describe('File-store mode', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      delete process.env.MONGODB_URI;
      mocks.mongo.mockResolvedValue(false);
    });

    it('rejects deletion of seeded system category and prevents file modification', async () => {
      const seeded = [
        {
          _id: 'default-mp-1',
          name: 'Madhya Pradesh',
          slug: 'madhya-pradesh',
        },
        {
          _id: 'custom-investigations',
          name: 'Investigations',
          slug: 'investigations',
        },
      ];
      mocks.readFile.mockResolvedValue(JSON.stringify(seeded));

      expect(isDefaultCategorySlug('madhya-pradesh')).toBe(true);

      await expect(
        deleteAdminCategory('default-mp-1')
      ).rejects.toThrow('System categories cannot be deleted');

      expect(mocks.writeFile).not.toHaveBeenCalled();
    });

    it('allows deletion of genuine custom categories in file-store mode', async () => {
      const seeded = [
        {
          _id: 'default-mp-1',
          name: 'Madhya Pradesh',
          slug: 'madhya-pradesh',
        },
        {
          _id: 'custom-investigations',
          name: 'Investigations',
          slug: 'investigations',
        },
      ];
      mocks.readFile.mockResolvedValue(JSON.stringify(seeded));
      mocks.writeFile.mockResolvedValue(undefined);

      expect(isDefaultCategorySlug('investigations')).toBe(false);

      const result = await deleteAdminCategory('custom-investigations');
      expect(result).toBe(true);
      expect(mocks.writeFile).toHaveBeenCalledTimes(1);

      const written = JSON.parse(mocks.writeFile.mock.calls[0][1]);
      expect(written).toEqual([
        {
          _id: 'default-mp-1',
          name: 'Madhya Pradesh',
          slug: 'madhya-pradesh',
        },
      ]);
    });

    it('returns false when category id is not found in file-store mode', async () => {
      mocks.readFile.mockResolvedValue(JSON.stringify([]));

      const result = await deleteAdminCategory('non-existent-id');
      expect(result).toBe(false);
      expect(mocks.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('MongoDB mode', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      process.env.MONGODB_URI = 'mongodb://example.invalid/test';
      mocks.mongo.mockResolvedValue(true);
    });

    it('rejects deletion of system categories and avoids calling findByIdAndDelete', async () => {
      mocks.findById.mockResolvedValue({
        _id: 'mongo-national-id',
        name: 'National',
        slug: 'national',
      });

      expect(isDefaultCategorySlug('national')).toBe(true);

      await expect(
        deleteAdminCategory('mongo-national-id')
      ).rejects.toThrow('System categories cannot be deleted');

      expect(mocks.findById).toHaveBeenCalledWith('mongo-national-id');
      expect(mocks.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('allows deletion of custom categories in MongoDB mode', async () => {
      mocks.findById.mockResolvedValue({
        _id: 'mongo-custom-id',
        name: 'Investigations',
        slug: 'investigations',
      });
      mocks.findByIdAndDelete.mockResolvedValue({
        _id: 'mongo-custom-id',
        name: 'Investigations',
        slug: 'investigations',
      });

      expect(isDefaultCategorySlug('investigations')).toBe(false);

      const result = await deleteAdminCategory('mongo-custom-id');
      expect(result).toBe(true);
      expect(mocks.findById).toHaveBeenCalledWith('mongo-custom-id');
      expect(mocks.findByIdAndDelete).toHaveBeenCalledWith('mongo-custom-id');
    });

    it('returns false when category id is not found in MongoDB mode', async () => {
      mocks.findById.mockResolvedValue(null);

      const result = await deleteAdminCategory('unknown-id');
      expect(result).toBe(false);
      expect(mocks.findByIdAndDelete).not.toHaveBeenCalled();
    });
  });
});
