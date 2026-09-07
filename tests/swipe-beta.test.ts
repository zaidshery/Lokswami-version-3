import { describe, expect, it } from 'vitest';
import { isSwipeBetaEnabled } from '@/lib/content/swipeBeta';

describe('Swipe beta exposure', () => {
  it('is enabled by default and can be disabled explicitly for rollback', () => {
    expect(isSwipeBetaEnabled({})).toBe(true);
    expect(isSwipeBetaEnabled({ SWIPE_BETA_ENABLED: 'false' })).toBe(false);
    expect(isSwipeBetaEnabled({ SWIPE_BETA_ENABLED: 'FALSE' })).toBe(false);
  });
});
