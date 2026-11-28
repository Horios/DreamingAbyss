const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime,ADD_TEST_COMPANIONS}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=require('./runtime.cjs').balanceRoot(root);
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
// v0.228: since v0.222 the roster is 洛恩 (10) and 艾琳 (13), both visible from the start; hidden behaviour uses test companion 11.
test('Visible initial companions; hidden entries cannot be acquired',()=>{
 const r=loadRuntime(root);r.run(ADD_TEST_COMPANIONS.replace('availability:"visible"','availability:"hidden"'));r.run('selectSaveSlot(1);start(0);closeModal();');const doc=json(r,'exportableBalance()');
 assert.deepEqual(doc.companions.filter(p=>p.availability==='visible').map(p=>p.id),[10,13]);assert.deepEqual(doc.companions.filter(p=>p.availability==='hidden').map(p=>p.id),[11,12,14]);
 assert.equal(r.run('typeof showCompanionRecruitment'),'undefined','v0.178: no recruiting page');
 r.run('grantCompanionTicket(11);');assert.equal(r.run('useCompanionRecruitmentTicket(11)'),false,'a hidden companion cannot join by ticket');
 r.run('closeModal();recruitCompanion(11);acquireCompanion(12);');assert.equal(r.run('party.members.length'),1);
 r.run("recruitCompanion(10);closeModal();{const d=exportableBalance();d.companions.find(p=>p.id===11).availability='visible';applyBalanceConfig(d);}recruitCompanion(11);closeModal();party.active=[10,11];party.enlisted=[10,11];party.selected=11;state=partyMember(11);{const d=exportableBalance();d.companions.find(p=>p.id===11).availability='hidden';applyBalanceConfig(d);setTab('partnerRoster');save();}");assert.notEqual(r.run('party.selected'),11);assert.equal(r.run('party.enlisted.includes(party.selected)'),true);assert(!r.elements.get('app').innerHTML.includes('測試夥伴11'));assert.equal(r.run('party.active.includes(11)'),false);assert.equal(r.run('party.enlisted.includes(11)'),false);assert.equal(r.run('setPartnerEnlisted(11,true)'),false);assert.equal(r.run('toggleMember(11)'),false);
 const before=r.run('JSON.stringify(exportableBalance())');assert.throws(()=>r.run(`{const d=exportableBalance();d.companions[0].availability='bad';applyBalanceConfig(d);}`),/顯示狀態無效/);assert.equal(r.run('JSON.stringify(exportableBalance())'),before);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('partyMember(11).name'),'測試夥伴11');assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);
});
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();globalThis.__initialCatalog=exportableBalance();const unlocked=exportableBalance();for(const p of unlocked.companions)p.availability="visible";applyBalanceConfig(unlocked);for(const p of __EMBERWILD_COMPANION_TEST_API.plans){recruitCompanion(p.id);closeModal();}');return r;}

// v0.228: each companion's skills and passive unlock at the class mastery levels in the data (v0.226: 洛恩 0/0/2 + passive 7, 艾琳 0/0/7 + passive 4).
test('Built-in companions unlock their own skills and passive exactly at their class mastery levels',()=>{
 const r=game(),doc=json(r,'__initialCatalog');assert.deepEqual(doc.companions.map(p=>p.id),[10,13]);
 const levels={10:{core:[0,0,2],passive:7},13:{core:[0,0,7],passive:4}};
 for(const p of doc.companions){assert.deepEqual(p.core.map(i=>doc.classes[p.job].skills[i].requiredLevel),levels[p.id].core);assert.equal(p.passives.length,1);assert.equal(doc.passiveDefinitions.find(d=>d.id===p.passives[0]).requiredLevel,levels[p.id].passive);assert.equal(doc.classes[p.job].skills[p.core[0]].activation,'active');}
 for(const lv of [1,2,3,5,7,8,3,1]){
  r.run(`setPartyClassMasteryLevel(${lv}-1);`);
  for(const row of json(r,'party.members.slice(1).map(h=>{const p=__EMBERWILD_COMPANION_TEST_API.companionPlan(h);return {id:memberKey(h),skills:p.core.map(i=>h.skills[i]),passives:__EMBERWILD_COMPANION_TEST_API.passivesFor(h).length};})')){const want=levels[row.id];assert.deepEqual(row.skills,want.core.map(x=>Number(lv-1>=x)),row.id+' @'+lv);assert.equal(row.passives,Number(lv-1>=want.passive),row.id+' passive @'+lv);}
 }
 const tank=doc.companions.find(p=>p.id===10),priest=doc.companions.find(p=>p.id===13);assert.deepEqual(tank.core.map(i=>doc.classes[0].skills[i].effect),['damage','tauntRage','damage']);assert.deepEqual(priest.core.map(i=>doc.classes[3].skills[i].effect),['heal','heal','revive']);
 const e=loadRuntime(editorRoot,'balance-editor.html'),editor=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');assert.deepEqual(json(e,'validateData()'),[]);
 for(const p of doc.companions){const other=editor.companions.find(x=>x.id===p.id);for(const k of ['name','description','core','active','proc','support','passives','availability'])assert.deepEqual(other[k],p[k]);}
 assert.deepEqual(r.errors,[]);assert.deepEqual(e.errors,[]);
});

// Skill system v1 retired per-companion skill switches: every unlocked companion skill is used automatically.
// The three earlier toggle tests (casts, save validation, imported support/aura/induction toggles) covered that retired feature.
test('Companion skill toggles are retired: calls are refused, the save is unchanged and unlocked skills stay in use',()=>{
 const r=game();r.run('setPartyClassMasteryLevel(7);globalThis.h=partyMember(10);globalThis.p=__EMBERWILD_COMPANION_TEST_API.companionPlan(h);');
 const before=r.run('JSON.stringify(packParty())'),learned=json(r,'p.core.map(i=>h.skills[i])');assert.deepEqual(learned,[1,1,1]);
 for(const code of ["setCompanionSkillEnabled(10,'core',p.core[0],false)","setCompanionSkillEnabled(10,'core',p.core[1],false)","setCompanionSkillEnabled(10,'passive',p.passives[0],false)","setCompanionSkillEnabled(10,'support',0,false)","setCompanionSkillEnabled(0,'core',0,false)","setCompanionSkillEnabled(10,'wrong',1,false)"]){
  assert.equal(r.run(code),false,code);assert.equal(r.run('JSON.stringify(packParty())'),before,code);
 }
 assert.equal(r.run('__EMBERWILD_COMPANION_TEST_API.passivesFor(h).length'),1,'the passive (class mastery 7) stays active');
 assert.deepEqual(r.errors,[]);
});
