import React, { type HTMLAttributes } from 'react';

export interface BreakingBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  label?: string;
  pulse?: boolean;
}

/**
 * LokSwami Design System — Breaking News Badge
 * High-visibility badge with pulsing live indicator.
 */
export function BreakingBadge({
  label = 'BREAKING',
  pulse = true,
  className = '',
  ...props
}: BreakingBadgeProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={`inline-flex items-center gap-1.5 rounded-editorial-xs bg-breaking px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white shadow-sm select-none ${className}`}
      {...props}
    >
      {pulse ? (
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
        </span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}

export default BreakingBadge;
