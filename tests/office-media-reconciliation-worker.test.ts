import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const loadWorker = createRequire(import.meta.url);
const {assertOfficeEnvironment,parseOptions,runBounded}=loadWorker('../scripts/media/run-office-reconciliation.cjs');
const env={MONGODB_URI:'mongodb://127.0.0.1:27038/lokswami_phase318c_office_qa_20261013?directConnection=true',
  LOKSWAMI_CMS_QA:'true',LOKSWAMI_CMS_QA_DB_NAME:'lokswami_phase318c_office_qa_20261013',DIGITALOCEAN_SPACES_BUCKET:'lokswami-staging-media',
  DIGITALOCEAN_SPACES_REGION:'sgp1',DIGITALOCEAN_SPACES_ACCESS_KEY:'qa-key',DIGITALOCEAN_SPACES_SECRET_KEY:'qa-secret',
  LOKSWAMI_QA_SPACES_ACCESS_KEY_SHA256:crypto.createHash('sha256').update('qa-key').digest('hex')};

describe('bounded office media reconciliation worker',()=>{
  let directory='';
  afterEach(()=>{if(directory)fs.rmSync(directory,{recursive:true,force:true});directory='';});
  it.each([{MONGODB_URI:'mongodb://remote.example:27038/lokswami_phase318c_office_qa_20261013'},
    {MONGODB_URI:'mongodb://127.0.0.1:27038/production'},{DIGITALOCEAN_SPACES_BUCKET:'production-media'},
    {LOKSWAMI_CMS_QA:'false'},{LOKSWAMI_QA_SPACES_ACCESS_KEY_SHA256:'wrong'}])('fails closed for unsafe targets %j',override=>{
    expect(()=>assertOfficeEnvironment({...env,...override})).toThrow();
  });
  it.each([['--cycles','0'],['--cycles','11'],['--limit','101'],['--interval-ms','0'],['--max-runtime-ms','600001'],['--unknown','2']])('rejects unbounded/unknown arguments %j',args=>{
    expect(()=>parseOptions(args)).toThrow();
  });
  it('holds an exclusive cross-process file lock for the full cycle and does not run overlapping work',async()=>{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'lokswami-office-worker-test-'));
    let release!: (value:unknown)=>void;
    const pending=new Promise(resolve=>{release=resolve});
    const firstService={reconcileCleanupDetailed:vi.fn(()=>pending)},secondService={reconcileCleanupDetailed:vi.fn()};
    const log=vi.fn(),options=parseOptions(['--cycles','1','--limit','2']);
    const first=runBounded({env,options,service:firstService,log,lockRoot:directory});
    const second=await runBounded({env,options,service:secondService,log,lockRoot:directory});
    expect(second.skipped).toBe(true);
    expect(secondService.reconcileCleanupDetailed).not.toHaveBeenCalled();
    expect(firstService.reconcileCleanupDetailed).toHaveBeenCalledWith(expect.any(Date),{limit:2,cursor:null});
    release({deleted:0,failed:0,retained:1,blocked:1,progress:{considered:2,nextCursor:null,wrapped:false}});
    expect((await first).completed).toBe(1);
    expect(fs.readdirSync(directory)).toEqual(['lokswami-office-media-'+env.LOKSWAMI_CMS_QA_DB_NAME+'.cursor.json']);
  });

  it('resumes durable progress across separately locked worker invocations and saves wrap/reset',async()=>{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'lokswami-office-worker-test-'));
    const cursor={cutoff:'2026-10-13T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',id:'000000000000000000000002'};
    const first={reconcileCleanupDetailed:vi.fn(async()=>({progress:{considered:2,nextCursor:cursor,wrapped:false}}))};
    const next={reconcileCleanupDetailed:vi.fn(async()=>({progress:{considered:1,nextCursor:null,wrapped:true}}))};
    const options=parseOptions(['--cycles','1','--limit','2']),log=vi.fn();
    await runBounded({env,options,service:first,log,lockRoot:directory});
    await runBounded({env,options,service:next,log,lockRoot:directory});
    expect(next.reconcileCleanupDetailed).toHaveBeenCalledWith(expect.any(Date),{limit:2,cursor});
    const checkpoint=JSON.parse(fs.readFileSync(path.join(directory,'lokswami-office-media-'+env.LOKSWAMI_CMS_QA_DB_NAME+'.cursor.json'),'utf8'));
    expect(checkpoint.cursor).toBeNull();
  });

  it('retains the last successful checkpoint when selection fails and releases only its own lock',async()=>{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'lokswami-office-worker-test-'));
    const cursor={cutoff:'2026-10-13T00:00:00.000Z',updatedAt:'2026-10-01T00:00:00.000Z',id:'000000000000000000000002'};
    const options=parseOptions(['--cycles','1','--limit','2']),log=vi.fn();
    await runBounded({env,options,service:{reconcileCleanupDetailed:async()=>({progress:{considered:2,nextCursor:cursor}})},log,lockRoot:directory});
    const cursorPath=path.join(directory,'lokswami-office-media-'+env.LOKSWAMI_CMS_QA_DB_NAME+'.cursor.json'),before=fs.readFileSync(cursorPath);
    await expect(runBounded({env,options,service:{reconcileCleanupDetailed:async()=>{throw new Error('database unavailable')}},log,lockRoot:directory})).rejects.toThrow('database unavailable');
    expect(fs.readFileSync(cursorPath)).toEqual(before);
    expect(fs.existsSync(path.join(directory,'lokswami-office-media-'+env.LOKSWAMI_CMS_QA_DB_NAME+'.lock'))).toBe(false);
  });

  it('refuses a checkpoint from another storage scope without running cleanup',async()=>{
    directory=fs.mkdtempSync(path.join(os.tmpdir(),'lokswami-office-worker-test-'));
    fs.writeFileSync(path.join(directory,'lokswami-office-media-'+env.LOKSWAMI_CMS_QA_DB_NAME+'.cursor.json'),JSON.stringify({version:1,database:env.LOKSWAMI_CMS_QA_DB_NAME,bucket:'other',region:'sgp1',cursor:null}));
    const service={reconcileCleanupDetailed:vi.fn()};
    await expect(runBounded({env,options:parseOptions([]),service,log:vi.fn(),lockRoot:directory})).rejects.toThrow('scope');
    expect(service.reconcileCleanupDetailed).not.toHaveBeenCalled();
  });
});
