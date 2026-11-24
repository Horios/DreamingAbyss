'use strict';
/* v0.212: the support category is merged into active skills. Support skills are equipped in active slots, the player has
   no support slots, old saves lose their support-slot loadout (the skills stay learned), and combat casts them through
   their own engine exactly as before. Active slot counts and the skill data are unchanged. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function ready(){
 const r=loadRuntime(root);
 r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);running=false;
  globalThis.S=__EMBERWILD_SKILLS;globalThis.sup=S.system().definitions.find(sk=>sk.type==='support'&&sk.jobs.includes(0)&&sk.partnerId==null&&!sk.disabled);
  const h=playerHero();h.acquiredSkillIds??=[];h.acquiredSkillIds.push(sup.id);S.grantSkill?.(h,sup.id);S.refreshHero(h);`);
 return r;
}
test('support skills go into active slots; there are no support slots and the active count is unchanged',()=>{
 const r=ready();
 assert.equal(r.run('S.learned(playerHero(),sup)'),true,'the fixture learned a support skill');
 const before=json(r,'({active:playerHero().skillLoadout.active.length,proc:playerHero().skillLoadout.proc.length,support:playerHero().skillLoadout.support.length,rule:EmberwildSkillSystem.slots(S.system(),0,true)})');
 assert.equal(before.support,0);assert.equal(before.active,before.rule.active,'active slots follow the class rule');assert.equal(before.proc,before.rule.proc);
 assert.equal(r.run(`configureSkill('support',0,sup.id)`),false,'no support slot');
 assert.equal(r.run(`configureSkill('active',2,sup.id)`),true);
 const h=json(r,'({loadout:playerHero().skillLoadout.active,active:playerHero().active,support:playerHero().supportSlots,index:EmberwildSkillSystem.adapterFor(sup,0).index})');
 assert.equal(h.loadout[2],r.run('sup.id'));assert.equal(h.active[2],null,'the core field stays empty at that slot');assert.equal(h.support[2],h.index,'the support engine field holds it');
 // A core active skill cannot replace the support skill twice, and the support skill appears once.
 assert.equal(h.loadout.filter(id=>id===r.run('sup.id')).length,1);
 // The slot dialog offers it among active skills, labelled 主動.
 r.run(`openSkillSlot('active',2)`);const modal=r.elements.get('modal').innerHTML;
 assert.match(modal,new RegExp('data-skill-id="'+r.run('sup.id')+'"'));assert.doesNotMatch(modal,/輔助/);
 assert.doesNotMatch(r.run('skillsView()'),/輔助技能|data-skill-slot="support:/);
 // Save and reload keep it in the active slot.
 r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');
 assert.equal(r.run('playerHero().skillLoadout.active[2]'),r.run('sup.id'));assert.deepEqual(r.errors,[]);
});
test('an old save with a support-slot loadout keeps the skill learned but unequipped',()=>{
 const r=ready();
 const raw=json(r,`(()=>{const d=packParty(),m=d.version===3?d.members[0]:d;m.skillLoadout.support=[sup.id];m.skillLoadout.active=m.skillLoadout.active.map(id=>id===sup.id?null:id);m.supportSlots=[EmberwildSkillSystem.adapterFor(sup,0).index];return d;})()`);
 r.run(`loadParty(${JSON.stringify(raw)})`);
 const h=json(r,'({loadout:playerHero().skillLoadout,support:playerHero().supportSlots,learned:S.learned(playerHero(),sup)})');
 assert.deepEqual(h.loadout.support,[]);assert(!h.loadout.active.includes(r.run('sup.id')),'not moved into an active slot');
 assert(h.support.every(i=>i===null),'no support skill is cast');assert.equal(h.learned,true,'still learned and equippable');
 assert.equal(r.run(`configureSkill('active',0,sup.id)`),true);assert.deepEqual(r.errors,[]);
});
test('combat casts a support skill from an active slot through its own engine',()=>{
 const r=ready();
 r.run(`configureSkill('active',0,sup.id);globalThis.casts=0;const base=castSupport;castSupport=function(...a){const out=base.apply(this,a);if(out!==false)casts++;return out;};
  setTab('battle');running=true;spawnGroup();for(let i=0;i<400&&!casts;i++){const it=pacedRound();for(let n=0;n<5000&&!it.next().done;n++){}if(!foes.some(e=>e.hp>0))spawnGroup();}running=false;`);
 assert(r.run('casts')>0,'the support skill was cast');assert.deepEqual(r.errors,[]);
});
