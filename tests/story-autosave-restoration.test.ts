import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStoryAutosave } from '@/components/admin/stories/useStoryAutosave';

vi.mock('@/lib/auth/clientToken', () => ({ getAuthHeader: () => ({}) }));

describe('restored Story editor autosave baseline', () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); localStorage.clear(); });
  it('cancels pending old edits, marks the persisted restoration saved, and still saves subsequent edits with the new version', async () => {
    vi.useFakeTimers();
    const fetchMock=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({success:true,data:{version:8}})));
    vi.stubGlobal('fetch',fetchMock);
    const onVersionAdvanced=vi.fn();
    const {result,rerender}=renderHook(({formData,version})=>useStoryAutosave({storyId:'story-1',storyVersion:version,
      formData,hasLease:true,isLockedByOther:false,loadedAt:Date.now(),onVersionAdvanced,debounceMs:100}),
      {initialProps:{formData:{title:'Current'},version:6}});
    rerender({formData:{title:'Pending edit'},version:6});
    expect(result.current.saveStatus).toBe('unsaved');
    act(()=>result.current.resetSavedForm({title:'Restored'}));
    rerender({formData:{title:'Restored'},version:7});
    await act(async()=>{await vi.advanceTimersByTimeAsync(200)});
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.saveStatus).toBe('saved');
    expect(localStorage.getItem('story-draft-story-1')).toBeNull();
    rerender({formData:{title:'New edit'},version:7});
    await act(async()=>{await vi.advanceTimersByTimeAsync(200)});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({title:'New edit',expectedVersion:7,autosave:true});
    expect(onVersionAdvanced).toHaveBeenCalledWith(8);
  });
});
