// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import EPaper from '@/lib/models/EPaper';
import EPaperProcessingJob from '@/lib/models/EPaperProcessingJob';
import { processClaimedJob } from '@/lib/server/epaperProcessingJobs';
import * as renderer from '@/lib/server/epaperPdfRenderer';
import * as spaces from '@/lib/utils/digitalOceanSpaces';
import { clone, matches, change, type Row } from './helpers/epaperMutationMongoFixture';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/server/epaperOcrJobs',()=>({queueEpaperOcr:vi.fn(async()=>[])}));
vi.mock('@/lib/server/epaperActivity',()=>({recordEpaperActivity:vi.fn(),buildEpaperActivityMessage:()=>''}));
afterEach(()=>vi.restoreAllMocks());
describe.each([1,undefined])('worker page replacement version fence; stored revision %s',(revisionNumber)=>{
  it.each(['epaper','emagazine'])('retains concurrent %s page changes at every worker write and retries safely',async(publicationType)=>{
    for(const phase of ['processing','render','failure','finalize']) {
      const paper:Row={_id:'507f1f77bcf86cd799439011',publicationType,citySlug:publicationType==='emagazine'?'global':'indore',publishDate:new Date('2026-09-01'),status:'draft',productionStatus:'draft_upload',processingGeneration:'generation',revisionNumber,version:4,pdfPath:'https://qa.example/fixture.pdf',pdfPublicId:'pdf-key',pageCount:2,pages:[{pageNumber:1,processingStatus:'pending',imagePath:''},{pageNumber:2,processingStatus:'ready',imagePath:'/existing.jpg',reviewStatus:'pending'}]};
      const job={_id:'607f1f77bcf86cd799439001',epaperId:paper._id,generation:'generation',revisionNumber:1,sourceKey:'pdf-key',leaseOwner:'worker',attemptCount:1,maxAttempts:4,pageNumbers:[1],totalItems:1};
      const query=()=>({lean:async()=>clone(paper),select:()=>query()});
      vi.spyOn(EPaper,'findById').mockImplementation(query as never);
      let edited=false;
      const edit=()=>{edited=true;paper.version=Number(paper.version)+1;(paper.pages as Row[])[1]={pageNumber:2,processingStatus:'ready',imagePath:'/editor-new.jpg',pageType:'photo',reviewStatus:'ready',reviewedAt:new Date(),reviewedBy:{id:'editor'}};};
      vi.spyOn(EPaper,'updateOne').mockImplementation((async(filter:Row,updates:Row)=>{
        if(!edited&&(phase==='processing'||phase==='finalize'&&Boolean((updates.$set as Row)?.thumbnailPath)))edit();
        if(!matches(paper,filter))return{matchedCount:0};change(paper,updates);return{matchedCount:1};
      }) as never);
      vi.spyOn(EPaperProcessingJob,'findOne').mockReturnValue({lean:async()=>job} as never);
      vi.spyOn(EPaperProcessingJob,'findByIdAndUpdate').mockResolvedValue({} as never);
      vi.spyOn(renderer,'downloadVerifiedEpaperPdf').mockResolvedValue(Buffer.from('%PDF-1.4'));
      const render=vi.spyOn(renderer,'renderPdfPageToJpeg').mockImplementation(async()=>{
        if(phase==='render'||phase==='failure')edit();
        if(phase==='failure')throw Error('render failure after editor save');
        return{buffer:Buffer.from('jpeg'),width:3000,height:4000};
      });
      vi.spyOn(spaces,'uploadBufferToDigitalOceanSpaces').mockResolvedValue({secureUrl:'https://qa.example/rendered.jpg'} as never);
      await expect(processClaimedJob(job as never)).rejects.toThrow('Edition changed');
      expect((paper.pages as Row[])[1]).toMatchObject({imagePath:'/editor-new.jpg',pageType:'photo',reviewStatus:'ready',reviewedBy:{id:'editor'}});
      expect(edited).toBe(true);
      expect(paper.version).toBe(phase==='processing'?5:phase==='finalize'?7:6);
      render.mockResolvedValue({buffer:Buffer.from('jpeg'),width:3000,height:4000});
      await expect(processClaimedJob(job as never)).resolves.toMatchObject({status:'completed'});
      expect((paper.pages as Row[])[1]).toMatchObject({imagePath:'/editor-new.jpg',pageType:'photo',reviewStatus:'ready',reviewedBy:{id:'editor'}});
      vi.restoreAllMocks();
    }
  });
});
