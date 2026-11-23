'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
test('enhancement effects preserve existing successful costs, saved levels, caps and save rollback',()=>{
 const r=loadRuntime(path.resolve(__dirname,'..'));
 r.run(`{const create=document.createElement;document.createElement=(...args)=>{const n=create(...args);n.style.setProperty=(key,value)=>n.style[key]=value;return n;};}selectSaveSlot(1);start(1);closeModal();globalThis.g=state.bag.find(g=>!EmberwildTokens.isToken(g));state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=100000;openForge(g.id);globalThis.cost=upgradeMaterials(g),beforeDust=state.dust;enhance(g.id);`);
 assert.equal(r.run('g.plus'),1);assert.equal(r.run('state.dust'),r.run('beforeDust-cost.dust'));assert.equal(r.run('RULES.enhanceMax'),12);
 r.run(`globalThis.saveBase=save;save=()=>false;globalThis.dustBeforeRollback=state.dust;enhance(g.id);save=saveBase;`);
 assert.equal(r.run('g.plus'),1);assert.equal(r.run('state.dust'),r.run('dustBeforeRollback'));
 const message=r.ctx.document.body.children.at(-1);assert.equal(message.textContent,'強化成功！');assert.match(message.className,/forge-enhance-success/);assert.equal(message.attributes.role,'status');
 assert.equal(r.run('EmberwildEnhancementEffects.present({outcome:"success",level:0})'),false);assert.equal(r.run('EmberwildEnhancementEffects.present({outcome:"success",level:13})'),false);
 assert.equal(r.run('EmberwildEnhancementEffects.activeCount'),1);r.run('EmberwildEnhancementEffects.clear()');assert.equal(r.run('EmberwildEnhancementEffects.activeCount'),0);assert.deepEqual(r.errors,[]);
});
