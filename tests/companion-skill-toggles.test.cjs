const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=path.resolve(root,'../Emberwild-Balance');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
test('Default recruitment contains five visible initial companions; hidden entries cannot be acquired',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();showCompanionRecruitment();');const doc=json(r,'exportableBalance()');
 assert.deepEqual(doc.companions.filter(p=>p.availability==='visible').map(p=>p.id),[10,11,12,13,14]);assert.equal(doc.companions.filter(p=>p.availability==='hidden').length,15);
 const modal=r.elements.get('modal').innerHTML;assert.equal((modal.match(/recruitCompanion\(/g)||[]).length,5);assert(!modal.includes('雷昂'));
 r.run('closeModal();recruitCompanion(15);acquireCompanion(16);');assert.equal(r.run('party.members.length'),1);
 r.run("recruitCompanion(10);closeModal();{const d=exportableBalance();d.companions.find(p=>p.id===15).availability='visible';applyBalanceConfig(d);}recruitCompanion(15);closeModal();party.active=[10,15];party.enlisted=[10,15];party.selected=15;state=partyMember(15);{const d=exportableBalance();d.companions.find(p=>p.id===15).availability='hidden';applyBalanceConfig(d);setTab('partnerRoster');save();}");assert.notEqual(r.run('party.selected'),15);assert.equal(r.run('party.enlisted.includes(party.selected)'),true);assert(!r.elements.get('app').innerHTML.includes('雷昂'));assert.equal(r.run('party.active.includes(15)'),false);assert.equal(r.run('party.enlisted.includes(15)'),false);assert.equal(r.run('setPartnerEnlisted(15,true)'),false);assert.equal(r.run('toggleMember(15)'),false);
 const before=r.run('JSON.stringify(exportableBalance())');assert.throws(()=>r.run(`{const d=exportableBalance();d.companions[0].availability='bad';applyBalanceConfig(d);}`),/顯示狀態無效/);assert.equal(r.run('JSON.stringify(exportableBalance())'),before);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('partyMember(15).name'),'雷昂');assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);
});
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();globalThis.__initialCatalog=exportableBalance();const unlocked=exportableBalance();for(const p of unlocked.companions)p.availability="visible";applyBalanceConfig(unlocked);for(const p of __EMBERWILD_COMPANION_TEST_API.plans){recruitCompanion(p.id);closeModal();}');return r;}

test('All 20 built-in companions have three focused skills unlocking exactly at levels 1, 3 and 8',()=>{
 const r=game(),doc=json(r,'__initialCatalog');assert.equal(doc.companions.length,20);
 for(const p of doc.companions){assert.equal(p.core.length+p.support.length+p.passives.length,3);assert.deepEqual(p.core.map(i=>doc.classes[p.job].skills[i].requiredLevel),[1,3]);assert.equal(doc.passiveDefinitions.find(d=>d.id===p.passives[0]).requiredLevel,8);assert.equal(doc.classes[p.job].skills[p.core[0]].activation,'active');}
 for(const lv of [1,2,3,7,8,2,1]){
  r.run(`playerHero().lv=${lv};syncParty();`);
  for(const row of json(r,'party.members.slice(1).map(h=>{const p=__EMBERWILD_COMPANION_TEST_API.companionPlan(h);return {skills:p.core.map(i=>h.skills[i]),passives:__EMBERWILD_COMPANION_TEST_API.passivesFor(h).length};})')){assert.deepEqual(row.skills,[1,Number(lv>=3)]);assert.equal(row.passives,Number(lv>=8));}
 }
 const tank=doc.companions.find(p=>p.id===11),priest=doc.companions.find(p=>p.id===13);assert.deepEqual(tank.core.map(i=>doc.classes[0].skills[i].effect),['tauntRage','shield']);assert(priest.core.every(i=>doc.classes[3].skills[i].effect==='heal'));
 const e=loadRuntime(editorRoot,'balance-editor.html'),editor=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');assert.deepEqual(json(e,'validateData()'),[]);
 for(const p of doc.companions){const other=editor.companions.find(x=>x.id===p.id);for(const k of ['name','description','core','active','proc','support','passives','availability'])assert.deepEqual(other[k],p[k]);}
 assert.deepEqual(r.errors,[]);assert.deepEqual(e.errors,[]);
});

// Skill system v1 retired per-companion skill switches: every unlocked companion skill is used automatically.
// The three earlier toggle tests (casts, save validation, imported support/aura/induction toggles) covered that retired feature.
test('Companion skill toggles are retired: calls are refused, the save is unchanged and unlocked skills stay in use',()=>{
 const r=game();r.run('playerHero().lv=8;syncParty();globalThis.h=partyMember(10);globalThis.p=__EMBERWILD_COMPANION_TEST_API.companionPlan(h);');
 const before=r.run('JSON.stringify(packParty())'),learned=json(r,'p.core.map(i=>h.skills[i])');assert.deepEqual(learned,[1,1]);
 for(const code of ["setCompanionSkillEnabled(10,'core',p.core[0],false)","setCompanionSkillEnabled(10,'core',p.core[1],false)","setCompanionSkillEnabled(10,'passive',p.passives[0],false)","setCompanionSkillEnabled(10,'support',0,false)","setCompanionSkillEnabled(0,'core',0,false)","setCompanionSkillEnabled(10,'wrong',1,false)"]){
  assert.equal(r.run(code),false,code);assert.equal(r.run('JSON.stringify(packParty())'),before,code);
 }
 assert.equal(r.run('__EMBERWILD_COMPANION_TEST_API.passivesFor(h).length'),1,'the level-8 passive stays active');
 assert.deepEqual(r.errors,[]);
});
