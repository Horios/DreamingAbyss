'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
test('enhancement effects preserve existing successful costs, saved levels, caps and save rollback',()=>{
 const r=loadRuntime(path.resolve(__dirname,'..'));
 r.run(`selectSaveSlot(1);start(1);closeModal();globalThis.g=state.bag.find(g=>!EmberwildTokens.isToken(g));state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=100000;openForge(g.id);globalThis.cost=upgradeMaterials(g),beforeDust=state.dust;enhance(g.id);`);
 assert.equal(r.run('g.plus'),1);assert.equal(r.run('state.dust'),r.run('beforeDust-cost.dust'));assert.equal(r.run('RULES.enhanceMax'),12);
 r.run(`globalThis.saveBase=save;save=()=>false;globalThis.dustBeforeRollback=state.dust;enhance(g.id);save=saveBase;`);
 assert.equal(r.run('g.plus'),1);assert.equal(r.run('state.dust'),r.run('dustBeforeRollback'));
 const sequences=JSON.parse(r.run('JSON.stringify(Array.from({length:12},(_,i)=>EmberwildEnhancementEffects.sequence(i+1)))'));
 assert.deepEqual(sequences.map(x=>x.length),[1,1,1,2,2,2,2,3,3,3,4,4]);assert.equal(r.run('EmberwildEnhancementEffects.gapMs'),300);
 assert.equal(r.run('EmberwildEnhancementEffects.sequence(0).length'),0);assert.equal(r.run('EmberwildEnhancementEffects.sequence(13).length'),0);assert.deepEqual(r.errors,[]);
});
