const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const api=require('../js/skills/induction-schema.js');
const target=(slot,chance=1)=>({kind:'activeSlot',slot,chance});
function doc(){return {classes:[{skills:[{id:'a',name:'A',activation:'active',effect:'damage',tags:['induce'],induction:{targets:[{kind:'skill',skillId:'b',chance:1}]}},{id:'b',name:'B',activation:'proc',effect:'shield'}]}]};}
test('legacy documents are valid and explicit active → proc references are accepted',()=>{
 assert.deepEqual(api.validate({classes:[{skills:[{activation:'active',effect:'damage'}]}]}),[]);
 assert.deepEqual(api.validate(doc()),[]);
});
test('0% and 100% accepted; NaN, Infinity, out-of-range and nonnumeric chances rejected',()=>{
 for(const chance of [0,1,.25]){const d=doc();d.classes[0].skills[0].induction.targets[0].chance=chance;assert.equal(api.validate(d).length,0);}
 for(const chance of [-1,1.001,NaN,Infinity,'1']){const d=doc();d.classes[0].skills[0].induction.targets[0].chance=chance;assert.ok(api.validate(d).length);}
});
test('tagged, missing, self and cross-job named targets are rejected',()=>{
 for(const skillId of ['a','missing']){const d=doc();d.classes[0].skills[0].induction.targets[0].skillId=skillId;assert.ok(api.validate(d).length);}
 const d=doc();d.classes[0].skills[1].tags=['induce'];d.classes[0].skills[1].induction={targets:[target(1)]};assert.ok(api.validate(d).some(x=>x.includes('不可誘發')));
 const other=doc();other.classes.push({skills:[{id:'other',activation:'active',effect:'shield'}]});other.classes[0].skills[0].induction.targets[0].skillId='other';assert.ok(api.validate(other).length);
});
// Canonical classes have three active slots (0-2) and up to two proc slots (0-1); slots beyond them are invalid.
test('pure induction requires its tag; depth overrides, >2 targets, duplicate and invalid slots rejected',()=>{
 let d=doc();d.classes[0].skills[0].effect=api.EFFECT;assert.equal(api.validate(d).length,0);delete d.classes[0].skills[0].tags;assert.ok(api.validate(d).length);
 for(const config of [{targets:[target(0)],maxDepth:99},{targets:[target(0),target(1),{kind:'procSlot',slot:0,chance:1}]},{targets:[target(0),target(0)]},{targets:[target(3)]},{targets:[{kind:'procSlot',slot:2,chance:1}]},{targets:[]}]){d=doc();d.classes[0].skills[0].induction=config;assert.ok(api.validate(d).length);}
});
function harness(){
 const calls=[],logs=[],behavior={};
 const hero={job:0,hp:100,skills:[1,1,1],active:[0,1],procSlots:[2,null]};
 const skills=[['A','active',1,3,1,'damage',{tags:['induce'],induction:{targets:[target(1)]}}],['B','active',1,3,1,'shield',{}],['C','proc',1,0,1,'heal',{}]];
 const math=Object.create(Math);math.random=()=>.5;
 const c={EmberwildInduction:api,CLASSES:[{skills}],state:hero,Math:math,castPartySkill:(h,i)=>{calls.push(i);if(behavior.throwIndex===i)throw Error('cast fault');return behavior.failIndex!==i;},battleStats:()=>({atk:10}),coreSkillAvailableToHero:()=>true,__EMBERWILD_MASTERY:{coreMissingRequirements:()=>[],gainMastery:()=>{},masterySettings:()=>({skillUseXp:1})},note:x=>logs.push(x),characterName:()=> 'hero',validateBalanceConfig:x=>x,applyBalanceConfig:x=>x,exportableBalance:()=>({classes:[{skills:[]}]}),resetBalanceJSON:()=>{},coreSkillDetail:()=> 'detail',skillTypeBadges:(j,i,g)=>g,skillCooldown:()=>3,procChance:()=>.2,localStorage:{getItem:()=>null},BALANCE_KEY:'balance',console,sharedSkillById:id=>({name:id}),GAMEPLAY_SETTINGS:{monsters:{catalog:[]}},render:()=>{}};
 vm.createContext(c);vm.runInContext(fs.readFileSync(path.join(root,'js/skills/induction-runtime.js'),'utf8'),c);
 return {c,hero,skills,calls,logs,behavior};
}
test('normal source retains original effect; induces two independent targets regardless of cooldown',()=>{
 const {c,hero,skills,calls}=harness();skills[0][6].induction.targets=[target(1),{kind:'procSlot',slot:0,chance:1}];c.actorCooldowns={B:99};
 assert.equal(c.castPartySkill(hero,0,{}),true);assert.deepEqual(calls,[0,1,2]);assert.equal(c.actorCooldowns.B,99);
});
test('0%, chance misses and exact probability boundary do not cast; 100% casts',()=>{
 for(const [chance,expected] of [[0,[0]],[.4,[0]],[.5,[0]],[.6,[0,1]],[1,[0,1]]]){const {c,hero,skills,calls}=harness();skills[0][6].induction.targets=[target(1,chance)];c.castPartySkill(hero,0,{});assert.deepEqual(calls,expected);}
});
test('slot aliases cast the same destination only once',()=>{
 const {c,hero,skills,calls}=harness();skills[1][6].sharedId='b';skills[0][6].induction.targets=[target(1),{kind:'skill',skillId:'b',chance:1}];c.castPartySkill(hero,0,{});assert.deepEqual(calls,[0,1]);
});
test('tagged targets, cycles and pure-induction targets are blocked even for mutated runtime metadata',()=>{
 for(const mutate of [sk=>{sk[6].tags=['induce'];sk[6].induction={targets:[target(0)]};},sk=>{sk[5]='induceSkill';}]){
  const {c,hero,skills,calls}=harness();mutate(skills[1]);c.castPartySkill(hero,0,{});assert.deepEqual(calls,[0]);
 }
});
test('pure source never executes fallback damage; zero chance still consumes the normal action',()=>{
 const {c,hero,skills,calls}=harness();skills[0][5]='induceSkill';skills[0][6].induction.targets=[target(1,0)];assert.equal(c.castPartySkill(hero,0,{}),true);assert.deepEqual(calls,[]);
});
test('unlearned, empty slots, missing requirements and incompatible scopes are skipped',()=>{
 for(const mutate of [h=>h.hero.skills[1]=0,h=>h.hero.active[1]=null,h=>h.c.coreSkillAvailableToHero=()=>false,h=>h.c.__EMBERWILD_MASTERY.coreMissingRequirements=()=>['weapon']]){
  const h=harness();mutate(h);h.c.castPartySkill(h.hero,0,{});assert.deepEqual(h.calls,[0]);
 }
});
test('failed source cannot induce; exceptions restore the recursion guard',()=>{
 const failed=harness();failed.behavior.failIndex=0;assert.equal(failed.c.castPartySkill(failed.hero,0,{}),false);assert.deepEqual(failed.calls,[0]);
 const h=harness();h.behavior.throwIndex=1;assert.throws(()=>h.c.castPartySkill(h.hero,0,{}));delete h.behavior.throwIndex;h.calls.length=0;h.c.castPartySkill(h.hero,0,{});assert.deepEqual(h.calls,[0,1]);
});
test('support badges preserve support-group metadata',()=>{const {c}=harness();assert.equal(c.skillTypeBadges(0,0,'support'),'support');assert.match(c.skillTypeBadges(0,0,'core'),/誘發/);});
const editorPath=path.resolve(root,'../Emberwild-Balance/balance-editor.html');
test('standalone editor uses exactly the same contract as the runtime',{skip:!fs.existsSync(editorPath)},()=>{
 const html=fs.readFileSync(editorPath,'utf8');const embedded=html.match(/<script id="skill-induction-schema">\n([\s\S]*?)<\/script>/)[1];assert.equal(embedded,fs.readFileSync(path.join(root,'js/skills/induction-schema.js'),'utf8'));
});
