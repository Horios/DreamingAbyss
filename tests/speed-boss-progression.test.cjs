const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.ctx.seed=require('../data/balance.json');r.run('applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal()');return r;}
test('battle speed controls and legacy speed tickets (speed2/speed4) are removed without touching other timed effects',()=>{
 const r=game();for(const name of ['setBattleSpeed','toggleBattleRate','battleSpeedButtons'])assert.equal(r.run('typeof globalThis.'+name),'undefined',name);assert.equal(r.run('battleRate'),1);
 r.run("state.consumables.exp_100_30m=1;useSupply('exp_100_30m');globalThis.old=JSON.parse(JSON.stringify(packParty()));old.members[0].consumables.speed2_30m=3;old.members[0].consumables.speed4_30m=2;old.timedBoosts.push({itemId:'speed4_30m',name:'四倍速解鎖券30分鐘',boostType:'speed4',bonusPercent:0,durationMinutes:30,remainingMs:900000,enabled:true});old.combatSession.speed=4;globalThis.left=old.timedBoosts[0].remainingMs;loadParty(old)");
 assert.equal(r.run('state.consumables.speed2_30m'),undefined);assert.equal(r.run('state.consumables.speed4_30m'),undefined);assert.equal(r.run('party.timedBoosts.length'),1);assert.equal(r.run('party.timedBoosts[0].boostType'),'exp');assert.equal(r.run('party.timedBoosts[0].remainingMs'),r.run('left'));assert.equal(r.run('battleRate'),1);
 r.run('EmberwildTimedBoosts.consume(party,1800000);__EMBERWILD_TIMED_BOOST_TEST.expireBoosts()');assert.equal(r.run('party.timedBoosts[0].remainingMs'),0);assert.equal(r.run('battleRate'),1);assert.deepEqual(r.errors,[]);
});
test('imported balance documents that still list speed tickets drop their shop rules with the items',()=>{
 const r=game();const out=JSON.parse(r.run(`JSON.stringify((()=>{const d=exportableBalance();d.items.push({id:'speed2_30m',type:'timedBoost',boostType:'speed2',bonusPercent:0,durationMinutes:30,duration:0,cost:1200,sellPrice:300,shopEnabled:false,name:'兩倍速解鎖券30分鐘',statEffects:{}});
  d.shopSettings.randomOffers.entries.push({id:'speed2_30m',enabled:true,type:'item',key:'speed2_30m',name:'',unitPrice:null,quantityMin:1,quantityMax:1,weight:.15,selection:'weighted',chance:1,quantityScalesWithTier:false,priceScalesWithTier:false});
  const valid=validateBalanceConfig(d);applyBalanceConfig(d,{persist:false});const now=exportableBalance();
  return {validRules:valid.shopSettings.randomOffers.entries.some(x=>x.key==='speed2_30m'),items:now.items.some(x=>x.id==='speed2_30m'),rules:now.shopSettings.randomOffers.entries.some(x=>x.key==='speed2_30m'),others:now.shopSettings.randomOffers.entries.length};})())`));
 assert.deepEqual({validRules:out.validRules,items:out.items,rules:out.rules},{validRules:false,items:false,rules:false});
 assert(out.others>0,'other random shop rules remain');assert.deepEqual(r.errors,[]);
});
test('new BOSS bases use the dedicated T band without an extra level bonus; old bases preserve their snapshot',()=>{
 const r=game();const out=JSON.parse(r.run(`JSON.stringify((()=>{const rows=[];for(const mode of [0,1,2]){const set=new Set();for(let i=0;i<30;i++){const g=bossGear(1,0,mode);set.add(g.powerTier);if(gearQualityRank(g)<2)throw Error('品質不足');if(g.baseSnapshot.mult<1.15||g.baseSnapshot.mult>1.3)throw Error('BOSS 基底超出範圍');}rows.push(set.size);}const g=bossGear(1,0,0),required=gearRequiredLevel(g),before=gearStatBreakdown(g);GAMEPLAY_SETTINGS.equipment.boss.baseLevelBonus=0;const after=gearStatBreakdown(g);return {rows,required,before,after,help:bossCraftView()};})())`));assert(out.rows.every(n=>n>1));assert.equal(out.required,6);assert.deepEqual(out.after,out.before);assert.match(out.help,/115%～130%/);assert.deepEqual(r.errors,[]);
});
