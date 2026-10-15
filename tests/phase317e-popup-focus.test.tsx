import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PopupFrame } from '@/components/ui/PopupOrchestrator';

function rect(x: number, y: number, width: number, height: number): DOMRect {
  return { x, y, width, height, left: x, right: x + width, top: y, bottom: y + height, toJSON: () => ({}) };
}
function Harness() {
  const [open, setOpen] = useState(true);
  return <><button data-testid="above">Above popup</button><button data-testid="covered">Covered control</button>{open && <PopupFrame title="Choose Your State" subtitle="Local recommendations" dismissLabel="Not now" neverShowLabel="Do not show again" onDismiss={() => setOpen(false)} onNeverShow={() => setOpen(false)}><button>State option</button></PopupFrame>}</>;
}
describe('Phase 3.17E non-modal recommendation focus', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.hasAttribute('data-popup-frame')) return rect(100, 100, 300, 400);
      if (this.dataset.testid === 'covered') return rect(150, 150, 100, 44);
      if (this.dataset.testid === 'above') return rect(150, 20, 100, 44);
      return rect(0, 0, 0, 0);
    });
  });
  afterEach(() => vi.restoreAllMocks());
  it('dismisses only when a background keyboard control is covered and preserves its focus', () => {
    render(<Harness />);
    screen.getByRole('button', { name: 'Above popup' }).focus();
    expect(screen.getByText('Choose Your State')).toBeInTheDocument();
    const covered = screen.getByRole('button', { name: 'Covered control' });
    act(() => covered.focus());
    expect(screen.queryByText('Choose Your State')).not.toBeInTheDocument();
    expect(covered).toHaveFocus();
  });
  it('keeps popup controls usable without a modal focus trap', () => {
    render(<Harness />);
    const option = screen.getByRole('button', { name: 'State option' });
    option.focus();
    expect(screen.getByText('Choose Your State')).toBeInTheDocument();
    expect(option).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(screen.queryByText('Choose Your State')).not.toBeInTheDocument();
  });
});
