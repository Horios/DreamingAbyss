const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=path.resolve(root,'../Emberwild-Balance');
test('Chromium: roster has no retired skill toggles; unlock levels, designer visibility and unlock rules reach the game',async()=>{
 const g=await openRuntime(root),e=await openRuntime(editorRoot,'balance-editor.html');const page=g.page;page.setDefaultTimeout(10000);
 try{
  await page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();for(const id of [10,11,13]){recruitCompanion(id);closeModal();}setTab('partnerRoster');});
  // Skill system v1 retired the per-skill switches: the roster shows no toggles and every unlocked skill stays in use.
  await page.evaluate(()=>{playerHero().lv=8;syncParty();render();});
  assert.equal(await page.locator('[data-companion-toggle]').count(),0);
  assert.equal(await page.evaluate(()=>setCompanionSkillEnabled(10,'core',__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(10)).core[0],false)),false);
  assert.deepEqual(await page.evaluate(()=>partyMember(10).disabledCompanionSkills||{core:[],support:[],passive:[]}),{core:[],support:[],passive:[]});
  const modalSnapshot=await page.evaluate(()=>{showCompanionRecruitment();const text=$('modal').innerText;closeModal();return text;});assert.match(modalSnapshot,/LV3/);assert.match(modalSnapshot,/LV8/);
  await e.page.evaluate(()=>selectCompanionDesign(15));assert.equal(await e.page.locator('#companionAvailability').inputValue(),'hidden');assert.equal(await e.page.locator('[data-companion]').count(),20);
  await e.page.locator('#companionAvailability').selectOption('visible');assert.equal(await e.page.evaluate(()=>data.companions.find(p=>p.id===15).availability),'visible');
  await e.page.evaluate(()=>{selectCompanionUnlock(15);document.getElementById('companionUnlockType').value='achievement';document.getElementById('companionUnlockType').dispatchEvent(new Event('change'));openCompanionSkillPage(10,'active');});assert.equal(await e.page.locator('[data-key="requiredLevel"]').inputValue(),'1');
  const designer=await e.page.evaluate(()=>__EMBERWILD_MASTERY_EDITOR.cleanExport());assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);
  await page.evaluate(d=>{applyBalanceConfig(d);save();loadParty(structuredClone(packParty()));setTab('partnerRoster');},designer);
  await page.evaluate(()=>showCompanionRecruitment());const locked=page.locator('#modal .roster-row').filter({hasText:'雷昂'});assert.equal(await locked.count(),1);assert.equal(await locked.getByRole('button',{name:'未解鎖',exact:true}).isDisabled(),true);assert.equal(await page.locator('#modal .roster-row').filter({hasText:'凱斯'}).count(),0);await page.evaluate(()=>closeModal());
  assert.deepEqual(g.errors,[]);assert.deepEqual(e.errors,[]);
 }finally{await g.browser.close();await e.browser.close();}
});
