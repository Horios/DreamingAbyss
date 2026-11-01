const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..'),legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/team-before-companion-skill-pools.json'),'utf8'));
test('Chromium: legacy slot continues without an error, preserves plans and reloads the migrated save',async()=>{
 const expectedPermanent=structuredClone(legacy.buildSystem.permanent);delete expectedPermanent.skillCredit;delete expectedPermanent.abilityCredit;
 // On first migration the former socket gem instances are refunded into
 // inventory and retired. Permanent progression and serial stay intact.
 expectedPermanent.gemInstances={};const r=await openRuntime(root,'index.html',{'emberwild-save-v1':JSON.stringify(legacy)}),p=r.page;
 try{
  assert.equal(await p.evaluate(()=>globalThis.__EMBERWILD_BOOT_SAVE_ERROR??null),null);
  await p.locator('.save-slot-select[onclick="selectSaveSlot(1)"]').click();await p.locator('.title-screen').waitFor({state:'detached'});assert.equal(await p.locator('#modal').evaluate(el=>el.open),false);
  const before=await p.evaluate(()=>({plans:structuredClone(party.buildSystem.plans),permanent:structuredClone(party.buildSystem.permanent),gems:playerHero().gems.slice()}));
  assert(before.plans.every(p=>!Object.hasOwn(p,'stats')),'obsolete allocation removed');
  // Recent releases can legitimately grant new default skills during migration.
  // Preserve all old permanent progress, while permitting additional unlocks.
  for(const [key,value] of Object.entries(expectedPermanent)){
    if(key==='unlocks'){for(const [id,unlocked] of Object.entries(value))assert.equal(before.permanent.unlocks[id],unlocked,id);}
    else assert.deepEqual(before.permanent[key],value,key);
  }
  const expectedGems=Array.from({length:before.gems.length},(_,i)=>legacy.members[0].gems[i]||0);
  for(const type of Object.values(legacy.buildSystem.permanent.gemInstances))expectedGems[type]++;
  assert.deepEqual(before.gems,expectedGems,'legacy socket gems are returned once, never lost');
  await p.evaluate(()=>save());await p.reload();await p.locator('.save-slot-select[onclick="selectSaveSlot(1)"]').click();
  assert.deepEqual(await p.evaluate(()=>({plans:party.buildSystem.plans,permanent:party.buildSystem.permanent,gems:playerHero().gems})),before);assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
test('Chromium: genuinely corrupted skill records still show the recovery dialog and download unchanged original JSON',async()=>{
 const bad=structuredClone(legacy);bad.buildSystem.plans[0].skills[0]=2;
 const bytes=JSON.stringify(bad),r=await openRuntime(root,'index.html',{'emberwild-save-v1':bytes}),p=r.page;
 try{
  await p.locator('.save-slot-select[onclick="selectSaveSlot(1)"]').click();assert.match(await p.locator('#modal').innerText(),/隊伍技能(?:學習)?資料無效/);
  assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-save-v1')),bytes);
  const downloading=p.waitForEvent('download');await p.locator('[onclick="downloadRawLocalSave(\'primary\',1)"]').click();const download=await downloading;assert.deepEqual(JSON.parse(fs.readFileSync(await download.path(),'utf8')),bad);
  assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-save-v1')),bytes);assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Chromium: a corrupt primary restores a valid backup only after full startup, without touching stored bytes',async()=>{
 const primary='{"broken":',backup=JSON.stringify(legacy),r=await openRuntime(root,'index.html',{
  'emberwild-save-v1':primary,'emberwild-save-v1-backup':backup
 }),p=r.page;
 try{
  const boot=await p.evaluate(()=>({
   error:globalThis.__EMBERWILD_BOOT_SAVE_ERROR,
   ready:globalThis.__EMBERWILD_BALANCE_READY,
   party:!!party&&!!state,
   primary:localStorage.getItem('emberwild-save-v1'),
   backup:localStorage.getItem('emberwild-save-v1-backup')
  }));
  assert.equal(boot.ready,true);
  assert.equal(boot.error,null);
  assert.equal(boot.party,true);
  assert.equal(boot.primary,primary,'invalid primary bytes are left available for export');
  assert.equal(boot.backup,backup,'valid backup bytes are not modified during boot');
  await p.locator('.save-slot-select[onclick="selectSaveSlot(1)"]').click();
  await p.locator('.title-screen').waitFor({state:'detached'});
  assert.equal(await p.evaluate(()=>!!party&&!!state),true);
  assert.equal(await p.locator('#modal').evaluate(el=>el.open),false);
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});

test('Chromium: published cold load retains legacy split battle statistics without changing original storage',async()=>{
 const legacyWithoutStats=structuredClone(legacy);delete legacyWithoutStats.battleStatistics;
 const raw=JSON.stringify(legacyWithoutStats),statistics=JSON.stringify({maps:{0:[{
  time:1793390000000,difficulty:0,result:'victory',xp:31,drops:{'鍛鐵':2},deaths:[]
 }]}});
 const r=await openRuntime(root,'index.html',{'emberwild-save-v1':raw,'emberwild-battle-statistics-v1':statistics}),p=r.page;
 try{
  const boot=await p.evaluate(()=>({
   error:globalThis.__EMBERWILD_BOOT_SAVE_ERROR,
   xp:party?.battleStatistics?.maps?.[0]?.[0]?.xp,
   primary:localStorage.getItem('emberwild-save-v1'),
   statistics:localStorage.getItem('emberwild-battle-statistics-v1')
  }));
  assert.equal(boot.error,null);
  assert.equal(boot.xp,31);
  assert.equal(boot.primary,raw);
  assert.equal(boot.statistics,statistics);
  assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
