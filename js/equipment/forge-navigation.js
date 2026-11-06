
(()=>{
  let forgeSortKey='quality';
  let forgeSortDirection='desc';
  let forgeWearFilter='equipped';
  const forgePageSize=60;
  let forgePage=0;

  function forgeIsToken(g){return globalThis.EmberwildTokens?.isToken(g)===true;}
  function forgeGearMeta(g){
    return forgeIsToken(g)?[companionTokenJobLabel(g),'信物']:[gearWearableJobsText(g),CLASS_GEAR[g.job][g.slot],`LV ${gearRequiredLevel(g)}`];
  }

  function forgeSortValue(g,key){
    if(key==='equipped')return gearWearer(g.id)?1:0;
    if(key==='tier')return Number.isInteger(g.powerTier)?g.powerTier:-1;
    if(key==='plus')return Number(g.plus)||0;
    if(key==='quality')return gearQualityRank(g);
    if(key==='slot')return Number(g.slot)||0;
    if(key==='job')return g.slot===1?-1:(Number(g.job)||0);
    return 0;
  }
  function forgeSortedGear(wearers){
    // Display account equipment even when its wearer is outside the active roster.
    // Fixed starter gear remains visible; its mutation restrictions are unchanged.
    // Compute each sort field once, instead of rescanning ownership and affixes
    // in every comparator call. This cache lasts for this render only.
    const items=state.bag.filter(g=>forgeWearFilter==='equipped'?wearers.has(g.id):!wearers.has(g.id)).map(g=>({g,quality:gearQualityRank(g),tier:forgeSortValue(g,'tier'),plus:Number(g.plus)||0,name:equipmentDisplayName(g),value:forgeSortValue(g,forgeSortKey)}));
    items.sort((a,b)=>{
      let diff=0;
      if(forgeSortKey==='name')diff=a.name.localeCompare(b.name,'zh-Hant');
      else diff=a.value-b.value;
      if(diff!==0)return forgeSortDirection==='asc'?diff:-diff;
      const qualityDiff=b.quality-a.quality;if(qualityDiff)return qualityDiff;
      const tierDiff=b.tier-a.tier;if(tierDiff)return tierDiff;
      const plusDiff=b.plus-a.plus;if(plusDiff)return plusDiff;
      return a.name.localeCompare(b.name,'zh-Hant');
    });
    return items.map(row=>row.g);
  }
  function forgeSortLabel(){
    return forgeSortDirection==='desc'?'高 → 低':'低 → 高';
  }
  globalThis.setForgeSort=function(key){
    if(!['equipped','tier','plus','quality','slot','job','name'].includes(key))return;
    forgeSortKey=key;render();
  };
  globalThis.toggleForgeSortDirection=function(){forgeSortDirection=forgeSortDirection==='desc'?'asc':'desc';render();};
  globalThis.setForgeWearFilter=function(mode){
    if(!['equipped','unequipped'].includes(mode)||forgeWearFilter===mode)return;
    forgeWearFilter=mode;forgePage=0;
    render();
  };
  globalThis.changeForgePage=function(step){
    if(step!==1&&step!==-1)return;
    forgePage=Math.max(0,forgePage+step);forgeSelection=null;render();
  };

  const forgeNavigationOpenForgeBase=openForge;
  openForge=function(id){
    const g=findGear(id);
    if(g)forgeWearFilter=gearWearer(g.id)?'equipped':'unequipped';
    return forgeNavigationOpenForgeBase(id);
  };

  function forgeListItem(g,selected){
    return gearSlotHTML(g,{selected,className:'forge-gear-item',onclick:`chooseForge('${g.id}')`});
  }

  function forgeDetail(g){
    if(!g)return `<div class="empty">沒有${forgeWearFilter==='equipped'?'已穿戴':'未穿戴'}裝備，請切換穿戴狀態或先探索取得裝備。</div>`;
    const wearer=gearWearer(g.id),draft=inlineAffixDrafts.has(affixDraftKey(g)),cost=rerollCostFor(g);
    const meta=[...forgeGearMeta(g),wearer?characterName(wearer)+'已穿戴':''].filter(Boolean).join(' · ');
    const header=`<div class="gear-detail-header"><div><span class="tag item-quality-${gearQualityRank(g)}">${qualityTag(g)}</span><h2>${equipmentNameHTML(g)}</h2><p class="small">${esc(meta)}</p></div></div>`;
    if(forgeIsToken(g))return header+`<div class="forge-layout"><article class="forge-preview"><h3>目前能力</h3><p>${esc(gearDesc(g))}</p>${globalThis.companionTokenDescription?.(g)?`<p class="small">${esc(companionTokenDescription(g))}</p>`:''}<p class="token-special">${esc(globalThis.companionTokenAbilityText?.(g)||'')}</p></article><div class="forge-controls"><section class="forge-action"><h3>信物強化</h3><p class="small">強化提升信物屬性，特殊能力保持原參數。</p>${g.plus<RULES.enhanceMax?`<p class="small">費用：${itemCostHTML(g)}</p><button class="primary" onclick="openForge('${g.id}')" ${!canEnhance(g)?'disabled':''}>強化至 +${g.plus+1}</button>`:`<p class="gold">已達 +${RULES.enhanceMax} 強化上限。</p>`}</section><section class="forge-action"><h3>固定複合屬性</h3><p class="small">信物無法洗鍊或重鑄基底。</p></section></div></div>`;
    let enhanceControls=`<p class="gold">已達 +${RULES.enhanceMax} 強化上限。</p>`;
    if(g.plus<RULES.enhanceMax){
      const current=gearBaseStats(g),next=gearBaseStats({...g,plus:g.plus+1});
      const gains=['atk','hp','def'].filter(k=>next[k]>current[k]).map(k=>`${{atk:'攻擊',hp:'生命',def:'防禦'}[k]} +${next[k]-current[k]}`).join(' / ')||'本次沒有能力增加';
      enhanceControls=`<p class="green">下一級 +${g.plus+1}，本次增加：${gains}</p><p class="small">費用：${itemCostHTML(g)} · 成功率 100%</p><button class="primary" onclick="enhance('${g.id}')" ${!canEnhance(g)?'disabled':''}>強化至 +${g.plus+1}</button>`;
    }
    const rerollControls=g.starterPack?'<p class="small starter-forge-lock-note">新手專屬裝備使用固定詞條，無法洗鍊或重鑄基底。</p>':`${uiHelp('洗鍊說明','每條詞條品質：'+qualityChanceText()+'。重骰時逐次扣款；自動洗鍊會在至少出現一條指定品質以上詞條時停止，每個未達條件的結果停留 1 秒。')}<p>◈ ${cost.gold} 金幣 ＋ ${itemSlotHTML('material','粉塵',{count:cost.dust})}／次</p><div class="actions"><button onclick="reroll('${g.id}')" ${draft||state.gold<cost.gold||state.dust<cost.dust?'disabled':''}>洗鍊一次</button><button onclick="autoReroll('${g.id}',2)" ${draft||state.gold<cost.gold||state.dust<cost.dust?'disabled':''}>自動洗到稀有+</button><button onclick="autoReroll('${g.id}',3)" ${draft||state.gold<cost.gold||state.dust<cost.dust?'disabled':''}>自動洗到傳說</button></div>`;
    return header+`<div class="forge-layout"><article class="forge-preview"><h3>目前能力</h3><p class="equipment-total-summary">${globalThis.equipmentTotalSummaryHTML(g)}</p>${globalThis.equipmentAttributeDetailsHTML(g)}</article><div class="forge-controls"><section class="forge-action"><h3>強化基礎能力</h3><p class="small">精煉依裝備 LV ${gearRequiredLevel(g)} 給予固定值，僅提升基底原有屬性，不受 T 級倍率影響。</p>${enhanceControls}</section><section class="forge-action"><h3>洗鍊隨機詞條</h3>${rerollControls}</section></div></div>${inlineAffixComparison(g)}`;
  }

  // Backpack no longer performs strengthening or rerolling directly. All such
  // actions preserve the selected gear and move to the dedicated forge page.
  inventoryGearDetail=function(g){
    if(!g)return `<div class="inventory-detail-empty"><b>沒有可顯示的裝備</b><p class="small">調整左側篩選條件後選擇裝備。</p></div>`;
    const wearer=gearWearer(g.id),worn=!!wearer,draft=inlineAffixDrafts.has(affixDraftKey(g)),locked=!!g.locked;
      const manageActions=`<button type="button" onclick="openInventoryWear('${g.id}')">穿戴</button><button onclick="toggleGearLock('${g.id}')">${locked?'解除鎖定':'鎖定'}</button><button onclick="sellGear('${g.id}')" ${worn||draft||locked||globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)===false?'disabled':''}>販賣 ${equipmentSellPrice(g)} 金幣</button><button class="danger" onclick="salvage('${g.id}')" ${worn||draft||locked?'disabled':''}>分解</button>`;
    return `<div class="inventory-detail-pane"><div class="inventory-detail-heading"><div><h2>${equipmentNameHTML(g)}</h2></div><span class="tag inventory-quality-tag item-quality-${gearQualityRank(g)}"><span class="effect-quality-${gearQualityRank(g)}">${qualityTag(g)}${locked?' · 已鎖定':''}</span></span></div><div class="inventory-detail-meta">${gearWearableJobsText(g)} · ${CLASS_GEAR[g.job][g.slot]} · LV ${gearRequiredLevel(g)} · ${Number.isInteger(g.powerTier)?'T'+g.powerTier:'T—'}${worn?' · 目前由 '+esc(characterName(wearer))+' 穿戴':''}</div><section class="inventory-detail-section"><h3>裝備能力</h3><p class="inventory-detail-stats equipment-total-summary">${globalThis.equipmentTotalSummaryHTML(g)}</p>${globalThis.equipmentAttributeDetailsHTML(g)}</section><section class="inventory-detail-section"><div class="actions inventory-detail-actions">${manageActions}</div>${draft?'<p class="inventory-detail-forge-note">這件裝備有待確認的洗鍊結果，請前往「裝備強化」處理。</p>':''}</section></div>`;
  };

  // Forge is now an account-level workbench: no character tabs, a sortable
  // equipment list on the left, and the selected equipment controls on right.
  forgeView=function(){
    ensureSharedGear();ensureAccountResources();
    const wearers=new Set(party.members.flatMap(h=>[...h.equipped,h.tokenId]).filter(Boolean));
    const items=forgeSortedGear(wearers),pages=Math.max(1,Math.ceil(items.length/forgePageSize));
    forgePage=Math.min(forgePage,pages-1);
    const selectedIndex=items.findIndex(g=>g.id===forgeSelection);
    if(selectedIndex>=0)forgePage=Math.floor(selectedIndex/forgePageSize);
    if(items.length&&selectedIndex<0)forgeSelection=items[forgePage*forgePageSize].id;
    if(!items.length)forgeSelection=null;
    const selected=items.find(g=>g.id===forgeSelection)||null;
    const equippedCount=state.bag.filter(g=>wearers.has(g.id)).length,unequippedCount=state.bag.length-equippedCount;
    const pageItems=items.slice(forgePage*forgePageSize,(forgePage+1)*forgePageSize);
    const pagination=pages>1?`<div class="forge-pagination" aria-label="強化裝備分頁"><button type="button" onclick="changeForgePage(-1)" ${forgePage===0?'disabled':''}>上一頁</button><span class="small">${forgePage+1} / ${pages} 頁 · ${forgePage*forgePageSize+1}–${Math.min(items.length,(forgePage+1)*forgePageSize)} 件</span><button type="button" onclick="changeForgePage(1)" ${forgePage===pages-1?'disabled':''}>下一頁</button></div>`:'';
    const sortOptions=[['quality','稀有度 → T 級'],['equipped','穿戴狀態'],['tier','T 級'],['plus','強化等級'],['slot','部位'],['job','職業'],['name','名稱']];
    const wearLabel=forgeWearFilter==='equipped'?'已穿戴':'未穿戴';
    return heading('FORGE / 裝備強化','強化與洗鍊',`<span class="tag">${wearLabel} · ${items.length} 件</span>`)+`<section class="panel forge-account-shell">${resourceLine()}${uiHelp('強化說明','背包與強化資源皆為帳號共用；此頁直接從左側裝備列表選擇目標，不需要先選角色。強化必定成功，最高 +'+RULES.enhanceMax+'。')}<div class="forge-workbench"><section class="forge-gear-pane"><div class="forge-gear-toolbar"><div class="row"><b>選擇裝備</b><span class="small">${items.length} 件</span></div><div class="forge-wear-toggle" role="group" aria-label="裝備穿戴狀態"><button type="button" class="${forgeWearFilter==='equipped'?'primary':''}" onclick="setForgeWearFilter('equipped')">已穿戴 ${equippedCount}</button><button type="button" class="${forgeWearFilter==='unequipped'?'primary':''}" onclick="setForgeWearFilter('unequipped')">未穿戴 ${unequippedCount}</button></div><div class="row"><label>排序 <select onchange="setForgeSort(this.value)">${sortOptions.map(([value,label])=>`<option value="${value}" ${forgeSortKey===value?'selected':''}>${label}</option>`).join('')}</select></label><button class="forge-sort-direction" onclick="toggleForgeSortDirection()">${forgeSortLabel()}</button></div>${pagination}</div><div class="forge-gear-list">${pageItems.map(g=>forgeListItem(g,g===selected)).join('')||`<p class="inventory-list-empty">沒有${wearLabel}裝備。</p>`}</div></section><section class="forge-detail-pane">${forgeDetail(selected)}</section></div></section>`;
  };

  const resetForgeSession=resetSession;
  resetSession=function(){const out=resetForgeSession();forgeSortKey='quality';forgeSortDirection='desc';forgeWearFilter='equipped';forgePage=0;return out;};

  if(state)render();
})();
