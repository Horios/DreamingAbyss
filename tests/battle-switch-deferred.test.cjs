// v0.083: companion tokens and roster changes made during an encounter apply from the next encounter,
// like gear and skills; the current encounter keeps its lineup and token effects.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
function fighting(){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();for(const id of [10,12,13])recruitCompanion(id),closeModal();startSelectedExploration();`);
 for(let i=0;i<400&&!r.run('EmberwildBattleConfiguration.pending()');i++){r.advance(250);r.run('tick()');}assert.equal(r.run('EmberwildBattleConfiguration.pending()'),true,'an encounter is running');return r;}
const lineupInCombat=r=>json(r,'EmberwildBattleConfiguration.combat(()=>heroes().map(memberKey))');

test('equipping or removing a companion token during an encounter keeps the encounter and applies next encounter',()=>{
 const r=fighting(),foes0=json(r,'foes.map(e=>e.uid??e.name)'),comp=r.run('memberKey(heroes().find(h=>h!==playerHero()))');r.ctx.comp=comp;
 r.run(`globalThis.tok=createCompanionToken({0:'berserk',1:'arcane',2:'hunt',3:'prayer'}[partyMember(comp).job],3);addGear(tok);ensureSharedGear?.();`);
 assert.equal(r.run('equipCompanionToken(tok.id,comp)'),true);
 assert.deepEqual(json(r,'foes.map(e=>e.uid??e.name)'),foes0,'the encounter was not reset');
 assert.equal(r.run('partyMember(comp).tokenId'),r.run('tok.id'),'the change is saved now');
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>partyMember(comp).tokenId)'),null,'combat still uses the previous token');
 r.run('globalThis.saved=JSON.parse(JSON.stringify(packParty()))');assert.equal(r.run('saved.members.find(h=>memberKey(h)===comp).tokenId'),r.run('tok.id'));
 for(let i=0;i<2000&&r.run('EmberwildBattleConfiguration.combat(()=>partyMember(comp).tokenId)')!==r.run('tok.id');i++){r.advance(250);r.run('tick()');}
 assert.equal(r.run('EmberwildBattleConfiguration.combat(()=>partyMember(comp).tokenId)'),r.run('tok.id'),'the next encounter uses the new token');
 assert.equal(r.run('unequipCompanionToken(comp)'),true);assert.equal(r.run('partyMember(comp).tokenId'),null);
 assert.deepEqual(r.errors,[]);
});

test('swapping or benching a member during an encounter keeps the fighting lineup until the next encounter',()=>{
 const r=fighting(),before=lineupInCombat(r),out=before[1];r.ctx.out=out;
 const bench=r.run('party.members.map(memberKey).find(k=>!party.active.includes(k))');
 if(bench!==undefined){r.ctx.bench=bench;r.run('confirmMemberReplacement(bench,out)');}else r.run('toggleMember(out)');
 assert.notDeepEqual(json(r,'party.active'),before,'the roster change is saved now');
 assert.deepEqual(lineupInCombat(r),before,'the running encounter keeps its lineup');
 r.run('globalThis.saved=JSON.parse(JSON.stringify(packParty()))');const live=json(r,'party.active');
 for(let i=0;i<2000&&JSON.stringify(lineupInCombat(r))===JSON.stringify(before);i++){r.advance(250);r.run('tick()');}
 assert.deepEqual(lineupInCombat(r),live,'the next encounter uses the new lineup');
 assert.deepEqual(r.errors,[]);
});
