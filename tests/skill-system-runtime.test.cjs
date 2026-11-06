const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs');
const game=job=>{const r=loadRuntime(path.resolve(__dirname,'..'));r.run(`selectSaveSlot(1);start(${job});closeModal();`);return r;};
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
test('four classes unlock only their new LV1/3/5 actives and creation previews use canonical descriptions',()=>{
 for(let job=0;job<4;job++){const r=game(job);for(const lv of [1,3,5]){r.run(`state.lv=${lv};syncParty();save();`);assert.equal(json(r,'state.skills').filter(Boolean).length,(lv===1?1:lv===3?2:3)+(job>=2&&lv>=3?1:0));assert.equal(json(r,'state.active').length,3);assert.equal(json(r,'state.procSlots').length,1);assert.equal(json(r,'state.supportSlots').length,1);}const s=json(r,'__EMBERWILD_SKILLS.system()'),html=r.run(`creationSkillPreview(${job})`);for(const row of s.classRules[job].initial){const sk=s.definitions.find(x=>x.id===row.skillId);assert(html.includes(sk.name));assert(html.includes(sk.description));}assert(!html.includes('熟練'));}
});
test('skill IDs configure three active slots, reject duplicates/types/locked sources and survive reload',()=>{
 const r=game(1);r.run('state.lv=5;save();configureSkill("active",1,"class1-initial1");configureSkill("active",2,"class1-initial2")');assert.deepEqual(json(r,'state.skillLoadout.active'),['class1-initial0','class1-initial1','class1-initial2']);assert.equal(r.run('configureSkill("proc",0,"class1-initial0")'),false);assert.equal(r.run('configureSkill("active",0,"job1-core0")'),false);r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');assert.deepEqual(json(r,'state.skillLoadout.active'),['class1-initial0','class1-initial1','class1-initial2']);r.run('configureSkill("active",1,"class1-initial0")');assert.deepEqual(json(r,'state.skillLoadout.active'),[null,'class1-initial0','class1-initial2']);
});
test('advancement adds choices and expands proc/support without replacing initial skills',()=>{
 const r=game(0);r.run('state.lv=20;state.advanced=true;state.mastery.sword=100000;save()');assert.equal(json(r,'state.active').length,3);assert.equal(json(r,'state.procSlots').length,2);assert.equal(json(r,'state.supportSlots').length,2);assert.equal(r.run('__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId("job0-core4"))'),true);assert.equal(r.run('__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId("class0-initial0"))'),true);
});
test('legacy fixtures migrate without losing gear and repeated reloads do not refund twice',()=>{
 const r=game(0);for(let j=0;j<4;j++){r.ctx.fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/legacy-skills-job'+j+'.json')));r.run('loadParty(fixture)');assert.equal(r.run('state.job'),j);assert.equal(r.run('state.bag.length'),r.ctx.fixture.members[0].bag.length);const gems=json(r,'state.gems');r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');assert.deepEqual(json(r,'state.gems'),gems);}
});
test('companions use every unlocked skill automatically and remain compatible with save validators',()=>{
 const r=game(0);r.run('state.lv=8;syncParty();recruitCompanion(10);closeModal();party.active=[0,10];save()');assert.deepEqual(json(r,'partyMember(10).active'),[7]);assert.deepEqual(json(r,'partyMember(10).procSlots'),[8]);assert.equal(r.run('setCompanionSkillEnabled(10,"core",7,false)'),false);r.run('loadParty(JSON.parse(JSON.stringify(packParty())))');assert.deepEqual(json(r,'partyMember(10).procSlots'),[8]);
});

test('quest acquisition, mastery and weapon requirements remain independent of slot configuration',()=>{
 const r=game(1);r.run(`state.lv=8;party.story.quests.goddess_intro={done:true};save();`);assert.equal(r.run('__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId("job1-core1"))'),true);assert.equal(r.run('configureSkill("active",1,"job1-core1")'),true);r.run(`globalThis.doc=exportableBalance();doc.skillSystem.definitions.find(s=>s.id==='job1-core1').requiredMastery='fire';doc.skillSystem.definitions.find(s=>s.id==='job1-core1').requiredMasteryLevel=50;applyBalanceConfig(doc,{persist:false});delete party.buildSystem.permanent.unlocks['1:core:1'];__EMBERWILD_SKILLS.refreshAll();`);assert.equal(r.run('__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId("job1-core1"))'),false);assert.equal(r.run('configureSkill("active",1,"job1-core1")'),false);
});
test('team copies preserve stable loadouts and share gem ownership without granting a second copy',()=>{
 const r=game(1);r.run(`state.lv=5;save();configureSkill('active',1,'class1-initial1');copyTeamPlan();configureSkill('active',1,null);switchTeamPlan('team-2');`);assert.equal(r.run('state.skillLoadout.active[1]'),'class1-initial1');const gems=json(r,'state.gems');r.run(`switchTeamPlan('team-1');switchTeamPlan('team-2');loadParty(packParty());`);assert.deepEqual(json(r,'state.gems'),gems);assert.equal(r.run('state.skillLoadout.active[1]'),'class1-initial1');
});
