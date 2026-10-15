// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EpaperEditorialService } from '@/lib/server/epaper/epaperEditorialService';
import { EpaperVersionConflictError } from '@/lib/server/epaper/epaperTypes';
import type { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/epaperActivity', () => ({ recordEpaperActivity: vi.fn(), buildEpaperActivityMessage: () => 'note' }));
afterEach(() => vi.restoreAllMocks());
const id='665000000000000000000001';
const actor={id:'qa-admin',username:'qa-admin',role:'super_admin' as const,name:'QA',email:'qa@example.com'};
describe('manual workflow snapshot fencing', () => {
  it.each(['epaper','emagazine'])('rejects stale %s note and assignment writes after worker advancement', async (publicationType) => {
    for (const body of [{note:'Editor note'},{assignedToId:''}]) {
      const current={_id:id,publicationType,status:'draft',productionStatus:'hotspot_mapping',version:4,pageCount:1,pages:[{pageNumber:1,imagePath:'/qa.jpg'}],productionNotes:[]};
      const canonical={...current,productionStatus:'ready_to_publish',version:5,productionNotes:[{message:'Worker transition'}]};
      const before=JSON.stringify(canonical);
      const update=vi.fn(async (_id:string, updates:Record<string,unknown>, expectedVersion?:number) => {
        if(expectedVersion!==undefined&&expectedVersion!==canonical.version) throw new EpaperVersionConflictError(canonical.version,expectedVersion);
        Object.assign(canonical,updates); return canonical;
      });
      const repo={connect:vi.fn(),isValidId:()=>true,findEditionById:async()=>current,listArticles:async()=>[],updateEdition:update} as unknown as EpaperRepository;
      await expect(new EpaperEditorialService(repo).updateWorkflow(actor,id,body)).rejects.toThrow('EPAPER_VERSION_CONFLICT');
      expect(update.mock.calls[0][2]).toBe(4);
      expect(JSON.stringify(canonical)).toBe(before);
    }
  });
});
