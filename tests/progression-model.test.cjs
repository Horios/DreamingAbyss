const test=require('node:test');
const assert=require('node:assert/strict');
const curve=require('../js/balance/progression-model.js');
// v0.161: no character levels. Class natural stats are the fixed initial stats; no XP or level-gap formulas remain.
test('class natural stats are the fixed initial stats; level, XP and level-gap formulas are gone',()=>{
  for(const cls of curve.defaults.classes){const n=curve.naturalStats(cls);for(const k of ['hp','atk','def'])assert.equal(n[k],Math.round(cls.initialStats[k]));assert(!('growthPerLevel' in cls)&&!('growthSteps' in cls));}
  for(const name of ['requiredXp','enemyXp','xpLevelGapFactor','xpShare','encounterLevelLead','goldLevelGapFactor','validSteps'])assert.equal(curve[name],undefined,name);
  const p=curve.defaults.settings.progression;for(const k of ['xpCurve','levelCaps','statsPerLevel','xpLevelGap','mapAheadAllowance'])assert(!(k in p),k);
  assert.equal(curve.enemyGold(curve.defaults.settings,10,'normal',0),curve.enemyGold(curve.defaults.settings,10,'normal',0,99),'gold ignores any extra level argument');
});
test('Direct equipment stats and each displayed contribution are integral and monotonic',()=>{
  for(const raw of [{atk:3,hp:0,def:0},{atk:0,hp:8,def:2},{atk:1,hp:3,def:0},{atk:36,hp:0,def:0}]){
    let previous;for(const power of curve.defaults.powerMultipliers){const out=curve.gearStats(raw,{atk:15},power,0,1);
      for(const k of ['atk','hp','def']){assert(Number.isSafeInteger(out.total[k]));if(previous)assert(out.total[k]>=previous[k]);}previous=out.total;
    }
    const base=curve.gearStats(raw,{},1,0,1),enhanced=curve.gearStats(raw,{},1,10,1);
    for(const k of ['atk','hp','def'])assert(enhanced.total[k]>=base.total[k]);
    assert(curve.gearStats(raw,{},1.72,10,1).total.atk<200);
  }
});