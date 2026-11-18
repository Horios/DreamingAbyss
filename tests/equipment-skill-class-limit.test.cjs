// Class eligibility is checked when a worn item supplies a skill.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function wearing(job){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(${job});closeModal();state.lv=15;state.mastery.sword=100000;clearInterval(timer);globalThis.g=gear(1,1,0,${job});g.id='armor';__EMBERWILD_SKILLS.byId('job0-core2').sources=[{type:'equipment'}];g.skillId='job0-core2';g.skillSockets={version:1,count:1,gems:[null]};addGear(g);state.equipped[1]='armor';save();`);return r;}

test('worn equipment supplies a skill only to its eligible class',()=>{
 for(const job of [0,1]){
  const r=wearing(job);
  assert.equal(r.run("__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('job0-core2'))"),job===0);
  if(job!==0)assert.equal(r.run("configureSkill('proc',0,'job0-core2')"),false);
  assert.deepEqual(r.errors,[]);
 }
});
