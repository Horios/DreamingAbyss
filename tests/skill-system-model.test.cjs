const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/skills/skill-system-model.js'),legacy=require('../data/balance.json');
test('canonical IDs project all legacy skills without changing their positions and retain existing initial skills and add four level-three skills',()=>{
 const d=M.normalizeDocument(legacy),s=d.skillSystem;assert.equal(new Set(s.definitions.map(x=>x.id)).size,s.definitions.length);
 for(let j=0;j<4;j++){assert.equal(s.classRules[j].initial.length,4);assert.deepEqual(s.classRules[j].initial.map(x=>x.level),[1,3,5,3]);legacy.classes[j].skills.forEach((sk,i)=>assert.equal(d.classes[j].skills[i].id,sk.id));assert.deepEqual(M.slots(s,j,false),{active:3,proc:1,support:1});assert.deepEqual(M.slots(s,j,true),{active:3,proc:2,support:2});}
 assert.deepEqual(M.normalizeDocument(d),d);
});
test('dangling skill references, duplicate IDs, invalid slots and socket probabilities are rejected',()=>{
 const d=M.normalizeDocument(legacy);for(const mutate of [s=>s.definitions.push(s.definitions[0]),s=>s.classRules[0].initial[0].skillId='missing',s=>s.classRules[0].slots.first.proc=3,s=>s.equipment.pool[0].skillId='missing',s=>s.equipment.socketBands[0].weights=[1,1,0,0]]){const s=M.copy(d.skillSystem);mutate(s);assert.throws(()=>M.validate(s));}
});
test('shared team gem instances refund once, companion gems refund and gear migration never rerolls',()=>{
 const s=M.normalizeDocument(legacy).skillSystem,d={version:3,members:[{gems:Array(15).fill(0),skills:[1],sockets:[0],bag:[{id:'old',plus:5,affix:[{type:4,skill:2,value:3}]}]},{gems:Array(15).fill(0),skills:[1],sockets:[2],bag:[]}],buildSystem:{permanent:{gemInstances:{'gem-1':0}},plans:[{sockets:['gem-1']},{sockets:['gem-1']}]}};
 const out=M.migrateSave(d,s);assert.equal(out.members[0].gems[0],1);assert.equal(out.members[0].gems[2],1);assert.deepEqual(out.buildSystem.permanent.gemInstances,{});assert.equal(out.members[0].bag[0].skillSockets.count,0);assert.equal(out.members[0].bag[0].plus,5);assert.deepEqual(M.migrateSave(out,s),out);assert.equal(d.members[0].bag[0].skillSockets,undefined);
});
test('generated sockets are fixed after creation and invalid saved gems are rejected',()=>{
 const system=M.normalizeDocument(legacy).skillSystem,g={id:'new',equipmentLevel:25};M.gear(g,{system,random:()=>.99});assert.equal(g.skillSockets.count,3);M.gear(g,{system,random:()=>0});assert.equal(g.skillSockets.count,3);g.skillSockets.gems.push(0);assert.throws(()=>M.gear(g,{system}));
});
