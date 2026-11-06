'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();running=true;');return r;}
const read=r=>JSON.parse(r.run('JSON.stringify(EmberwildBattleSummary.snapshot(),(key,value)=>key==="unit"?undefined:value)'));
test('a deferred page redraw does not recursively render a stale battle roster during UI interaction',()=>{
 const r=game();enemies(r);r.run("tab='battle';$('battleSummary').isConnected=true;globalThis.redraws=0;render=()=>{redraws++};globalThis.isEmberwildUIInteracting=()=>true;");
 r.run('EmberwildBattleSummary.sync()');assert.equal(r.run('redraws'),0);
 r.run('isEmberwildUIInteracting=()=>false;EmberwildBattleSummary.sync()');assert.equal(r.run('redraws'),1);assert.deepEqual(r.errors,[]);
});
function enemies(r){r.run(`foes=[{id:'first',name:'同名',hp:25,maxhp:100},{id:'second',name:'同名',hp:450,maxhp:900}];enemy=foes[0];beginBattleStatistics();`);}
test('single and unequal-HP enemies use summed effective HP, with safe per-unit bounds and no shield HP',()=>{
 const r=game();r.run(`foes=[{id:'first',hp:25,maxhp:100,shield:999}];beginBattleStatistics()`);
 assert.equal(read(r).hp,25);assert.equal(read(r).percent,25);
 enemies(r);let s=read(r);assert.equal(s.hp,475);assert.equal(s.max,1000);assert.equal(s.percent,47.5);assert.equal(s.alive,2);assert.deepEqual(s.units.map(x=>x.id),['first','second']);
 r.run('foes[0].hp=-50;foes[1].hp=9999');s=read(r);assert.equal(s.hp,900);assert.equal(s.max,1000);assert.equal(s.alive,1);assert.equal(r.run('foes[0].hp'),-50,'presentation must not write HP');
 r.run('foes[1].maxhp=1800;foes[1].hp=1200');s=read(r);assert.equal(s.hp,1200);assert.equal(s.max,1900);
});
test('damage, death, healing, resurrection, summon, despawn and phase replacement share combat membership',()=>{
 const r=game();enemies(r);r.run('foes[0].hp=0');assert.equal(read(r).hp,450);assert.equal(read(r).total,2);assert.equal(read(r).alive,1);
 r.run('foes[1].hp=600');assert.equal(read(r).hp,600);
 r.run('foes[0].hp=40');assert.equal(read(r).hp,640);assert.equal(read(r).max,1000);assert.equal(read(r).total,2);
 r.run(`foes.push({id:'summoned',name:'同名',hp:200,maxhp:200})`);assert.equal(read(r).hp,840);assert.equal(read(r).max,1200);assert.equal(read(r).total,3);
 r.run('foes.splice(2,1)');assert.equal(read(r).total,2);assert.equal(read(r).max,1000);
 r.run(`foes=[{id:'phase2',name:'BOSS 第二階段',hp:800,maxhp:1000}];enemy=foes[0]`);assert.deepEqual(read(r).units.map(x=>x.id),['phase2']);assert.equal(read(r).hp,800);
});
test('official outcomes survive existing cleanup, and reset/new encounters/load discard old references',()=>{
 const r=game();enemies(r);r.run(`EmberwildBattleSummary.finish('wipe');foes=[];enemy=null;running=false`);
 assert.equal(read(r).result,'wipe');assert.equal(read(r).hp,475);
 r.run('resetEncounter()');assert.equal(read(r).total,0);assert.equal(read(r).result,null);
 enemies(r);r.run('foes.forEach(e=>e.hp=0)');assert.equal(read(r).result,null,'zero HP is not a victory predicate');
 r.run(`EmberwildBattleSummary.finish('victory');foes=[];enemy=null`);assert.equal(read(r).result,'victory');assert.equal(read(r).hp,0);assert.equal(read(r).max,1000);
 r.run('spawnGroup()');assert.equal(read(r).result,null);assert(read(r).hp>0);assert(!read(r).units.some(e=>e.id==='first'));
 r.run('save();loadParty(JSON.parse(localStorage.getItem(KEY)))');assert.equal(read(r).result,null);assert.equal(new Set(read(r).units.map(e=>e.id)).size,read(r).total);
 assert.deepEqual(r.errors,[]);
});
test('real defeat and victory use result hooks without altering rewards, refill or stopping',()=>{
 const r=game();enemies(r);r.run(`for(const h of heroes())h.hp=0;running=true;let end=pacedRound();while(!end.next().done){};`);
 assert.equal(read(r).result,'wipe');assert.equal(read(r).hp,475);assert.equal(r.run('foes.length'),0);assert.equal(r.run('running'),true,'existing automatic retry remains active');assert(r.run('heroes().every(h=>h.hp===stats(h).hp)'));
 enemies(r);r.run(`foes.forEach(e=>{e.hp=0;e.rewarded=true});combatRoundProgress={order:[],index:0,unit:null};running=true;let win=pacedRound();while(!win.next().done){};`);
 assert.equal(read(r).result,'victory');assert.equal(read(r).hp,0);
});
test('summary is outside the mobile report body and offline settlement restores effective combat HP',async()=>{
 const r=game();enemies(r);const html=r.run('sharedBattleJournal()');
 assert(html.indexOf('id="battleSummary"')>html.indexOf('id="mobileJournalBody"'));
 assert(html.includes('</div></section><section id="battleSummary"'));
 r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run('startSelectedExploration()');
 r.advance(60000);await r.run('EmberwildOffline.settle(undefined,false)');
 const s=read(r);assert.equal(s.hp,s.units.reduce((n,e)=>n+e.hp,0));if(r.run('foes.length'))assert.deepEqual(s.units.map(e=>e.id),JSON.parse(r.run('JSON.stringify(foes.map(e=>e.id))')));assert.deepEqual(r.errors,[]);
});
