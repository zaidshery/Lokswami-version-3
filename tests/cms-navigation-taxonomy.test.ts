import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NEWS_CATEGORIES, CMS_READER_CATEGORIES, resolveNewsCategory } from '@/lib/constants/newsCategories';
const mocks=vi.hoisted(()=>({ readFile:vi.fn(),writeFile:vi.fn(),mkdir:vi.fn(),mongo:vi.fn(),find:vi.fn(),insert:vi.fn() }));
vi.mock('fs/promises',()=>({default:{readFile:mocks.readFile,writeFile:mocks.writeFile,mkdir:mocks.mkdir}}));
vi.mock('@/lib/db/mongoAvailability',()=>({isMongoAvailable:mocks.mongo}));
vi.mock('@/lib/models/Category',()=>({default:{find:mocks.find,insertMany:mocks.insert}}));
import { getAdminCategories } from '@/lib/server/content/adminTaxonomyService';
describe('CMS navigation taxonomy defaults',()=>{
  const existing=[...NEWS_CATEGORIES, CMS_READER_CATEGORIES[0]].map(c=>({name:c.nameEn,slug:c.slug}));
  const added=['maharashtra','rajasthan','uttar-pradesh','gujarat','lokswami-special','kisaan','jobs','sarkari-yojana','dharm-jyotish'];
  beforeEach(()=>{vi.clearAllMocks();mocks.mkdir.mockResolvedValue(undefined);mocks.writeFile.mockResolvedValue(undefined);mocks.insert.mockResolvedValue(undefined);});
  it('adds only missing file-store defaults and retains existing records',async()=>{
    mocks.mongo.mockResolvedValue(false);mocks.readFile.mockResolvedValue(JSON.stringify(existing));
    const result=await getAdminCategories();
    expect(result.filter(c=>added.includes(c.slug)).map(c=>c.slug).sort()).toEqual([...added].sort());
    expect(result.filter(c=>c.slug==='madhya-pradesh')).toHaveLength(1);
    for(const category of existing)expect(result).toContainEqual(category);
    const saved=JSON.parse(mocks.writeFile.mock.calls[0][1]);expect(saved).toEqual(result);
  });
  it('seeds the same canonical defaults in Mongo without file writes',async()=>{
    const previous=process.env.MONGODB_URI;process.env.MONGODB_URI='mongodb://example.invalid/test';
    try{
      mocks.mongo.mockResolvedValue(true);
      mocks.find.mockReturnValue({sort:()=>({lean:async()=>existing})});
      await getAdminCategories();
      expect(mocks.insert.mock.calls[0][0].map((c:{slug:string})=>c.slug).sort()).toEqual([...added].sort());
      expect(mocks.writeFile).not.toHaveBeenCalled();
    }finally{if(previous===undefined)delete process.env.MONGODB_URI;else process.env.MONGODB_URI=previous;}
  });
  it.each(CMS_READER_CATEGORIES)('resolves canonical names and aliases for $slug',category=>{
    for(const alias of [category.slug,category.name,category.nameEn,...category.aliases])expect(resolveNewsCategory(alias.toUpperCase())?.slug).toBe(category.slug);
  });
});
