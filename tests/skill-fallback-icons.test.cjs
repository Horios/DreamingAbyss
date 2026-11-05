const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

async function startParty(page){
  await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();selectHero(10);setTab('skills');});
  await page.waitForTimeout(60);await page.evaluate(()=>closeModal());
}

// The skills page shows the protagonist's loadout and the class catalog (技能圖鑑); classes are no longer browsed by tabs.
test('Chromium: every class catalog skill has a compact local SVG without changing the selected companion',async()=>{
  for(let job=0;job<4;job++){
   const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'}),page=game.page;
   try{
      const requests=[];page.on('request',r=>{if(!/^http:\/\/localhost\/preview\/(js|css|data)\//.test(r.url())&&r.url()!=='http://localhost/preview/')requests.push(r.url());});
      await page.evaluate(job=>{selectSaveSlot(1);start(job);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();selectHero(10);setTab('skills');openSkillCatalog();},job);
      // v0.092: every catalog list item carries the skill icon; the right pane details the selected skill.
      const rows=await page.locator('#modal .skill-catalog-item').count();assert(rows>0,'job '+job);
      assert.equal(await page.locator('#modal .skill-catalog-item .skill-icon-glyph svg').count(),rows,'every catalog entry has an icon');
      assert.equal(await page.locator('#modal .skill-catalog-detail .skill-candidate .skill-slot-name svg').count(),1,'the selected skill shows its icon');
      const icons=await page.locator('#modal .skill-catalog-item svg').evaluateAll(list=>list.map(svg=>({width:svg.getBoundingClientRect().width,visible:getComputedStyle(svg).visibility,geometry:svg.querySelectorAll('path,circle,rect,line,polyline,polygon,ellipse').length,hidden:svg.closest('[aria-hidden]')?.getAttribute('aria-hidden')})));
      for(const icon of icons){assert(icon.width>=16&&icon.width<=48,JSON.stringify(icon));assert.equal(icon.visible,'visible');assert(icon.geometry>0);assert.equal(icon.hidden,'true');}
      assert.equal(await page.evaluate(()=>party.selected),10,'opening the catalog keeps the selected companion');
      assert.deepEqual(requests,[],'icons are local');assert.deepEqual(game.errors,[]);
   }finally{await game.browser.close();}
  }
});

test('Chromium: configured custom/Lucide icons and semantic fallback survive reload in the catalog and loadout',async()=>{
  const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'}),page=game.page;
  try{
    await startParty(page);
    await page.evaluate(async()=>{
      const doc=exportableBalance(),def=id=>doc.skillSystem.definitions.find(s=>s.id===id);
      doc.skillIcons=[{id:'fallback-test',name:'自訂火焰',layers:[{kind:'icon',icon:'lucide:flame',x:0,y:0,scale:1,rotation:0}],appearance:__EMBERWILD_SKILL_ICONS.normalizeAppearance({size:48,color:'#fa7312',opacity:.75,effect:'float'})},...doc.skillIcons.filter(x=>x)];
      // Icons are set on the canonical definitions (skill system v1 projects classes[].skills from them).
      def('job0-core0').iconType='custom:fallback-test';def('job0-core1').iconType='lucide:shield';
      Object.assign(def('job0-core2'),{iconType:'auto',name:'臨時治療技能',effect:'heal'});
      def('class0-initial0').iconType='custom:fallback-test';
      // Only the JSON import keeps a Preview balance across reloads.
      const text=JSON.stringify(doc);if(await importBalanceJSON({target:{files:[{size:text.length,text:async()=>text}],value:'test'}})!==true)throw Error('import failed');save();setTab('skills');
    });
    const verify=async()=>{
      await page.evaluate(()=>{closeModal();setTab('skills');openSkillCatalog('job0-core0');});
      const custom=page.locator('#modal [data-skill-id="job0-core0"] .skill-slot-name svg').first();
      const appearance=await custom.evaluate(svg=>({width:svg.getBoundingClientRect().width,color:getComputedStyle(svg).color,opacity:getComputedStyle(svg).opacity,animation:getComputedStyle(svg.querySelector('.ew-icon-motion')).animationName}));
      assert.deepEqual(appearance,{width:48,color:'rgb(250, 115, 18)',opacity:'0.75',animation:'tr-float'});
      await page.evaluate(()=>openSkillCatalog('job0-core1'));assert.equal(await page.locator('#modal [data-skill-id="job0-core1"] .icon-lucide svg').count(),1);
      await page.evaluate(()=>openSkillCatalog('job0-core2'));assert.equal(await page.locator('#modal [data-skill-id="job0-core2"] .icon-heal svg').count(),1);
      await page.evaluate(()=>closeModal());
      assert.equal(await page.locator('[data-skill-slot="active:0"] .icon-custom svg').count(),1,'the loadout slot (initial skill) shows the custom icon');
      // Applying a balance re-applies the team plan, which selects the protagonist by design (team-runtime apply).
    };
    await verify();await page.reload();await page.evaluate(()=>{continueFromTitle();clearInterval(timer);closeModal();});await verify();
    assert.deepEqual(game.errors,[]);
  }finally{await game.browser.close();}
});
