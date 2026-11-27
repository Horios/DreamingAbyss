'use strict';
/* v0.179: only the story hands out companion tickets. Achievements no longer mail them and the shop no longer offers
   them, even for a companion whose unlock rule is an achievement or a shop ticket. Tickets already held still work, and
   an offer left in a saved market is neither shown nor sold. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer)');return r;}

test('an achievement-rule companion gets no ticket in the mail when the achievement completes',()=>{
 const r=game();
 r.run(`{const d=exportableBalance(),p=d.companions.find(p=>p.id===10);p.availability='visible';p.unlockCondition={type:'achievement',achievementIds:['region-0-elite-50']};applyBalanceConfig(d);}
  party.achievements.eliteKills[0]=49;globalThis.e=makeEnemy(0,playerHero(),()=>.5);e.kind='elite';e.hp=0;rewardGroupKill(e);`);
 assert.equal(r.run("party.achievements.completed.includes('region-0-elite-50')"),true,'the achievement itself still completes');
 assert.equal(r.run("party.mailbox.messages.some(m=>m.rewardKey==='companion-10')"),false,'no ticket mail');
 assert.equal(r.run('companionTicketCount(10)'),0);assert.equal(r.run('!!partyMember(10)'),false);
 assert.deepEqual(r.errors,[]);
});

test('the shop offers no companion tickets; a saved offer is hidden and cannot be bought; held tickets still work',()=>{
 const r=game();
 r.run(`{const d=exportableBalance(),p=d.companions.find(p=>p.id===13);p.availability='visible';p.unlockCondition={type:'ticket',chance:1,price:100};applyBalanceConfig(d);}`);
 assert.equal(r.run("generateMarket().offers.some(o=>o.ruleId?.startsWith('companion-recruit-'))"),false);
 assert.equal(r.run('hasCompanionRecruitmentOffers()'),false);
 // An offer saved by an older version.
 r.run("party.market=generateMarket();party.market.offers.push({id:'old-1',kind:'material',key:'夥伴招募券-13',qty:1,price:100,sold:false,ruleId:'companion-recruit-13'});playerHero().gold=500;");
 assert.doesNotMatch(r.run('marketCards()'),/companion-ticket-13/);
 r.run("buyMarketOffer('old-1')");assert.equal(r.run('companionTicketCount(13)'),0);assert.equal(r.run('playerHero().gold'),500);
 // A ticket the player already holds is still used normally.
 r.run('grantCompanionTicket(13)');assert.equal(r.run('useCompanionRecruitmentTicket(13)'),true);assert.equal(r.run('!!partyMember(13)'),true);
 assert.deepEqual(r.errors,[]);
});
