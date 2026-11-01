const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(){
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(0);closeModal();globalThis.journalRng=123456;Math.random=()=>{journalRng=(Math.imul(journalRng,1664525)+1013904223)>>>0;return journalRng/4294967296;};startSelectedExploration();logs=[];battleLogGeneration++;`);
 return r;
}
function hasAttacks(r){assert(r.run("logs.some(e=>e.type==='playerDamage'||e.type==='enemyDamage')"),'Live combat must record attack events');assert.match(r.run('logContent()'),/data-event-type="(?:playerDamage|enemyDamage)"/);}
test('normal live ticks publish combat events to the battle journal without an offline receipt',()=>{
 const r=game();for(let i=0;i<12;i++){r.advance(1000);r.run('tick()');}
 hasAttacks(r);assert.equal(r.run('party.offlineExploration.receipt'),null);assert.equal(r.run('party.offlineExploration.pendingReceipt'),null);assert.deepEqual(r.errors,[]);
});
test('delayed live ticks still record damage, XP and loot without opening offline settlement',async()=>{
 const r=game();r.advance(60000);r.run('tick()');await r.run('EmberwildOffline.settle(undefined,false)');
 hasAttacks(r);assert(r.run("logs.some(e=>e.type==='exp')"));
 // Random drops may legitimately be absent in a one-minute session. Grant one
 // deterministic material through the real loot path to verify journal wiring.
 const beforeCount=r.run("state.materials['戰報測試素材']||0");
 r.run("grantConfiguredDrop({type:'material',key:'戰報測試素材',quantityMin:1,quantityMax:1},{kind:'normal',region:party.map,difficulty:party.difficulty})");
 assert.equal(r.run("state.materials['戰報測試素材']"),beforeCount+1);
 assert(r.run("logs.some(e=>e.type==='item'&&e.text.includes('戰報測試素材'))"));
 assert.match(r.run('logContent()'),/data-event-type="item"/);
 assert.equal(r.run('party.offlineExploration.receipt'),null);assert.notEqual(r.elements.get('offline-settlement').hidden,false);assert.deepEqual(r.errors,[]);
});
test('offline replay stays quiet and live combat resumes recording after it',async()=>{
 const r=game();r.advance(60000);await r.run('EmberwildOffline.settle()');
 assert.equal(r.run('logs.length'),0);assert(r.run('party.offlineExploration.receipt.kills')>0);r.run('acknowledgeOfflineExploration()');
 for(let i=0;i<12;i++){r.advance(1000);r.run('tick()');}hasAttacks(r);assert.deepEqual(r.errors,[]);
});
test('live combat respects report pause and keeps event types available for filtering',()=>{
 const r=game();r.run('toggleBattleReport()');for(let i=0;i<6;i++){r.advance(1000);r.run('tick()');}assert.equal(r.run('logs.length'),0);
 r.run('toggleBattleReport();setBattleLogFilter("playerDamage")');for(let i=0;i<12;i++){r.advance(1000);r.run('tick()');}
 assert(r.run("logs.some(e=>e.type==='playerDamage')"));assert.match(r.run('logContent()'),/data-event-type="playerDamage"/);assert.doesNotMatch(r.run('logContent()'),/data-event-type="enemyDamage"/);assert.deepEqual(r.errors,[]);
});
