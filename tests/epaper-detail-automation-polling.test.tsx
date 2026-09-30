import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import DetailPage from '@/app/(admin)/admin/epapers/[id]/page';
const config=vi.hoisted(()=>({type:'epaper'}));
vi.mock('next/navigation',()=>({useParams:()=>({id:'qa-revision'}),usePathname:()=>config.type==='emagazine'?'/admin/emagazines/qa-revision':'/admin/epapers/qa-revision',useRouter:()=>({push:vi.fn()})}));
vi.mock('next-auth/react',()=>({useSession:()=>({data:{user:{role:'super_admin'}}})}));
vi.mock('@/lib/auth/clientToken',()=>({getAuthHeader:()=>({})}));
afterEach(()=>{cleanup();vi.useRealTimers();vi.unstubAllGlobals();});
describe('revision automation polling with no PDF job',()=>{
  it.each(['epaper','emagazine'])('refreshes %s canonical readiness and publish controls when automation becomes ready',async(type)=>{
    config.type=type;let ready=false;let editionLoads=0;
    const page={pageNumber:1,imagePath:'/qa.png',pageType:'editorial',processingStatus:'ready',reviewStatus:'ready'};
    const fetch=vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input);let data:unknown=[];
      if(url.includes('/processing'))data={job:null,pageCount:1,pages:[page],productionStatus:ready?'ready_to_publish':'hotspot_mapping',automation:{stage:ready?'ready_to_publish':'hotspot_mapping',generation:'qa-generation',revisionNumber:2,page:{total:1,ready:1,processing:0,failed:0,missing:0},ocr:{enabled:false,eligible:0,queued:0,processing:0,completed:0,failed:0,skipped:0,pendingSuggestions:0,terminal:true},mappedStories:1,blockers:[],warnings:[],nextAutomaticAction:'',lastReconciledAt:''}};
      else if(url.includes('?publicationType=')){editionLoads++;data={_id:'qa-revision',title:'QA revision',publicationType:type,publishDate:'2027-04-01',citySlug:type==='emagazine'?'global':'indore',status:'draft',supersedesId:'source',version:ready?5:4,productionStatus:ready?'ready_to_publish':'hotspot_mapping',pageCount:1,pages:[page],readiness:{status:ready?'ready':'not-ready',blockers:ready?[]:['Page QA pending'],warnings:[],pageImageCoveragePercent:100,hotspotCoveragePercent:100,textCoveragePercent:100,pagesWithImage:1,mappedArticles:1}};}
      return {ok:true,json:async()=>({success:true,data})} as Response;
    });
    vi.stubGlobal('fetch',fetch);vi.useFakeTimers();
    await act(async()=>{render(<DetailPage/>);await vi.advanceTimersByTimeAsync(0);});
    expect(screen.queryByRole('button',{name:type==='epaper'?'Publish Edition':'Publish Issue'})).toBeNull();
    ready=true;
    await act(async()=>{await vi.advanceTimersByTimeAsync(5000);});
    expect(editionLoads).toBe(2);
    expect(screen.getAllByRole('button',{name:type==='epaper'?'Publish Edition':'Publish Issue'}).length).toBeGreaterThan(0);
    const polls=fetch.mock.calls.filter(([input])=>String(input).includes('/processing')).length;
    await act(async()=>{await vi.advanceTimersByTimeAsync(10000);});
    expect(fetch.mock.calls.filter(([input])=>String(input).includes('/processing')).length).toBe(polls);
  });
});
