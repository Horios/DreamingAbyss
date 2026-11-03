const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

async function startParty(page){
 await page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();for(const id of [10,12,14]){recruitCompanion(id);closeModal();}save();setTab('roster');});
 await page.waitForTimeout(50);await page.evaluate(()=>closeModal());
}
function combatSnapshot(){
 return {running,partyClock,foes:JSON.parse(JSON.stringify(foes)),effects:JSON.parse(JSON.stringify(effects)),actors:{...actorCooldowns},supports:{...supportCooldowns},build:JSON.parse(JSON.stringify(party.buildSystem)),members:party.members.map(h=>({key:memberKey(h),hp:h.hp,shield:h.shield,job:h.job,stats:h.stats.slice(),skills:h.skills.slice(),supportLevels:h.supportLevels.slice(),equipped:h.equipped.slice()}))};
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

  await p.evaluate(()=>{setTab('battle');toggleBattle();clearInterval(timer);partyClock=7;actorCooldowns={'0-0':4};supportCooldowns={'10-0':3};for(const h of heroes()){h.hp=Math.max(1,stats(h).hp-3);h.shield=2;}save();render();});
  await p.waitForFunction(()=>document.querySelectorAll('.squad-allies .character-avatar-control').length===3);
  assert.equal(await p.locator('.squad-allies .character-avatar-control').count(),3);
  const before=await p.evaluate(combatSnapshot);
  await p.locator('.squad-allies [data-avatar-owner="0"]').click();
  assert.equal(await p.evaluate(()=>running),true);
  await p.locator('[data-avatar-choice="mage"]').click();
  await p.waitForFunction(()=>document.querySelector('.squad-allies [data-avatar-owner="0"]')?.dataset.avatarId==='mage');
  assert.deepEqual(await p.evaluate(combatSnapshot),before);
  await p.locator('.squad-allies [data-avatar-owner="10"]').click();
  await p.locator('[data-avatar-choice="wanderer"]').click();
  await p.waitForFunction(()=>document.querySelector('.squad-allies [data-avatar-owner="10"]')?.dataset.avatarId==='wanderer');
  assert.deepEqual(await p.evaluate(combatSnapshot),before);
  for(const viewport of [{width:1440,height:900},{width:1280,height:600}]){
   await p.setViewportSize(viewport);
   const fits=await p.evaluate(()=>[...document.querySelectorAll('.squad-allies .unit')].every(unit=>{const box=unit.getBoundingClientRect();return [...unit.querySelectorAll('.unit-numbers,.battle-health-bar,.unit-skills')].every(el=>{const r=el.getBoundingClientRect();return r.top>=box.top&&r.bottom<=box.bottom&&r.right<=box.right;});}));
   assert(fits);
   assert(await p.locator('.expedition-control-card').isVisible());assert(await p.locator('.global-battle-journal').isVisible());
  }
  await p.setViewportSize({width:390,height:844});
  const bounds=await p.evaluate(()=>[...document.querySelectorAll('#battleAllyIcons .character-avatar-control')].map(el=>{const r=el.getBoundingClientRect(),strip=el.closest('#battleAllyIcons').getBoundingClientRect(),card=document.querySelector(`[data-combat-id="hero-${el.dataset.avatarOwner}"]`),box=card.getBoundingClientRect(),content=[...card.querySelectorAll('.unit-numbers,.battle-health-bar,.unit-skills')].map(x=>x.getBoundingClientRect());return {visible:r.width>0&&r.height>0,fits:r.left>=strip.left&&r.right<=strip.right&&r.top>=strip.top&&r.bottom<=strip.bottom&&strip.bottom<=box.top,label:el.getAttribute('aria-label'),contentFits:content.every(x=>x.top>=box.top&&x.bottom<=box.bottom&&x.right<=box.right)};}));
  assert(bounds.every(x=>x.visible&&x.fits&&x.label&&x.contentFits));
  await p.locator('.squad-allies [data-avatar-owner="0"]').click();
  const dialog=await p.locator('#modal').boundingBox();assert(dialog.width<=390&&dialog.height<650);
  await p.getByRole('button',{name:'使用職業預設圖示',exact:true}).click();
  await p.waitForFunction(()=>document.querySelector('.squad-allies [data-avatar-owner="0"]')?.dataset.avatarId==='guardian');
  assert.equal(await p.evaluate(()=>Object.prototype.hasOwnProperty.call(playerHero(),'avatarId')),false);
  assert.deepEqual(await p.evaluate(combatSnapshot),before);
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
