export const EPAPER_PAGE_LOW_RESOLUTION_WIDTH = 2200;
export const EPAPER_PAGE_HIGH_RESOLUTION_WIDTH = 2800;
export const EPAPER_PAGE_RESIZE_THRESHOLD = 3200;
export const EPAPER_PAGE_TARGET_WIDTH = 3000;
export const EPAPER_PAGE_IMAGE_QUALITY = 0.9;

export type NormalizedEpaperPageImage = {
  file: File;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  resized: boolean;
  outputMimeType: 'image/webp' | 'image/jpeg';
  isLowResolution: boolean;
};

export function resolveEpaperPreviewMaxZoom(width: unknown) {
  const parsedWidth = Number(width);
  if (!Number.isFinite(parsedWidth) || parsedWidth < EPAPER_PAGE_LOW_RESOLUTION_WIDTH) {
    return 3;
  }
  if (parsedWidth < EPAPER_PAGE_HIGH_RESOLUTION_WIDTH) {
    return 3.5;
  }
  return 4;
}

export function resolveEpaperTouchPreviewMaxZoom(width: unknown) {
  const desktopMaxZoom = resolveEpaperPreviewMaxZoom(width);
  return desktopMaxZoom >= 4 ? 6 : desktopMaxZoom;
}

export function resolveEpaperPageResizeDimensions(width: number, height: number) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));

  if (safeWidth <= EPAPER_PAGE_RESIZE_THRESHOLD) {
    return {
      width: safeWidth,
      height: safeHeight,
      resized: false,
    };
  }

  return {
    width: EPAPER_PAGE_TARGET_WIDTH,
    height: Math.max(1, Math.round((safeHeight * EPAPER_PAGE_TARGET_WIDTH) / safeWidth)),
    resized: true,
  };
}

export function buildEpaperLowResolutionWarning(pageNumber: number, width: number) {
  return `Page ${pageNumber} is ${width}px wide, so reader zoom will be limited to 300%. Upload at least ${EPAPER_PAGE_LOW_RESOLUTION_WIDTH}px for 350% zoom or ${EPAPER_PAGE_HIGH_RESOLUTION_WIDTH}px for 400% zoom.`;
}

function loadImageFromFile(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = window.URL.createObjectURL(file);
    const image = new window.Image();

    image.onload = () => {
      window.URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      window.URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read the selected page image.'));
    };
    image.src = objectUrl;
  });
}

function encodeCanvas(
  canvas: HTMLCanvasElement,
  mimeType: 'image/webp' | 'image/jpeg'
) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, mimeType, EPAPER_PAGE_IMAGE_QUALITY);
  });
}

function replaceImageExtension(fileName: string, extension: 'webp' | 'jpg') {
  const stem = fileName.replace(/\.[^./\\]+$/, '').trim() || 'epaper-page';
  return `${stem}.${extension}`;
}

export async function normalizeEpaperPageImage(
  file: File
): Promise<NormalizedEpaperPageImage> {
  if (typeof window === 'undefined') {
    throw new Error('Page images can only be optimized in the browser.');
  }

  const image = await loadImageFromFile(file);
  const originalWidth = Number(image.naturalWidth || image.width || 0);
  const originalHeight = Number(image.naturalHeight || image.height || 0);
  if (originalWidth <= 0 || originalHeight <= 0) {
    throw new Error('The selected page image has invalid dimensions.');
  }

  const output = resolveEpaperPageResizeDimensions(originalWidth, originalHeight);
  const canvas = document.createElement('canvas');
  canvas.width = output.width;
  canvas.height = output.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('This browser could not prepare the page image for upload.');
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, output.width, output.height);

  const webpBlob = await encodeCanvas(canvas, 'image/webp');
  const useWebp = webpBlob?.type === 'image/webp';
  const encodedBlob = useWebp ? webpBlob : await encodeCanvas(canvas, 'image/jpeg');
  if (!encodedBlob) {
    throw new Error('This browser could not encode the page image for upload.');
  }

  const outputMimeType = useWebp ? 'image/webp' : 'image/jpeg';
  const outputFile = new File(
    [encodedBlob],
    replaceImageExtension(file.name, useWebp ? 'webp' : 'jpg'),
    {
      type: outputMimeType,
      lastModified: file.lastModified,
    }
  );

  return {
    file: outputFile,
    width: output.width,
    height: output.height,
    originalWidth,
    originalHeight,
    resized: output.resized,
    outputMimeType,
    isLowResolution: output.width < EPAPER_PAGE_LOW_RESOLUTION_WIDTH,
  };
}
