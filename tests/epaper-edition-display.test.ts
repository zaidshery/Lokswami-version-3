import { describe, expect, it } from 'vitest';
import {
  getEpaperCityDisplayName,
  getEpaperEditionDisplayLabel,
} from '@/lib/constants/epaperCities';

describe('public e-paper edition labels', () => {
  it('keeps the legacy Delhi slug while presenting it as Digital Edition', () => {
    expect(getEpaperCityDisplayName('delhi')).toBe('Digital');
    expect(getEpaperCityDisplayName('Delhi', 'hi')).toBe('डिजिटल');
    expect(getEpaperEditionDisplayLabel('delhi')).toBe('Digital Edition');
    expect(getEpaperEditionDisplayLabel('delhi', 'hi')).toBe('डिजिटल संस्करण');
  });

  it('does not rename other editions', () => {
    expect(getEpaperEditionDisplayLabel('indore')).toBe('Indore Edition');
  });
});
