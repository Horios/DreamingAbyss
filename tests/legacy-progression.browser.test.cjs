// v0.161: character levels were removed. v1 saves (from the EXP-curve era) load in a real browser without a level
// or XP; the old level is kept only as the skill compatibility threshold and the maps it could enter.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),legacy=require('./fixtures/legacy-progression.json');
const root=path.resolve(__dirname,'..');
test('v1 saves drop level and XP, keep the old level as legacySkillLevel and map access, and migrate once',async()=>{
 const g=await openRuntime(root,'index.html',{},{pathname:'/preview/'});
 try{
  const out=await g.page.evaluate(fixtures=>{
   localStorage.removeItem(BALANCE_KEY);const rows=[];
   for(const raw of fixtures){loadParty(raw);const old=raw.members[0],h=party.members[0];
    rows.push({old:old.lv,lv:h.lv,xp:h.xp,legacy:party.legacySkillLevel,access:[...(h.mapAccess||[])],visit:canVisit(0)});
    const once=structuredClone(packParty());loadParty(once);rows.at(-1).again={legacy:party.legacySkillLevel,access:[...(party.members[0].mapAccess||[])],lv:party.members[0].lv};}
   return rows;
  },legacy);
  for(const r of out){
   assert.equal(r.lv,undefined,'no level');assert.equal(r.xp,undefined,'no XP');assert.equal(r.legacy,r.old,'old level kept as the skill threshold');
   assert(r.access.includes(0)&&r.visit,'the first map stays open');
   assert.deepEqual(r.again,{legacy:r.legacy,access:r.access,lv:undefined},'reloading changes nothing');
  }
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
