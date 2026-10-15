import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoryUploadPreviews } from '@/components/admin/stories/useStoryUploadPreviews';
import type { StoryMediaAsset } from '@/lib/content/storyMedia';

const asset: StoryMediaAsset = { id:'local-1',assetId:'receipt-1',kind:'video',url:'https://cdn/private.mp4',key:'stories/private.mp4',
  mimeType:'video/mp4',sizeBytes:10,storageProvider:'do-spaces',originalFileName:'private.mp4',order:0,createdAt:new Date().toISOString() };

describe('unsaved Story upload previews', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });
  it('previews the selected file without putting blob URLs into canonical assets', () => {
    const create=vi.spyOn(URL,'createObjectURL').mockReturnValue('blob:local-preview');
    vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    const file=new File(['video'],'private.mp4',{type:'video/mp4'});
    const {result}=renderHook(()=>useStoryUploadPreviews([asset]));
    act(()=>result.current.addUploadPreview(asset,file));
    expect(result.current.getUploadPreview(asset)).toBe('blob:local-preview');
    expect(create).toHaveBeenCalledWith(file);
    expect(asset.url).toBe('https://cdn/private.mp4');
    expect(asset.key).toBe('stories/private.mp4');
  });
  it('releases object URLs on replacement, removal and editor unmount', () => {
    vi.spyOn(URL,'createObjectURL').mockReturnValueOnce('blob:one').mockReturnValueOnce('blob:two').mockReturnValueOnce('blob:three');
    const revoke=vi.spyOn(URL,'revokeObjectURL').mockImplementation(()=>{});
    const {result,rerender,unmount}=renderHook(({assets})=>useStoryUploadPreviews(assets),{initialProps:{assets:[asset]}});
    const file=new File(['v'],'video.mp4',{type:'video/mp4'});
    act(()=>result.current.addUploadPreview(asset,file));
    act(()=>result.current.addUploadPreview(asset,file));
    expect(revoke).toHaveBeenCalledWith('blob:one');
    rerender({assets:[]});
    expect(revoke).toHaveBeenCalledWith('blob:two');
    expect(result.current.getUploadPreview(asset)).toBeUndefined();
    rerender({assets:[asset]});
    act(()=>result.current.addUploadPreview(asset,file));
    unmount();
    expect(revoke).toHaveBeenCalledWith('blob:three');
  });
  it('retains the replacement preview when the editor preserves the old tile ID', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:replacement');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const uploaded = { ...asset, id: 'new-upload-tile', assetId: 'receipt-2' };
    const persistedTile = { ...uploaded, id: asset.id };
    const { result, rerender } = renderHook(({ assets }) => useStoryUploadPreviews(assets), { initialProps: { assets: [asset] } });
    act(() => {
      result.current.addUploadPreview(uploaded, new File(['v'], 'replacement.mp4', { type: 'video/mp4' }));
      rerender({ assets: [persistedTile] });
    });
    expect(result.current.getUploadPreview(persistedTile)).toBe('blob:replacement');
  });
});
