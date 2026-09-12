import React, { type HTMLAttributes } from 'react';

export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded-editorial-xs',
  circular: 'rounded-full shrink-0',
  rectangular: 'rounded-none',
  rounded: 'rounded-editorial-md',
};

/**
 * LokSwami Design System — Skeleton Primitive
 * Content loading placeholder with subtle pulse animation and reduced-motion fallback.
 */
export function Skeleton({
  variant = 'text',
  width,
  height,
  className = '',
  style,
  ...props
}: SkeletonProps) {
  const inlineStyles = {
    ...(width ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
    ...style,
  };

  return (
    <div
      aria-hidden="true"
      className={`animate-pulse bg-zinc-200/80 dark:bg-zinc-800/70 ${VARIANT_CLASSES[variant]} ${className}`}
      style={inlineStyles}
      {...props}
    />
  );
}

export default Skeleton;
