'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {loadRuntime}=require('./headless-runtime.cjs');
function game(){const r=loadRuntime(process.cwd());r.ctx.setTimeout=fn=>setImmediate(fn);r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);grantCompanionTicket(13);useCompanionRecruitmentTicket(13);closeModal();party.active=[0,13];syncParty();`);return r;}
test('non-casting companions earn participation mastery once per encounter, including defeats; reserves gain none',()=>{
 const r=game();
 r.run(`grantCompanionTicket(10);useCompanionRecruitmentTicket(10);closeModal();party.active=[0,13];syncParty();startSelectedExploration();globalThis.h=partyMember(13);globalThis.before=classMasteryXp(h);EmberwildBattleSummary.finish('victory');`);
 assert.equal(r.run('classMasteryXp(h)-before'),1);assert.equal(r.run('classMasteryXp(partyMember(10))'),0);
 r.run(`EmberwildBattleSummary.finish('victory');EmberwildBattleSummary.finish('wipe');`);assert.equal(r.run('classMasteryXp(h)-before'),1);
 assert.match(r.run('partnerRosterView()'),/companion-mastery-progress[^]*?職業精通 Lv0 · 經驗 1 \/ 8/);
 assert.match(r.run('rosterView()'),/職業精通 Lv0 · 經驗 1 \/ 8/);
 r.run(`spawnGroup();h.hp=0;EmberwildBattleSummary.finish('wipe')`);assert.equal(r.run('classMasteryXp(h)-before'),2);
 r.run(`save();loadParty(structuredClone(packParty()))`);assert.equal(r.run('classMasteryXp(partyMember(13))'),2);
 assert.deepEqual(r.errors,[]);
});
test('participation mastery unlocks companion skills, retains skill-use XP and respects the cap',()=>{
 const r=game();r.run(`startSelectedExploration();globalThis.h=partyMember(13);globalThis.M=__EMBERWILD_MASTERY;h.companionMastery.xp=M.masteryStepCost(0)+M.masteryStepCost(1)-1;syncParty();EmberwildBattleSummary.finish('victory');`);
 assert.equal(r.run('classMasteryLevel(h)'),2);assert(r.run('h.skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(h).proc[0]]'));
 r.run(`globalThis.before=classMasteryXp(h);M.gainMastery(h,'light',M.masterySettings().skillUseXp)`);assert.equal(r.run('classMasteryXp(h)-before'),r.run('M.masterySettings().skillUseXp'));
 r.run(`h.companionMastery.xp=M.masteryMaxXp();spawnGroup();EmberwildBattleSummary.finish('victory')`);assert.equal(r.run('classMasteryXp(h)'),r.run('M.masteryMaxXp()'));assert.match(r.run('partnerRosterView()'),/已達上限/);assert.deepEqual(r.errors,[]);
});
test('foreground and offline settlement award identical companion mastery',async()=>{
 const a=game(),b=game();
 for(const r of [a,b])r.run(`globalThis.rng=12345;Math.random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);startSelectedExploration();save();`);
 for(let i=0;i<60000;i+=50){a.advance(50);a.run('tick()');}b.advance(60000);await b.run('EmberwildOffline.settle()');
 assert(a.run('state.totalKills')>0);assert(a.run('classMasteryXp(partyMember(13))')>0);assert.equal(b.run('classMasteryXp(partyMember(13))'),a.run('classMasteryXp(partyMember(13))'));assert.equal(b.run('EmberwildOffline.failed'),false);assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
});
