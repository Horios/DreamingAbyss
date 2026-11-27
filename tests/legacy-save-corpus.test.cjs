'use strict';
// 只保留第一張地圖時刪除了 hidden 夥伴技能，技能位置編號改變；依決定不再相容此版本以前的舊存檔。
const LEGACY_SKIP='舊存檔的技能位置編號已失效（不再相容）';
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
const loadedSummary=`JSON.stringify((()=>{if(!state||!party)return null;const p=packParty(),m=p.members;return {members:m.length,jobs:m.map(h=>h.job),lv:m[0].lv,legacy:p.legacySkillLevel,gold:m[0].gold,gearIds:[...new Set(m.flatMap(h=>(h.bag||[]).map(g=>g.id)))].sort(),equipped:(m[0].equipped||[]).filter(Boolean),plus:Object.fromEntries(m.flatMap(h=>(h.bag||[]).map(g=>[g.id,g.plus||0])))};})())`;
const summarize=runtime=>JSON.parse(runtime.run(loadedSummary));

for(const row of corpus()){
 test('legacy save keeps player progress: '+row.name,{skip:LEGACY_SKIP},()=>{
  const expected=sourceSummary(row.raw);
  const cold=loadRuntime(root,'index.html',{[KEY]:row.raw});
  assert.equal(cold.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null,'boot error');
  const loaded=summarize(cold);
  assert(loaded,'save must hydrate a party');
  assert.equal(loaded.members,expected.members,'party size');
  assert.deepEqual(loaded.jobs,expected.jobs,'member jobs and order');
  // v0.161: the level is removed; the old level is kept only as the skill compatibility threshold.
  assert.equal(loaded.lv,undefined,'no character level after loading');
  assert.equal(loaded.legacy,expected.lv>1?expected.lv:(expected.lv===1?1:undefined),'old level kept as legacySkillLevel');
  assert.equal(loaded.gold,expected.gold,'gold');
  for(const id of expected.gearIds)assert(loaded.gearIds.includes(id),'gear UID kept: '+id);
  for(const id of expected.equipped)assert(loaded.equipped.includes(id),'worn gear kept: '+id);
  const source=JSON.parse(row.raw),srcMembers=source.version===3?source.members:[source];
  for(const g of srcMembers.flatMap(h=>h.bag||[]))if(Number.isInteger(g.plus))assert.equal(loaded.plus[g.id],g.plus,'enhancement level kept: '+g.id);
  if(/^legacy-skills-job[0-3]\.json$/.test(row.name)){
   assert(source.story.quests.two_regions,'fixture retains the retired quest');
   const quests=JSON.parse(cold.run('JSON.stringify(party.story.quests)'));
   assert.equal(Object.hasOwn(quests,'two_regions'),false,'retired record is removed on cold load');
   for(const [id,progress] of Object.entries(source.story.quests))if(id!=='two_regions')assert.deepEqual(quests[id],progress,'other quest progress remains: '+id);
   cold.run("setStoryCategory('side')");assert.doesNotMatch(cold.run('storyView()'),/兩地巡查|two_regions/,'side page has no retired quest');
  }
  assert.equal(cold.values.get(KEY),row.raw,'cold load must not rewrite the original save bytes');
  // Migrated data must survive one more save and cold boot unchanged.
  cold.run('save()');
  const rewritten=cold.values.get(KEY);
  const again=loadRuntime(root,'index.html',{[KEY]:rewritten});
  assert.equal(again.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null,'re-saved boot error');
  assert.equal(again.run('Object.hasOwn(party.story.quests,"two_regions")'),false);
  assert.deepEqual(summarize(again),loaded,'save → cold boot round trip');
 });
}
