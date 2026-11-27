// v0.226: the quest 裝備技能與寶石入門 became two onboarding stages right after the weapon: wear the 啟程護符 and slot its
// skill 追擊 (charm), then socket the 赤焰石 handed out with it (gem). Finishing the gem stage grants the class's lesson skill.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {open,create,weapon,charm,gem}=require('./opening-helpers.cjs'),M=require('../js/story/story-model.js');
const root=path.resolve(__dirname,'..'),seed=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
const stage=r=>r.run('__EMBERWILD_PROLOGUE.stage()');
for(let job=0;job<4;job++)test(`job ${job}: charm skill, actual proc cast, gem bonus and a single lesson skill that survives reload`,()=>{
 const r=open();create(r,job);weapon(r);assert.equal(stage(r),'charm');
 r.run("globalThis.c=playerHero().bag.find(g=>g.storyRewardKey==='initiation_charm')");
 assert.equal(r.run('c.skillSockets.count'),2);assert.equal(r.run('gearWearableJobs(c).includes(playerHero().job)'),true);
 assert.equal(r.run('sellGear(c.id)'),false,'the charm cannot be sold during the onboarding');assert.equal(r.run('salvage(c.id)'),false);
 charm(r);assert.equal(stage(r),'gem');
 r.run(`running=false;spawnGroup();globalThis.target=foes[0];target.hp=target.maxhp=100000;target.def=0;foes=[target];enemy=target;Math.random=()=>.3;globalThis.beforeHP=target.hp;{const h=playerHero();castPartySkill(h,h.procSlots[0],battleStats(h));}`);
 assert(r.run('target.hp<beforeHP'),'追擊 damages the foe');r.run('running=false;foes=[];enemy=null');
 const atk=r.run('stats(playerHero()).atk');gem(r);
 assert.equal(r.run('stats(playerHero()).atk'),atk+2,'the gem in the first socket adds attack');
 assert.equal(stage(r),'practice');
 const skill=`job${job}-support0`;
 assert.equal(r.run(`playerHero().acquiredSkillIds.filter(id=>id==='${skill}').length`),1);
 assert.equal(r.run(`withHero(playerHero(),()=>configureSkill('active',1,'${skill}'))`),true);
 r.run('save();loadParty(JSON.parse(JSON.stringify(packParty())));render()');
 assert.equal(r.run(`playerHero().acquiredSkillIds.filter(id=>id==='${skill}').length`),1);assert.equal(r.run('playerHero().gems[0]'),0);
 assert.deepEqual(r.errors,[]);
});
test('a failed save at the gem stage keeps the stage and grants nothing',()=>{
 const r=open();create(r);weapon(r);charm(r);
 r.run("globalThis.realSave=save;save=()=>false");gem(r);r.run('save=realSave');
 assert.equal(stage(r),'gem');assert.equal(r.run('(playerHero().acquiredSkillIds||[]).includes("job0-support0")'),false);
 if(r.run('playerHero().bag.find(g=>g.storyRewardKey==="initiation_charm").skillSockets.gems[0]')===null)gem(r);else r.run('render()');assert.equal(stage(r),'practice');assert.equal(r.run('playerHero().acquiredSkillIds.filter(id=>id==="job0-support0").length'),1);
});
test('old saves: an unfinished intro quest is replaced by its skill, and a gift-stage onboarding plays the new lessons',()=>{
 const r=open();create(r);weapon(r);charm(r);gem(r);
 // Finished onboarding, old quest finished up to the gem: only the skill is missing.
 r.run("{const h=playerHero();h.acquiredSkillIds=h.acquiredSkillIds.filter(id=>id!=='job0-support0');party.story.quests.prologue.done=true;party.story.quests.prologue.current='departure';party.story.quests.skill_equipment_intro={current:'gem_base',started:true,done:false,completed:['equipment_gift','equip_skill'],baseline:{},choices:{}};delete party.story.flags.onboarding_v226;h.gems[0]=0;save();loadParty(JSON.parse(JSON.stringify(packParty())));}");
 assert.equal(r.run('playerHero().acquiredSkillIds.filter(id=>id==="job0-support0").length'),1);assert.equal(r.run('playerHero().gems[0]'),0,'the quest already gave its gem');
 assert.equal(r.run('party.story.quests.skill_equipment_intro'),undefined);assert.equal(r.run('party.story.flags.onboarding_v226'),true);
 r.run('save();loadParty(JSON.parse(JSON.stringify(packParty())))');assert.equal(r.run('playerHero().acquiredSkillIds.filter(id=>id==="job0-support0").length'),1,'runs once');
 // An onboarding saved at the weapon stage before the lessons existed gets the gem the quest used to give.
 const n=open();create(n);n.run("playerHero().gems[0]=0;delete party.story.flags.onboarding_v226;save();loadParty(JSON.parse(JSON.stringify(packParty())));render()");
 assert.equal(n.run('playerHero().gems[0]'),1);weapon(n);assert.equal(stage(n),'charm');charm(n);gem(n);assert.equal(stage(n),'practice');
 // An onboarding already past the weapon skips the lessons and gets the skill.
 const p=open();create(p);weapon(p);charm(p);gem(p);p.run("{const h=playerHero(),r=party.story.quests.prologue;h.acquiredSkillIds=[];r.completed=r.completed.filter(id=>!['charm','gem'].includes(id));delete party.story.flags.onboarding_v226;save();loadParty(JSON.parse(JSON.stringify(packParty())));}");
 assert.equal(stage(p),'practice');assert.deepEqual(p.json('party.story.quests.prologue.completed.slice(0,5)'),['creation','calling','gift','charm','gem']);assert.equal(p.run('playerHero().acquiredSkillIds.includes("job0-support0")'),true);
});
test('data: the onboarding carries the charm, gem and lesson-skill stages and the old quest is gone',()=>{
 assert.deepEqual(M.issues(seed.story,{skills:seed.skillSystem.definitions,forms:seed.equipmentForms}),[]);
 assert.equal(seed.story.quests.some(q=>q.id==='skill_equipment_intro'),false);
 const pro=seed.story.quests.find(q=>q.id==='prologue');assert.deepEqual(pro.stages.map(s=>s.id),['creation','calling','gift','charm','gem','practice','helper','departure']);
 assert(pro.stages.find(s=>s.id==='calling').rewards.items.some(x=>x.type==='gem'&&x.key==='0'));
 assert.deepEqual(pro.stages.find(s=>s.id==='gem').rewards.items.map(x=>x.key),['job0-support0','job1-support0','job2-support0','job3-support0']);
 const broken=structuredClone(seed.story);broken.quests.find(q=>q.id==='prologue').stages.splice(3,1);assert(M.issues(broken).some(e=>e.includes('階段連結')));
});
