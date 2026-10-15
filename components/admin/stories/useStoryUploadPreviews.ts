'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryMediaAsset } from '@/lib/content/storyMedia';

// The file is available in this authenticated editor while its private receipt
// is not yet attached to a Story. Preview locally; persist only canonical metadata.
export function useStoryUploadPreviews(assets: StoryMediaAsset[]) {
  const urlsRef = useRef<Record<string, string>>({});
  const [urls, setUrls] = useState<Record<string, string>>({});

  const addUploadPreview = useCallback((asset: StoryMediaAsset, file: File) => {
    const key = asset.assetId || asset.id;
    const previous = urlsRef.current[key];
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file);
    urlsRef.current = { ...urlsRef.current, [key]: url };
    setUrls(urlsRef.current);
  }, []);

  useEffect(() => {
    const retained = new Set(assets.map((asset) => asset.assetId || asset.id));
    const next = { ...urlsRef.current };
    let changed = false;
    for (const [id, url] of Object.entries(urlsRef.current)) {
      if (!retained.has(id)) {
        URL.revokeObjectURL(url);
        delete next[id];
        changed = true;
      }
    }
    if (changed) {
      urlsRef.current = next;
      setUrls(next);
    }
  }, [assets]);

  useEffect(() => () => {
    for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
    urlsRef.current = {};
  }, []);

  return { addUploadPreview, getUploadPreview: (asset: StoryMediaAsset) => urls[asset.assetId || asset.id] };
}
