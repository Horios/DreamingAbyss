const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function challenge(){
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(0);closeModal();playerHero().lv=GS('progression.levelCaps.beforeClear',30);syncParty();refillParty();setExplorationCategory('boss');selectExplorationMap(worldProgressionGateIndex());startSelectedExploration();for(const e of foes){e.hp=1;e.atk=1;}save();`);
 assert.equal(r.run('party.map'),r.run('worldProgressionGateIndex()'));assert(r.run("foes.some(e=>e.kind==='final')"));return r;
}
async function settle(r){r.advance(55000);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false,r.elements.get('offline-settlement').innerHTML);}
function completed(r){assert.equal(r.run('party.cleared'),true);assert.equal(r.run('running'),false);assert(r.run('party.offlineExploration.receipt.kills')>0);assert.equal(r.run('party.offlineExploration.lastAt'),r.now);assert.equal(r.run('__EMBERWILD_SIMULATION_MODAL'),null);assert.equal(r.elements.get('modal').open,false);assert.deepEqual(r.errors,[]);}
test('final boss offline victory can close its simulated dialog and commit the complete stage',async()=>{
 const r=challenge();await settle(r);completed(r);
 const kills=r.run('state.totalKills'),gold=r.run('state.gold');await r.run('EmberwildOffline.settle()');assert.equal(r.run('state.totalKills'),kills);assert.equal(r.run('state.gold'),gold);
});
test('refreshing a saved final-stage fight resumes and completes without a stuck settlement',async()=>{
 const original=challenge(),key=original.run('KEY'),raw=original.values.get(key),r=loadRuntime(root,'index.html',{[key]:raw},original.now+55000);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run('continueFromTitle()');await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false,r.elements.get('offline-settlement').innerHTML);completed(r);
 const saved=r.values.get(key),cold=loadRuntime(root,'index.html',{[key]:saved},r.now);cold.ctx.setTimeout=fn=>setImmediate(fn);cold.run('continueFromTitle()');await cold.run('EmberwildOffline.settle()');assert.equal(cold.run('EmberwildOffline.failed'),false);assert.equal(cold.run('state.totalKills'),r.run('state.totalKills'));assert.equal(cold.run('state.gold'),r.run('state.gold'));assert.equal(cold.run('acknowledgeOfflineExploration()'),true);
});
