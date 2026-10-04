import {expect,test} from '@playwright/test';

// Opt-in released-data acceptance; never create content to make this suite pass.
const issues=[['epaper',process.env.READER_QA_PAPER_ID],['emagazine',process.env.READER_QA_MAGAZINE_ID]];
const modes=[['light','light'],['dark','light'],['auto','light'],['auto','dark']];
for(const [type,id] of issues) for(const width of [1440,390]) for(const [preference,system] of modes) {
  test(`${type} ${width}px ${preference}/${system}: direct, refresh, internal navigation`,async({browser})=>{
    test.skip(!id,'Provide an existing released publication ID for real-data acceptance.');
    const context=await browser.newContext({viewport:{width,height:900},hasTouch:width===390,colorScheme:system});
    await context.route('**/api/**',route=>route.request().method()==='GET'?route.continue():route.fulfill({json:{success:true}}));
    await context.addInitScript(({preference,system})=>{
      if(!localStorage.getItem('lokswami-storage')) localStorage.setItem('lokswami-storage',JSON.stringify({state:{theme:preference==='auto'?system:preference,themePreference:preference,language:'hi'},version:0}));
    },{preference,system});
    const page=await context.newPage();const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const route=type==='epaper'?'epaper':'e-magazine';
    const url=`/main/${route}?paper=${id}&page=1`;
    const effective=preference==='auto'?system:preference;
    const reader=page.locator('[data-publication-reader-frame]');
    async function ready(){
      await expect(reader).toBeVisible();
      await expect(reader.getByRole('button',{name:'Share edition',exact:true})).toBeEnabled();
      await expect(reader.locator(`button[aria-label="Switch reader to ${effective==='dark'?'light':'dark'} mode"]:visible`)).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute('data-theme',effective);
      expect(errors).toEqual([]);
    }
    try {
      const response=await page.goto(url);
      expect(await response.text()).toContain('Switch reader to light mode');
      await ready();
      await page.reload();await ready();
      if(preference==='auto'){
        const before=await reader.boundingBox();
        await page.emulateMedia({colorScheme:system==='dark'?'light':'dark'});
        await expect(page.locator('html')).toHaveAttribute('data-theme',system==='dark'?'light':'dark');
        const after=await reader.boundingBox();expect(after).toEqual(before);
        await page.emulateMedia({colorScheme:system});await ready();
      }
      const detail=await context.request.get(`/api/epapers/${id}?publicationType=${type}`);
      const payload=await detail.json();expect(payload.success).toBe(true);
      await page.goto(`/main/${route==='epaper'?'e-magazine':'epaper'}`);
      const dismiss=page.getByRole('button',{name:'Dismiss popup',exact:true});
      if(await dismiss.isVisible()) await dismiss.click();
      await page.locator(`a[href="/main/${route}"]:visible`).first().click();
      if(await dismiss.isVisible()) await dismiss.click();
      await page.getByText(payload.data.title,{exact:true}).first().click();
      await ready();
      expect(errors).toEqual([]);
    }finally{await context.close();}
  });
}
