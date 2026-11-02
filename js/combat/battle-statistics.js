
/* Persistent per-map battle statistics. One battle = one completed group encounter. */
const BATTLE_STATS_LIMIT=300;
const BATTLE_STATS_STORAGE_KEY=battleStatsKeyForSlot(ACTIVE_SAVE_SLOT);
let activeBattleStat=null;
let statsRewardingKill=false;

function normalizeBattleStatistics(raw){
  const out={maps:{}};
  const maps=raw&&typeof raw==='object'&&raw.maps&&typeof raw.maps==='object'?raw.maps:{};
  for(let mi=0;mi<MAPS.length;mi++){
    const src=Array.isArray(maps[mi])?maps[mi]:Array.isArray(maps[String(mi)])?maps[String(mi)]:[];
    const rows=[];
    for(const r of src.slice(-BATTLE_STATS_LIMIT)){
      if(!r||typeof r!=='object')continue;
      const deaths=Array.isArray(r.deaths)?r.deaths.slice(0,8).flatMap(d=>{
        if(!d||!Number.isInteger(d.job)||d.job<0||d.job>=CLASSES.length)return [];
        const memberId=Number.isInteger(d.memberId)&&d.memberId>=10&&d.memberId<=999?d.memberId:d.job;
        return [{job:d.job,memberId,name:String(d.name||CLASSES[d.job].name).slice(0,60),cause:String(d.cause||'未知').slice(0,160)}];
      }):[];
      const drops={};
      if(r.drops&&typeof r.drops==='object'&&!Array.isArray(r.drops))for(const [name,n] of Object.entries(r.drops).slice(0,600)){
        const v=Math.max(0,Math.min(1e9,Math.floor(Number(n)||0)));if(v)drops[String(name).slice(0,120)]=v;
      }
      rows.push({time:Number.isFinite(r.time)?Math.max(0,Math.floor(r.time)):0,difficulty:[0,1,2].includes(r.difficulty)?r.difficulty:0,result:['wipe','abandoned'].includes(r.result)?r.result:'victory',xp:Math.max(0,Math.min(1e12,Math.floor(Number(r.xp)||0))),drops,deaths});
    }
    if(rows.length)out.maps[mi]=rows;
  }
  return out;
}
function ensureBattleStatistics(){
  if(!party)return {maps:{}};
  const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
  if(cache?.statistics===party.battleStatistics)return party.battleStatistics;
  party.battleStatistics=normalizeBattleStatistics(party.battleStatistics);
  if(cache)cache.statistics=party.battleStatistics;
  return party.battleStatistics;
}
function currentMapBattleRecords(){
  const stats=ensureBattleStatistics();
  return stats.maps[party.map]||(stats.maps[party.map]=[]);
}
function beginBattleStatistics(){
  if(!party)return;
  activeBattleStat={map:party.map,difficulty:party.difficulty||0,time:Date.now(),xp:0,drops:{},deaths:[],pendingOutcome:null};
}
function addBattleStatDrop(name,count=1){
  if(!activeBattleStat||activeBattleStat.map!==party?.map)return;
  const n=Math.floor(Number(count)||0);if(n<=0||!name||name==='金幣')return;
  activeBattleStat.drops[name]=(activeBattleStat.drops[name]||0)+n;
}
function recordBattleDeath(h,e,cause){
  if(!activeBattleStat||!h||!e)return;
  activeBattleStat.deaths.push({job:h.job,memberId:memberKey(h),name:characterName(h),cause:`${e.name}－${cause}`});
  if(!living().length)activeBattleStat.pendingOutcome='wipe';
}
function finalizeBattleStatistics(result){
  if(!activeBattleStat||!party)return;
  const rec={time:activeBattleStat.time,difficulty:activeBattleStat.difficulty,result:['wipe','abandoned'].includes(result)?result:'victory',xp:Math.max(0,Math.floor(activeBattleStat.xp||0)),drops:{...activeBattleStat.drops},deaths:activeBattleStat.deaths.map(x=>({...x}))};
  const map=activeBattleStat.map,stats=ensureBattleStatistics(),rows=stats.maps[map]||(stats.maps[map]=[]);
  rows.push(rec);if(rows.length>BATTLE_STATS_LIMIT)rows.splice(0,rows.length-BATTLE_STATS_LIMIT);
  activeBattleStat=null;
  save();
  if(tab==='statistics')render();
}
function battleDeathMoveName(e){
  if(e?.kind!=='final')return '普通攻擊';
  const fb=GAMEPLAY_SETTINGS.combat.finalBoss,turn=e.turn||0;
  if(turn>fb.enrageAfterTurn)return '狂暴攻擊';
  if(turn%Math.max(1,Math.round(fb.specialEveryTurns))===0)return '日蝕打擊';
  return '普通攻擊';
}
function battleStatLootSnapshot(){
  const h=party?.members?.[0];
  if(!h)return null;
  return {ore:h.ore,dust:h.dust,potions:h.potions,healingPotions:typeof healingInventory==='function'?{...healingInventory()}:null,gems:[...h.gems],materials:{...h.materials}};
}
function collectBattleStatLootDiff(before,after){
  if(!before||!after)return;
  addBattleStatDrop('鍛鐵',after.ore-before.ore);addBattleStatDrop('寶石粉塵',after.dust-before.dust);addBattleStatDrop('治療藥水',after.potions-before.potions);
  for(const [id,n] of Object.entries(after.healingPotions||{})){const item=SHOP.find(x=>x.id===id);if(item)addBattleStatDrop(item.name,n-(before.healingPotions?.[id]||0));}
  after.gems.forEach((n,i)=>addBattleStatDrop(GEMS[i].name,n-before.gems[i]));
  for(const [name,n] of Object.entries(after.materials))addBattleStatDrop(name,n-(before.materials[name]||0));
}

const battleStatsCreatePartyBase=createParty;
createParty=function(hero){const p=battleStatsCreatePartyBase(hero);p.battleStatistics={maps:{}};return p;};
const battleStatsValidatePartyBase=validateParty;
validateParty=function(data){const p=battleStatsValidatePartyBase(data);p.battleStatistics=normalizeBattleStatistics(data?.battleStatistics);return p;};
const battleStatsPackPartyBase=packParty;
packParty=function(){const out=battleStatsPackPartyBase();if(party)out.battleStatistics=normalizeBattleStatistics(party.battleStatistics);return out;};
const battleStatsSaveBase=save;
save=function(show=false){if(!saveReady)return;if(party){try{localStorage.setItem(BATTLE_STATS_STORAGE_KEY,JSON.stringify(normalizeBattleStatistics(party.battleStatistics)));}catch{}}return battleStatsSaveBase(show);};
const battleStatsNewGameBase=newGame;
newGame=function(){try{localStorage.removeItem(BATTLE_STATS_STORAGE_KEY);}catch{}activeBattleStat=null;return battleStatsNewGameBase();};
const battleStatsResetEncounterBase=resetEncounter;
resetEncounter=function(){activeBattleStat=null;return battleStatsResetEncounterBase();};
const battleStatsSpawnGroupBase=spawnGroup;
spawnGroup=function(){const r=battleStatsSpawnGroupBase();beginBattleStatistics();return r;};
const battleStatsAwardXPBase=awardXP;
awardXP=function(amount){if(statsRewardingKill&&activeBattleStat)activeBattleStat.xp+=Math.max(0,Math.floor(Number(amount)||0));return battleStatsAwardXPBase(amount);};
const battleStatsAddGearBase=addGear;
addGear=function(g){if(statsRewardingKill&&activeBattleStat)addBattleStatDrop(equipmentDisplayName(g)+(globalThis.EmberwildTokens?.isToken(g)?' · '+AFFIX_RANK[g.rar]:''),1);return battleStatsAddGearBase(g);};
const battleStatsRewardGroupKillBase=rewardGroupKill;
rewardGroupKill=function(e){if(e?.rewarded)return;const before=battleStatLootSnapshot();statsRewardingKill=true;try{return battleStatsRewardGroupKillBase(e);}finally{statsRewardingKill=false;collectBattleStatLootDiff(before,battleStatLootSnapshot());}};
const battleStatsEnemyBasicBase=performEnemyBasic;
performEnemyBasic=function(e){const before=new Map(heroes().map(h=>[memberKey(h),h.hp]));const r=battleStatsEnemyBasicBase(e);for(const h of heroes())if((before.get(memberKey(h))||0)>0&&h.hp<=0)recordBattleDeath(h,e,battleDeathMoveName(e));return r;};
const battleStatsPacedRoundBase=pacedRound;
pacedRound=function*(){yield* battleStatsPacedRoundBase();if(!activeBattleStat)return;if(activeBattleStat.pendingOutcome==='wipe')finalizeBattleStatistics('wipe');else if(foes.length&&foes.every(e=>e.hp<=0))finalizeBattleStatistics('victory');};

function aggregateCurrentMapStatistics(){
  const records=currentMapBattleRecords(),drops=new Map(),memberData=new Map();let xp=0,wipes=0,deaths=0;
  for(const h of party.members)memberData.set(memberKey(h),{count:0,recent:[]});
  for(const r of records){xp+=r.xp||0;if(r.result==='wipe')wipes++;for(const [name,n] of Object.entries(r.drops||{}))drops.set(name,(drops.get(name)||0)+n);deaths+=(r.deaths||[]).length;for(const d of r.deaths||[]){const key=d.memberId??d.job;if(!memberData.has(key))memberData.set(key,{count:0,recent:[]});memberData.get(key).count++;}}
  for(let i=records.length-1;i>=0;i--)for(let j=(records[i].deaths||[]).length-1;j>=0;j--){const d=records[i].deaths[j],m=memberData.get(d.memberId??d.job);if(m&&m.recent.length<5)m.recent.push(d.cause);}
  return {records,xp,wipes,deaths,drops:[...drops.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-Hant')),memberData};
}
function statisticsView(){
  const a=aggregateCurrentMapStatistics(),m=MAPS[party.map];
  const difficultyCounts=[0,1,2].map(i=>a.records.filter(r=>r.difficulty===i).length);
  return heading('STATISTICS / 戰鬥統計',m.name,`<span class="tag">最近 ${a.records.length} / ${BATTLE_STATS_LIMIT} 場</span>`)+
  `<section class="statistics-summary">
    <article class="card"><span class="statistics-number">${a.records.filter(r=>r.result!=='abandoned').length.toLocaleString()}</span><span class="statistics-label">已完成戰鬥</span></article>
    <article class="card"><span class="statistics-number">${a.xp.toLocaleString()}</span><span class="statistics-label">總獲得經驗</span></article>
    <article class="card"><span class="statistics-number">${a.wipes.toLocaleString()}</span><span class="statistics-label">總全滅次數</span></article>
    <article class="card"><span class="statistics-number">${a.deaths.toLocaleString()}</span><span class="statistics-label">總死亡次數</span></article>
  </section><p class="small">統計只計算在此地圖完成的群怪遭遇；停止探索保留已取得獎勵並記錄為中止，不計完成場次；中途換圖、換隊員或切換難度不計場次。模式場次：${MODES.map((d,i)=>`${d.name} ${difficultyCounts[i]}`).join(' ／ ')}</p>
  <div class="statistics-layout"><section class="panel"><h2>掉落道具</h2><div class="statistics-loot-list">${a.drops.length?a.drops.map(([name,n])=>`<div class="statistics-loot-row"><span>${esc(name)}</span><b>×${n.toLocaleString()}</b></div>`).join(''):'<p class="statistics-empty">最近的戰鬥尚無掉落紀錄。</p>'}</div></section>
  <section class="panel"><h2>隊員死亡統計</h2><div class="statistics-members">${party.members.map(h=>{const d=a.memberData.get(memberKey(h))||{count:0,recent:[]};return `<article class="statistics-member"><h3><span>${esc(characterName(h))}</span><span class="tag">死亡 ${d.count}</span></h3>${d.recent.length?`<ol class="statistics-deaths">${d.recent.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>`:'<p class="statistics-empty">最近 300 場內沒有死亡紀錄。</p>'}</article>`;}).join('')}</div><p class="small">每名隊員最多顯示最近 5 次直接致死來源，格式為「怪物名稱－招式名稱」。</p></section></div>`;
}
function ensureStatisticsNavButton(){
  const nav=document.querySelector('#app nav');if(!nav||nav.querySelector('.game-menu-item'))return;
  let btn=nav.querySelector('[data-page="statistics"], [data-statistics-tab]');
  if(!btn){btn=document.createElement('button');btn.dataset.page='statistics';btn.dataset.statisticsTab='1';btn.textContent='戰鬥統計';btn.onclick=()=>setTab('statistics');nav.appendChild(btn);}
  if(tab==='statistics'){nav.querySelectorAll('button').forEach(b=>b.classList.remove('active'));btn.classList.add('active');}else btn.classList.remove('active');
}
const battleStatisticsRenderBase=render;
render=function(){
  if(state&&party&&tab==='statistics'){
    tab='battle';battleStatisticsRenderBase();tab='statistics';
    const main=document.querySelector('#app .layout>main');if(main)main.innerHTML=(globalThis.gameSubtabsHTML?.('statistics')||'')+statisticsView();
    ensureStatisticsNavButton();return;
  }
  battleStatisticsRenderBase();ensureStatisticsNavButton();
};
if(state&&party){
  try{const raw=localStorage.getItem(BATTLE_STATS_STORAGE_KEY);if(raw)party.battleStatistics=normalizeBattleStatistics(JSON.parse(raw));}catch{party.battleStatistics={maps:{}};}
  ensureBattleStatistics();save();render();
}
