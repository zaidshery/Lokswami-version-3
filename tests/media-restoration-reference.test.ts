import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MediaRepository } from '@/lib/server/media/mediaRepository';

describe('file-store restored Story reference protection', () => {
  const originalUri = process.env.MONGODB_URI;
  let directory = '';
  afterEach(async () => {
    vi.restoreAllMocks();
    if (originalUri === undefined) delete process.env.MONGODB_URI; else process.env.MONGODB_URI=originalUri;
    if (directory) await fs.rm(directory,{recursive:true,force:true});
  });
  it('serializes repeated attachments, preserves cleanup history, and refuses invalid lifecycle/ownership', async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(),'lokswami-reference-test-'));
    vi.spyOn(process,'cwd').mockReturnValue(directory);
    process.env.MONGODB_URI='';
    await fs.mkdir(path.join(directory,'data'));
    const base = {filename:'video.mp4',url:'https://cdn/video.mp4',provider:'do-spaces',
      ownerType:'story',ownerId:'',status:'cleanup_pending',verifiedAt:new Date(),references:[],cleanupError:'provider_cleanup_failed'};
    const records = [ {_id:'good',...base}, {_id:'foreign',...base,ownerId:'other'},
      {_id:'cancelled',...base,status:'cancelled'}, {_id:'deleted',...base,status:'deleted'},
      {_id:'unverified',...base,verifiedAt:null} ];
    await fs.writeFile(path.join(directory,'data/media.json'),JSON.stringify(records));
    const repository=new MediaRepository();
    const results=await Promise.all([repository.attachRestoredStoryReference('good','story'),repository.attachRestoredStoryReference('good','story')]);
    expect(results.every(Boolean)).toBe(true);
    const restored=await repository.getMediaById('good');
    expect(restored).toMatchObject({status:'attached',cleanupError:'provider_cleanup_failed'});
    expect(restored?.references).toHaveLength(1);
    for (const id of ['foreign','cancelled','deleted','unverified']) expect(await repository.attachRestoredStoryReference(id,'story')).toBeNull();
  });
});
