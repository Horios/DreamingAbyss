const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run(`JSON.stringify(${code})`));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}
function configured(){const r=game();r.run(`playerHero().lv=5;save();recruitCompanion(10);const token=__EMBERWILD_TOKEN_TEST.makeToken('berserk');playerHero().bag.push(token);equipCompanionToken(token.id,10);playerHero().gems[0]=1;const gemGear=gear(1,1,0,0);gemGear.skillSockets={version:1,count:1,gems:[0],firstMode:'base'};playerHero().bag.push(gemGear);copyTeamPlan();`);return r;}

test('clearing plans preserves equipment-owned gems, permanent progression, inventory and companions',()=>{
 const r=configured(),out=json(r,`(()=>{
  const before=packParty(),first=structuredClone(before.buildSystem.plans[0]);
  const inactive=clearTeamPlan('team-2'),afterInactive=packParty();
  const active=clearTeamPlan('team-1'),after=packParty();loadParty(after);
  return {before,first,inactive,afterInactive,active,after,reloaded:packParty()};
 })()`);
 assert(out.inactive&&out.active);
 assert.deepEqual(out.afterInactive.buildSystem.plans[0],out.first);
 assert.equal(out.afterInactive.members[0].gems[0],1);
 assert.deepEqual(out.after.buildSystem.plans.map(p=>p.job),[null,null]);
 assert.deepEqual(out.after.buildSystem.permanent,{...out.before.buildSystem.permanent,gemInstances:{}});
 assert.equal(out.after.members[0].gems[0],1);
 assert.deepEqual(out.after.members.map(h=>h.bag),out.before.members.map(h=>h.bag));
 assert.deepEqual(out.after.members.map(h=>h.companionId),out.before.members.map(h=>h.companionId));
 assert.deepEqual(out.after.buildSystem,out.reloaded.buildSystem);assert.deepEqual(r.errors,[]);
});

test('deleting an active plan switches to the first plan, preserves equipment gems and frees a plan slot',()=>{
 const r=configured(),out=json(r,`(()=>{
  const before=packParty();switchTeamPlan('team-2');const active=deleteTeamPlan('team-2'),afterActive=packParty();
  copyTeamPlan();clearTeamPlan('team-1');const deleted=deleteTeamPlan('team-3'),after=packParty(),repeat=deleteTeamPlan('team-3');
  addTeamPlan();return {before,active,afterActive,deleted,after,repeat,ids:party.buildSystem.plans.map(p=>p.id)};
 })()`);
 assert(out.active&&out.deleted);assert.equal(out.repeat,false);
 assert.equal(out.afterActive.buildSystem.activeId,'team-1');
 assert.deepEqual(out.afterActive.buildSystem.plans,[out.before.buildSystem.plans[0]]);
 assert.equal(out.afterActive.members[0].gems[0],1);assert.equal(out.after.members[0].gems[0],1);
 assert.deepEqual(out.after.buildSystem.permanent.gemInstances,{});
 assert.deepEqual(out.ids,['team-1','team-4']);
 assert.deepEqual(out.after.members[0].bag,out.before.members[0].bag);assert.deepEqual(r.errors,[]);
});

test('first plan cannot be deleted; native warning cancellation changes no saved data',()=>{
 const r=configured(),out=json(r,`(()=>{
  const before=JSON.stringify(packParty());let questions=[];confirm=message=>{questions.push(message);return false};
  const first=deleteTeamPlan('team-1'),cleared=clearTeamPlan('team-2'),deleted=deleteTeamPlan('team-2');
  return {first,cleared,deleted,questions,same:before===JSON.stringify(packParty())};
 })()`);
 assert.equal(out.first,false);assert.equal(out.cleared,false);assert.equal(out.deleted,false);
 assert.equal(out.questions.length,2);assert(out.questions.every(q=>q.includes('隊伍 1 複本')&&q.includes('無法復原')));assert(out.same);
});

test('active/paused encounters and intervals block clear and delete before asking confirmation',()=>{
 const r=configured(),out=json(r,`(()=>{
  const before=JSON.stringify(packParty());let questions=0;confirm=()=>{questions++;return true};const results=[];
  for(const mode of ['active','paused','interval']){running=mode!=='paused';foes=mode==='interval'?[]:[{id:'enemy',hp:1}];results.push(clearTeamPlan('team-2'),deleteTeamPlan('team-2'));}
  running=false;foes=[];return {results,questions,same:before===JSON.stringify(packParty())};
 })()`);
 assert(out.results.every(x=>x===false));assert.equal(out.questions,0);assert(out.same);
});

test('failed storage rolls back clearing and deletion, including gem refund, active ID and token ownership',()=>{
 for(const command of ["clearTeamPlan('team-1')","clearTeamPlan('team-2')","deleteTeamPlan('team-2')"]){
  const r=configured();r.run("switchTeamPlan('team-2');");
  const out=json(r,`(()=>{const before=packParty();localStorage.setItem=()=>{throw Error('test storage full')};const result=${command};return {result,before,after:packParty()};})()`);
  assert.equal(out.result,false);assert.deepEqual(out.after,out.before);assert.deepEqual(r.errors,[]);
 }
});

test('unset player class blocks start, restart, bosses and developer simulation without resetting or consuming resources',()=>{
 const r=game(),out=json(r,`(()=>{
  addTeamPlan();switchTeamPlan('team-2');const before=JSON.stringify(packParty());const clock=partyClock;
  const results=[toggleBattle(),restartExploration(),startBossChallenge(),devMasterySimulate()];
  const blocked=!running&&foes.length===0&&clock===partyClock&&before===JSON.stringify(packParty());
  changePlayerClass(1);toggleBattle();const started=running;stopTeamExploration();return {results,blocked,started};
 })()`);
 assert(out.results.every(x=>x===false));assert(out.blocked);assert(out.started);assert.deepEqual(r.errors,[]);
});

test('rendered plan controls protect the first plan, and journal refresh retains the missing-class disabled state',()=>{
 const r=game(),out=json(r,`(()=>{
  addTeamPlan();const roster=rosterView();switchTeamPlan('team-2');
  const journal=sharedBattleJournal();refreshGlobalJournal();const refreshed=$('globalBattleJournal').innerHTML;
  const battle=battleView();changePlayerClass(1);const ready=sharedBattleJournal();
  return {roster,journal,refreshed,battle,ready};
 })()`);
 assert.match(out.roster,/onclick="deleteTeamPlan\('team-1'\)" disabled/);
 assert.match(out.roster,/onclick="deleteTeamPlan\('team-2'\)"\s+>/);
 assert.match(out.roster,/onclick="clearTeamPlan\('team-1'\)"/);
 assert.match(out.journal,/globalBattleJournal/);for(const html of [out.journal,out.refreshed])assert(!html.includes('onclick="toggleBattle()"'));
 assert(!out.battle.includes('onclick="toggleBattle()"'));
 assert(!out.ready.includes('onclick="toggleBattle()" disabled'));assert.deepEqual(r.errors,[]);
});

test('title and character creation omit removed copy even when old custom UI text is loaded',()=>{
 const fs=require('node:fs'),r=loadRuntime(root);
 r.run(`UI_TEXT.homeTitle='向荒野出發。';UI_TEXT.chapterTitle='遠征者手札';UI_TEXT.chapterSubtitle='純文字遠征手札';render();`);
 const title=r.elements.get('app').innerHTML;
 for(const text of ['向荒野出發','遠征者手札','純文字遠征手札'])assert(!title.includes(text));
 assert(!fs.readFileSync(path.join(root,'index.html'),'utf8').includes('class="chapter"'));
 r.run('selectSaveSlot(1);');assert(!r.elements.get('app').innerHTML.includes('向荒野出發'));assert.deepEqual(r.errors,[]);
});
