const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

async function startParty(page){
  await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();selectHero(10);setTab('skills');});
  await page.waitForTimeout(60);await page.evaluate(()=>closeModal());
}

test('Chromium: every main class skill has a compact local SVG without changing selected companion or builds',async()=>{
  const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'}),page=game.page;
  try{
    await startParty(page);
    const before=await page.evaluate(()=>({selected:party.selected,state:memberKey(state),build:JSON.stringify(__EMBERWILD_TEAMS.build())}));
    const requests=[];page.on('request',r=>requests.push(r.url()));
    for(let job=0;job<4;job++){
      await page.locator(`[data-skill-class="${job}"]`).click();
      await page.waitForFunction(job=>document.querySelector('.player-class-skills')?.dataset.playerSkillClass===String(job),job);
      const rows=await page.locator('.team-skill-tile').count();assert(rows>0);
      assert.equal(await page.locator('.team-skill-tile .skill-icon-glyph svg').count(),rows);
      const icons=await page.locator('.team-skill-tile svg').evaluateAll(icons=>icons.map(svg=>({width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height,visible:getComputedStyle(svg).visibility,geometry:svg.querySelectorAll('path,circle,line,rect,polygon,ellipse').length,hidden:svg.getAttribute('aria-hidden')})));
      for(const icon of icons){assert.equal(icon.width,24);assert.equal(icon.height,24);assert.equal(icon.visible,'visible');assert(icon.geometry>0);assert.equal(icon.hidden,'true');}
      assert.deepEqual(await page.evaluate(()=>({selected:party.selected,state:memberKey(state),build:JSON.stringify(__EMBERWILD_TEAMS.build())})),before);
    }
    assert.deepEqual(requests,[]);assert.deepEqual(game.errors,[]);
  }finally{await game.browser.close();}
});

test('Chromium: configured custom/Lucide icons and semantic fallback survive reload and compact loadout previews',async()=>{
  const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'}),page=game.page;
  try{
    await startParty(page);
    await page.evaluate(()=>{
      const doc=exportableBalance();
      doc.skillIcons=[{id:'fallback-test',name:'自訂火焰',layers:[{kind:'icon',icon:'lucide:flame',x:0,y:0,scale:1,rotation:0}],appearance:__EMBERWILD_SKILL_ICONS.normalizeAppearance({size:48,color:'#fa7312',opacity:.75,effect:'float'})},...doc.skillIcons.filter(x=>x)];
      doc.classes[0].skills[0].iconType='custom:fallback-test';doc.classes[0].skills[1].iconType='lucide:shield';
      doc.classes[0].skills[2].iconType='auto';doc.classes[0].skills[2].name='臨時治療技能';doc.classes[0].skills[2].effect='heal';
      applyBalanceConfig(doc);playerHero().skills[0]=1;playerHero().active=[0,null];__EMBERWILD_TEAMS.capture();selectHero(10);save();setTab('skills');
    });
    const verify=async()=>{
      const custom=page.locator('[data-team-skill="0:core:0"] svg');
      const appearance=await custom.evaluate(svg=>({width:svg.getBoundingClientRect().width,color:getComputedStyle(svg).color,opacity:getComputedStyle(svg).opacity,animation:getComputedStyle(svg.querySelector('.ew-icon-motion')).animationName}));
      assert.deepEqual(appearance,{width:48,color:'rgb(250, 115, 18)',opacity:'0.75',animation:'tr-float'});
      assert.equal(await page.locator('[data-team-skill="0:core:1"] .icon-lucide svg').count(),1);
      assert.equal(await page.locator('[data-team-skill="0:core:2"] .icon-heal svg').count(),1);
      const loadout=page.locator('.skill-loadout-slot strong .icon-custom svg');assert.equal(await loadout.count(),1);
      assert.equal(await loadout.evaluate(svg=>svg.getBoundingClientRect().width),16);
      assert.equal(await page.evaluate(()=>party.selected),10);
    };
    await verify();await page.reload();await page.evaluate(()=>{continueFromTitle();clearInterval(timer);closeModal();setTab('skills');});await verify();
    assert.deepEqual(game.errors,[]);
  }finally{await game.browser.close();}
});
