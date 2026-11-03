const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
// The skills page is the canonical slot loadout (js/ui/skill-system-ui.js); the old level-group board and
// per-skill gem sockets were replaced by it, and gems now live only in equipment sockets.
function game(){const r=loadRuntime(root);r.run("selectSaveSlot(1);start(0);closeModal();setTab('skills')");return r;}
const html=r=>r.elements.get('app').innerHTML,modal=r=>r.elements.get('modal').innerHTML;
const slot=(r,key)=>html(r).match(new RegExp(`data-skill-slot="${key}"[\\s\\S]*?</button>`))[0];
test('Player skills show canonical slots with SVG icons; the catalog sorts learned first then by level and details show one skill',()=>{
 const r=game();
 assert.deepEqual([...html(r).matchAll(/data-skill-slot="([^"]+)"/g)].map(x=>x[1]),['active:0','active:1','active:2','proc:0','support:0']);
 assert.match(slot(r,'active:0'),/<svg[\s\S]*<b>[^<]+<\/b>/);assert.match(slot(r,'active:1'),/選擇技能/);
 assert.equal(r.run('openSkillCatalog()'),true);
 const order=r.run(`JSON.stringify([...$('modal').innerHTML.matchAll(/data-skill-id="([^"]+)"/g)].map(x=>{const sk=__EMBERWILD_SKILLS.byId(x[1]);return [__EMBERWILD_SKILLS.learned(playerHero(),sk)?0:1,sk.requiredLevel??sk.level??1];}))`);
 const rows=JSON.parse(order);assert(rows.length>1);assert(rows.some(x=>x[0]===0)&&rows.some(x=>x[0]===1));
 assert.deepEqual(rows,[...rows].sort((a,b)=>a[0]-b[0]||a[1]-b[1]));
 assert(!/chooseSkillSlot|configureSkill/.test(modal(r)),'the catalog is read-only');
 r.run('closeModal()');assert.equal(r.run("showSkillInformation('class0-initial0')"),true);
 assert.equal((modal(r).match(/class="skill-candidate/g)||[]).length,1);assert.match(modal(r),/data-skill-id="class0-initial0"/);
 assert.equal(r.run("showSkillInformation('missing-skill')"),false);assert.deepEqual(r.errors,[]);
});
test('Learning by level and equipping refresh the slot view while keeping real team state',()=>{
 const r=game();assert.equal(r.run("__EMBERWILD_SKILLS.learned(playerHero(),__EMBERWILD_SKILLS.byId('class0-initial1'))"),false);
 r.run("openSkillSlot('active',1)");assert.match(modal(r),/chooseSkillSlot\('active',1,'class0-initial1'\)" disabled/);
 r.run("closeModal();playerHero().lv=3;save();openSkillSlot('active',1)");assert.match(modal(r),/chooseSkillSlot\('active',1,'class0-initial1'\)"(?! disabled)/);
 assert.equal(r.run("chooseSkillSlot('active',1,'class0-initial1')"),true);assert.equal(r.run("$('modal').open"),false);
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(playerHero().skillLoadout.active)')),['class0-initial0','class0-initial1',null]);
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(__EMBERWILD_TEAMS.plan().skillLoadout.active)')),['class0-initial0','class0-initial1',null]);
 assert.match(slot(r,'active:1'),new RegExp(r.run("__EMBERWILD_SKILLS.byId('class0-initial1').name")));
 assert.equal(r.run("chooseSkillSlot('active',2,'class0-initial2')"),false,'an unlearned skill cannot be slotted');
 assert.equal(r.run("chooseSkillSlot('active',0,'class0-initial1')"),true);
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(playerHero().skillLoadout.active)')),['class0-initial1',null,null],'moving a skill clears its old slot');
 r.run('resetSkills()');assert.deepEqual(JSON.parse(r.run('JSON.stringify(playerHero().skillLoadout.active)')),['class0-initial0','class0-initial1',null]);
 assert.match(slot(r,'active:0'),new RegExp(r.run("__EMBERWILD_SKILLS.byId('class0-initial0').name")));assert.deepEqual(r.errors,[]);
});
test('Locked slot choices have no equip action and switching plans redraws that plan loadout',()=>{
 const r=game(),before=r.run('JSON.stringify(party.buildSystem)');
 r.run("openSkillSlot('active',1)");assert.equal(r.run("chooseSkillSlot('active',1,'class0-initial2')"),false);assert.equal(r.run('JSON.stringify(party.buildSystem)'),before);
 r.run("closeModal();playerHero().lv=3;save();chooseSkillSlot('active',1,'class0-initial1');copyTeamPlan();switchTeamPlan('team-2')");
 assert.equal(r.run('__EMBERWILD_TEAMS.plan().id'),'team-2');
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(playerHero().skillLoadout.active)')),['class0-initial0','class0-initial1',null]);
 assert.match(slot(r,'active:1'),new RegExp(r.run("__EMBERWILD_SKILLS.byId('class0-initial1').name")));assert.deepEqual(r.errors,[]);
});
test('Redraws replace the skills scroll region but restore its position through slot changes',()=>{
 const r=game();r.run(`
 globalThis.skillScroll={scrollTop:0,scrollLeft:0};
 const app=document.getElementById('app');let appHTML=app.innerHTML;
 Object.defineProperty(app,'innerHTML',{get:()=>appHTML,set:value=>{appHTML=value;skillScroll={scrollTop:0,scrollLeft:0};}});
 document.querySelectorAll=selector=>selector.split(',').includes('.layout>main')?[skillScroll]:[];
 render();playerHero().lv=3;save();skillScroll.scrollTop=186;skillScroll.scrollLeft=7;
 `);
 for(const action of ["chooseSkillSlot('active',1,'class0-initial1')","chooseSkillSlot('active',1,null)","configureSkill('active',2,'class0-initial1')",'render()']){
  r.run(`heroMenuAction(memberKey(playerHero()),()=>{${action}})`);assert.equal(r.run('skillScroll.scrollTop'),186,action);assert.equal(r.run('skillScroll.scrollLeft'),7,action);
 }
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(playerHero().skillLoadout.active)')),['class0-initial0',null,'class0-initial1']);
 assert.deepEqual(r.errors,[]);
});
test('Legacy skill gem sockets are refused and the physical gem inventory survives a reload unchanged',()=>{
 const r=game();r.run('playerHero().gems=[1,1,1];save();render()');
 for(const type of [0,1,2])assert.equal(r.run(`socket(0,${type})`),false);
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(playerHero().gems)')),[1,1,1]);assert.equal(r.run('playerHero().sockets.every(x=>x===null)'),true);
 assert(!/data-team-gem=|鑲嵌槽：/.test(html(r)),'the skills page has no per-skill gem slot');
 const cold=loadRuntime(root,'index.html',Object.fromEntries(r.values));cold.run("continueFromTitle();closeModal();setTab('skills')");
 assert.deepEqual(JSON.parse(cold.run('JSON.stringify(playerHero().gems.slice(0,3))')),[1,1,1]);assert.equal(cold.run('playerHero().gems.reduce((a,b)=>a+b,0)'),3,'loading pads higher gem tiers with zero');assert.equal(cold.run('playerHero().sockets.every(x=>x===null)'),true);
 assert.deepEqual(r.errors,[]);assert.deepEqual(cold.errors,[]);
});
