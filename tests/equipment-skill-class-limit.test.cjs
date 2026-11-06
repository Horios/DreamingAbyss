// v0.082: an equipment skill rolled for another class (for example a warrior skill on all-class armor worn by a priest)
// shows its class limit on the skills page, the gear details and the socket editor, and cannot be enabled.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const text=html=>html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
function wearing(job){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(${job});closeModal();clearInterval(timer);globalThis.g=gear(1,1,0,${job});g.id='armor';g.skillId='job0-core2';g.skillSockets={version:1,count:1,gems:[null],firstMode:'base'};addGear(g);state.equipped[1]='armor';save();`);return r;}

test('a priest wearing gear with a warrior skill sees the limit and cannot enable it',()=>{
 const r=wearing(3),page=r.run('skillsView()');
 assert.match(text(page),/反擊之刃 · 觸發（限戰士） 目前職業無法啟用此裝備技能。/);assert.match(page,/data-skill-equipment-locked="armor" disabled/);
 assert.doesNotMatch(page,/data-skill-equipment="armor"/,'not offered as a selectable equipment skill');
 assert.match(text(r.run('equipmentAttributeDetailsHTML(g)')),/反擊之刃 · 觸發（限戰士） 目前職業（牧師）無法啟用此裝備技能。/);
 assert.equal(r.run('selectSkillEquipment("armor")'),false);assert.equal(r.run('state.activeSkillEquipmentId'),null);
 assert.deepEqual(r.errors,[]);
});
test('the warrior wearing the same gear can enable it, and no limit is shown',()=>{
 const r=wearing(0),page=r.run('skillsView()');
 assert.match(page,/data-skill-equipment="armor"/);assert.doesNotMatch(page,/equipment-skill-locked|（限戰士）/);
 assert.equal(r.run('selectSkillEquipment("armor")'),true);assert.equal(r.run('state.activeSkillEquipmentId'),'armor');
 assert.deepEqual(r.errors,[]);
});
