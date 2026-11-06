const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),Skills=require('../js/skills/companion-skill-model.js'),Plans=require('../js/character/companion-model.js');
const root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}
test('Every legacy name becomes a uniquely named companion with independent complete skill pools',()=>{
 const e=loadRuntime(editorRoot,'balance-editor.html'),doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');
 const expected=Plans.defaultPlans.flatMap(p=>p.names);assert.equal(doc.companions.length,20);assert.deepEqual(new Set(doc.companions.map(p=>p.name)),new Set(expected));Skills.validate(doc);
 assert(doc.companions.every(p=>!('role' in p)&&!('names' in p)));
 for(const original of Plans.defaultPlans){const first=doc.companions.find(p=>p.id===original.id);assert.equal(first.name,original.names[0]);for(const name of original.names.slice(1)){const other=doc.companions.find(p=>p.name===name);assert.equal(other.job,first.job);assert.deepEqual(other.points,first.points);assert.equal(other.core.length,first.core.length);assert.equal(other.support.length,first.support.length);assert.equal(other.passives.length,first.passives.length);assert(!other.core.some(i=>first.core.includes(i)));assert(!other.support.some(i=>first.support.includes(i)));assert(!other.passives.some(id=>first.passives.includes(id)));}}
 const before=structuredClone(doc);Skills.migrate(doc);assert.deepEqual(doc,before);
});
test('Splitting copies unconfigured skills too, remaps references and rejects capacity overflow without partial changes',()=>{
 const r=game(),doc=json(r,'exportableBalance()'),p=doc.companions.find(p=>p.id===10);delete doc.companionNameVersion;p.names=[p.name,'拆分測試'];delete p.name;
 const raw=structuredClone(doc.classes[p.job].skills[p.core[0]]);raw.id='unused-core';raw.name='尚未配置';doc.classes[p.job].skills.push(raw);
 Skills.migrate(doc);const split=doc.companions.find(p=>p.name==='拆分測試');assert(doc.classes[split.job].skills.some(s=>s.partnerId===split.id&&s.name==='尚未配置'));assert.equal(split.core.length,p.core.length);Skills.validate(doc);
 const large=json(r,'exportableBalance()');delete large.companionNameVersion;const first=large.companions.find(p=>p.id===10);delete first.name;first.names=Array.from({length:30},(_,i)=>'容量測試'+i);const before=structuredClone(large);assert.throws(()=>Skills.migrate(large),/最多 64/);assert.deepEqual(large,before);
});
test('Designer names import, recruit deterministically and keep sibling stats, skill ownership and unlock levels independent',()=>{
 const e=loadRuntime(editorRoot,'balance-editor.html'),r=game();e.run("data.companions.find(p=>p.id===15).availability='visible';");r.ctx.doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');r.run('applyBalanceConfig(doc);playerHero().lv=10;syncParty();recruitCompanion(10);recruitCompanion(15);closeModal();');
 assert.deepEqual(json(r,'[partyMember(10).name,partyMember(15).name]'),['洛恩','雷昂']);
 const definitions=json(r,'exportableBalance().companions'),first=definitions.find(p=>p.id===10),other=definitions.find(p=>p.id===15);assert.deepEqual(first.initialStats,other.initialStats);assert.deepEqual(first.growthPerLevel,other.growthPerLevel);
 // Skill system v1: edit the canonical definition that classes[0].skills is projected from.
 r.run('const edited=exportableBalance(),owner=edited.companions.find(p=>p.id===15),sk=edited.skillSystem.definitions.find(x=>x.adapter?.job===0&&x.adapter.kind==="core"&&x.adapter.index===owner.core[0]);sk.power=7;sk.requiredLevel=20;applyBalanceConfig(edited);');
 assert.equal(r.run('partyMember(15).skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(15)).core[0]]'),0);assert.equal(r.run('CLASSES[0].skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(10)).core[0]][4]'),first?json(e,'data.classes[0].skills[data.companions.find(p=>p.id===10).core[0]].power'):0);
 r.run('save();loadParty(structuredClone(packParty()));');const restarted=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(restarted.run('partyMember(15).name'),'雷昂');assert.equal(restarted.run('__EMBERWILD_COMPANION_TEST_API.plans.length'),20);assert.deepEqual(restarted.errors,[]);
});
test('Duplicate names reject atomically; legacy acquired names normalize to fixed names while profiles survive migration and reload',()=>{
 const r=game();r.run('recruitCompanion(10);closeModal();');const before=r.run('JSON.stringify(exportableBalance())');assert.throws(()=>r.run('{const d=exportableBalance();d.companions[1].name=d.companions[0].name;applyBalanceConfig(d);}'),/重複/);assert.equal(r.run('JSON.stringify(exportableBalance())'),before);
 r.run(`{const old=structuredClone(packParty());old.members[1].name='既有自訂名稱';old.companionNames[10]='既有自訂名稱';const p=old.companionProfiles[10];delete p.name;p.role='旧定位';p.names=['洛恩','雷昂'];loadParty(old);save();loadParty(structuredClone(packParty()));}`);
 assert.equal(r.run('partyMember(10).name'),'洛恩');assert.equal(r.run('partyMember(10).companionId'),10);assert.equal(r.run('packParty().companionProfiles[10].role'),undefined);assert.equal(r.run('packParty().companionProfiles[10].names'),undefined);assert.deepEqual(r.errors,[]);
});
