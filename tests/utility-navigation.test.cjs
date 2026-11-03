const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),A=require('../js/character/achievement-model.js');
const root=path.resolve(__dirname,'..'),json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();for(const m of [...party.mailbox.messages])if(m.rewardKey.startsWith("starter-"))claimMailboxAttachments(m.id)');return r;}
function mail(r){r.run("{const d=exportableBalance(),p=d.companions.find(p=>p.id===15);p.availability='visible';p.unlockCondition={type:'achievement',achievementIds:['region-0-open']};applyBalanceConfig(d);globalThis.testMail=party.mailbox.messages.find(m=>m.rewardKey==='companion-15').id;}");}
test('Three SVG buttons replace sidebar entries and open dialogs without changing the main page; redeem codes remain only in Options',()=>{
 const r=game(),main=r.elements.get('app').innerHTML;for(const id of ['mailbox','achievements','options'])assert(!main.includes(`onclick="setTab('${id}')"`));assert.equal((r.elements.get('utilityNavigation').innerHTML.match(/<svg /g)||[]).length,4,'mailbox, achievements, options and save');
 for(const id of ['mailbox','achievements','options']){assert.equal(r.run(`openUtilityPanel('${id}')`),true);assert.equal(r.run('tab'),'battle');assert.equal(r.elements.get('modal').open,true);assert.equal(r.elements.get('modal').dataset.view,'utility-'+id);assert.equal(r.run(`isUtilityDialogOpen('${id}')`),true);r.run('closeModal()');}
 assert(!r.run('inventoryTabs()').includes('showTestCodes'));r.run('setOptionsTab("other")');assert(r.run('optionsView()').includes('showTestCodes'));assert(!r.run('shopView()').includes('showTestCodes'));
 r.run('setTab("mailbox")');assert.equal(r.run('tab'),'battle');r.run('openUtilityPanel("options");showTestCodes()');assert(!r.run('isUtilityDialogOpen("options")'));assert.match(r.elements.get('modal').innerHTML,/test-code-input/);r.run('render()');assert.match(r.elements.get('modal').innerHTML,/test-code-input/);assert.deepEqual(r.errors,[]);
});
test('Achievement unread count clears when opened, tracks later milestones, survives reload, and respects failed saves',()=>{
 const r=game();assert(r.run('numberBadgeCounts().achievements')>0);r.run('globalThis.originalSave=save;save=()=>false;openUtilityPanel("achievements")');assert(r.run('numberBadgeCounts().achievements')>0);r.run('save=originalSave;closeModal();openUtilityPanel("achievements");closeModal();save()');assert.equal(r.run('numberBadgeCounts().achievements'),0);
 r.run('party.achievements.eliteKills[0]=50;save()');assert.equal(r.run('numberBadgeCounts().achievements'),1);r.run('save()');const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('numberBadgeCounts().achievements'),1);reload.run('continueFromTitle();closeModal();openUtilityPanel("achievements")');assert.equal(reload.run('numberBadgeCounts().achievements'),0);
 reload.run('party.achievements.eliteKills[0]=100;save()');assert.equal(reload.run('numberBadgeCounts().achievements'),0);assert(reload.run('party.achievements.readCompleted.includes("region-0-elite-100")'));
});
test('Mail reminder remains until attachments are claimed and drops to zero without duplicate rewards',()=>{
 const r=game();mail(r);assert.equal(r.run('numberBadgeCounts().mailbox'),1);r.run('openUtilityPanel("mailbox");openMailboxMail(testMail)');assert.equal(r.run('numberBadgeCounts().mailbox'),1);r.run('claimMailboxAttachments(testMail)');assert.equal(r.run('numberBadgeCounts().mailbox'),0);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.elements.get('utilityReminder-mailbox').hidden,true);
});
test('Bag reminder counts unresolved affix drafts once, without a pending-loot reminder',()=>{
 const r=game();r.run('globalThis.a=gear(1,0,0,0);globalThis.b=gear(1,1,0,0);addGear(a);addGear(b);globalThis.g=state.bag[0];inlineAffixDrafts.set(affixDraftKey(g),structuredClone(g.affix));pendingAffix={id:g.id,affix:structuredClone(g.affix)};render()');assert.equal(r.run('numberBadgeCounts().equipment'),1);assert.match(r.elements.get('app').innerHTML,/navReminder-equipment/);
 r.run('pendingAffix=null;render()');assert.equal(r.run('numberBadgeCounts().equipment'),1);r.run('resolveInlineAffix(g.id,false)');assert.equal(r.run('numberBadgeCounts().equipment'),0);r.run('inlineAffixDrafts.set("shared:missing",[])');assert.equal(r.run('numberBadgeCounts().equipment'),0);
});
test('commission reminders count started objectives, exclude side quests and block full-bag rewards',()=>{
 const r=game();r.run(`state.board.tasks.forEach(q=>q.started=false);globalThis.q=state.board.tasks[0];q.started=true;q.done=false;q.objectives=[EmberwildQuestDesign.objective('material','紅色草',3)];q.rewards=EmberwildQuestDesign.reward();q.rewards.gemCounts=[1,0,0];setMaterialCount('紅色草',3);`);assert.equal(r.run('numberBadgeCounts().quests'),1);r.run('claimBoard(q.id)');assert.equal(r.run('numberBadgeCounts().quests'),0);
 r.run(`q.done=false;setMaterialCount('紅色草',3);q.rewards.gear=[{tier:1,slot:0,job:0,rar:0,quantity:1,legendaryChance:0}];globalThis.cap=GAMEPLAY_SETTINGS.equipment.bagCapacity;GAMEPLAY_SETTINGS.equipment.bagCapacity=state.bag.length;`);assert.equal(r.run('numberBadgeCounts().quests'),0);r.run('GAMEPLAY_SETTINGS.equipment.bagCapacity=cap');assert.equal(r.run('numberBadgeCounts().quests'),1);
});
test('Each reminder switch persists by player save, hides only badges, and rolls back when saving fails',()=>{
 const r=game();mail(r);for(const id of ['mailbox','achievements','equipment','quests'])assert.equal(r.run(`setNumberReminder('${id}',false)`),true);assert.equal(r.elements.get('utilityReminder-mailbox').hidden,true);assert.equal(r.run('numberBadgeCounts().mailbox'),1);r.run('save()');
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.deepEqual(json(reload,'party.numberReminders'),{mailbox:false,achievements:false,equipment:false,quests:false});reload.run('continueFromTitle();closeModal();openUtilityPanel("mailbox")');assert.match(reload.elements.get('modal').innerHTML,/招募券/);
 const other=game();assert.equal(other.run('party.numberReminders?.mailbox??true'),true);reload.run('globalThis.origSave=save;save=()=>false');assert.equal(reload.run('setNumberReminder("mailbox",true)'),false);assert.equal(reload.run('party.numberReminders.mailbox'),false);reload.run('save=origSave');assert.equal(reload.run('setNumberReminder("mailbox",true)'),true);assert.equal(reload.elements.get('utilityReminder-mailbox').textContent,'1');
});
test('Legacy achieved records begin as read, new schema validates read markers and preference types atomically',()=>{
 const old={version:2,eliteKills:{},bossKills:{},completed:['region-0-open'],rewardCompanions:[],tickets:{}};assert.deepEqual(A.validateState(old).readCompleted,['region-0-open']);const r=game();const before=r.run('JSON.stringify(packParty())');r.run('globalThis.bad=structuredClone(packParty());bad.achievements.readCompleted=["region-0-boss-1000"]');assert.throws(()=>r.run('loadParty(bad)'),/成就與招募券/);assert.equal(r.run('JSON.stringify(packParty())'),before);r.run('bad=structuredClone(packParty());bad.numberReminders.mailbox="false"');assert.throws(()=>r.run('loadParty(bad)'),/數字提醒設定無效/);assert.equal(r.run('JSON.stringify(packParty())'),before);
});
test('Navigation shares one scan while building page HTML and reads live state outside the render',()=>{
 const r=game();
 r.run('let scans=0;const readyBase=questReadyCount;questReadyCount=function(){scans++;return readyBase();};scans=0;render();');
 assert.equal(r.run('scans'),3); // v0.016 baseline: page badge snapshot plus task-specific reminders.
 r.run('globalThis.badgeGear=state.bag[0];inlineAffixDrafts.set(affixDraftKey(badgeGear),[])');
 assert.match(r.run('numberBadgeHTML("equipment")'),/>1<\/span>/);
 r.run('inlineAffixDrafts.clear()');
 assert.match(r.run('numberBadgeHTML("equipment")'),/ hidden /);
 assert.deepEqual(r.errors,[]);
});
test('Repeated badge refreshes skip identical DOM attributes',()=>{
 const r=game();
 r.run('let attributeWrites=0;');
 for(const [id,node] of r.elements)if(/^(navReminder-|utilityReminder-|utilityButton-)/.test(id)){
  const original=node.setAttribute.bind(node);node.setAttribute=(...args)=>{r.run('attributeWrites++');return original(...args);};
 }
 r.run('render();');assert.equal(r.run('attributeWrites'),0);
 r.run('render();render();');
 assert.equal(r.run('attributeWrites'),0);assert.deepEqual(r.errors,[]);
});
