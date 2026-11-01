
/* Update 23: compatibility fixes for dynamic maps with small custom monster pools. */
(function installWorldRuntimeFollowupFixes(){
  // The commission board promises three commissions. Custom maps may have only
  // one or two normal monsters, so cycle the available pool instead of silently
  // producing fewer tasks.
  if(typeof buildBoard==='function'){
    buildBoard=function(s=state){
      const currentMap=(typeof party!=='undefined'&&party&&Number.isInteger(party.map))?party.map:s.map;
      const mi=currentMap===6?5:currentMap,m=MAPS[mi],b=GAMEPLAY_SETTINGS.quests.board,pool=m?.mobs||[];
      if(!pool.length)throw Error('目前地圖沒有可用的普通怪物，無法建立委託');
      s.board.serial++;s.board.next=Date.now()+BOARD_INTERVAL;
      s.board.tasks=Array.from({length:3},(_,i)=>{
        const mob=pool[i%pool.length];
        return {id:uid(),map:mi,mat:mob[2],n:Math.max(1,Math.round(b.taskBase+rand(Math.max(1,Math.round(b.taskRandomRange)))+(regionTier(mi)-1)*b.taskPerTier)),kind:i===2?'gear':'gem',gem:rand(3),slot:rand(4),rar:Math.random()<b.legendaryGearChance?3:2,done:false};
      });
    };
  }

  // Saves are first hydrated before this late dynamic-world module exists. A save
  // made while standing on a newly added map would therefore fail the early
  // MAPS-length validation on the next reload. Migrate map-dependent fields and
  // hydrate once more after the dynamic map catalog is installed.
  function migrateWorldSaveForCurrentMaps(raw){
    const d=JSON.parse(JSON.stringify(raw));
    const validMap=i=>Number.isInteger(i)&&i>=0&&i<MAPS.length;
    const validBoardTask=q=>q&&validMap(q.map)&&q.map!==6&&EmberwildCommissions.validSource(q,MAPS);
    const scrubBoard=b=>{if(!b||typeof b!=='object')return;if(Array.isArray(b.tasks)){b.tasks=b.tasks.filter(validBoardTask);if(![1,2].includes(b.dailyVersion)&&b.tasks.length!==3)b.next=0;}};
    const scrubGear=g=>{if(!g||typeof g!=='object'||g.region===undefined)return;if(!validMap(g.region)||g.region===6||g.boss===undefined||regionFamily(g.region)!==g.boss||regionTier(g.region)!==g.tier)delete g.region;};
    const scrubHero=h=>{if(!h||typeof h!=='object')return;if(Array.isArray(h.bag))h.bag.forEach(scrubGear);scrubBoard(h.board);};
    if(d.version===3){
      if(Array.isArray(d.members))d.members.forEach(scrubHero);
      const activeRows=Array.isArray(d.active)&&Array.isArray(d.members)?d.active.map(key=>d.members.find(h=>(h?.companionId??h?.job)===key)).filter(Boolean):[];
      const usable=i=>validMap(i)&&activeRows.length>0&&activeRows.every(h=>{try{return solo.canVisit(i,h);}catch{return false;}});
      if(!usable(d.map)){const fallback=MAPS.findIndex((_,i)=>usable(i));d.map=fallback>=0?fallback:0;}
      if(Array.isArray(d.members))for(const h of d.members)h.map=d.map;

    }else{
      scrubHero(d);if(!validMap(d.map))d.map=0;
    }
    if(Array.isArray(d.pendingGearLoot))d.pendingGearLoot.forEach(scrubGear);
    return d;
  }
  migrateWorldSave=migrateWorldSaveForCurrentMaps;
  try{
    const raw=globalThis.__EMBERWILD_BOOT_SAVE_RAW??localStorage.getItem(KEY);
    if(raw&&(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)){
      const migrated=migrateWorldSaveForCurrentMaps(JSON.parse(raw));
      loadParty(migrated);save();
    }
  }catch(e){
    console.warn('動態地圖套用後重新載入存檔失敗',e);
    if(!state){state=null;party=null;if(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)toast('存檔未能載入：'+e.message+'；可匯入備份。');}
  }

  // Keep the player-facing bestiary consistent with per-map BOSS switches.
  // A disabled BOSS remains visible as configured data, but is explicitly
  // labelled as disabled rather than looking like an active encounter.
  if(typeof showRegionBestiary==='function'){
    showRegionBestiary=function(){
      const mi=party.map,m=MAPS[mi],mc=typeof worldMapConfig==='function'?worldMapConfig(mi):null;
      const normalRows=m.mobs.map(x=>`<p><b>${esc(x[0])}</b> · ${ELEMENTS[species.get(x[2])?.element||'physical']}／${RACES[species.get(x[2])?.race||'beast']}<br>專屬掉落：${esc(x[2])}</p>`).join('');
      const bossEnabled=mi===6||mc?.bossEnabled!==false;
      const bossRow=m.boss?.[0]?`<p><b>${esc(m.boss[0])}</b> · ${ELEMENTS[species.get(m.boss[2])?.element||'physical']}／${RACES[species.get(m.boss[2])?.race||'beast']} ${bossEnabled?'':'<span class="tag">遭遇已停用</span>'}<br>專屬掉落：${esc(m.boss[2])}</p>`:'';
      $('modal').innerHTML=`<h2>${esc(m.name)} · 怪物與掉落</h2>${normalRows}${bossRow}<button onclick="closeModal()">關閉</button>`;$('modal').showModal();
    };
  }
})();
