const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),file='js/combat/offline-exploration.js';
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(){
 const r=loadRuntime(root,'index.html',{},undefined,{transformSource:(name,code)=>name===file?code.replace('globalThis.EmberwildOffline={','globalThis.__offlineTest={captureResources,collect,track};globalThis.EmberwildOffline={'):code});
 r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`globalThis.rngState=123456;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};selectSaveSlot(1);start(0);closeModal();startSelectedExploration();save();`);return r;
}
const turn=()=>new Promise(setImmediate);
async function pump(callbacks,pending){for(let i=0;callbacks.length;i++){assert(i<20000,'finite replay');callbacks.shift()();await turn();}await pending;}
function paused(r,ms=3600000){const callbacks=[];r.ctx.setTimeout=fn=>callbacks.push(fn);r.advance(ms);const pending=r.run('EmberwildOffline.settle()');return {callbacks,pending};}

test('resource scratch buffers preserve separate gains/spending, deleted keys and full appended gear/token snapshots',()=>{
 const r=game();
 r.run(`globalThis.noReceipt=__offlineTest.captureResources();__offlineTest.track(Date.now()+60000);
 const h=playerHero(),rr=party.offlineExploration.pendingReceipt;h.materials.test=5;
 globalThis.before=__offlineTest.captureResources();h.materials.test+=4;h.gold+=10;__offlineTest.collect(before);
 globalThis.reused=__offlineTest.captureResources(before)===before;h.materials.test-=4;h.gold-=10;__offlineTest.collect(before);
 __offlineTest.captureResources(before);delete h.materials.test;__offlineTest.collect(before);
 __offlineTest.captureResources(before);h.materials.newkey=2;h.healingPotions.heal_standard=0;__offlineTest.collect(before);
 __offlineTest.captureResources(before);h.materials.newkey=3;h.healingPotions.heal_standard=1;
 addGear(gear(1,0,0,0));grantConfiguredToken(EmberwildTokens.normalize().catalog[0].id);__offlineTest.collect(before);`);
 assert.equal(r.run('noReceipt'),null);assert.equal(r.run('reused'),true);
 assert.equal(r.run('party.offlineExploration.pendingReceipt.items["material:test"]'),4);
 assert.equal(r.run('party.offlineExploration.pendingReceipt.consumed["material:test"]'),9);
 assert.equal(r.run('party.offlineExploration.pendingReceipt.items["material:newkey"]'),3);
 assert.equal(r.run('party.offlineExploration.pendingReceipt.goldGained'),10);assert.equal(r.run('party.offlineExploration.pendingReceipt.goldSpent'),10);
 assert.deepEqual(json(r,'party.offlineExploration.pendingReceipt.gear'),json(r,'state.bag.slice(-2)'));
 r.run(`state.bag.at(-1).locked=true;`);assert.equal(r.run('party.offlineExploration.pendingReceipt.gear.at(-1).locked'),false);
 // Replaced arrays use ID comparison; existing items must not appear twice.
 r.run(`__offlineTest.captureResources(before);state.bag=[...state.bag,gear(1,1,0,0)];__offlineTest.collect(before);`);
 assert.equal(r.run('party.offlineExploration.pendingReceipt.gear.length'),3);
});

test('simulation can advance past a durable checkpoint, then reload only that checkpoint without duplicate receipts',async()=>{
 const r=game();let timer=0;r.ctx.performance.now=()=>timer;const {callbacks,pending}=paused(r);await turn();const key=r.run('KEY'),initial=r.values.get(key);
 timer=20;callbacks.shift()();await turn();assert(r.run('party.offlineExploration.lastAt')>JSON.parse(initial).offlineExploration.lastAt);assert.equal(r.values.get(key),initial);
 assert.match(r.elements.get('offline-settlement').innerHTML,/進度代表已計算時間/);
 timer=1200;callbacks.shift()();await turn();const checkpoint=r.values.get(key),durable=JSON.parse(checkpoint),rng=r.run('rngState'),serial=r.run('uidSerial');assert(durable.offlineExploration.lastAt>JSON.parse(initial).offlineExploration.lastAt);assert(durable.offlineExploration.pendingReceipt);assert.equal(durable.offlineExploration.receipt,null);
 // One-event batches: interrupt after more simulation but before the next save.
 r.ctx.performance.now=()=>timer+=20;callbacks.shift()();await turn();assert.equal(r.values.get(key),checkpoint);assert(r.run('party.offlineExploration.lastAt')>durable.offlineExploration.lastAt);
 r.ctx.performance.now=()=>timer;await pump(callbacks,pending);assert.equal(r.run('EmberwildOffline.failed'),false);const expected=json(r,'packParty()');
 const b=loadRuntime(root,'index.html',{[key]:checkpoint},r.now);b.ctx.setTimeout=fn=>setImmediate(fn);
 // RNG is not part of the game save; restore the test source at this cursor.
 b.ctx.rng=rng;b.ctx.serial=serial;b.run('globalThis.rngState=rng;uidSerial=serial;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};continueFromTitle()');await b.run('EmberwildOffline.settle()');
 assert.equal(b.run('EmberwildOffline.failed'),false);assert.deepEqual(json(b,'packParty()'),expected);
});

test('failed write with an unread receipt falls back to lastCommitted and restores its pending checkpoint',async()=>{
 const r=game();r.advance(60000);await r.run('EmberwildOffline.settle()');const unread=json(r,'party.offlineExploration.receipt');let timer=0;r.ctx.performance.now=()=>timer;const {callbacks,pending}=paused(r);await turn();const key=r.run('KEY'),put=r.ctx.localStorage.setItem,get=r.ctx.localStorage.getItem;
 timer=1200;callbacks.shift()();await turn();const checkpoint=r.values.get(key),durable=JSON.parse(checkpoint),rng=r.run('rngState'),serial=r.run('uidSerial');
 r.ctx.performance.now=()=>timer+=20;callbacks.shift()();await turn();r.ctx.localStorage.setItem=(k,v)=>{if(k===key)throw Error('quota');return put(k,v);};r.ctx.localStorage.getItem=k=>k===key?'{invalid read':get(k);timer+=1500;callbacks.shift()();await turn();await pending;
 assert.equal(r.run('EmberwildOffline.failed'),true);assert.equal(r.values.get(key),checkpoint);assert.equal(r.run('party.offlineExploration.lastAt'),durable.offlineExploration.lastAt);assert.equal(r.run('state.totalKills'),durable.members[0].totalKills);assert.deepEqual(json(r,'party.offlineExploration.pendingReceipt'),durable.offlineExploration.pendingReceipt);assert.deepEqual(json(r,'party.offlineExploration.receipt'),unread);
 r.ctx.localStorage.setItem=put;r.ctx.localStorage.getItem=get;r.ctx.setTimeout=fn=>setImmediate(fn);r.ctx.performance.now=()=>0;r.ctx.rng=rng;r.ctx.serial=serial;r.run('rngState=rng;uidSerial=serial');await r.run('retryOfflineExploration()');assert.equal(r.run('EmberwildOffline.failed'),false);assert.equal(r.run('party.offlineExploration.lastAt'),r.now);assert.deepEqual(json(r,'party.offlineExploration.receipt'),unread);assert.equal(r.run('party.offlineExploration.receipt.kills+party.offlineExploration.pendingReceipt.kills'),r.run('state.totalKills'));
});

test('losing save ownership between uncommitted batches cannot write or acknowledge rewards',async()=>{
 const r=game();let timer=0;r.ctx.performance.now=()=>timer;const {callbacks,pending}=paused(r);await turn();const key=r.run('KEY'),raw=r.values.get(key);r.ctx.performance.now=()=>timer+=20;callbacks.shift()();await turn();r.ctx.__EMBERWILD_SAVE_OWNER=false;await pump(callbacks,pending);assert.equal(r.values.get(key),raw);assert.equal(r.run('EmberwildOffline.failed'),true);assert.equal(r.run('save()'),false);assert.equal(r.run('acknowledgeOfflineExploration()'),false);
});

test('interrupted settlement keeps its original cap, skips the excess, then permits a new absence',async()=>{
 const cap=60000,source=(name,code)=>name===file?code.replace('maxOfflineMs=24*60*60*1000','maxOfflineMs='+cap):code;
 const r=loadRuntime(root,'index.html',{},undefined,{transformSource:source}),callbacks=[];
 r.ctx.setTimeout=fn=>callbacks.push(fn);let timer=0;r.ctx.performance.now=()=>timer+=20;
 r.run('selectSaveSlot(1);start(0);closeModal();startSelectedExploration();save()');
 const first=r.run('party.offlineExploration.lastAt'),key=r.run('KEY');r.advance(90000);
 const pending=r.run('EmberwildOffline.settle()');await turn();assert(callbacks.length>0);
 let checkpoint;
 for(let i=0;i<6;i++){
  timer+=1200;assert(callbacks.length>0);callbacks.shift()();await turn();
  checkpoint=JSON.parse(r.values.get(key)).offlineExploration;
  if(checkpoint.lastAt>first)break;
 }
 const durable=r.values.get(key);
 assert(checkpoint.lastAt>first&&checkpoint.lastAt<first+cap);
 assert.equal(checkpoint.offlineWindow.capAt,first+cap);
 assert.equal(checkpoint.offlineWindow.untilAt,r.now);
 const b=loadRuntime(root,'index.html',{[key]:durable},r.now,{transformSource:source});
 b.ctx.setTimeout=fn=>setImmediate(fn);b.run('continueFromTitle()');await b.run('EmberwildOffline.settle()');
 assert.equal(b.run('EmberwildOffline.failed'),false);
 assert.equal(b.run('party.offlineExploration.lastAt'),b.now);
 assert.equal(b.run('party.offlineExploration.offlineWindow'),null);
 const receipt=json(b,'party.offlineExploration.receipt||party.offlineExploration.pendingReceipt');
 assert.equal(receipt.intervals.reduce((sum,x)=>sum+x.end-x.start,0),cap);
 b.advance(15000);await b.run('EmberwildOffline.settle()');
 assert.equal(b.run('party.offlineExploration.lastAt'),b.now);
 assert.equal(b.run('party.offlineExploration.offlineWindow'),null);
 r.ctx.performance.now=()=>timer;r.ctx.setTimeout=fn=>setImmediate(fn);
 while(callbacks.length){callbacks.shift()();await turn();}await pending;
 assert.equal(r.run('EmberwildOffline.failed'),false);
});
