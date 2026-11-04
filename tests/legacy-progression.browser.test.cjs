// v1 saves (no EXP curve snapshot) convert their EXP to the published curve and refill HP once,
// also after the published curve differs from the model's built-in default (multiplierBase 16, v0.051).
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),legacy=require('./fixtures/legacy-progression.json');
const root=path.resolve(__dirname,'..');
test('v1 saves migrate EXP proportionally and refill HP under the published curve',async()=>{
 const g=await openRuntime(root,'index.html',{},{pathname:'/preview/'});
 try{
  const out=await g.page.evaluate(fixtures=>{
   localStorage.removeItem(BALANCE_KEY);const rows=[];
   const legacyNeed=l=>Math.max(1,Math.round(Math.round((45+l*18+l*l*2)*(2.2+l*.16))*1.35));
   for(const raw of fixtures){loadParty(raw);const old=raw.members[0],h=party.members[0];
    rows.push({lv:old.lv,want:Math.floor(Math.min(.999999,old.xp/legacyNeed(old.lv))*need(old.lv)),got:h.xp,full:party.members.every(m=>m.hp===stats(m).hp)});
    const once=structuredClone(packParty());loadParty(once);rows.at(-1).again=party.members[0].xp;}
   return {rows,curveDiffers:JSON.stringify(GAMEPLAY_SETTINGS.progression.xpCurve)!==JSON.stringify(EmberwildProgression.defaults.settings.progression.xpCurve)};
  },legacy);
  assert.equal(out.curveDiffers,true,'the published curve is tuned, not the model default');
  for(const r of out.rows){assert(Math.abs(r.got-r.want)<=1,JSON.stringify(r));assert.equal(r.again,r.got,'no double migration');assert.equal(r.full,true,'HP refilled once');}
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
