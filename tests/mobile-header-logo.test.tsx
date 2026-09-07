import { existsSync } from 'node:fs';
import path from 'node:path';
import { render } from '@testing-library/react';
import { vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ alt, height, src, width }: { alt: string; height: number; src: string; width: number }) => (
    <img alt={alt} height={height} src={src} width={width} />
  ),
}));

import { MOBILE_HEADER_LOGO_SRC, MobileHeaderLogoIcon } from '@/components/layout/Logo';

describe('MobileHeaderLogoIcon', () => {
  it('renders the supplied red-tab logo from a public asset sized for the mobile header', () => {
    const { container } = render(<MobileHeaderLogoIcon />);

    const logoFrame = container.querySelector<HTMLSpanElement>('[data-logo-element="mobile-header-icon"]');
    if (!logoFrame) {
      throw new Error('Expected the mobile header logo frame to render.');
    }
    const logoImage = logoFrame.querySelector('img');

    expect(existsSync(path.join(process.cwd(), 'public', MOBILE_HEADER_LOGO_SRC.slice(1)))).toBe(true);
    expect(logoFrame).toHaveAttribute('data-logo-element', 'mobile-header-icon');
    expect(logoFrame).toHaveClass('h-12', 'w-[58px]');
    expect(logoImage).toHaveAttribute('src', MOBILE_HEADER_LOGO_SRC);
    expect(logoImage).toHaveAttribute('width', '90');
    expect(logoImage).toHaveAttribute('height', '60');
  });
});
