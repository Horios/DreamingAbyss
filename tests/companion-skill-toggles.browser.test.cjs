const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=require('./runtime.cjs').balanceRoot(root);
test('Chromium: roster has no retired skill toggles; unlock levels, designer visibility and unlock rules reach the game',async()=>{
 const g=await openRuntime(root),e=await openRuntime(editorRoot,'balance-editor.html');const page=g.page;page.setDefaultTimeout(10000);
 try{
  await page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();for(const id of [10,11,13]){recruitCompanion(id);closeModal();}setTab('partnerRoster');});
  // Skill system v1 retired the per-skill switches: the roster shows no toggles and every unlocked skill stays in use.
  await page.evaluate(()=>{setClassMasteryLevel(7,playerHero());syncParty();render();});
  assert.equal(await page.locator('[data-companion-toggle]').count(),0);
  assert.equal(await page.evaluate(()=>setCompanionSkillEnabled(10,'core',__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(10)).core[0],false)),false);
  assert.deepEqual(await page.evaluate(()=>partyMember(10).disabledCompanionSkills||{core:[],support:[],passive:[]}),{core:[],support:[],passive:[]});
  // v0.178: the ticket's details describe the companion (there is no recruiting page).
  const modalSnapshot=await page.evaluate(()=>{grantCompanionTicket(11);setTab('equipment');setInventoryCategory('special');bagCellClick(document.querySelector('.bag-cell[data-bag-ref^="t:11:"]').dataset.bagRef);return document.querySelector('.bag-detail').innerText;});assert.match(modalSnapshot,/技能：/);assert.doesNotMatch(modalSnapshot,/LV\d/,'no character levels since v0.161 (v0.173 text)');
  await e.page.evaluate(()=>selectCompanionDesign(15));assert.equal(await e.page.locator('#companionAvailability').inputValue(),'hidden');assert.equal(await e.page.locator('[data-companion]').count(),20);
  await e.page.locator('#companionAvailability').selectOption('visible');assert.equal(await e.page.evaluate(()=>data.companions.find(p=>p.id===15).availability),'visible');
  await e.page.evaluate(()=>{selectCompanionUnlock(15);document.getElementById('companionUnlockType').value='achievement';document.getElementById('companionUnlockType').dispatchEvent(new Event('change'));openCompanionSkillPage(10,'active');});assert.equal(await e.page.locator('[data-key="requiredLevel"]').inputValue(),'0','old LV1 is class mastery 0');
  const designer=await e.page.evaluate(()=>__EMBERWILD_MASTERY_EDITOR.cleanExport());assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);
  await page.evaluate(d=>{applyBalanceConfig(d);save();loadParty(structuredClone(packParty()));setTab('partnerRoster');},designer);
  assert.equal(await page.evaluate(()=>useCompanionRecruitmentTicket(15)),false,'no ticket: 雷昂 cannot join');assert.equal(await page.evaluate(()=>{grantCompanionTicket(16);return useCompanionRecruitmentTicket(16);}),false,'a hidden companion cannot join by ticket');
  assert.deepEqual(g.errors,[]);assert.deepEqual(e.errors,[]);
 }finally{await g.browser.close();await e.browser.close();}
});
