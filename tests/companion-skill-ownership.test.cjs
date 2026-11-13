const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),M=require('../js/skills/companion-skill-model.js');
const root=path.resolve(__dirname,'..'),editorRoot=path.resolve(root,'../Emberwild-Balance');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
// Exported documents carry the canonical skillSystem; legacy class/support/passive arrays are projections of it.
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();for(const id of [10,11,12,13,14]){recruitCompanion(id);closeModal();}globalThis.canonicalSkill=(d,job,kind,index)=>d.skillSystem.definitions.find(s=>(s.adapters||[s.adapter]).some(a=>a.job===job&&a.kind===kind&&a.index===index));globalThis.canonicalById=(d,id)=>d.skillSystem.definitions.find(s=>s.id===id);');return r;}
test('Game ownership migration is append-only and idempotent without the editor',()=>{
 const d=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));M.validate(d);
 const before=structuredClone(d);M.migrate(d);assert.deepEqual(d,before);
 const legacy=structuredClone(d);delete legacy.companionSkillVersion;
 const originalCore=structuredClone(legacy.classes.map(c=>c.skills)),originalSupport=structuredClone(legacy.supportSkills);
 M.migrate(legacy);M.validate(legacy);
 originalCore.forEach((pool,j)=>assert.deepEqual(legacy.classes[j].skills.slice(0,pool.length),pool));
 originalSupport.forEach((pool,j)=>assert.deepEqual(legacy.supportSkills[j].slice(0,pool.length),pool));
});
test('Game and private designer embed the identical ownership module',t=>{
 const file=path.join(editorRoot,'balance-editor.html');
 if(!fs.existsSync(file))return t.skip('Private balance editor fixture unavailable in standalone game CI');
 const html=fs.readFileSync(file,'utf8');
 assert.equal(html.match(/<script id="companion-skill-model-v1">\n([\s\S]*?)<\/script>/)[1],fs.readFileSync(path.join(root,'js/skills/companion-skill-model.js'),'utf8'));
 const e=loadRuntime(editorRoot,'balance-editor.html'),d=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');M.validate(d);
});
test('Player, same-job companions and monsters cannot use another character’s skills; editing copies does not change the original',()=>{
 const r=game(),d=json(r,'exportableBalance()'),p=d.companions.find(p=>p.id===10),other=d.companions.find(p=>p.id===11),i=p.core[0];
 assert.notEqual(i,other.core[0]);const original=d.classes[0].skills[0].power,otherPower=d.classes[0].skills[other.core[0]].power;d.classes[0].skills[i].power=7;r.ctx.d=d;r.run('applyBalanceConfig(d);');
 assert.equal(r.run('CLASSES[0].skills[0][4]'),original);assert.equal(r.run('CLASSES[0].skills['+other.core[0]+'][4]'),otherPower);
 r.ctx.i=i;assert.deepEqual(json(r,'[playerHero(),partyMember(10),partyMember(11)].map(h=>skillAllowedForPartner(h,CLASSES[0].skills[i][6]))'),[false,true,false]);
 assert.equal(r.run('skillAllowedForPartner(partyMember(10),CLASSES[0].skills[0][6])'),false);
 r.run('withHero(playerHero(),()=>learn(i));withHero(playerHero(),()=>equipSkill(i,0));partyMember(11).skills[i]=1;');assert.equal(r.run('playerHero().skills[i]'),0);assert(!json(r,'playerHero().active').includes(i));assert.equal(r.run('castPartySkill(partyMember(11),i,battleStats(partyMember(11)))'),false);
});
test('New active, proc, support and passive definitions unlock at exact boundaries and relock after lowering the level',()=>{
 const r=game();r.run(`const d=exportableBalance(),p=d.companions.find(p=>p.id===10);for(const i of p.core)canonicalSkill(d,p.job,'core',i).requiredLevel=8;for(const i of p.support)canonicalSkill(d,p.job,'support',i).level=9;for(const id of p.passives)canonicalById(d,id).requiredLevel=10;applyBalanceConfig(d);`);
 for(const lv of [7,8,9,10,7]){
  r.run(`playerHero().lv=${lv};syncParty();`);const out=json(r,'(()=>{const h=partyMember(10),p=__EMBERWILD_COMPANION_TEST_API.companionPlan(h);return {core:p.core.map(i=>h.skills[i]),support:p.support.map(i=>h.supportLevels[i]),passives:__EMBERWILD_COMPANION_TEST_API.passivesFor(h).length,active:h.active,proc:h.procSlots};})()');
  assert(out.core.every(v=>v===Number(lv>=8)));assert(out.support.every(v=>v===Number(lv>=9)));assert.equal(out.passives,Number(lv>=10));if(lv<8){assert(out.active.every(x=>x===null),'no active skill equipped below the unlock level');assert(out.proc.every(x=>x===null),'no proc skill equipped below the unlock level');}
 }
 r.run('{const h=partyMember(10),p=__EMBERWILD_COMPANION_TEST_API.companionPlan(h);h.skills[p.core[0]]=1;h.supportLevels[p.support[0]]=1;}');assert.equal(r.run('castPartySkill(partyMember(10),__EMBERWILD_COMPANION_TEST_API.plans[0].core[0],battleStats(partyMember(10)))'),false);assert.equal(r.run('castSupport(partyMember(10),__EMBERWILD_COMPANION_TEST_API.plans[0].support[0])'),false);
});
test('Passive stat, healing and both aura directions do nothing before their unlock level',()=>{
 const r=game();r.run(`const d=exportableBalance(),p=d.companions.find(p=>p.id===10);p.passives=['stat','ally','enemy'];d.passiveDefinitions.push({id:'stat',partnerId:10,name:'強化',requiredLevel:5,target:'self',effects:[{key:'flatAttack',value:11},{key:'healingPct',value:50}]},{id:'ally',partnerId:10,name:'光環',requiredLevel:5,target:'allies',effects:[{key:'guard',value:20}]},{id:'enemy',partnerId:10,name:'弱化',requiredLevel:5,target:'enemies',effects:[{key:'weaken',value:30}]});applyBalanceConfig(d);globalThis.inspect=()=>{const h=partyMember(10);party.active=[0,10];foes=[{id:'foe',hp:100}];return {heal:scaleHeroHealing(h,10),guard:effectTotal(heroKey(playerHero()),'guard'),weaken:effectTotal('foe','weaken')};};`);
 r.run('playerHero().lv=4;syncParty()');assert.deepEqual(json(r,'inspect()'),{heal:10,guard:0,weaken:0});r.run('playerHero().lv=5;syncParty()');assert.deepEqual(json(r,'inspect()'),{heal:15,guard:.2,weaken:.3});
});
test('Invalid ownership, cross-owner induction and passive levels reject atomically',()=>{
 const r=game(),before=r.run('JSON.stringify(exportableBalance())');
 for(const edit of [`d.companions[1].core.push(d.companions[0].core[0]);`,`canonicalSkill(d,0,'core',d.companions[0].core[0]).partnerId=999;`,`d.skillSystem.definitions.find(d=>d.type==='passive'&&d.partnerId===10).requiredLevel=0;`,`d.companions[1].passives.push(d.companions[0].passives[0]);`,`{const sk=canonicalSkill(d,0,'core',d.companions[0].active[0]);sk.tags=['induce'];sk.induction={targets:[{kind:'skill',skillId:d.classes[0].skills[0].id,chance:1}]};}`]){
  assert.throws(()=>r.run('{const d=exportableBalance();'+edit+'applyBalanceConfig(d);}'));assert.equal(r.run('JSON.stringify(exportableBalance())'),before);
 }
});
test('Designer edits import, save, cold boot and repeated reload preserve owner and unlock levels',t=>{
 const file=path.join(editorRoot,'balance-editor.html');
 if(!fs.existsSync(file))return t.skip('Private balance editor fixture unavailable in standalone game CI');
 const e=loadRuntime(editorRoot,'balance-editor.html'),r=game();e.run(`openCompanionSkillPage(10);document.getElementById('addSkill').onclick();const sk=data.classes[0].skills[selected.skill];sk.name='獨立斬擊';sk.requiredLevel=8;sk.power=3;selected.skillTab='support';render();document.getElementById('addCompanionSupport').onclick();data.supportSkills[0][selected.support].level=9;selected.skillTab='passive';render();document.getElementById('addPassive').onclick();const d=data.passiveDefinitions.at(-1);d.name='等級被動';d.requiredLevel=10;d.effects=[{key:'flatAttack',value:20}];`);
 assert.deepEqual(json(e,'validateData()'),[]);r.ctx.doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');r.run('applyBalanceConfig(doc);playerHero().lv=10;syncParty();save();loadParty(structuredClone(packParty()));loadParty(structuredClone(packParty()));');
 const restarted=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(restarted.run('party.members.length'),6);assert.equal(restarted.run('CLASSES[0].skills.find(s=>s[0]==="獨立斬擊")[6].partnerId'),10);assert.equal(restarted.run('__EMBERWILD_COMPANION_TEST_API.passivesFor(partyMember(10)).find(d=>d.name==="等級被動").requiredLevel'),10);assert.deepEqual(restarted.errors,[]);
});
test('Legacy shared skills and passive references migrate on import and original skill indices stay intact',()=>{
 const r=game(),legacy=json(r,'exportableBalance()');delete legacy.companionSkillVersion;delete legacy.skillSystem;// A real pre-canonical document has neither companion-owned nor class-initial/clearing skills; migration adds those.
 const canonicalOnly=/^(class\d-initial\d|warrior-cleave-chain|mage-mana-cycle|archer-arrow-rain|priest-holy-prison)$/;legacy.classes.forEach(c=>c.skills=c.skills.filter(s=>s.partnerId==null&&!canonicalOnly.test(s.id||'')));if(legacy.story){legacy.story.quests=(legacy.story.quests||[]).filter(q=>q.id!=='skill_equipment_intro'&&!q.prologue);legacy.story.gearRewards=[];}legacy.supportSkills=legacy.supportSkills.map(pool=>pool.filter(s=>s.partnerId==null));legacy.companions=structuredClone(require('../js/character/companion-model.js').defaultPlans);legacy.passiveDefinitions=structuredClone(require('../js/skills/passive-model.js').defaults);const original=legacy.classes.map(c=>c.skills.map(s=>s.name));r.ctx.legacy=legacy;
 // Applying would be refused because the running save already learned canonical class skills; validate the migration itself.
 const now=json(r,'validateBalanceConfig(EmberwildSkillSystem.normalizeDocument(legacy))');original.forEach((names,j)=>assert.deepEqual(now.classes[j].skills.slice(0,names.length).map(s=>s.name),names));M.validate(now);assert.deepEqual(r.errors,[]);
});
