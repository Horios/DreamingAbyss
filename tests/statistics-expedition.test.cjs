'use strict';
/* v0.114: 累積戰利品 lives on the 戰鬥統計 page (not the battle journal), with manual resets, and the page
   charts damage / damage taken / healing for the active protagonist and companions. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
function game(){
 const r=loadRuntime(root);r.ctx.performance.now=performance.now.bind(performance);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(3);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();globalThis.rng=24680;Math.random=()=>((rng=(Math.imul(rng,1664525)+1013904223)>>>0)/4294967296);startSelectedExploration();save();`);
 return r;
}
function drive(r,ms){for(let i=0;i<ms;i+=50){r.advance(Math.min(50,ms-i));r.run('tick()');}}

test('real combat records damage, damage taken and healing per active member; the statistics page charts them',()=>{
 const r=game();drive(r,180000);
 const rows=json(r,'combatContributionData()');
 assert.equal(rows.length,3,'protagonist and two companions');
 assert(rows.some(x=>x.damage>0),'damage recorded');
 assert(rows.some(x=>x.taken>0),'damage taken recorded');
 for(const x of rows)for(const k of ['damage','taken','healing'])assert(Number.isFinite(x[k])&&x[k]>=0,k);
 const html=r.run(`tab='statistics';statisticsView()`);
 for(const label of ['戰鬥數據','傷害','承傷','治療'])assert(html.includes(label),label);
 assert.equal((html.match(/class="combat-chart-row"/g)||[]).length,9,'3 members × 3 metrics');
 const top=Math.max(...rows.map(x=>x.damage));
 assert.match(html,new RegExp('metric-damage" style="width:100\\.0%"'),'the largest value fills the bar');
 assert(html.includes(Math.round(top).toLocaleString('zh-TW')),'numeric value shown next to the bar');
 assert.deepEqual(r.errors,[]);
});

test('the journal has no loot list; the statistics page keeps one drops table whose reset clears only this map',()=>{
 const r=game();drive(r,120000);
 const journal=r.run('sharedBattleJournal()');
 assert.doesNotMatch(journal,/累積戰利品|journal-loot-compact|journal-resizer/);
 assert.match(journal,/id="liveLog"/);
 const page=r.run(`tab='statistics';statisticsView()`);
 assert.doesNotMatch(page,/累積戰利品/,'the duplicate session list is gone');
 assert.equal((page.match(/<h2>掉落道具<\/h2>/g)||[]).length,1);
 const map=r.run('party.map'),before=r.run('currentMapBattleRecords().length');
 assert(before>0,'combat produced finished battles');
 r.run(`party.battleStatistics.maps[${map}+1]=[{time:1,difficulty:0,result:'victory',xp:5,drops:{'其他地圖素材':2},deaths:[]}]`);
 const gold=r.run('state.gold');
 r.run('requestResetMapBattleStatistics()');assert.match(r.run("$('modal').innerHTML"),/重置戰鬥統計/);
 r.run('confirmResetMapBattleStatistics()');
 assert.equal(r.run('currentMapBattleRecords().length'),0);
 assert.equal(r.run(`party.battleStatistics.maps[${map}+1].length`),1,'other maps keep their records');
 assert.equal(r.run('state.gold'),gold,'earned rewards are untouched');
 assert.equal((JSON.parse(r.values.get(r.run('KEY'))).battleStatistics.maps[map]||[]).length,0,'reset is saved');
 r.run('resetCombatContribution()');
 assert(json(r,'combatContributionData()').every(x=>!x.damage&&!x.taken&&!x.healing&&!x.mitigation));
 assert.deepEqual(r.errors,[]);
});

test('older stored contribution rows without damage taken load as zero',()=>{
 const r=game();
 r.run(`(()=>{const root=party.members[0],k='emberwild-combat-contribution-v1:'+root.created;localStorage.setItem(k,JSON.stringify({teamSignature:[...party.active].sort((a,b)=>a-b).join(','),byJob:Object.fromEntries(party.active.map(id=>[id,{damage:5,healing:2,mitigation:1}]))}));})()`);
 const fresh=loadRuntime(root,'index.html',Object.fromEntries(r.values),r.now);
 const rows=json(fresh,'combatContributionData()');
 assert(rows.length>0);for(const x of rows){assert.equal(x.damage,5);assert.equal(x.taken,0);}
});
