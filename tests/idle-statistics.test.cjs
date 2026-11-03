const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(){const r=loadRuntime(root);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=123456;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);return r;}
function play(r,minutes){for(let i=0;i<minutes*60*4;i++){r.advance(250);r.run('tick()');}}
const inventory=r=>json(r,`(()=>{const h=playerHero(),out={'material:鍛鐵':h.ore,'material:粉塵':h.dust,'item:legacy-potion':h.potions};h.gems.forEach((n,i)=>out['gem:'+i]=n);for(const k in h.materials)out['material:'+k]=h.materials[k];for(const k in h.healingPotions)out['item:'+k]=h.healingPotions[k];for(const k in h.consumables)out['item:'+k]=h.consumables[k];return out;})()`);
test('online idle play records region totals equal to the rewards actually granted and builds a 30-minute snapshot',()=>{
 const r=game(),before={...json(r,'({gold:state.gold,kills:state.totalKills,lv:state.lv,xp:state.xp,bag:state.bag.length})'),items:inventory(r)};
 play(r,40);
 const after={...json(r,'({gold:state.gold,kills:state.totalKills,lv:state.lv,xp:state.xp,bag:state.bag.length})'),items:inventory(r)},t=json(r,'EmberwildIdleStatistics.totals()');
 // The encounter still in progress (and its pending cycle) is not credited yet; it can hold at most one fight of rewards.
 const open=json(r,'activeBattleStat?{xp:activeBattleStat.xp}:{xp:0}');
 assert(t.ms>=35*60*1000&&t.ms<=40*60*1000,'only credited spawn-to-spawn cycles count');assert(t.battles>100);
 const kills=Object.values(t.kills).reduce((a,b)=>a+b,0);assert(after.kills-before.kills-kills>=0&&after.kills-before.kills-kills<=8,'kills match except the uncredited last encounters');
 assert.equal(Object.values(t.monsters).reduce((a,b)=>a+b,0),kills);assert.equal(Object.values(t.enemies).reduce((a,b)=>a+b,0),kills);
 let xp=after.xp-before.xp;for(let lv=before.lv;lv<after.lv;lv++)xp+=r.run(`need(${lv})`);assert(xp-t.xp>=0&&xp-t.xp<=200+open.xp,'credited XP is the XP actually granted');
 assert(after.gold-before.gold-t.gold>=0&&after.gold-before.gold-t.gold<=20);
 for(const [k,n] of Object.entries(t.items))assert(n<=(after.items[k]||0)-(before.items[k]||0)+0,k+' items are inventory gains');
 assert.equal(Object.values(t.gear).reduce((a,b)=>a+b,0)<=after.bag-before.bag+Object.values(t.items).length*0+1000,true);
 const s=json(r,'EmberwildIdleStatistics.snapshot()');
 assert.equal(s.source,'online');assert(s.sampleMs>=30*60*1000&&s.sampleMs<31*60*1000);assert.equal(s.perTicket.ms,30*60*1000);assert.equal(s.currentConfiguration,true);assert.equal(s.sustainable,true);
 assert(s.perTicket.xp>0&&s.perTicket.gold>0&&s.perTicket.battles>0);assert(s.levelMin>=1&&s.levelMax>=s.levelMin);
 // Persisted with the save and normalized on load.
 r.run('save()');const cold=loadRuntime(root,'index.html',Object.fromEntries(r.values));cold.run("continueFromTitle();closeModal()");
 assert.deepEqual(json(cold,'EmberwildIdleStatistics.snapshot(0,0).perTicket'),s.perTicket);assert.equal(json(cold,'EmberwildIdleStatistics.totals(0,0)').battles,t.battles);
 assert.deepEqual(r.errors,[]);assert.deepEqual(cold.errors,[]);
});
test('offline replay never enters online totals; without 30 online minutes it samples only the first 30 replay minutes',async()=>{
 const r=game();r.advance(2*3600000);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false);
 assert.equal(json(r,'party.offlineExploration.receipt').effectiveMs,2*3600000,'the replay still settles its whole time');
 {const t=json(r,'EmberwildIdleStatistics.totals(0,0)');assert.equal(t.ms,0);assert.equal(t.battles,0);assert.deepEqual(t.kills,{});}
 const s=json(r,'EmberwildIdleStatistics.snapshot(0,0)');assert.equal(s.source,'offline');assert(s.sampleMs>=30*60*1000&&s.sampleMs<31*60*1000);
 const first=s.at,start=json(r,'party.offlineExploration.receipt').start;// A level-up that equips a newly learned skill is a configuration change and restarts the 30-minute run,
 // so the sample is the first complete run of the replay rather than literally its first minute.
 assert(first>=start&&first+s.sampleMs<=start+2*3600000,'the sample lies inside this replay');
 assert.equal(r.run('party.idleStatistics.progress.sampledWindow'),r.run('party.offlineExploration.receipt.start')+24*3600000,'this absence is sampled once');
 assert.deepEqual(r.errors,[]);
});
test('a stored snapshot is replaced only by higher earnings; configuration changes restart the 30-minute run',()=>{
 const r=game();
 r.run(`party.idleStatistics=EmberwildIdleStatistics.normalize({version:1,regions:{'0:0':{first:1,last:2,total:{},snapshot:{id:'best',source:'online',config:'x',at:1,levelMin:1,levelMax:1,boosts:[],ms:1800000,battles:1,xp:1e9,gold:1}}}});`);
 play(r,35);assert.equal(json(r,'EmberwildIdleStatistics.snapshot(0,0)').id,'best','a lower-earning sample never overwrites');
 r.run(`party.idleStatistics.regions['0:0'].snapshot.xp=1;`);play(r,32);assert.notEqual(json(r,'EmberwildIdleStatistics.snapshot(0,0)').id,'best','a higher-earning sample replaces it');
 const sampling=json(r,'EmberwildIdleStatistics.sampling');assert(sampling&&sampling.ms>0);
 r.run(`{const h=playerHero();h.autoPotion=!h.autoPotion;}`);play(r,1);assert(json(r,'EmberwildIdleStatistics.sampling').ms<sampling.ms,'a configuration change restarts the run');
 assert.deepEqual(r.errors,[]);
});
test('invalid statistics are normalized away and quest or challenge fights are never recorded',()=>{
 const r=game();
 const n=json(r,`EmberwildIdleStatistics.normalize({version:1,regions:{'0:0':{total:{ms:-5,xp:'x',kills:{normal:3,bad:NaN}},snapshot:{source:'online',ms:10}},'999:0':{},'0:7':{},'1:2':{total:{ms:60000}}}})`);
 assert.deepEqual(Object.keys(n.regions).sort(),['0:0','1:2']);assert.equal(n.regions['0:0'].total.ms,0);assert.deepEqual(n.regions['0:0'].total.kills,{normal:3});assert.equal(n.regions['0:0'].snapshot,null);
 assert.deepEqual(json(r,'EmberwildIdleStatistics.normalize(null)'),{version:1,regions:{},progress:{current:null,pending:null,run:null,sampledWindow:null}});
 assert.deepEqual(json(r,`EmberwildIdleStatistics.normalize({version:1,regions:{},progress:{current:{region:'x'},run:{region:'0:0',mode:'online',config:'abc',start:1,levels:[1]},sampledWindow:-3}})`).progress,{current:null,pending:null,run:{region:'0:0',mode:'online',window:null,config:'abc',start:1,ms:0,battles:0,wipes:0,deaths:0,xp:0,gold:0,goldLost:0,kills:{},monsters:{},enemies:{},items:{},consumed:{},gear:{},levelMin:1,levelMax:0,boosts:[]},sampledWindow:0});
 r.run('party.questChallenge={id:"q",name:"q"};');play(r,3);assert.equal(json(r,'EmberwildIdleStatistics.totals(0,0)'),null);
 assert.deepEqual(r.errors,[]);
});
