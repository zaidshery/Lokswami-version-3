import { getImageProps } from 'next/image';

/** Use the existing image optimizer for fitted pages and higher-resolution zoom. */
export function getEpaperReaderImage(
  src: string, width?: number, height?: number,
  options: { zoom?: number; spread?: boolean; responsiveSpread?: boolean } = {}
): { src: string; srcSet?: string; sizes?: string } {
  if (!src || !width || !height) return { src };
  const zoom = Math.max(1, options.zoom || 1);
  const single = `${92 * zoom}vw`, spread = `${43 * zoom}vw`;
  const sizes = options.spread ? spread : options.responsiveSpread
    ? `(min-width: 1024px) and (pointer: fine) ${spread}, (min-width: 1024px) and (pointer: none) ${spread}, ${single}`
    : single;
  const { props } = getImageProps({ src, width, height, alt: '', sizes, quality: zoom >= 2 ? 90 : 75 });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}
