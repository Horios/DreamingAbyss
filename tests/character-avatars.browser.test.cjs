const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

async function startParty(page){
 await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();for(const id of [10,12,14]){recruitCompanion(id);closeModal();}save();setTab('roster');});
 await page.waitForTimeout(50);await page.evaluate(()=>closeModal());
}
function combatSnapshot(){
 return {running,partyClock,foes:JSON.parse(JSON.stringify(foes)),effects:JSON.parse(JSON.stringify(effects)),actors:{...actorCooldowns},supports:{...supportCooldowns},build:JSON.parse(JSON.stringify(party.buildSystem)),// Seconds combat keeps its state in the scheduler checkpoint; skill system v1 heroes have no supportLevels array.
  seconds:JSON.parse(JSON.stringify(EmberwildSecondsCombat.pack())),members:party.members.map(h=>JSON.parse(JSON.stringify({key:memberKey(h),hp:h.hp,shield:h.shield,job:h.job,stats:h.stats,skills:h.skills,supportLevels:h.supportLevels??null,equipped:h.equipped})))};
}

test('Chromium: six accessible SVG portraits can be selected in formation and exploration without changing combat',async()=>{
 const g=await openRuntime(root),p=g.page;
 try{
  await startParty(p);
  assert.equal(await p.locator('.roster-row .character-avatar-control').count(),4);
  assert.equal(await p.locator('.character-avatar-control img').count(),0);
  await p.locator('[data-avatar-owner="14"]').click();
  assert.equal(await p.locator('#modal [data-avatar-choice]').count(),6);
  assert.equal(await p.locator('#modal [data-avatar-choice] svg').count(),6);
  assert.equal(await p.locator('#modal [aria-pressed="true"]').count(),1);
  assert.equal(await p.evaluate(()=>document.activeElement.dataset.avatarChoice),'ranger');
  await p.locator('[data-avatar-choice="phoenix"]').click();
  await p.waitForFunction(()=>document.querySelector('[data-avatar-owner="14"]')?.dataset.avatarId==='phoenix');
  await p.waitForFunction(()=>document.activeElement.dataset.avatarOwner==='14');
  assert.equal(await p.evaluate(()=>partyMember(14).avatarId),'phoenix');
  assert.equal(await p.evaluate(()=>party.active.includes(14)),false);
  assert.match(await p.locator('[data-avatar-owner="14"]').getAttribute('aria-label'),/代表圖示：鳳凰/);
  await p.locator('[data-avatar-owner="14"]').click();await p.keyboard.press('Escape');
  await p.waitForFunction(()=>!$('modal').open);
  assert.equal(await p.evaluate(()=>partyMember(14).avatarId),'phoenix');

  // Since v0.041 a battle portrait opens the unit's full data; portraits are chosen in the roster and shown in battle.
  await p.locator('.roster-row [data-avatar-owner="0"]').click();await p.locator('[data-avatar-choice="mage"]').click();
  await p.waitForFunction(()=>playerHero().avatarId==='mage');
  await p.evaluate(()=>{setTab('battle');toggleBattle();clearInterval(timer);partyClock=7;for(const h of heroes()){h.hp=Math.max(1,stats(h).hp-3);h.shield=2;}save();render();});
  await p.waitForFunction(()=>document.querySelectorAll('#battleAllyIcons .battle-ally-icon').length===3);
  const art=()=>p.evaluate(()=>Object.fromEntries([...document.querySelectorAll('#battleAllyIcons .battle-ally-icon')].map(b=>[b.dataset.heroId,b.querySelector('[data-avatar-id]')?.dataset.avatarId])));
  assert.equal((await art())['hero-0'],'mage','the chosen portrait appears on the battle card');
  assert.equal(await p.locator('#battleAllyIcons .character-avatar-control').count(),0,'battle cards have no portrait picker');
  const before=await p.evaluate(combatSnapshot);
  await p.locator('#battleAllyIcons [data-hero-id="hero-0"]').click();
  assert.equal(await p.locator('#modal [data-avatar-choice]').count(),0,'the battle portrait does not open the picker');
  assert.match(await p.locator('#modal').innerText(),/戰士|詳細|生命|HP/);await p.evaluate(()=>closeModal());
  assert.deepEqual(await p.evaluate(combatSnapshot),before,'opening the details never changes combat');
  for(const viewport of [{width:1440,height:900},{width:1280,height:600},{width:390,height:844}]){
   await p.setViewportSize(viewport);await p.evaluate(()=>render());
   const fits=await p.evaluate(()=>[...document.querySelectorAll('#battleAllyIcons .unit')].every(unit=>{const box=unit.getBoundingClientRect();return [...unit.querySelectorAll('.battle-ally-icon,.unit-numbers,.battle-health-bar')].every(el=>{const r=el.getBoundingClientRect();return r.width>0&&r.top>=box.top-1&&r.bottom<=box.bottom+1&&r.left>=box.left-1&&r.right<=box.right+1;});}));
   assert(fits,'portraits and numbers stay inside each card at '+viewport.width);
   assert(await p.locator('[data-adventure-config]').isVisible(),'adventure settings open from the toolbar');
  }
  // Back to the class default from the roster; battle follows.
  await p.evaluate(()=>setTab('roster'));await p.locator('.roster-row [data-avatar-owner="0"]').click();
  await p.getByRole('button',{name:'使用職業預設圖示',exact:true}).click();
  await p.waitForFunction(()=>!Object.prototype.hasOwnProperty.call(playerHero(),'avatarId'));
  await p.evaluate(()=>{closeModal();setTab('battle');render();});assert.equal((await art())['hero-0'],'guardian');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Chromium: actor portraits survive class and team switches, real save export/import and cold reload',async()=>{
 const g=await openRuntime(root),p=g.page;p.on('dialog',d=>d.accept());
 try{
  await startParty(p);
  await p.evaluate(()=>{setCharacterAvatar(0,'phoenix');setCharacterAvatar(10,'wanderer');setCharacterAvatar(14,'healer');copyTeamPlan();changePlayerClass(1);switchTeamPlan('team-2');save();});
  const expected=await p.evaluate(()=>({avatars:party.members.map(h=>({key:memberKey(h),avatarId:h.avatarId??null})),job:playerHero().job,active:party.buildSystem.activeId}));
  assert.equal(expected.job,0);
  await p.evaluate(()=>{openUtilityPanel('options');setOptionsTab('save');});const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'匯出存檔 JSON',exact:true}).click();await p.evaluate(()=>closeModal());
  const file=await (await downloadPromise).path(),doc=JSON.parse(fs.readFileSync(file,'utf8'));
  assert.equal(doc.members[0].avatarId,'phoenix');assert.equal(doc.members.find(h=>h.companionId===10).avatarId,'wanderer');
  await p.evaluate(()=>setCharacterAvatar(0,'guardian'));
  await p.locator('header input[type="file"]').setInputFiles({name:'avatar-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await p.locator('#modal').getByRole('button',{name:'確認載入',exact:true}).click();
  assert.deepEqual(await p.evaluate(()=>({avatars:party.members.map(h=>({key:memberKey(h),avatarId:h.avatarId??null})),job:playerHero().job,active:party.buildSystem.activeId})),expected);
  await p.reload();await p.waitForFunction(()=>globalThis.__EMBERWILD_TEAM_READY&&party?.buildSystem);
  assert.deepEqual(await p.evaluate(()=>({avatars:party.members.map(h=>({key:memberKey(h),avatarId:h.avatarId??null})),job:playerHero().job,active:party.buildSystem.activeId})),expected);
  await p.evaluate(()=>{continueFromTitle();clearInterval(timer);closeModal();setTab('roster');});
  assert.equal(await p.locator('[data-avatar-owner="0"]').getAttribute('data-avatar-id'),'phoenix');
  assert.equal(await p.locator('[data-avatar-owner="10"]').getAttribute('data-avatar-id'),'wanderer');
  await p.evaluate(()=>{setCharacterAvatar(0,'');changePlayerClass(2);setTab('roster');});
  assert.equal(await p.locator('[data-avatar-owner="0"]').getAttribute('data-avatar-id'),'ranger');
  assert.equal(await p.evaluate(()=>Object.prototype.hasOwnProperty.call(playerHero(),'avatarId')),false);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('Chromium: legacy defaults migrate and malformed portrait IDs reject atomically before import or cold boot',async()=>{
 const g=await openRuntime(root),p=g.page;let invalidBoot;
 try{
  await startParty(p);
  const result=await p.evaluate(()=>{
   const doc=packParty(),live=party,before=JSON.stringify(party.buildSystem);let rejected=0;
   for(const bad of ['<svg onload="alert(1)">','https://example.test/avatar.svg','unknown',1,{},[]]){
    const d=JSON.parse(JSON.stringify(doc));d.members[1].avatarId=bad;
    try{loadParty(d);}catch(e){if(e.message.includes('角色圖示無效'))rejected++;}
   }
   const legacy=JSON.parse(JSON.stringify(doc.members[0]));legacy.version=2;delete legacy.avatarId;
   const old=validateParty(legacy),oldDefaults=old.members.map(h=>EmberwildAvatars.resolvedId(h));
   const noAvatars=JSON.parse(JSON.stringify(doc));for(const h of noAvatars.members)delete h.avatarId;
   const modern=validateParty(noAvatars);
   for(const value of [null,'']){const d=JSON.parse(JSON.stringify(doc));d.members[0].avatarId=value;validateParty(d);}
   return {rejected,same:live===party,buildUnchanged:before===JSON.stringify(party.buildSystem),oldDefaults,modernDefaults:modern.members.map(h=>EmberwildAvatars.resolvedId(h)),raw:doc};
  });
  assert.equal(result.rejected,6);assert(result.same&&result.buildUnchanged);assert.deepEqual(result.oldDefaults,['guardian']);assert.deepEqual(result.modernDefaults,['guardian','guardian','mage','ranger']);
  const invalid=structuredClone(result.raw);invalid.members[0].avatarId='invalid-avatar';invalidBoot=JSON.stringify(invalid);
  await p.locator('header input[type="file"]').setInputFiles({name:'invalid-avatar.json',mimeType:'application/json',buffer:Buffer.from(invalidBoot)});
  await p.waitForFunction(()=>document.getElementById('toast')?.textContent.includes('角色圖示無效'));
  assert.equal(await p.evaluate(()=>pendingImport),null);
  assert.equal(await p.locator('#modal').evaluate(el=>el.open),false);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
 const boot=await openRuntime(root,'index.html',{'emberwild-save-v1':invalidBoot});
 try{
  assert.equal(await boot.page.evaluate(()=>party),null);
  assert.equal(await boot.page.evaluate(()=>localStorage.getItem('emberwild-save-v1')),invalidBoot);
  assert.match(await boot.page.evaluate(()=>globalThis.__EMBERWILD_BOOT_SAVE_ERROR),/角色圖示無效/);
  await boot.page.evaluate(()=>selectSaveSlot(1));
  assert.match(await boot.page.locator('#modal').innerText(),/角色圖示無效/);
  assert.deepEqual(boot.errors,[]);
 }finally{await boot.browser.close();}
});
