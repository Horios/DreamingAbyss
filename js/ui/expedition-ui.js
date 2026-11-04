
/* Update 27: compact expedition controls + lower-density battle journal. */
(function installExpeditionUiTidy(){
  const style=document.createElement('style');
  style.textContent=`
  /* Main battle: keep the battlefield dominant and use one compact control card on the lower-right. */
  .text-battle-layout{grid-template-columns:minmax(0,1.78fr) minmax(215px,.72fr)!important;grid-template-rows:minmax(0,1fr)!important;gap:8px!important}
  .party-combat{grid-column:1;grid-row:1}
  .battle-map-column.expedition-control-card{grid-column:2;grid-row:1;align-self:end;max-height:min(520px,72vh);overflow:auto;padding:10px!important}
  .expedition-control-card .control-head{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:7px}
  .expedition-control-card .control-head h2{font-size:15px;margin:0}
  .expedition-control-card .control-grid{display:grid;gap:6px}
  .expedition-control-card .control-row{display:grid;grid-template-columns:48px minmax(0,1fr) auto;align-items:center;gap:6px}
  .expedition-control-card .control-row>span{font-size:11px;color:var(--muted)}
  .expedition-control-card select,.expedition-control-card button{min-width:0;height:30px;padding:3px 7px;font-size:12px}
  .expedition-control-card .control-row select{width:100%}
  .expedition-control-card .icon-help{width:28px!important;min-width:28px!important;padding:0!important;border-radius:999px;font-weight:700}
  .expedition-control-card .boss-compact{margin-top:8px;padding-top:8px;border-top:1px solid var(--line)}
  .expedition-control-card .boss-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:5px}
  .expedition-control-card .boss-head b{font-size:12px}
  .expedition-control-card .boss-meter{height:6px;background:rgba(255,255,255,.08);border-radius:999px;overflow:hidden;margin:5px 0}
  .expedition-control-card .boss-meter>span{display:block;height:100%;background:currentColor;opacity:.72}
  .expedition-control-card .boss-meta{display:flex;gap:5px 8px;flex-wrap:wrap;font-size:11px;color:var(--muted);line-height:1.4}
  .expedition-control-card .boss-actions{display:flex;gap:6px;align-items:center;margin-top:7px}
  .expedition-control-card .boss-actions button{flex:1}
  .expedition-control-card details{margin-top:7px}
  .expedition-control-card details>summary{cursor:pointer;color:var(--muted);font-size:11px}
  .expedition-control-card .supply-list{display:grid;gap:5px;margin-top:6px}
  .expedition-control-card .supply-row{border:1px solid rgba(255,255,255,.08);padding:6px;border-radius:7px;display:grid;gap:5px}
  .expedition-control-card .supply-row-head{display:flex;justify-content:space-between;gap:6px;align-items:center}
  .expedition-control-card .supply-actions{display:flex;gap:4px;flex-wrap:wrap}
  .expedition-control-card .supply-actions button{height:27px;font-size:11px;padding:2px 5px}
  .expedition-control-card .supply-actions label{display:flex;align-items:center;gap:3px;font-size:10px;color:var(--muted)}
  .party-combat>.actions>.icon-help{width:28px!important;height:28px!important;min-width:28px!important;padding:0!important;border-radius:999px;font-size:11px;flex:0 0 28px!important}
  .party-combat>.actions{grid-template-columns:auto minmax(0,1fr) auto auto auto}
  .party-combat>.actions>button[onclick="restartExploration()"]{width:auto;white-space:nowrap}
  @media(max-width:700px){.party-combat>.actions{grid-template-columns:minmax(0,1fr) auto auto auto}.party-combat>.actions>.tag{display:none}}
  /* Remove the superseded standalone panels that used to repeat the same controls. */
  .difficulty-panel,.pace-controls,.boss-meter-panel,.expedition-tools{display:none!important}

  /* Journal: show the useful live log first, move secondary data behind one disclosure. */
  #app>.layout{grid-template-columns:150px minmax(0,1fr) clamp(235px,20vw,310px)!important}
  .global-battle-journal{grid-template-rows:auto minmax(0,1fr) auto!important;gap:5px!important;padding:7px!important}
  .global-journal-head{max-height:none!important;overflow:visible!important}
  .global-journal-head .journal-title-row{display:flex;align-items:center;justify-content:space-between;gap:6px}
  .global-journal-head h2{font-size:14px!important}
  .global-journal-head .journal-summary{font-size:11px;color:var(--muted);margin:3px 0 5px;white-space:normal;line-height:1.35}
  .global-journal-head .journal-actions{display:flex;gap:5px}
  .global-journal-head .journal-actions button{height:28px;min-height:28px;width:auto!important;padding:3px 7px;font-size:11px}
  .global-battle-journal #liveLog{min-height:0!important;overflow:hidden!important}
  .battle-log-stream{--battle-log-visible-rows:8!important;--battle-log-row-height:21px!important}
  .global-battle-journal .journal-loot-compact{border-top:1px solid var(--line);padding-top:5px;margin:0;min-height:0}
  .global-battle-journal .journal-loot-compact>summary{height:auto!important;cursor:pointer;font-size:11px;color:var(--muted)}
  .global-battle-journal .journal-loot-list{max-height:145px;overflow:auto;margin-top:5px}
  .global-battle-journal .journal-loot-row{font-size:11px;padding:2px 0}
  @media(max-width:1100px){
    #app>.layout{grid-template-columns:116px minmax(0,1fr) 245px!important}
    .text-battle-layout{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:auto auto!important}
    .battle-map-column.expedition-control-card{grid-column:1;grid-row:2;max-height:none}
  }
  `;
  document.head.appendChild(style);

  const safeEsc=s=>typeof esc==='function'?esc(String(s)):String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const isFinal=mi=>typeof globalThis.isFinalMap==='function'?globalThis.isFinalMap(mi):GAMEPLAY_SETTINGS?.maps?.catalog?.[mi]?.mapType==='final';
  const mapCfg=mi=>typeof globalThis.worldMapConfig==='function'?globalThis.worldMapConfig(mi):GAMEPLAY_SETTINGS?.maps?.catalog?.[mi];
  const progressEntry=mi=>typeof globalThis.bossProgressEntry==='function'?globalThis.bossProgressEntry(mi):(party?.bossProgress?.[mapCfg(mi)?.id]||{progress:0,charges:0});
  const bossRows=mi=>typeof globalThis.configuredBossStageRows==='function'?globalThis.configuredBossStageRows(mi,Math.random,{preview:true}):[];
  const finalRows=mi=>typeof globalThis.configuredFinalStageRows==='function'?globalThis.configuredFinalStageRows(mi):[];
  const fmt=n=>Math.round((Number(n)||0)*100)/100;
  function tooltip(label,text){return `<button type="button" class="icon-help" title="${safeEsc(text)}" aria-label="${safeEsc(label+'：'+text)}">?</button>`;}
  globalThis.restartExploration=function(){
    if(!party||!living().length)return toast('請先戰後恢復');
    resetEncounter();
    if(party.bossChallenge?.active)party.bossChallenge.stagePaid=false;
    toggleBattle();save();
  };

  function compactSupply(){
    const pc=Math.round(GS('quests.potion.buyCost',75)),pq=Math.round(GS('quests.potion.buyQuantity',5)),th=Math.round(GS('combat.autoPotionThreshold',.35)*10000)/100;
    return `<details><summary>隊伍補給</summary><div class="supply-list">${(typeof enlistedHeroes==='function'?enlistedHeroes():party.members).map(h=>`<div class="supply-row"><div class="supply-row-head"><b>${safeEsc(characterName(h))}</b><span class="small">藥水 ${h.potions}</span></div><div class="supply-actions"><button onclick="heroMenuAction(${memberKey(h)},()=>potion())" ${h.potions<1?'disabled':''}>喝藥</button><button onclick="heroMenuAction(${memberKey(h)},()=>buyPotion())" ${h.gold<pc?'disabled':''}>+${pq}／${pc}金</button><label title="生命低於 ${th}% 時自動使用治療藥水"><input type="checkbox" ${h.autoPotion?'checked':''} onchange="heroMenuAction(${memberKey(h)},()=>{state.autoPotion=this.checked;save()})">自動</label></div></div>`).join('')}</div></details>`;
  }

  function bossBlock(mi){
    if(isFinal(mi)){
      const rows=finalRows(mi),total=rows.reduce((n,x)=>n+(x.count||0),0)||1;
      return `<div class="boss-compact"><div class="boss-head"><b>終局關卡</b><span class="tag">${total} 隻</span></div><div class="boss-meta"><span>固定編成</span><span>${party?.bossChallenge?.active?'挑戰中':'直接由探索進入'}</span></div></div>`;
    }
    const cfg=mapCfg(mi),bm=GAMEPLAY_SETTINGS.monsters.bossMeter,entry=progressEntry(mi),enabled=cfg?.bossEnabled!==false,active=party?.bossChallenge?.active&&party.bossChallenge.mapIndex===mi,total=enabled?bossRows(mi).reduce((n,x)=>n+(x.count||0),0):0,pct=entry.charges>=bm.maxCharges?100:Math.max(0,Math.min(100,(Number(entry.progress)||0)/bm.progressPerCharge*100));
    return `<div class="boss-compact"><div class="boss-head"><b>${active?'BOSS 關卡':'BOSS 進度'}</b><span class="tag">${entry.charges}/${bm.maxCharges} 次</span></div><div class="boss-meter"><span style="width:${pct}%"></span></div><div class="boss-meta"><span>${fmt(entry.progress)}/${bm.progressPerCharge}%</span><span>普通 +${bm.normalProgress}%</span><span>菁英 ×${bm.eliteMultiplier}</span><span>${total} 隻／場</span></div><div class="boss-actions">${active?`<button class="danger" onclick="leaveBossChallenge()" title="離開會放棄目前已消耗的一次，剩餘次數保留。">離開關卡</button>`:`<button class="primary" onclick="startBossChallenge()" ${!enabled||entry.charges<1?'disabled':''} title="${enabled?'使用 1 次累積挑戰進入本地圖 BOSS 關卡。':'此地圖 BOSS 挑戰已停用。'}">挑戰 BOSS</button>`}${tooltip('BOSS 規則','普通與菁英怪擊殺會累積進度；進度滿後增加一次挑戰，次數用完會自動返回一般探索。')}</div></div>`;
  }

  let destinationOwner=null,destination={category:'explore',map:0,quest:''};
  function selectedDestination(){
    if(destinationOwner!==party){destinationOwner=party;destination={category:isFinal(party.map)?'boss':'explore',map:party.map,quest:''};}
    return destination;
  }
  globalThis.selectedExplorationCategory=()=>party?selectedDestination().category:'explore';
  globalThis.setExplorationCategory=function(category){if(!['explore','boss','quest'].includes(category))return;const d=selectedDestination();d.category=category;const maps=MAPS.map((_,i)=>i).filter(i=>category==='boss'||!isFinal(i));if(category!=='quest'&&!maps.includes(d.map))d.map=maps[0]??0;render();};
  globalThis.selectExplorationMap=function(mi){const d=selectedDestination();if(!MAPS[mi])return;d.map=mi;render();};
  globalThis.selectQuestEncounter=function(key){selectedDestination().quest=key;render();};
  const busy=()=>!!globalThis.__EMBERWILD_TEAMS?.busy();
  globalThis.explorationStateText=function(){return running?($('modal')?.open?'視窗暫停':'探索中'):globalThis.expeditionChallengeResult?'挑戰結束':busy()?'已暫停':'已停止';};
  globalThis.currentExplorationName=function(){return party?.questChallenge?.name||(party?.bossChallenge?.active?MAPS[party.map]?.name+' · BOSS 難關':MAPS[party?.map]?.name)||'';};
  globalThis.explorationControlButtons=function(quick=false){
    if(running||busy()&&!globalThis.expeditionChallengeResult)return `<button class="primary" onclick="toggleBattle()">${running?'暫停':'繼續'}</button><button onclick="stopTeamExploration()">停止</button>`;
    if(quick)return `<button onclick="setTab('battle')">前往探索</button>`;
    const d=selectedDestination(),single=d.category!=='explore';
    return `<button class="primary" onclick="startSelectedExploration()">${single?'開始挑戰':'開始探索'}</button>`;
  };
  globalThis.startSelectedExploration=function(){
    if(running||busy()&&!globalThis.expeditionChallengeResult)return false;
    const d=selectedDestination();if(d.category==='quest')return globalThis.startQuestEncounter?.(d.quest);
    if(!canVisit(d.map))return toast('尚未符合此地區的探索條件');
    if(!globalThis.__EMBERWILD_TEAMS?.valid())return toast('請先完成可探索的隊伍編成');
    if(state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理裝備');
    globalThis.expeditionChallengeResult=null;
    if(party.bossChallenge?.active&&d.category==='boss'&&d.map===party.map)return toggleBattle();
    chooseMap(d.map);
    if(d.category==='boss'&&!isFinal(d.map))return startBossChallenge();
    return toggleBattle();
  };
  globalThis.refreshExplorationStatus=function(){
    document.querySelectorAll('[data-exploration-state]').forEach(n=>n.textContent=explorationStateText());
    document.querySelectorAll('[data-exploration-name]').forEach(n=>n.textContent=currentExplorationName());
  };
  function expeditionControlCard(){
    const d=selectedDestination(),mi=d.map,mode=party.difficulty||0,questRows=globalThis.questEncounterRows?.()||[];
    if(!questRows.some(x=>x.key===d.quest))d.quest=questRows.find(x=>x.unlocked)?.key||questRows[0]?.key||'';
    const q=questRows.find(x=>x.key===d.quest),maps=MAPS.map((m,i)=>({m,i})).filter(({i})=>d.category==='boss'||!isFinal(i));
    const enemies=d.category==='quest'?(q?.enemies||[]).map(x=>{const row=monsterCatalog().find(m=>m.id===x.monsterId);return (row?.name||x.monsterId)+' ×'+x.count;}):d.category==='boss'?(isFinal(mi)?finalRows(mi):bossRows(mi)).map(x=>x.row.name+' ×'+x.count):monsterCatalog().filter(m=>m.mapIndex===mi&&['normal','elite'].includes(m.kind)&&m.enabled!==false).map(m=>m.name);
    const info=d.category==='quest'?(q?`任務來源：${safeEsc(q.source)} · ${q.completed?'已通關':q.unlocked?'已開放':'尚未符合任務進度'} · ${q.repeatable?'可重複挑戰':'完成後不可重複挑戰'}`:'依任務進度開放，目前沒有已設定的任務關卡。'):d.category==='boss'&&!isFinal(mi)?`累積挑戰 ${progressEntry(mi).charges} 次 · 保留原有連續挑戰與獎勵規則`:`LV ${MAPS[mi]?.min}–${MAPS[mi]?.max} · ${isFinal(mi)?'擊敗全部敵人後結束挑戰':'持續探索，直到暫停或停止'}`;
    const result=globalThis.expeditionChallengeResult;
    return `<section class="panel battle-map-column expedition-control-card"><div class="control-head"><h2>探索與挑戰</h2><span class="tag" data-exploration-state>${explorationStateText()}</span></div><div class="exploration-categories" role="group" aria-label="關卡分類">${[['explore','一般探索'],['boss','BOSS 難關'],['quest','任務關卡']].map(([id,name])=>`<button aria-pressed="${d.category===id}" class="${d.category===id?'primary':''}" onclick="setExplorationCategory('${id}')">${name}</button>`).join('')}</div><div class="exploration-selection"><label><span>${d.category==='quest'?'任務關卡':'選擇地圖'}</span>${d.category==='quest'?`<select aria-label="任務關卡" onchange="selectQuestEncounter(this.value)">${questRows.map(x=>`<option value="${x.key}" ${x.key===d.quest?'selected':''}>${safeEsc(x.name)} · ${x.unlocked?'可挑戰':x.completed?'已完成':'未解鎖'}</option>`).join('')||'<option>目前無任務關卡</option>'}</select>`:`<select aria-label="探索地圖" onchange="selectExplorationMap(Number(this.value))">${maps.map(({m,i})=>`<option value="${i}" ${i===mi?'selected':''}>${safeEsc(m.name)} · LV${m.min}${canVisit(i)?'':' · 未解鎖'}</option>`).join('')}</select>`}</label><div class="exploration-destination-detail"><b>${safeEsc(d.category==='quest'?q?.name||'任務關卡':MAPS[mi]?.name)}</b><p>${info}</p><p>敵人：${safeEsc(enemies.join('、')||'未設定')}</p></div><div class="exploration-primary-actions">${explorationControlButtons()}</div></div><div class="exploration-live-status"><span>目前${running||busy()?'探索':'所在'}：</span><b data-exploration-name>${safeEsc(currentExplorationName())}</b><small>${running||busy()?'選擇其他目的地僅供準備，停止後再開始才會切換。':'選擇目的地後按下開始。'}</small></div>${result?`<div class="exploration-result" role="status">${safeEsc(result.name)} · ${result.success?'挑戰成功':'挑戰失敗'}${result.key?`<button onclick="openStory('${result.key.split('/')[0]}')">查看任務</button>`:''}</div>`:''}<div class="exploration-secondary-settings">${typeof timedBoostManagement==='function'?timedBoostManagement():''}<details class="exploration-secondary"><summary>難度與隊伍補給</summary><label class="control-row"><span>難度</span><select aria-label="探索難度" onchange="changeDifficulty(this.value)">${MODES.map((x,i)=>`<option value="${i}" ${i===mode?'selected':''}>${safeEsc(x.name)}</option>`).join('')}</select><button onclick="showRegionBestiary()">目前地區圖鑑</button></label><p class="small">切換難度會停止探索並放棄目前遭遇。</p>${compactSupply()}${combatContributionPanel()}</details></div></section>`;
  }

  if(typeof battleView==='function'){
    const compactBattleViewBase=battleView;
    battleView=function(){
      let html=compactBattleViewBase();
      if(!party)return html;
      /* Replace the existing right-side map list with the unified control card. */
      html=html.replace(/<section class="panel battle-map-column">[\s\S]*?<\/section>/,expeditionControlCard());
      /* In case an older wrapper failed to create that column, inject before the battle grid closes. */
      if(!html.includes('expedition-control-card')){
        const marker='</div><section class="panel battle-buffs">';
        if(html.includes(marker))html=html.replace(marker,expeditionControlCard()+marker);
        else html+=expeditionControlCard();
      }
      /* Keep combat rules available without occupying a separate row. */
      html=html.replace(/<p class="small combat-rule">[\s\S]*?<\/p>/,'');
      html=html.replace(/<div class="actions">(?:(?!<\/div>)[\s\S])*?<\/div>/g,match=>match.includes('onclick="toggleBattle()"')?'':match);
      html=html.replace(/<section class="panel boss-meter-panel">[\s\S]*?<\/section>/,'');
      return html;
    };
  }

  if(typeof sharedBattleJournal==='function'){
    sharedBattleJournal=function(){
      if(!party)return '';
      const alive=living().length,total=heroes().length,enemies=foes.filter(e=>e.hp>0).length,allEnemies=foes.length,lootKinds=expeditionLoot.items.size;
      return `<section id="globalBattleJournal" class="global-battle-journal" aria-label="全隊共通戰報"><div class="global-journal-head"><div class="journal-title-row"><h2>全隊戰報</h2><span class="tag" data-exploration-state>${explorationStateText()}</span></div><div class="journal-summary"><b data-exploration-name>${safeEsc(currentExplorationName())}</b> · ${safeEsc(MODES[party.difficulty||0].name)} · 隊員 ${alive}/${total} · 敵人 ${enemies}/${allEnemies}</div><div class="journal-actions">${explorationControlButtons(true)}${tab==='battle'?'':``}<button onclick="toggleBattleReport()">${battleReportPaused?'恢復戰報':'戰報暫停'}</button></div>${typeof battleJournalStatus==='function'?battleJournalStatus():''}${battleJournalFilter()}</div><div id="liveLog" role="log" aria-label="即時戰鬥紀錄">${logContent()}</div><div class="journal-resizer" title="拖曳調整戰報與累積戰利品高度" onpointerdown="startJournalResize(event)"></div><details class="journal-loot-compact" ${globalThis.journalLootOpen?'open':''} onclick="toggleJournalLoot(event)"><summary>累積戰利品 · 擊敗 ${expeditionLoot.kills} · ${lootKinds} 種</summary><div id="journalLootList" class="journal-loot-list">${[...expeditionLoot.items].map(([name,item])=>`<div class="journal-loot-row"><span class="loot-rarity-${item.rar??0}">${safeEsc(name)}</span><b>+${(item.count??item).toLocaleString()}</b></div>`).join('')||'<p class="small">尚無戰利品。</p>'}</div></details></section>`;
    };
  }

  const preserveSettingsRender=render;
  render=function(...args){const open=$('explorationBoostSettings')?.open,secondary=document.querySelector('.exploration-secondary-settings>details:last-child')?.open;const out=preserveSettingsRender(...args);if(open&&$('explorationBoostSettings'))$('explorationBoostSettings').open=true;if(secondary){const node=document.querySelector('.exploration-secondary-settings>details:last-child');if(node)node.open=true;}return out;};
  if(typeof render==='function'&&typeof party!=='undefined'&&party)render();
})();
