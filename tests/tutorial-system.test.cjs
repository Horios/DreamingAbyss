// v0.144: the tutorial system. Contract rules (shared with the balance editor) and the manager's behaviour, headless.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),M=require('../js/story/tutorial-model.js');
const D=require('../js/balance/balance-document.js');
function game(){const r=loadRuntime(root);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer)');return r;}
const active=r=>r.json('__EMBERWILD_TUTORIAL.status().active');
const step=r=>active(r)?.stepId||null;
const records=r=>r.json('party.tutorials.records');
// Apply a modified copy of the running document's tutorials.
function edit(r,fn){r.run('globalThis.__d=exportableBalance()');const t=r.json('__d.tutorials');fn(t);r.run('__d.tutorials='+JSON.stringify(t)+';applyBalanceConfig(__d,{persist:false})');}

test('the built-in tutorials pass the shared rules and keep their exact form when normalized',()=>{
 const d=M.defaults();assert.deepEqual(M.issues(d),[]);assert.equal(JSON.stringify(M.validate(d)),JSON.stringify(d));
 assert.deepEqual(d.modules.map(m=>[m.id,m.type,m.category,m.implemented]),[['explore_basics','guide','battle',true],['equipment_basics','guide','equipment',true],['skill_basics','guide','skills',true]]);
 assert.deepEqual(require('../data/balance.json').tutorials,d,'the published data carries the built-in tutorials');
});

test('invalid tutorial data is reported with the module, step and reason',()=>{
 const d=M.defaults(),m=d.modules;
 m[1].id='explore_basics';
 m[0].steps[0].target='battle.nowhere';
 m[0].steps[1].advance={type:'event',key:'teleport'};
 m[0].steps[2].advance={type:'click'};m[0].steps[2].target='';
 m[2].prerequisites.conditions.push({type:'script',key:'alert(1)',count:1});
 m[2].completion={type:'condition',condition:{mode:'all',conditions:[{type:'tutorialDone',key:'skill_basics',count:1}]}};
 const issues=M.issues(d).join('\n');
 for(const text of ['ID 重複','引導目標不存在：battle.nowhere','遊戲不支援這個事件：teleport','必須指定引導目標','未知的條件類型 script','完成條件不能等待自己完成'])assert.match(issues,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 const loop=M.defaults();loop.modules[0].prerequisites.conditions.push(M.condition('tutorialDone','skill_basics'));loop.modules[2].prerequisites.conditions.push(M.condition('tutorialDone','explore_basics'));
 assert.match(M.issues(loop).join('\n'),/前置教學形成循環/);
 const tip=M.defaults();tip.modules[0].type='tip';assert.match(M.issues(tip).join('\n'),/簡短提示只能有一個步驟/);
 const empty=M.defaults();empty.modules[0].steps=[];assert.match(M.issues(empty).join('\n'),/已實裝的教學至少要有一個步驟/);
 empty.modules[0].implemented=false;assert.doesNotMatch(M.issues(empty).join('\n'),/已實裝/,'a registered module without content is allowed when it is not marked implemented');
 const missing=M.defaults();missing.modules[0].prerequisites.conditions.push(M.condition('tutorialDone','ghost'));assert.match(M.issues(missing).join('\n'),/前置教學不存在：ghost/);
});

test('the balance document check and the game both refuse invalid tutorials',()=>{
 const r=game();r.run('globalThis.__d=exportableBalance()');assert.equal(r.json('__d.tutorials.modules.length'),3,'export carries the tutorials');
 const bad=r.json('__d');bad.tutorials.modules[0].steps[0].target='nope';
 assert.match(D.inspect(bad).filter(x=>x.system==='教學').map(x=>x.reason).join('\n'),/引導目標不存在：nope/);
 assert.throws(()=>r.run('__d.tutorials.modules[0].steps[0].target="nope";applyBalanceConfig(__d,{persist:false})'),/引導目標不存在/);
 assert.equal(r.json('__EMBERWILD_TUTORIAL.design.modules[0].steps[0].target'),'battle.destination','the running tutorials are unchanged');
 assert.equal(D.tutorialsVersion,1,'the game advertises the tutorial capability to the publisher');
});

test('entering the battle page starts the exploration guide once; its steps wait for the real actions',()=>{
 const r=game();r.run('render()');
 assert.equal(step(r),'intro');assert.equal(active(r).mode,'normal');assert.equal(records(r).explore_basics.triggered,true);
 assert.equal(r.run('tutorialControl("next")'),true);assert.equal(step(r),'map');
 r.run('tutorialControl("next")');assert.equal(step(r),'start');
 assert.equal(r.run('tutorialControl("next")'),false,'a step that waits for exploration cannot be passed with 下一步');
 r.run('startSelectedExploration();__EMBERWILD_TUTORIAL.evaluate()');assert.equal(step(r),'auto','starting exploration moves the guide on');
 assert.equal(r.json('party.tutorials.events.explorationStarted'),1);
 r.run('tutorialControl("next")');assert.equal(active(r),null);
 assert.deepEqual(records(r).explore_basics,{triggered:true,completed:true,skipped:false,step:-1,revision:1});
 r.run('stopTeamExploration();setTab("statistics");setTab("battle")');assert.equal(active(r),null,'a completed guide does not start again');
 assert.deepEqual(r.errors,[]);
});

test('skipping, closing for later and resuming after a reload',()=>{
 const r=game();r.run('render();tutorialControl("next")');assert.equal(step(r),'map');
 r.run('tutorialControl("close")');assert.equal(active(r),null);assert.equal(records(r).explore_basics.step,1,'the step is kept');
 r.run('setTab("statistics");setTab("battle")');assert.equal(active(r),null,'closed for this visit');
 // A reload (fresh runtime with the same save) resumes at the saved step.
 const saved=r.run('save();JSON.stringify(Object.fromEntries([...Array(localStorage.length||0)].map(()=>[])))');void saved;
 const pack=r.json('packParty()');const r2=loadRuntime(root);r2.json=s=>JSON.parse(r2.run('JSON.stringify('+s+')'));
 r2.run('selectSaveSlot(1);loadParty('+JSON.stringify(pack)+');clearInterval(timer);setTab("battle");render()');
 assert.equal(step(r2),'map','the guide resumes where it was left');
 r2.run('tutorialControl("skipAll")');assert.equal(active(r2),null);assert.equal(r2.json('party.tutorials.records.explore_basics.skipped'),true);
 r2.run('setTab("statistics");setTab("battle")');assert.equal(active(r2),null,'a skipped guide does not start again');
 assert.deepEqual(r.errors,[]);assert.deepEqual(r2.errors,[]);
});

test('switching to an unrelated page pauses the guide; returning continues it',()=>{
 const r=game();r.run('render()');assert.equal(step(r),'intro');
 r.run('setTab("shop")');assert.equal(active(r).paused,true);assert.match(active(r).reason,/荒野探索/);
 assert.equal(r.run('tutorialControl("next")'),false,'a paused guide does not move');
 r.run('tutorialControl("resume")');assert.equal(r.run('tab'),'battle');assert.equal(active(r).paused,false);assert.equal(step(r),'intro');
});

test('gear: the notice comes first, the guide starts on the bag page, and replaying it changes nothing',()=>{
 const r=game();r.run('render();tutorialControl("skipAll")');
 assert.equal(r.json('party.tutorials.records.equipment_basics?.notified||false'),false,'starting gear is not an acquisition');
 r.run('const h=playerHero();const x=gear(1,0,1,h.job);addGear(x);render()');
 assert.equal(r.json('party.tutorials.events.gearAcquired'),1);assert.equal(records(r).equipment_basics.notified,true);
 assert.match(r.run("$('tutorial-notices').innerHTML"),/新功能：裝備/);assert.equal(active(r),null,'the notice does not start the guide by itself');
 r.run('setTab("equipment")');assert.equal(step(r),'bag');
 r.run('tutorialControl("next")');assert.equal(step(r),'info');
 const id=r.json('playerHero().bag.at(-1).id');
 r.run(`selectInventoryGear('${id}')`);assert.equal(step(r),'wear');
 r.run(`openInventoryWear('${id}')`);assert.equal(r.run('tab'),'worn');assert.equal(step(r),'equip');assert.equal(active(r).paused,false,'the wear button leads to the next step, not a pause');
 assert.equal(r.run('tutorialControl("skipStep")'),true,'wearing is optional');assert.equal(step(r),'slots');
 r.run('tutorialControl("next")');assert.equal(records(r).equipment_basics.completed,true);
 // Replay: no records change, nothing is granted, worn gear stays.
 const before=r.json('{records:party.tutorials.records,bag:playerHero().bag.length,gold:playerHero().gold,worn:playerHero().equipped}');
 assert.equal(r.run('replayTutorial("equipment_basics")'),true);assert.equal(active(r).mode,'replay');
 r.run('tutorialControl("next")');assert.equal(step(r),'info');
 assert.equal(r.run('tutorialControl("next")'),false,'looking at a gear is harmless, so the replay still waits for it');
 r.run(`selectInventoryGear('${id}');openInventoryWear('${id}')`);assert.equal(step(r),'equip');
 assert.equal(active(r).advance.explainOnly,true,'the wear step only explains during a replay');
 r.run('tutorialControl("next");tutorialControl("next")');assert.equal(active(r),null);
 assert.deepEqual(r.json('{records:party.tutorials.records,bag:playerHero().bag.length,gold:playerHero().gold,worn:playerHero().equipped}'),before);
 assert.deepEqual(r.errors,[]);
});

test('skill guide follows the character: steps that cannot be done say why and can be passed',()=>{
 const r=game();r.run('render();tutorialControl("skipAll");setTab("skills")');assert.equal(step(r),'slots');
 r.run('tutorialControl("next");tutorialControl("next")');assert.equal(step(r),'active');
 r.run('openSkillSlot("active",0)');assert.equal(step(r),'auto','opening a slot is the action this step waits for');
 // A step whose requirement the character does not meet is unavailable, with the reason.
 r.run('closeModal()');edit(r,t=>{t.modules[2].steps[4].requires=M.group([M.condition('level','',99)]);});
 assert.equal(step(r),'auto','editing the data keeps the running step');assert.equal(r.run('tutorialControl("next")'),true);
 assert.equal(step(r),'others');assert.match(active(r).unavailable,/主角等級達到（目前 1／需要 99）/);assert.equal(r.run('tutorialControl("skipStep")'),true);
 assert.equal(active(r),null);assert.equal(records(r).skill_basics.completed,false,'an unavailable step that was passed does not count as done');
 assert.deepEqual(r.errors,[]);
});

test('one guide at a time, in list order; others wait',()=>{
 const r=game();
 edit(r,t=>{const m=M.copy(t.modules[2]);m.id='battle_second';m.title='第二個探索教學';m.trigger.page='battle';m.steps=[M.step('one','一','說明',{page:'battle'})];t.modules.push(m);});
 r.run('setTab("statistics");setTab("battle")');assert.equal(active(r).id,'explore_basics');
 assert.equal(r.json('__EMBERWILD_TUTORIAL.start("battle_second").ok'),false,'a second guide is refused while one runs');
 r.run('tutorialControl("skipAll");__EMBERWILD_TUTORIAL.evaluate()');assert.equal(active(r).id,'battle_second','the next one starts after the first ends');
});

test('developer test mode ignores prerequisites, can start at any step and writes no record',()=>{
 const r=game();r.run('render();tutorialControl("skipAll")');const before=r.json('party.tutorials');
 assert.equal(r.json('__EMBERWILD_TUTORIAL.test("equipment_basics",{step:3}).ok'),true);
 assert.equal(step(r),'equip');assert.equal(active(r).mode,'test');assert.equal(r.run('tab'),'worn');
 assert.equal(r.json('__EMBERWILD_TUTORIAL.module("equipment_basics").prerequisites.met'),false,'its prerequisites are reported, not enforced');
 r.run('tutorialControl("back")');assert.equal(step(r),'wear');r.run('tutorialControl("restartStep");tutorialControl("next")');assert.equal(step(r),'equip','test mode can step past waits');
 r.run('tutorialControl("pause")');assert.equal(active(r).paused,true);r.run('tutorialControl("resume");tutorialControl("close")');assert.equal(active(r),null);
 assert.deepEqual(r.json('party.tutorials'),before,'testing left the progress untouched');
 assert.equal(r.json('__EMBERWILD_TUTORIAL.test("ghost").ok'),false);
});

test('old saves load without tutorial data; finished basics are recognised instead of replayed',()=>{
 const r=game();r.run('playerHero().totalKills=12');const pack=r.json('packParty()');delete pack.tutorials;
 const r2=loadRuntime(root);r2.json=s=>JSON.parse(r2.run('JSON.stringify('+s+')'));r2.run('selectSaveSlot(1);loadParty('+JSON.stringify(pack)+');clearInterval(timer);render()');
 assert.equal(r2.json('party.tutorials.records.explore_basics.completed'),true);assert.equal(r2.json('party.tutorials.records.explore_basics.legacy'),true);
 assert.equal(active(r2)?.id===undefined||active(r2)===null,true,'no exploration guide for a player who already explored');
 assert.throws(()=>r2.run('validateParty({...packParty(),tutorials:{version:1,records:{a:{completed:"yes"}},pages:{},events:{}}})'),/教學存檔格式無效/);
 assert.deepEqual(r2.errors,[]);
});

test('a revised module is offered again only when marked, and never forced',()=>{
 const r=game();r.run('render();tutorialControl("next");tutorialControl("next");startSelectedExploration();__EMBERWILD_TUTORIAL.evaluate();tutorialControl("next");stopTeamExploration()');
 assert.equal(records(r).explore_basics.completed,true);
 edit(r,t=>{t.modules[0].revision=2;});r.run('setTab("statistics");setTab("battle")');assert.equal(active(r),null,'a new revision alone changes nothing');
 edit(r,t=>{t.modules[0].revision=3;t.modules[0].reprompt=true;});r.run('render()');
 assert.equal(active(r),null,'not started automatically');assert.match(r.run("$('tutorial-notices').innerHTML"),/教學已更新：探索/);
 assert.equal(records(r).explore_basics.completed,true,'the completed record stays');
});

test('nothing runs during the prologue',()=>{
 const r=loadRuntime(root);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));r.run('selectSaveSlot(1)');
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'creation');r.run('__EMBERWILD_TUTORIAL.evaluate()');
 assert.equal(active(r),null);assert.equal(r.json('__EMBERWILD_TUTORIAL.start("explore_basics").ok'),false);assert.deepEqual(r.errors,[]);
});
