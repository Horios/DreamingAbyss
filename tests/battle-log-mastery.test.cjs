'use strict';
/* v0.179: the battle log's 「獲得精通經驗」 filter lists the mastery experience each member gained in an encounter (one
   line per member when the encounter ends); before, the 「獲得經驗」 filter had nothing left to show after levels went. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
test('an encounter end writes one mastery line per member with class and weapon gains',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);grantCompanionTicket(13);useCompanionRecruitmentTicket(13);closeModal();');
 assert.equal(r.run('BATTLE_LOG_FILTERS.exp'),'獲得精通經驗');
 r.run(`const M=__EMBERWILD_MASTERY,h=playerHero(),c=partyMember(13);M.gainMastery(h,'sword',3);M.gainMastery(h,'sword',2);M.gainMastery(c,'light',4);EmberwildBattleSummary.finish('victory');`);
 const lines=json(r,"logs.filter(e=>e?.type==='exp').map(e=>e.text.replace(/^\\[[^\\]]*\\] /,''))");
 assert.deepEqual(lines.sort(),['戰士・獲得精通經驗 戰士 +5（劍 +5）','艾琳・獲得精通經驗 牧師 +4'].sort());
 // Nothing gained, nothing written; a second finish of the same encounter writes nothing again.
 r.run("EmberwildBattleSummary.finish('victory')");assert.equal(r.run("logs.filter(e=>e?.type==='exp').length"),2);
 assert.deepEqual(r.errors,[]);
});
