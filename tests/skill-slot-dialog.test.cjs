// v0.083: the skill slot dialog has slot tabs on the left and the candidate skills on the right, with a toggle that
// hides unlearned skills; mastery shows as colored icon bars, and the current class mastery sits in the exploration header.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(3);closeModal();clearInterval(timer);setClassMasteryLevel(11,playerHero());save();');return r;}
const modal=r=>r.run("$('modal').innerHTML");

test('slot tabs list every slot and switch the right pane; unlearned skills can be hidden and shown again',()=>{
 const r=game();r.run("openSkillSlot('active',1)");let html=modal(r);
 assert.match(html,/<nav class="skill-slot-tabs"/);for(const t of ['active:0','active:1','active:2','proc:0'])assert.match(html,new RegExp(`data-slot-tab="${t}"`));
 assert.match(html,/data-slot-tab="active:1" aria-pressed="true"/);// v0.214: only learned skills by default; unlearned ones can be shown.
 assert.doesNotMatch(html,/skill-locked/);assert.match(html,/已隱藏 \d+ 個未學技能/);
 r.run("toggleSkillSlotLocked('active',1,true)");html=modal(r);assert((html.match(/skill-locked/g)||[]).length>0);
 r.run("toggleSkillSlotLocked('active',1,false)");html=modal(r);assert.doesNotMatch(html,/skill-locked/);assert.match(html,/data-slot-tab="active:1" aria-pressed="true"/);
 // v0.212: support skills are active skills; there is no support slot.
 assert.equal(r.run("openSkillSlot('support',0)"),false);r.run("openSkillSlot('active',0)");assert.doesNotMatch(modal(r),/輔助槽|data-slot-tab="support:/);
 r.run("toggleSkillSlotLocked('active',0,true)");assert.match(modal(r),/type="checkbox" checked/);
 assert.equal(r.run("chooseSkillSlot('active',0,null)"),true);assert.deepEqual(r.errors,[]);
});

test('mastery bars use element colors, gray for warrior and cyan for archer, and the header shows the current class mastery',()=>{
 const r=game();const B='EmberwildMasteryBars.bar';
 assert.match(r.run(`${B}('class:0',{label:'戰士',level:1,current:1,next:2,xp:3})`),/--mastery-color:#9aa3a8/);
 assert.match(r.run(`${B}('sword',{label:'劍',level:1,current:1,next:2,xp:3})`),/--mastery-color:#9aa3a8/);
 assert.match(r.run(`${B}('class:2',{label:'弓箭手',level:1,current:1,next:2,xp:3})`),/--mastery-color:#3fc9d4/);
 assert.match(r.run(`${B}('bow',{label:'弓',level:1,current:1,next:2,xp:3})`),/--mastery-color:#3fc9d4/);
 assert.match(r.run(`${B}('fire',{label:'火',level:1,current:1,next:4,xp:3})`),/--mastery-color:#e0603f[\s\S]*width:25%/);
 r.run("setTab('character')");assert.match(r.run("document.getElementById('app').innerHTML"),/mastery-bar-grid[\s\S]*data-mastery-key="class:3"/);
 r.run("setTab('battle');startSelectedExploration();");for(let i=0;i<8;i++){r.advance(250);r.run('tick()');}
 // v0.091: the header shows two bars, the class mastery and the class's highest weapon/element mastery.
 let head=r.run("document.getElementById('app').innerHTML");const row=h=>{const a=h.indexOf('class="mastery-bar-row"');return a<0?'':h.slice(a,h.indexOf('data-party-gold',a));};
 assert.deepEqual([...row(head).matchAll(/data-mastery-key="([^"]+)"/g)].map(m=>m[1]),['class:3','light'],'ties keep the listed order');
 r.run("__EMBERWILD_TEAMS.build().permanent.masteries.shadow=50;render();");head=r.run("document.getElementById('app').innerHTML");
 assert.deepEqual([...row(head).matchAll(/data-mastery-key="([^"]+)"/g)].map(m=>m[1]),['class:3','shadow'],'the highest weapon/element mastery is shown');
 assert.deepEqual(r.errors,[]);
});
