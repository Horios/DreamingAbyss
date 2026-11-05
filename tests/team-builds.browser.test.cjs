const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
// The 隊伍方案 block is folded by default since v0.059; these tests use its controls, so it starts open.
const OPEN_PLANS={'emberwild-team-plan-panel-open':'1'};
test('Chromium: create blank plans, choose classes, learn, copy, rename, safety gate and exact reload through actual UI',async t=>{
 const game=await openRuntime(root,'index.html',OPEN_PLANS),p=game.page,warnings=[];p.setDefaultTimeout(10000);p.on('dialog',async d=>{warnings.push(d.message());await d.accept(d.type()==='prompt'?'法術編成':undefined);});
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);playerHero().lv=5;syncParty();save();setTab('roster');});await p.waitForTimeout(50);await p.evaluate(()=>closeModal());
  await t.test('new plan has no class, stat allocations, equipment or companions',async()=>{
   await p.getByRole('button',{name:'新增空白隊伍',exact:true}).click();await p.locator('.team-plan-card').nth(1).locator('summary').click();await p.locator('.team-plan-card').nth(1).getByRole('button',{name:'切換',exact:true}).click();
   const a=await p.evaluate(()=>({plan:__EMBERWILD_TEAMS.plan(),hasAP:Object.hasOwn(playerHero(),'ap'),hasSp:Object.hasOwn(playerHero(),'sp')}));assert.equal(a.plan.job,null);assert.deepEqual(a.plan.skills,[]);assert.equal(a.plan.stats,undefined);assert(a.plan.equipped.every(x=>x===null));assert.deepEqual(a.plan.companions,[]);assert.equal(a.hasAP,false);assert.equal(a.hasSp,false);
   await p.waitForFunction(()=>document.querySelector('.adventurer-summary > p')?.textContent==='尚未選擇職業');assert.equal(await p.locator('.adventurer-summary > p').textContent(),'尚未選擇職業');await p.evaluate(()=>toggleBattle());assert.equal(await p.evaluate(()=>running),false);
  });
  await t.test('actual class and skill controls save the current team independently',async()=>{
   await p.getByLabel('本隊主角職業',{exact:true}).selectOption('1');await p.evaluate(()=>setTab('character'));assert.equal(await p.locator('[id^="stat-alloc-"]').count(),0);await p.evaluate(()=>setTab('skills'));
   // Skill system v1: a class's starter skill is learned and equipped automatically; each plan keeps its own loadout.
   assert.match(await p.locator('[data-skill-slot="active:0"]').textContent(),/主動槽 1\s*魔爆/);
   const a=await p.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).buildSystem);assert.equal(a.activeId,'team-2');assert.equal(a.plans[0].job,0);assert.equal(a.plans[0].stats,undefined);assert.equal(a.plans[1].job,1);assert.equal(a.plans[1].stats,undefined);
   assert.equal(a.plans[1].skillLoadout.active[0],'class1-initial0');assert.equal(a.plans[0].skillLoadout.active[0],'class0-initial0','the first plan keeps its own loadout');
  });
  await t.test('copy and rename use actual controls without creating another item or companion',async()=>{
   const count=await p.evaluate(()=>{setTab('roster');return state.bag.length;});await p.locator('.team-plan-card.current').getByRole('button',{name:'複製',exact:true}).click();await p.locator('.team-plan-card.current').getByRole('button',{name:'改名',exact:true}).click();const a=await p.evaluate(()=>({count:state.bag.length,plans:party.buildSystem.plans}));assert.equal(a.count,count);assert.equal(a.plans[1].name,'法術編成');assert.equal(a.plans[1].stats,undefined);assert.equal(a.plans[2].stats,undefined);assert.deepEqual(a.plans[1].equipped,a.plans[2].equipped);
  });
  await t.test('reset and class confirmation leave permanent progress and other plans intact',async()=>{
   // The free skill reset left with the skill-point system; changing class still confirms and keeps other plans and permanent progress.
   const before=await p.evaluate(()=>({copy:structuredClone(party.buildSystem.plans[2].skillLoadout),unlocks:structuredClone(party.buildSystem.permanent.unlocks)}));
   await p.evaluate(()=>setTab('roster'));await p.getByLabel('本隊主角職業',{exact:true}).selectOption('0');assert(warnings.some(s=>s.includes('不符職業的裝備')));
   const after=await p.evaluate(()=>({job:__EMBERWILD_TEAMS.plan().job,copy:party.buildSystem.plans[2].skillLoadout,unlocks:party.buildSystem.permanent.unlocks}));
   assert.equal(after.job,0);assert.deepEqual(after.copy,before.copy,'the copied plan keeps its loadout');assert.deepEqual(after.unlocks,before.unlocks,'permanent unlocks stay');
  });
  // A LV20 party can defeat the LV1 foe at second 0 and end the encounter before the paused-state check;
  // keep a living, durable foe so the paused state is an unfinished encounter.
  await t.test('running and paused encounters disable UI; stopping and safe switching reset HP, cooldowns and the encounter',async()=>{
   await p.evaluate(()=>{setTab('battle');toggleBattle();if(!foes.some(f=>f.hp>0))spawnGroup();foes.forEach(f=>{f.hp=1e9;});playerHero().hp=4;actorCooldowns={'0-0':7};render();setTab('roster');});assert.equal(await p.getByLabel('本隊主角職業',{exact:true}).isDisabled(),true);assert.equal(await p.locator('.team-plan-card').first().getByRole('button',{name:'切換',exact:true}).isDisabled(),true);
   await p.evaluate(()=>{running=false;render();setTab('roster');});assert.equal(await p.getByLabel('本隊主角職業',{exact:true}).isDisabled(),true);await p.getByRole('button',{name:'停止探索並結束遭遇',exact:true}).click();await p.locator('.team-plan-card').first().getByRole('button',{name:'切換',exact:true}).click();const a=await p.evaluate(()=>({hp:playerHero().hp,max:stats(playerHero()).hp,cd:actorCooldowns['0-0']||0,foes:foes.length,clock:partyClock,job:playerHero().job}));assert.equal(a.hp,a.max);assert.equal(a.cd,0);assert.equal(a.foes,0);assert.equal(a.clock,0);assert.equal(a.job,0);
  });
  await t.test('actual save download and file import restore every team and shared resource',async()=>{
   const expected=await p.evaluate(()=>{save();return {build:party.buildSystem,ids:state.bag.map(g=>g.id).sort(),gold:state.gold};});
   await p.evaluate(()=>{openUtilityPanel('options');setOptionsTab('save');});const downloadPromise=p.waitForEvent('download');await p.getByRole('button',{name:'匯出存檔 JSON',exact:true}).click();const file=await (await downloadPromise).path();
   await p.evaluate(()=>renameTeamPlan('team-1','匯入前改名'));
   await p.locator('#options-save-import').setInputFiles({name:'party-roundtrip.json',mimeType:'application/json',buffer:fs.readFileSync(file)});
   await p.locator('#modal').getByRole('button',{name:'確認載入',exact:true}).click();
   assert.deepEqual(await p.evaluate(()=>({build:party.buildSystem,ids:state.bag.map(g=>g.id).sort(),gold:state.gold})),expected);
  });
  await t.test('browser reload restores all snapshots, global mastery and exactly the existing item UIDs',async()=>{
   const before=await p.evaluate(()=>{save();return {build:party.buildSystem,ids:state.bag.map(g=>g.id).sort()};});await p.reload();await p.waitForFunction(()=>globalThis.__EMBERWILD_TEAM_READY&&party?.buildSystem);const after=await p.evaluate(()=>({build:party.buildSystem,ids:state.bag.map(g=>g.id).sort()}));assert.deepEqual(after,before);
  });
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
test('Chromium: worn equipment can be force-sold after a native warning naming all plans, with cancellation and one reward',async()=>{
 const g=await openRuntime(root,'index.html',OPEN_PLANS),p=g.page;p.setDefaultTimeout(10000);
 try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();copyTeamPlan();renameTeamPlan('team-1','戰士甲');renameTeamPlan('team-2','戰士乙');setTab('equipment');});
  await p.waitForTimeout(50);await p.evaluate(()=>closeModal());
  const before=await p.evaluate(()=>({id:state.equipped[0],gold:state.gold,price:equipmentSellPrice(findGear(state.equipped[0]))}));await p.evaluate(id=>selectInventoryGear(id),before.id);const button=p.locator('.inventory-detail-pane button[onclick*="sellGear("]').first();
  assert.equal(await button.isDisabled(),false);let message='';p.once('dialog',async d=>{message=d.message();await d.dismiss();});await button.click();assert(message.includes('戰士甲')&&message.includes('戰士乙'));assert.equal(await p.evaluate(id=>!!findGear(id),before.id),true);
  p.once('dialog',d=>d.accept());await button.click();
  const after=await p.evaluate(id=>({owned:!!findGear(id),refs:__EMBERWILD_TEAM_EQUIPMENT.references(id),gold:state.gold,empty:party.buildSystem.plans.every(p=>p.equipped[0]===null)}),before.id);
  assert.equal(after.owned,false);assert.deepEqual(after.refs,[]);assert(after.empty);assert.equal(after.gold,before.gold+before.price);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('Chromium: preview copies old saves once and never overwrites or resurrects the production slots',async()=>{
 const original=await openRuntime(root,'index.html',OPEN_PLANS);let raw;
 try{raw=await original.page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();const d=packParty();delete d.buildSystem;delete d.members[0].playerId;return JSON.stringify(d);});}finally{await original.browser.close();}
 const stats=JSON.stringify({maps:{}}),g=await openRuntime(root,'index.html',{'emberwild-save-v1':raw,'emberwild-save-v1-backup':raw,'emberwild-save-v1-slot-2':raw,'emberwild-battle-statistics-v1':stats,...OPEN_PLANS,'emberwild-play-time-v1-slot-1':'90000'},{pathname:'/Emberwild/preview/'}),p=g.page;
 try{
  assert.equal(await p.evaluate(()=>KEY),'emberwild-preview-save-v1');assert.match(await p.locator('.title-screen').textContent(),/正式版進度保留/);
  await p.evaluate(()=>{continueFromTitle();clearInterval(timer);closeModal();addTeamPlan();switchTeamPlan('team-2');changePlayerClass(1);save();});
  assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-save-v1')),raw);assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-save-v1-backup')),raw);assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-battle-statistics-v1')),stats);assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-play-time-v1-slot-1')),'90000');assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).buildSystem.plans.length),2);
  await p.reload();assert.equal(await p.evaluate(()=>party.buildSystem.plans.length),2);assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-save-v1')),raw);
  await p.getByRole('button',{name:'刪除存檔欄位 1',exact:true}).click();await p.locator('#modal').getByRole('button',{name:'繼續刪除',exact:true}).click();await p.locator('#modal').getByRole('button',{name:'確認永久刪除',exact:true}).click();
  await p.reload();assert.equal(await p.evaluate(()=>localStorage.getItem(KEY)),null);assert.equal(await p.evaluate(()=>party),null);assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-save-v1')),raw);assert.equal(await p.evaluate(()=>localStorage.getItem(saveKeyForSlot(2))),raw);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('Chromium: designer achievement gates export one no-skill-point contract and game imports it',async t=>{
 const editor=await openRuntime(editorRoot,'balance-editor.html'),game=await openRuntime(root,'index.html',OPEN_PLANS),p=editor.page;
 try{
  await t.test('embedded schema is byte-identical to the runtime model',async()=>{const html=fs.readFileSync(path.join(editorRoot,'balance-editor.html'),'utf8'),embedded=html.split('<script id="team-model-v1">\n')[1].split('\n</script>')[0];assert.equal(embedded,fs.readFileSync(path.join(root,'js/character/team-model.js'),'utf8'));});
  // Skill system v1: the skill database tab edits unlock conditions on the selected definition (classes[].skills is a projection).
  await p.evaluate(()=>{currentSection='skills';render();__EMBERWILD_SKILL_SYSTEM_EDITOR.select('skills',data.classes[0].skills[1].id);render();});
  assert.equal(await p.locator('#teamLearnCost').count(),0);assert.equal(await p.locator('[data-team-point-key="skillPoints"]').count(),0);
  await p.locator('#skillAddBossKill').click();await p.locator('[data-unlock-kind="bossKills"] select').last().selectOption('0');await p.locator('[data-unlock-kind="bossKills"] input[type="number"]').last().fill('2');await p.locator('[data-unlock-kind="bossKills"] input[type="number"]').last().blur();
  await p.locator('#skillAddEliteKill').click();await p.locator('[data-unlock-kind="eliteKills"] select').last().selectOption('0');await p.locator('[data-unlock-kind="eliteKills"] input[type="number"]').last().fill('5');await p.locator('[data-unlock-kind="eliteKills"] input[type="number"]').last().blur();
  await p.locator('#skillAddBossEquipment').click();await p.locator('[data-unlock-kind="bossEquipment"] select').last().selectOption('1');await p.locator('[data-unlock-kind="bossEquipment"] input[type="number"]').last().fill('1');await p.locator('[data-unlock-kind="bossEquipment"] input[type="number"]').last().blur();
  assert.deepEqual(await p.evaluate(()=>validateData()),[]);
  await t.test('download omits skill-point fields and keeps all achievement conditions',async()=>{
   const downloadPromise=p.waitForEvent('download');await p.locator('#exportBtn').click();const file=await (await downloadPromise).path(),doc=JSON.parse(fs.readFileSync(file,'utf8')),sk=doc.classes[0].skills[1];assert.equal(doc.teamSettings?.defaultLearnCost,undefined);assert.equal(doc.balanceSettings.progression.starting.skillPoints,undefined);assert.equal(doc.balanceSettings.progression.levelRewards.skillPoints,undefined);assert.equal(sk.learnCost,undefined);assert.deepEqual(sk.unlockConditions.bossKills,[{mapIndex:0,count:2}]);assert.deepEqual(sk.unlockConditions.eliteKills,[{mapIndex:0,count:5}]);assert.deepEqual(sk.unlockConditions.bossEquipment,[{mapIndex:1,quantity:1}]);
   await game.page.evaluate(d=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);applyBalanceConfig(d);},doc);const out=await game.page.evaluate(()=>({rule:__EMBERWILD_TEAMS.coreRule(0,1),json:exportableBalance(),hasSp:Object.hasOwn(playerHero(),'sp')}));assert.deepEqual(out.rule.unlockConditions,sk.unlockConditions);assert.equal(out.rule.learnCost,undefined);assert.equal(out.json.balanceSettings.progression.starting.skillPoints,undefined);assert.equal(out.json.balanceSettings.progression.levelRewards.skillPoints,undefined);assert.equal(out.hasSp,false);
  });
  assert.deepEqual(editor.errors,[]);assert.deepEqual(game.errors,[]);
 }finally{await editor.browser.close();await game.browser.close();}
});
