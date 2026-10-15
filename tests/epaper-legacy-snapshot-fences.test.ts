// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import { EpaperRepository } from '@/lib/server/epaper/epaperRepository';
import { matches, change, clone, type Row } from './helpers/epaperMutationMongoFixture';
vi.mock('server-only', () => ({}));
afterEach(() => vi.restoreAllMocks());
const id='507f1f77bcf86cd799439011';
describe.each(['epaper','emagazine'])('%s normalized legacy snapshot fences', (publicationType) => {
  it.each(['page','automation'])('allows missing/null first-revision metadata in %s writes and rejects newer snapshots', async (kind) => {
    for(const metadata of [{}, {revisionNumber:null,processingGeneration:null}, {revisionNumber:1}, {processingGeneration:''}, {revisionNumber:1,processingGeneration:''}]) {
      const paper:Row={_id:id,publicationType,status:'draft',productionStatus:'hotspot_mapping',version:4,...metadata};
      vi.spyOn(EPaper,'findOneAndUpdate').mockImplementation(((filter:Row,updates:Row)=>({lean:async()=>{
        if(!matches(paper,filter))return null; change(paper,updates);return clone(paper);
      }})) as never);
      const q=()=>({select:()=>q(),lean:async()=>clone(paper)});
      vi.spyOn(EPaper,'findById').mockImplementation(q as never);
      const repo=new EpaperRepository();
      const write=(revisionNumber=1,processingGeneration='')=>kind==='page'
        ? repo.updateEditionWithCas(id,{title:'Saved'},Number(paper.version),{productionStatus:'hotspot_mapping',revisionNumber,processingGeneration})
        : repo.advanceEditionAutomation({id,fromStatus:'hotspot_mapping',expectedVersion:Number(paper.version),expectedRevisionNumber:revisionNumber,expectedGeneration:processingGeneration,updates:{title:'Saved'}});
      await expect(write()).resolves.toMatchObject({title:'Saved',version:5});
      paper.revisionNumber=2; await expect(write()).rejects.toThrow('EPAPER_VERSION_CONFLICT');
      paper.revisionNumber=1;paper.processingGeneration='new-generation';await expect(write()).rejects.toThrow('EPAPER_VERSION_CONFLICT');
      vi.restoreAllMocks();
    }
  });
  it.each(['page','automation'])('advances a missing version once and rejects its stale reuse in %s writes', async(kind)=>{
    const paper:Row={_id:id,status:'draft',productionStatus:'hotspot_mapping'};
    vi.spyOn(EPaper,'findOneAndUpdate').mockImplementation(((filter:Row,updates:Row)=>({lean:async()=>{
      if(!matches(paper,filter))return null; change(paper,updates);return clone(paper);
    }})) as never);
    const q=()=>({select:()=>q(),lean:async()=>clone(paper)});
    vi.spyOn(EPaper,'findById').mockImplementation(q as never);
    const repo=new EpaperRepository();
    const input={id,fromStatus:'hotspot_mapping',expectedVersion:1,expectedRevisionNumber:1,expectedGeneration:'',updates:{title:'Saved'}};
    const write=()=>kind==='automation'?repo.advanceEditionAutomation(input):repo.updateEditionWithCas(id,{title:'Saved'},1,{productionStatus:'hotspot_mapping',revisionNumber:1,processingGeneration:''});
    await expect(write()).resolves.toMatchObject({title:'Saved',version:2});
    await expect(write()).rejects.toThrow('EPAPER_VERSION_CONFLICT');
  });
});
