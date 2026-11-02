const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(time){const r=loadRuntime(root,'index.html',{},time);r.ctx.setTimeout=fn=>setImmediate(fn);r.ctx.seed=require('./../data/balance.json');r.run('applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();state.gold=100000;state.ore=10000;save()');return r;}
async function allTypes(r){r.run(`{const cfg=exportableBalance();cfg.balanceSettings.quests.design.daily.entries=cfg.balanceSettings.quests.design.daily.entries.filter(q=>['daily_hunt','daily_salvage','daily_enhance','daily_explore','daily_herb'].includes(q.id));applyBalanceConfig(cfg,{persist:false});}`);r.advance(86400000);await r.run('EmberwildOffline.settle()');r.run('ensureBoard()');}
function complete(r,q){r.ctx.qid=q.id;r.run(`{const q=state.board.tasks.find(x=>x.id===qid);startDailyCommission(q.id);for(const o of q.objectives){if(o.type==='material')setMaterialCount(o.key,o.quantity+50);else if(o.type==='potion')setHealPotionCount(o.key,o.quantity+50);else if(o.type==='item')state.consumables[o.key]=o.quantity+50;else recordDailyProgress(o.type,o.key,o.quantity,o.levelMin||0);}}`);return r.run('claimBoard(qid)');}

test('five distinct snapshots survive switches, balance imports and cold reload, and refresh only at Taipei midnight',async()=>{
 let r=game(Date.parse('2026-10-19T15:59:59Z'));const before=r.run('JSON.stringify(state.board)');assert.equal(r.run('state.board.tasks.length'),5);assert.equal(new Set(json(r,'state.board.tasks.map(q=>q.templateId)')).size,5);
 r.run('party.map=1;refreshBoard();buildBoard();const cfg=exportableBalance();cfg.balanceSettings.quests.design.daily.entries.reverse();applyBalanceConfig(cfg,{persist:false});save();loadParty(packParty())');assert.equal(r.run('JSON.stringify(state.board)'),before);
 r=loadRuntime(root,'index.html',Object.fromEntries(r.values),r.now);r.run('continueFromTitle()');await r.run('EmberwildOffline.settle()');r.run('closeModal()');assert.equal(r.run('JSON.stringify(state.board)'),before);r.advance(1000);r.run('ensureBoard()');assert.equal(r.run('state.board.day'),'2026-10-20');assert.equal(r.run('state.board.tasks.length'),5);assert.equal(r.run('state.board.bonusClaimed'),false);assert.deepEqual(r.errors,[]);
});

test('four claims consume stock and award frozen random materials without a speed ticket bonus; fifth is blocked',async()=>{
 const r=game();await allTypes(r);const qs=json(r,'state.board.tasks');for(const q of qs.slice(0,4)){assert.equal(complete(r,q),true);assert.equal(r.run('claimBoard(qid)'),false);}
 assert.equal(r.run('state.board.tasks.filter(q=>q.done).length'),4);assert.equal(r.run('questReadyCount()'),0);assert.equal(complete(r,qs[4]),false);assert.equal(r.run('typeof claimDailyBonus'),'undefined');assert.equal(r.run('state.consumables.speed2_120m'),undefined);r.run('save();loadParty(packParty())');assert.equal(r.run('state.board.tasks.filter(q=>q.done).length'),4);
 assert.doesNotMatch(r.run('questView()'),/兩倍速|四項完成獎勵/);assert.equal(r.run('battleRate'),1);assert.deepEqual(r.errors,[]);
});

test('real kills respect species and snapshotted level range; enhance and every manual salvage path count after start',async()=>{
 const r=game();await allTypes(r);const hunt=json(r,'state.board.tasks.find(q=>q.objectives[0].type==="nearKill")');r.ctx.hunt=hunt;
 r.run(`globalThis.killForDaily=(id,lv)=>{const m=GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id===hunt.objectives[0].key),e=makeEnemy(m.mapIndex,state,()=>.5);e.monsterId=id;e.lv=lv;e.kind='normal';e.rewarded=false;rewardGroupKill(e);};killForDaily(hunt.objectives[0].key,hunt.objectives[0].levelMin)`);assert.equal(r.run('state.board.tasks.find(q=>q.id===hunt.id).objectives[0].progress'),0);
 r.run(`startDailyCommission(hunt.id);killForDaily('wrong_species',hunt.objectives[0].levelMin);killForDaily(hunt.objectives[0].key,hunt.objectives[0].levelMax+1)`);assert.equal(r.run('state.board.tasks.find(q=>q.id===hunt.id).objectives[0].progress'),0);
 r.run('killForDaily(hunt.objectives[0].key,hunt.objectives[0].levelMin)');assert.equal(r.run('state.board.tasks.find(q=>q.id===hunt.id).objectives[0].progress'),1);
 r.run(`startDailyCommission(state.board.tasks.find(q=>q.objectives[0].type==='enhance').id);globalThis.g=gear(1,0,0,0);addGear(g);enhance(g.id);startDailyCommission(state.board.tasks.find(q=>q.objectives[0].type==='salvage').id);salvage(g.id);globalThis.extra=gear(1,0,0,0);addGear(extra);salvage(extra.id);`);
 assert.equal(r.run("state.board.tasks.find(q=>q.objectives[0].type==='enhance').objectives[0].progress"),1);assert.equal(r.run("state.board.tasks.find(q=>q.objectives[0].type==='salvage').objectives[0].progress"),r.run("Math.min(2,state.board.tasks.find(q=>q.objectives[0].type==='salvage').objectives[0].quantity)"));assert.deepEqual(r.errors,[]);
});

test('collect tasks deduct every delivered inventory and failed saves restore stock, claims and event counters',async()=>{
 const r=game();await allTypes(r);r.run(`globalThis.collect=state.board.tasks.find(q=>q.objectives[0].type==='material');startDailyCommission(collect.id);setMaterialCount(collect.objectives[0].key,collect.objectives[0].quantity+20);globalThis.prior=JSON.stringify(packParty());globalThis.originalSave=save;save=()=>false`);assert.equal(r.run('claimBoard(collect.id)'),false);assert.equal(r.run('JSON.stringify(packParty())'),r.run('prior'));r.run('save=originalSave');
 const q=json(r,'state.board.tasks.find(q=>q.id===collect.id)'),k=q.objectives[0].key,before=r.run(`materialCount(${JSON.stringify(k)})`);assert.equal(r.run('claimBoard(collect.id)'),true);const reward=q.rewards.materials.find(x=>x.key===k)?.quantity||0;assert.equal(r.run(`materialCount(${JSON.stringify(k)})`),before-q.objectives[0].quantity+reward);
 r.run(`startDailyCommission(state.board.tasks.find(q=>q.objectives[0].type==='salvage').id);globalThis.g=gear(1,0,0,0);addGear(g);globalThis.prior=JSON.stringify(packParty());save=()=>false;salvage(g.id);`);assert.equal(r.run('JSON.stringify(packParty())'),r.run('prior'));r.run('save=originalSave');
 for(const q of json(r,'state.board.tasks.filter(q=>!q.done)').slice(0,3))assert.equal(complete(r,q),true);
});

test('one-task daily and one-time side progress migrate once; side content moves out of commissions',async()=>{
 const r=game();r.run(`globalThis.raw=JSON.parse(JSON.stringify(packParty()));const b=raw.members[0].board;b.dailyVersion=1;delete b.bonusClaimed;b.tasks=b.tasks.filter(q=>q.objectives[0].type==='material').slice(0,1);if(!b.tasks.length){const t=EmberwildQuestDesign.entry('legacy','舊任務');b.tasks=[{...t,designVersion:1,templateId:'legacy',id:'legacy',job:0,map:0,done:true,objectives:t.objectives,rewards:t.rewards}];}b.tasks[0].done=true;raw.members[0].claimed=['wolves'];loadParty(raw)`);
 assert.equal(r.run('state.board.dailyVersion'),2);assert.equal(r.run('state.board.tasks.filter(q=>q.done).length'),1);assert(r.run('state.claimed.includes("wolves")'));r.run('loadParty(packParty());setStoryCategory("side");setQuestSideFilter("all")');assert.match(r.run('storyView()'),/縫補獵人的披肩/);assert.doesNotMatch(r.run('questView()'),/一次性支線|縫補獵人的披肩/);assert.equal(r.run('state.board.tasks.filter(q=>q.done).length'),1);
});

test('navigation shows task-specific red counts and a green N badge, and clears N when started',async()=>{
 const r=game();assert.match(r.run("taskReminderHTML('quests')"),/class="quest-new"[^>]*>N<\/span>/);assert.match(r.run("taskReminderHTML('story-main')"),/class="quest-new"[^>]*>N<\/span>/);assert.match(r.run("taskReminderHTML('story-main')"),/class="quest-new"[^>]*>N<\/span>/);r.run("readStory('goddess_intro')");assert.doesNotMatch(r.run("taskReminderHTML('story-main')"),/class="quest-new"[^>]*>N<\/span>/);assert.match(r.run("gameNavigationHTML('quests')"),/data-page="story-side"/);assert.deepEqual(r.errors,[]);
});
