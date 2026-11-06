// A small backward clock step (time sync) must not fail the offline timeline; a large one still reports it.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('small backward clock steps wait for the clock; large ones keep the invalid-time error',async()=>{
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);r.run('selectSaveSlot(1);start(0);closeModal();startSelectedExploration();save();');
 r.run('party.offlineExploration.lastAt=Date.now()+800;');
 r.run('EmberwildOffline.sync()');await r.run('EmberwildOffline.settle(Date.now(),false)');
 assert.equal(r.run('EmberwildOffline.failed'),false,'an 0.8 s step back is tolerated');
 r.advance(1000);r.run('tick()');assert.equal(r.run('EmberwildOffline.failed'),false,'the timeline continues once the clock catches up');
 r.run('party.offlineExploration.lastAt=Date.now()+3600000;');await r.run('EmberwildOffline.settle(Date.now(),false)');
 assert.equal(r.run('EmberwildOffline.failed'),true,'an hour back is still reported');
});
