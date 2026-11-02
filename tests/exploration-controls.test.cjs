const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),M=(()=>{const vm=require('node:vm'),ctx={};vm.runInNewContext(fs.readFileSync(path.join(root,'js/items/timed-boosts.js'),'utf8'),ctx);return ctx.EmberwildTimedBoosts;})();
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function fixture(){const r=loadRuntime(root);r.ctx.seed=require('../data/balance.json');r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();state.lv=20;state.hp=stats().hp;recruitCompanion(11);recruitCompanion(13);closeModal();for(const h of heroes()){h.lv=20;h.hp=stats(h).hp;}syncParty();globalThis.durable=()=>{foes=[{...makeEnemy(0,state,()=>.9),id:'durable',hp:1e8,maxhp:1e8,atk:1,def:0}];enemy=foes[0];for(const h of heroes())h.shield=1e6;};globalThis.tickets=()=>{for(const id of ['exp_100_30m','drop_50_30m']){state.consumables[id]=2;useSupply(id);}};`);return r;}
const buff=(kind='exp',ms=60000,enabled=true)=>({itemId:kind,name:kind,boostType:kind,bonusPercent:100,durationMinutes:1,remainingMs:ms,enabled});
test('same-name sources stack up to 24h while preserving independent strength and disabled time',()=>{
 const a=buff(),b={...a,itemId:'alias'};let rows=M.stackBuff([a],b);assert.equal(rows.length,1);assert.equal(rows[0].remainingMs,120000);assert.equal(rows[0].expiresAt,undefined);
 rows=M.stackBuff([{...a,enabled:false}],b);assert.equal(rows[0].enabled,false);
 const max={...a,remainingMs:M.MAX_STACK_MS-60000};assert.equal(M.stackBuff([max],b)[0].remainingMs,M.MAX_STACK_MS);assert.throws(()=>M.stackBuff([{...max,remainingMs:max.remainingMs+1}],b),/24 小時/);
 assert.equal(M.stackBuff([a],{...b,bonusPercent:35}).length,2);
});
test('every enabled source consumes its own wall time; legacy speed sources are dropped from saves',()=>{
 const p={timedBoosts:[buff('exp',1000),buff('drop',1000,false),{...buff('drop',300),name:'other'}],members:[]};
 assert.equal(M.consume(p,500),false);assert.deepEqual(JSON.parse(JSON.stringify(p.timedBoosts.map(b=>[b.remainingMs,b.enabled]))),[[500,true],[1000,false],[0,false]]);
 const legacy={timedBoosts:[{...buff('exp'),boostType:'speed2',itemId:'speed2_30m',bonusPercent:0},buff('exp')],combatSession:{speed:2,pauseBoostsOnSpeedEnd:true}};
 const out=M.validateState(legacy);assert.deepEqual([...out.timedBoosts.map(b=>b.boostType)],['exp']);assert.deepEqual([...Object.keys(out.combatSession)].sort(),['filter','idleTimeMs','reportPaused']);
 assert.throws(()=>M.validateItem({id:'speed2_30m',type:'timedBoost',name:'x',description:'',boostType:'speed2',bonusPercent:0,durationMinutes:30,duration:0,cost:0}));
});
test('legacy deadline and malformed new timer migration are validated without mutating input',()=>{
 const old={timedBoosts:[{...buff(),remainingMs:undefined,enabled:undefined,expiresAt:Date.now()+60000}],combatSession:{speed:1}};const before=JSON.stringify(old),out=M.validateState(old);assert.equal(JSON.stringify(old),before);assert(out.timedBoosts[0].remainingMs>59000);assert.equal(out.timedBoosts[0].enabled,true);assert.equal(Object.hasOwn(out.combatSession,'pauseBoostsOnSpeedEnd'),false);
 for(const patch of [{remainingMs:-1},{remainingMs:Infinity},{enabled:'yes'},{remainingMs:undefined,expiresAt:Infinity}])assert.throws(()=>M.validateState({timedBoosts:[{...buff(),...patch}]}));
});
test('runtime exploration clock, controls, save compatibility, effects and quest encounters',async t=>{
 const r=fixture();r.ctx.setTimeout=fn=>setImmediate(fn);const move=async ms=>{r.advance(ms);await r.run('EmberwildOffline.settle()');if(r.run('!!party.offlineExploration.receipt'))r.run('acknowledgeOfflineExploration()');};const baseline=json(r,'packParty()');const reset=()=>{r.ctx.saved=structuredClone(baseline);r.ctx.saved.offlineExploration.lastAt=r.now;r.run('loadParty(saved);closeModal();setTab("battle");globalThis.expeditionChallengeResult=null;');};
 await t.test('adventure controls and the top shortcut share synchronized pause/resume/stop operations',()=>{
  reset();let view=r.run('battleView()');assert.equal((view.match(/onclick="startSelectedExploration\(\)"/g)||[]).length,2);assert(!view.includes('onclick="toggleBattle()"'));assert.match(view,/一般探索/);assert.match(view,/BOSS 難關/);assert.match(view,/任務關卡/);
  r.run('startSelectedExploration();durable();');for(const fn of ['battleView()','sharedBattleJournal()'])assert.match(r.run(fn),/onclick="toggleBattle\(\)">[\s\S]*?暫停/);
  r.run('toggleBattle()');for(const fn of ['battleView()','sharedBattleJournal()'])assert.match(r.run(fn),/onclick="toggleBattle\(\)">[\s\S]*?繼續/);
  r.run('toggleBattle();stopTeamExploration()');assert.equal(r.run('running||foes.length>0||!!roundIterator'),false);assert.match(r.run('battleView()'),/開始探索/);assert.doesNotMatch(r.run('sharedBattleJournal()'),/onclick="toggleBattle\(\)"/);
 });
 await t.test('pending map selection never changes the active encounter, starting after stop applies it once',()=>{
  reset();r.run('startSelectedExploration();durable();globalThis.oldFoe=foes[0];selectExplorationMap(1);');assert.equal(r.run('party.map'),0);assert.equal(r.run('foes[0]===oldFoe'),true);assert.match(r.run('battleView()'),/選擇其他目的地僅供準備/);
  r.run('stopTeamExploration();startSelectedExploration();');assert.equal(r.run('party.map'),1);assert.equal(r.run('foes.includes(oldFoe)'),false);assert.equal(r.run('running'),true);
 });
 await t.test('wall-clock effects count paused and stopped time; active time counts only exploration',async()=>{
  reset();r.run('tickets();startSelectedExploration();durable();');await move(30000);assert.deepEqual(json(r,'party.timedBoosts.map(b=>b.remainingMs)'),[1770000,1770000]);assert.equal(r.run('party.combatSession.idleTimeMs'),30000);
  r.run('toggleBattle()');await move(100000);assert.equal(r.run('party.timedBoosts[0].remainingMs'),1670000);assert.equal(r.run('party.combatSession.idleTimeMs'),30000);
  r.run('toggleBattle()');await move(1000);r.run('stopTeamExploration()');await move(100000);assert.equal(r.run('party.timedBoosts[0].remainingMs'),1569000);
 });
 await t.test('independent toggles change effects while retaining independent wall deadlines',async()=>{
  reset();r.run('tickets();setTimedBoostEnabled("team:0",false);');assert.equal(r.run('EmberwildTimedBoosts.bonus(party,"exp")'),0);assert.equal(r.run('partyDropRateBonus()'),.5);r.run('awardXP(100)');assert.equal(r.run('state.xp'),100);
  r.run('startSelectedExploration();durable()');await move(2000);assert.deepEqual(json(r,'party.timedBoosts.map(b=>b.remainingMs)'),[1798000,1798000]);
  r.run('setTimedBoostEnabled("team:0",true);state.xp=0;awardXP(100)');assert.equal(r.run('state.xp'),200);assert.equal(r.run('effectiveDropChance({chanceByDifficulty:[.05,.05,.05]},{difficulty:0})'),.07500000000000001);
 });
 await t.test('save/reload restores running combat; old saves have no retrospective offline rewards',async()=>{
  reset();r.run('tickets();setTimedBoostEnabled("team:1",false);startSelectedExploration();durable();');await move(1200);r.run('save();globalThis.snapshot=structuredClone(packParty());');
  r.advance(3600000);r.run('loadParty(snapshot)');assert.equal(r.run('running'),true);await r.run('EmberwildOffline.settle()');assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.run('party.offlineExploration.pendingReceipt.battles'),0);assert.equal(r.run('party.timedBoosts.every(b=>b.remainingMs===0)'),true);
  r.run('delete snapshot.combatSession;delete snapshot.timedBoosts;delete snapshot.offlineExploration;loadParty(snapshot)');assert.deepEqual(json(r,'party.timedBoosts'),[]);assert.equal(r.run('"pauseBoostsOnSpeedEnd" in party.combatSession'),false);assert.equal(r.run('running'),false);
 });
 await t.test('elemental potions share wall time, including when effects are disabled',async()=>{
  reset();const item=r.run('SHOP.find(i=>i.type==="ward").id');r.ctx.item=item;r.run('state.consumables[item]=2;useSupply(item);globalThis.originalLeft=EmberwildTimedBoosts.remainingMs(EmberwildTimedBoosts.buffRows(state.ward)[0]);startSelectedExploration();durable();');await move(2000);assert.equal(r.run('EmberwildTimedBoosts.remainingMs(EmberwildTimedBoosts.buffRows(state.ward)[0])'),r.run('originalLeft')-2000);
  r.run('setTimedBoostEnabled("0:ward:0",false)');await move(2000);assert.equal(r.run('EmberwildTimedBoosts.remainingMs(EmberwildTimedBoosts.buffRows(state.ward)[0])'),r.run('originalLeft')-4000);assert.equal(r.run('activeSupplies(state,"ward").length'),0);
  r.run('globalThis.elementSave=structuredClone(packParty());loadParty(elementSave)');assert.equal(r.run('EmberwildTimedBoosts.buffRows(state.ward)[0].enabled'),false);
 });
 await t.test('BOSS entrance keeps charges and original auto-return settlement',()=>{
  reset();r.run('bossProgressEntry(0).charges=1;setExplorationCategory("boss");startSelectedExploration();');assert.equal(r.run('!!party.bossChallenge?.active'),true);assert.equal(r.run('bossProgressEntry(0).charges'),0);r.run('globalThis.iter=pacedRound();iter.next();for(const e of foes)e.hp=0;for(let i=0;i<100&&!iter.next().done;i++){}');assert.equal(r.run('!!party.bossChallenge?.active'),false);assert.equal(r.run('running'),true);
 });
 await t.test('quest stage unlock, shared combat settlement, retry and non-repeatable completion',()=>{
  reset();assert.equal(r.run('questEncounterRows().find(x=>x.key==="shop_rescue/rescue").unlocked'),false);r.run('__EMBERWILD_STORY.record("shop_rescue").started=true;');assert.equal(r.run('questEncounterRows().find(x=>x.key==="shop_rescue/rescue").unlocked'),true);
  r.run('startQuestEncounter("shop_rescue/rescue")');assert.equal(r.run('foes.length'),3);r.run('globalThis.it=pacedRound();it.next();for(const h of heroes())h.hp=0;for(let i=0;i<100&&!it.next().done;i++){}');assert.equal(r.run('running'),false);assert.equal(r.run('expeditionChallengeResult.success'),false);assert.equal(r.run('questEncounterRows().find(x=>x.key==="shop_rescue/rescue").unlocked'),true);
  r.run('startQuestEncounter("shop_rescue/rescue");globalThis.beforeKills=state.totalKills;globalThis.it=pacedRound();it.next();for(const e of foes)e.hp=0;for(let i=0;i<100&&!it.next().done;i++){}');assert.equal(r.run('running'),false);assert.equal(r.run('expeditionChallengeResult.success'),true);assert.equal(r.run('state.totalKills-beforeKills'),3);assert.equal(r.run('__EMBERWILD_STORY.stats().encounters["shop_rescue/rescue"]'),1);assert.equal(r.run('questEncounterRows().find(x=>x.key==="shop_rescue/rescue").unlocked'),false);assert.match(r.run('battleView()'),/挑戰成功/);
  r.run('save();globalThis.completed=structuredClone(packParty());loadParty(completed)');assert.equal(r.run('__EMBERWILD_STORY.stats().encounters["shop_rescue/rescue"]'),1);
 });
 await t.test('data-only encounter completion conditions and repeatable stages are validated and effective',()=>{
  reset();r.run('globalThis.cfg=exportableBalance();globalThis.q=cfg.story.quests.find(q=>q.id==="shop_rescue");q.stages[0].encounter.repeatable=true;q.stages[0].conditions={mode:"all",conditions:[EmberwildStory.condition("encounter","shop_rescue/rescue",1,"stage")]};applyBalanceConfig(cfg,{persist:false});__EMBERWILD_STORY.record("shop_rescue").started=true;startQuestEncounter("shop_rescue/rescue");globalThis.it=pacedRound();it.next();for(const e of foes)e.hp=0;for(let i=0;i<100&&!it.next().done;i++){}');assert.equal(r.run('__EMBERWILD_STORY.met(q.stages[0].conditions,__EMBERWILD_STORY.record("shop_rescue"))'),true);assert.equal(r.run('questEncounterRows().find(x=>x.key==="shop_rescue/rescue").unlocked'),true);
  r.run('cfg.story.quests.find(q=>q.id==="shop_rescue").stages[0].encounter.enemies[0].monsterId="missing"');assert.throws(()=>r.run('validateBalanceConfig(cfg)'),/任務關卡敵人引用無效/);
 });
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.warnings,[]);
});
