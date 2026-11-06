const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
function buildSnapshot(){
 const d=packParty();
 return {build:d.buildSystem,active:d.active,enlisted:d.enlisted,selected:d.selected,members:d.members.map(h=>({job:h.job,lv:h.lv,ap:h.ap,sp:h.sp,stats:h.stats,skills:h.skills,supportLevels:h.supportLevels,active:h.active,procSlots:h.procSlots,supportSlots:h.supportSlots,sockets:h.sockets,equipped:h.equipped,tokenId:h.tokenId,bag:h.bag,gold:h.gold,ore:h.ore,dust:h.dust,gems:h.gems,materials:h.materials}))};
}

async function startParty(page){
 await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();playerHero().lv=5;syncParty();save();});
 await page.waitForTimeout(50);await page.evaluate(()=>closeModal());
}

test('Chromium: team plans and worn companion tokens have one management page',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await startParty(p);
  for(const tab of ['battle','roster','partnerRoster','character','skills','equipment','worn','forge','bossCraft']){
   await p.evaluate(t=>setTab(t),tab);
   assert.equal(await p.locator('.team-plan-panel').count(),tab==='roster'?1:0,tab+' team plans');
   assert.equal(await p.locator('.companion-token-panel').count(),tab==='worn'?1:0,tab+' token management');
  }
  await p.evaluate(()=>{setTab('roster');addTeamPlan();switchTeamPlan('team-2');});
  for(const tab of ['battle','character','skills']){
   await p.evaluate(t=>setTab(t),tab);
   assert.equal(await p.locator('.team-plan-panel').count(),0);
   assert.equal(await p.getByRole('button',{name:'前往隊伍編成',exact:true}).count(),1);
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Chromium: companion roster excludes the protagonist and counts recruited companions only',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);playerHero().name='名冊排除主角';setTab('partnerRoster');});
  await p.waitForTimeout(50);await p.evaluate(()=>closeModal());
  assert.equal(await p.locator('.partner-owned-list .roster-row').count(),0);
  assert.match(await p.locator('main .heading .tag').innerText(),/持有 0 · 現役 0 \/ 5/);
  assert.match(await p.locator('.partner-roster-empty').innerText(),/尚未招募任何夥伴/);
  assert.doesNotMatch(await p.locator('main').innerText(),/名冊排除主角/);
  await p.getByRole('button',{name:'招募夥伴',exact:true}).click();
  await p.locator('#modal .roster-row').first().getByRole('button',{name:'招募',exact:true}).click();
  await p.waitForFunction(()=>party.members.length===2);
  assert.equal(await p.locator('.partner-owned-list .roster-row').count(),1);
  assert.equal(await p.locator('.partner-owned-list [data-member-key="0"]').count(),0);
  assert.equal(await p.locator('.partner-roster-empty').count(),0);
  assert.match(await p.locator('main .heading .tag').innerText(),/持有 1 · 現役 1 \/ 5/);
  assert.equal(await p.locator('[data-member-key="10"] .companion-roster-ability').count(),1);
  assert.equal(await p.locator('[data-member-key="10"] .companion-roster-skills').count(),1);
  await p.evaluate(()=>{toggleMember(10);setPartnerEnlisted(10,false);});
  assert.equal(await p.locator('.partner-owned-list .roster-row').count(),1);
  assert.match(await p.locator('main .heading .tag').innerText(),/持有 1 · 現役 0 \/ 5/);
  await p.evaluate(()=>{setPartnerEnlisted(10,true);party.active=[10];setPartnerEnlisted(0,false);});
  assert.equal(await p.locator('.partner-owned-list [data-member-key="0"]').count(),0);
  assert.match(await p.locator('main .heading .tag').innerText(),/持有 1 · 現役 1 \/ 6/);
  assert.doesNotMatch(await p.locator('main').innerText(),/名冊排除主角/);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Chromium: protagonist pages stay independent of companion selection and class browsing preserves builds',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await startParty(p);
  await p.evaluate(()=>{__EMBERWILD_TEAMS.build().permanent.masteries.sword=__EMBERWILD_MASTERY.masteryStepCost(0);playerHero().name='主角測試';partyMember(10).name='夥伴測試';party.selected=10;state=partyMember(10);pageHeroSelection.set('character',10);pageHeroSelection.set('skills',10);save();setTab('character');});
  assert.equal(await p.locator('.page-hero-tabs').count(),0);
  assert.equal(await p.locator('.companion-character-section').count(),0);
  assert.match(await p.locator('main').innerText(),/主角測試/);
  assert.doesNotMatch(await p.locator('main').innerText(),/夥伴測試/);
  // Stat point allocation was retired (natural growth only); the character page offers no allocation control.
  assert.equal(await p.locator('[id^="stat-alloc-"]').count(),0);
  const statsOf=()=>p.evaluate(()=>JSON.stringify([stats(playerHero()),stats(partyMember(10))]));const statsBefore=await statsOf();
  await p.evaluate(()=>render());assert.equal(await statsOf(),statsBefore,'viewing the page changes nobody');
  // Skill system v1: the skills page and its 技能圖鑑 always describe the protagonist; there is no class browsing or learning.
  await p.evaluate(()=>{pageHeroSelection.set('skills',10);state=partyMember(10);setTab('skills');});
  assert.equal(await p.locator('.page-hero-tabs').count(),0);
  const builds=await p.evaluate(buildSnapshot),before=await p.evaluate(()=>({job:playerHero().job,player:structuredClone(playerHero().skillLoadout),companion:structuredClone(partyMember(10).skillLoadout)}));
  await p.getByRole('button',{name:'技能圖鑑'}).click();
  assert.match(await p.locator('#modal h2').innerText(),new RegExp(await p.evaluate(()=>CLASSES[playerHero().job].name)+'技能圖鑑'));
  assert.equal(await p.evaluate(()=>[...document.querySelectorAll('#modal [data-skill-id]')].every(n=>__EMBERWILD_SKILLS.byId(n.dataset.skillId).jobs.includes(playerHero().job))),true,'only protagonist class skills');
  await p.evaluate(()=>closeModal());
  assert.deepEqual(await p.evaluate(buildSnapshot),builds);assert.deepEqual(await p.evaluate(()=>({job:playerHero().job,player:playerHero().skillLoadout,companion:partyMember(10).skillLoadout})),before);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Chromium: protagonist class catalog excludes companion-exclusive and monster skills',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await startParty(p);
  // Skill system v1: companion-exclusive definitions (partnerId) never appear in the protagonist's 技能圖鑑.
  await p.evaluate(()=>setTab('skills'));await p.getByRole('button',{name:'技能圖鑑'}).click();
  const ids=await p.locator('#modal [data-skill-id]').evaluateAll(n=>n.map(e=>e.dataset.skillId));
  const rows=await p.evaluate(ids=>ids.map(id=>{const sk=__EMBERWILD_SKILLS.byId(id);return {id,partner:sk.partnerId??null,jobs:sk.jobs,disabled:!!sk.disabled,scope:sk.usageScope||null};}),ids);
  assert(rows.length>0);for(const r of rows){assert.equal(r.partner,null,r.id);assert(r.jobs.includes(0),r.id);assert.equal(r.disabled,false,r.id);assert.notEqual(r.scope,'monster',r.id);}
  const exclusive=await p.evaluate(()=>__EMBERWILD_SKILLS.system().definitions.filter(sk=>sk.partnerId!=null&&sk.jobs.includes(0)).map(sk=>sk.id));
  assert(exclusive.length>0,'the data has warrior-class companion skills to exclude');for(const id of exclusive)assert(!ids.includes(id),id);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
