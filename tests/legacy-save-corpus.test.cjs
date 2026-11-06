'use strict';
/* Cold-loads historical raw saves and checks that player progress survives:
   party members, jobs, player level, gold, every gear UID and the protagonist's
   worn gear. Also checks that a cold load never rewrites the original bytes and
   that the migrated save round-trips through save() and another cold boot. */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),fixtures=path.join(__dirname,'fixtures'),KEY='emberwild-save-v1';

function corpus(){
 const rows=[];
 const dir=path.join(fixtures,'saves');
 for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.json')).sort())rows.push({name:'saves/'+file,raw:fs.readFileSync(path.join(dir,file),'utf8')});
 for(const file of ['legacy-skills-job0.json','legacy-skills-job1.json','legacy-skills-job2.json','legacy-skills-job3.json','team-before-companion-skill-pools.json'])rows.push({name:file,raw:fs.readFileSync(path.join(fixtures,file),'utf8')});
 JSON.parse(fs.readFileSync(path.join(fixtures,'legacy-progression.json'),'utf8')).forEach((save,i)=>rows.push({name:'legacy-progression.json#'+i,raw:JSON.stringify(save)}));
 return rows;
}
function sourceSummary(raw){
 const d=JSON.parse(raw),members=d.version===3?d.members:[d];
 return {members:members.length,jobs:members.map(h=>h.job),lv:members[0].lv,gold:members[0].gold,gearIds:[...new Set(members.flatMap(h=>(h.bag||[]).map(g=>g.id)))].sort(),equipped:(members[0].equipped||[]).filter(Boolean)};
}
const loadedSummary=`JSON.stringify((()=>{if(!state||!party)return null;const p=packParty(),m=p.members;return {members:m.length,jobs:m.map(h=>h.job),lv:m[0].lv,gold:m[0].gold,gearIds:[...new Set(m.flatMap(h=>(h.bag||[]).map(g=>g.id)))].sort(),equipped:(m[0].equipped||[]).filter(Boolean),plus:Object.fromEntries(m.flatMap(h=>(h.bag||[]).map(g=>[g.id,g.plus||0])))};})())`;
const summarize=runtime=>JSON.parse(runtime.run(loadedSummary));

for(const row of corpus()){
 test('legacy save keeps player progress: '+row.name,()=>{
  const expected=sourceSummary(row.raw);
  const cold=loadRuntime(root,'index.html',{[KEY]:row.raw});
  assert.equal(cold.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null,'boot error');
  const loaded=summarize(cold);
  assert(loaded,'save must hydrate a party');
  assert.equal(loaded.members,expected.members,'party size');
  assert.deepEqual(loaded.jobs,expected.jobs,'member jobs and order');
  assert.equal(loaded.lv,expected.lv,'player level');
  assert.equal(loaded.gold,expected.gold,'gold');
  for(const id of expected.gearIds)assert(loaded.gearIds.includes(id),'gear UID kept: '+id);
  for(const id of expected.equipped)assert(loaded.equipped.includes(id),'worn gear kept: '+id);
  const source=JSON.parse(row.raw),srcMembers=source.version===3?source.members:[source];
  for(const g of srcMembers.flatMap(h=>h.bag||[]))if(Number.isInteger(g.plus))assert.equal(loaded.plus[g.id],g.plus,'enhancement level kept: '+g.id);
  assert.equal(cold.values.get(KEY),row.raw,'cold load must not rewrite the original save bytes');
  // Migrated data must survive one more save and cold boot unchanged.
  cold.run('save()');
  const rewritten=cold.values.get(KEY);
  const again=loadRuntime(root,'index.html',{[KEY]:rewritten});
  assert.equal(again.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null,'re-saved boot error');
  assert.deepEqual(summarize(again),loaded,'save → cold boot round trip');
 });
}
