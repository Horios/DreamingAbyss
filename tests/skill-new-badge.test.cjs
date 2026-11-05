// v0.076: newly learned skills are not equipped automatically; the skills tab shows NEW and the page guides equipping.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(3);closeModal();clearInterval(timer);');return r;}
test('a skill learned on level up is marked NEW on the skills tab until the player sees it, and is not equipped automatically',()=>{
 const r=game();assert.equal(r.run('newSkillCount()'),0,'starting skills count as seen');assert.equal(r.run("pageNewReminder('skills')"),false);
 r.run('state.lv=5;syncParty();__EMBERWILD_SKILLS.refreshAll?.();');
 const fresh=json(r,'__EMBERWILD_SKILL_SYSTEM_UI.newSkillIds(party.members[0])');assert(fresh.includes('class3-initial1'),'治療 is new');
 assert(!json(r,'state.skillLoadout.active').includes('class3-initial1'),'not equipped automatically');
 assert.equal(r.run("pageNewReminder('skills')"),true);
 r.run("setTab('skills');render();");const html=r.elements.get('app').innerHTML;assert.match(html,/學會新技能/);assert.match(html,/equipNewSkill\('class3-initial1'\)/);
 assert.match(html,/data-page="skills"[^>]*>[\s\S]*?quest-new|quest-new[\s\S]*?技能/,'menu shows the N badge');
 r.run("equipNewSkill('class3-initial1')");assert.match(r.elements.get('modal').innerHTML,/skill-new/,'the slot list highlights the new skill');
 assert.equal(json(r,'__EMBERWILD_SKILL_SYSTEM_UI.newSkillIds(party.members[0])').includes('class3-initial1'),false,'seeing the slot list marks it');
 r.run("closeModal();chooseSkillSlot('active',1,'class3-initial1')");assert(json(r,'state.skillLoadout.active').includes('class3-initial1'));
 assert.deepEqual(r.errors,[]);
});
test('知道了 clears all NEW marks, the seen list survives save and reload, and old saves start without NEW',()=>{
 const r=game();r.run('state.lv=5;syncParty();__EMBERWILD_SKILLS.refreshAll?.();');assert(r.run('newSkillCount()')>0);
 r.run('dismissNewSkills()');assert.equal(r.run('newSkillCount()'),0);
 r.run('globalThis.saved=JSON.parse(JSON.stringify(packParty()));loadParty(saved);');assert.equal(r.run('newSkillCount()'),0);
 // A save without seenSkillIds: everything already learned counts as seen.
 r.run('delete saved.members[0].seenSkillIds;loadParty(saved);');assert.equal(r.run('newSkillCount()'),0);
 assert.deepEqual(r.errors,[]);
});
