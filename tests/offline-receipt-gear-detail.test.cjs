'use strict';
/* v0.115: gear opened from the offline receipt shows the same detail as the backpack:
   tier, wearers and level, total stats and the attribute breakdown (was only the breakdown). */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');

test('offline receipt gear detail shows tier, level, total stats and attribute sources like the backpack',async()=>{
 const r=loadRuntime(root);r.ctx.seed=seed;r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=97531;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);
 // Long enough for ordinary drops to include equipment; offline settlement builds the receipt.
 r.advance(3*60*60*1000);await r.run('EmberwildOffline.settle(undefined,true)');
 assert.equal(r.run('EmberwildOffline.failed'),false);
 const count=r.run('party.offlineExploration.receipt?.gear?.length||0');
 assert(count>0,'the receipt lists dropped equipment');
 const kinds=new Set(),skills=[];
 for(let i=0;i<Math.min(count,12);i++){
  r.run(`closeModal();showOfflineGear(${i})`);
  const html=r.run("$('modal').innerHTML"),g=JSON.parse(r.run(`JSON.stringify(party.offlineExploration.receipt.gear[${i}])`));
  assert.match(html,/<h2>/,'name heading');
  assert.match(html,new RegExp('<p>T'+(g.powerTier||1)+' · '),'tier line');
  if(r.run(`EmberwildTokens.isToken(party.offlineExploration.receipt.gear[${i}])`)){
   assert.match(html,/攻擊力|生命上限|防禦力|暴擊/,'token stat line');
   assert.match(html,/token-job-tag/,'token job tag');
   assert.ok(html.includes(r.run(`companionTokenAbilityText(party.offlineExploration.receipt.gear[${i}])`)),'token ability text');
  }else{
   assert.match(html,/ · LV \d+/,'wearable jobs and required level');
   assert.match(html,/class="equipment-total-summary"><span class="equipment-summary-values"><span>[^<]+ \+\d/,'total stat values');
  }
  assert.match(html,/詳細數值來源/,'attribute sources stay available');
  assert.doesNotMatch(html,/^<h2>[\s\S]*?<\/h2><div class="offline-gear-detail"><h3>/,'the name is not repeated as a second heading');
  if(g.skillSockets!==undefined||g.equipmentSkill||g.skillId)skills.push(/<h3>裝備技能<\/h3>/.test(html));
  assert.equal(html,html.replace(/undefined|NaN/g,''),'no missing values');
  kinds.add(r.run(`EmberwildTokens.isToken(party.offlineExploration.receipt.gear[${i}])?'token':'gear'`));
 }
 assert(kinds.has('gear'),'covered ordinary equipment: '+[...kinds]);
 assert(skills.some(Boolean),'an equipment skill (ability) is shown for gear that has one');
 assert.deepEqual(r.errors,[]);
});
