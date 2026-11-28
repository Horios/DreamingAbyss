
(()=>{
  // Equipment workshop (裝備工坊). The page is split into four categories; the
  // player places one item from the shared backpack (worn items included) into
  // the central slot, and only the operations that item actually supports are
  // offered below it. Backpack and worn pages only send items here.
  const CATEGORIES=[
    {id:'weapon',label:'武器',icon:'sword',hint:'武器與副手'},
    {id:'armor',label:'防具',icon:'shield',hint:'護甲'},
    {id:'accessory',label:'飾品',icon:'gem',hint:'飾品'},
    {id:'token',label:'信物',icon:'badge',hint:'夥伴信物'}
  ];
  const CATEGORY_IDS=CATEGORIES.map(c=>c.id);
  const ACTION_LABELS={enhance:'強化',reroll:'洗鍊',power:'重鑄',socket:'鑲嵌',extract:'信物萃取'};
  const forgePageSize=60;
  let workshopCategory='weapon';
  let workshopSlots={weapon:null,armor:null,accessory:null,token:null};
  let workshopPickerOpen=false;
  let workshopAction='enhance';
  let forgeSortKey='quality';
  let forgeSortDirection='desc';
  let forgeWearFilter='all';
  let forgePage=0;

  function forgeIsToken(g){return globalThis.EmberwildTokens?.isToken(g)===true;}
  function workshopCategoryOf(g){
    if(!g)return null;
    if(forgeIsToken(g))return 'token';
    if(g.slot===1)return 'armor';
    if(g.slot===3)return 'accessory';
    return 'weapon';
  }
  function lucideSVG(name){
    const nodes=globalThis.__EMBERWILD_LUCIDE?.nodes?.[name]||[];
    return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${nodes.map(([tag,attrs])=>`<${tag} ${Object.entries(attrs).map(([key,value])=>`${key}="${esc(value)}"`).join(' ')}></${tag}>`).join('')}</svg>`;
  }
  function forgeGearMeta(g){
    return forgeIsToken(g)?[companionTokenJobLabel(g),'信物']:[gearWearableJobsText(g),CLASS_GEAR[g.job][g.slot],`裝等 ${gearRequiredLevel(g)}`];
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
  function categoryGear(category){return state.bag.filter(g=>workshopCategoryOf(g)===category);}
  function forgeSortedGear(wearers){
    // Fixed starter gear remains visible; its mutation restrictions are unchanged.
    // Each sort field is computed once per render instead of in every comparison.
    const items=categoryGear(workshopCategory).filter(g=>forgeWearFilter==='all'||(forgeWearFilter==='equipped'?wearers.has(g.id):!wearers.has(g.id))).map(g=>({g,worn:wearers.has(g.id)?1:0,quality:gearQualityRank(g),tier:forgeSortValue(g,'tier'),plus:Number(g.plus)||0,name:equipmentDisplayName(g),value:forgeSortValue(g,forgeSortKey)}));
    items.sort((a,b)=>{
      let diff=0;
      if(forgeSortKey==='name')diff=a.name.localeCompare(b.name,'zh-Hant');
      else diff=a.value-b.value;
      if(diff!==0)return forgeSortDirection==='asc'?diff:-diff;
      const wornDiff=b.worn-a.worn;if(wornDiff)return wornDiff;
      const qualityDiff=b.quality-a.quality;if(qualityDiff)return qualityDiff;
      const tierDiff=b.tier-a.tier;if(tierDiff)return tierDiff;
      const plusDiff=b.plus-a.plus;if(plusDiff)return plusDiff;
      return a.name.localeCompare(b.name,'zh-Hant');
    });
    return items.map(row=>row.g);
  }
  function forgeSortLabel(){return forgeSortDirection==='desc'?'高 → 低':'低 → 高';}

  // Selection: forgeSelection stays the global "item on the bench" because the
  // core game, tests and older helpers read and write it directly.
  function syncWorkshopSelection(){
    const g=forgeSelection?findGear(forgeSelection):null;
    if(g){const category=workshopCategoryOf(g);workshopCategory=category;workshopSlots[category]=g.id;return g;}
    if(forgeSelection)workshopSlots[workshopCategory]=null;
    forgeSelection=null;
    return null;
  }
  function workshopActions(g){
    if(!g)return [];
    const X=globalThis.__EMBERWILD_SKILL_EXTRACTION;
    if(forgeIsToken(g))return X?['enhance','extract']:['enhance'];
    const out=[];
    if(globalThis.__EMBERWILD_ENHANCE?.enhanceable(g)??true)out.push('enhance');
    if(!g.starterPack&&g.canReroll!==false)out.push('reroll');
    if(!g.starterPack&&g.equipmentSource!=='shop'&&typeof globalThis.equipmentPowerRerollHTML==='function')out.push('power');
    if(g.skillSockets?.count>0&&typeof globalThis.__EMBERWILD_SKILL_SYSTEM_UI?.sockets==='function')out.push('socket');
    if(X?.gearSkill(g))out.push('extract');
    return out;
  }

  globalThis.setWorkshopCategory=function(id){
    if(!CATEGORY_IDS.includes(id))return false;
    syncWorkshopSelection();
    if(workshopCategory!==id){workshopCategory=id;forgePage=0;}
    const kept=workshopSlots[id]?findGear(workshopSlots[id]):null;
    forgeSelection=kept&&workshopCategoryOf(kept)===id?kept.id:null;
    if(!forgeSelection)workshopSlots[id]=null;
    workshopPickerOpen=false;
    render();return true;
  };
  globalThis.toggleWorkshopPicker=function(force){
    const wasOpen=workshopPickerOpen;
    workshopPickerOpen=typeof force==='boolean'?force:!workshopPickerOpen;
    // Opening the picker shows the page that holds the item on the bench.
    if(workshopPickerOpen&&!wasOpen)forgePage=-1;
    render();return workshopPickerOpen;
  };
  globalThis.clearWorkshopSlot=function(){
    syncWorkshopSelection();
    workshopSlots[workshopCategory]=null;forgeSelection=null;workshopPickerOpen=false;
    render();return true;
  };
  globalThis.setWorkshopAction=function(action){
    if(!Object.hasOwn(ACTION_LABELS,action))return false;
    workshopAction=action;render();return true;
  };
  globalThis.setForgeSort=function(key){
    if(!['equipped','tier','plus','quality','slot','job','name'].includes(key))return;
    forgeSortKey=key;render();
  };
  globalThis.toggleForgeSortDirection=function(){forgeSortDirection=forgeSortDirection==='desc'?'asc':'desc';render();};
  globalThis.setForgeWearFilter=function(mode){
    if(!['all','equipped','unequipped'].includes(mode)||forgeWearFilter===mode)return;
    forgeWearFilter=mode;forgePage=0;workshopPickerOpen=true;
    render();
  };
  globalThis.changeForgePage=function(step){
    if(step!==1&&step!==-1)return;
    forgePage=Math.max(0,forgePage+step);render();
  };

  function placeOnBench(id){
    const g=findGear(id);if(!g)return null;
    const category=workshopCategoryOf(g);
    if(category!==workshopCategory)forgePage=0;
    workshopCategory=category;workshopSlots[category]=g.id;workshopPickerOpen=false;
    if(!workshopActions(g).includes(workshopAction))workshopAction=workshopActions(g)[0]||'enhance';
    return g;
  }
  const workshopChooseForgeBase=chooseForge;
  chooseForge=function(id){if(!placeOnBench(id))return;return workshopChooseForgeBase(id);};
  const workshopOpenForgeBase=openForge;
  openForge=function(id){if(!placeOnBench(id))return;return workshopOpenForgeBase(id);};

  function pickerItem(g,selected){
    const wearer=gearWearer(g.id);
    return `<div class="workshop-pick-row">${gearSlotHTML(g,{selected,className:'forge-gear-item',onclick:`chooseForge('${g.id}')`})}<span class="workshop-pick-meta small">${esc([...forgeGearMeta(g),wearer?characterName(wearer)+' 穿戴中':''].filter(Boolean).join(' · '))}</span></div>`;
  }
  function pickerView(wearers,selected){
    const items=forgeSortedGear(wearers),pages=Math.max(1,Math.ceil(items.length/forgePageSize));
    if(forgePage<0){const index=selected?items.indexOf(selected):-1;forgePage=index>=0?Math.floor(index/forgePageSize):0;}
    forgePage=Math.min(forgePage,pages-1);
    const pageItems=items.slice(forgePage*forgePageSize,(forgePage+1)*forgePageSize);
    const all=categoryGear(workshopCategory),equippedCount=all.filter(g=>wearers.has(g.id)).length;
    const category=CATEGORIES.find(c=>c.id===workshopCategory);
    const pagination=pages>1?`<div class="forge-pagination" aria-label="工坊裝備分頁"><button type="button" onclick="changeForgePage(-1)" ${forgePage===0?'disabled':''}>上一頁</button><span class="small">${forgePage+1} / ${pages} 頁 · ${forgePage*forgePageSize+1}–${Math.min(items.length,(forgePage+1)*forgePageSize)} 件</span><button type="button" onclick="changeForgePage(1)" ${forgePage===pages-1?'disabled':''}>下一頁</button></div>`:'';
    const sortOptions=[['quality','稀有度 → T 級'],['equipped','穿戴狀態'],['tier','T 級'],['plus','強化等級'],['slot','部位'],['job','職業'],['name','名稱']];
    const wear=[['all',`全部 ${all.length}`],['equipped',`穿戴中 ${equippedCount}`],['unequipped',`未穿戴 ${all.length-equippedCount}`]];
    return `<section class="workshop-picker" aria-label="選擇放入工坊的${esc(category.label)}"><div class="workshop-picker-toolbar"><div class="row"><b>選擇${esc(category.hint)}</b><button type="button" class="workshop-picker-close" onclick="toggleWorkshopPicker(false)">收起</button></div><div class="forge-wear-toggle" role="group" aria-label="裝備穿戴狀態">${wear.map(([mode,label])=>`<button type="button" class="${forgeWearFilter===mode?'primary':''}" aria-pressed="${forgeWearFilter===mode}" onclick="setForgeWearFilter('${mode}')">${label}</button>`).join('')}</div><div class="row"><label>排序 <select onchange="setForgeSort(this.value)">${sortOptions.map(([value,label])=>`<option value="${value}" ${forgeSortKey===value?'selected':''}>${label}</option>`).join('')}</select></label><button type="button" class="forge-sort-direction" onclick="toggleForgeSortDirection()">${forgeSortLabel()}</button></div>${pagination}</div><div class="workshop-picker-list forge-gear-list">${pageItems.map(g=>pickerItem(g,g===selected)).join('')||`<p class="inventory-list-empty">物品欄沒有符合條件的${esc(category.label)}。</p>`}</div></section>`;
  }

  function benchView(g){
    const category=CATEGORIES.find(c=>c.id===workshopCategory);
    if(!g)return `<div class="workshop-bench"><button type="button" class="workshop-slot empty" aria-expanded="${workshopPickerOpen}" onclick="toggleWorkshopPicker()"><span class="workshop-slot-icon">${lucideSVG('plus')}</span><span><b>放入${esc(category.label)}</b><small>點擊後從物品欄（含穿戴中）選擇${esc(category.hint)}</small></span></button></div>`;
    const wearer=gearWearer(g.id);
    const meta=[qualityTag(g),...forgeGearMeta(g),wearer?characterName(wearer)+' 穿戴中':'未穿戴'].filter(Boolean).join(' · ');
    const summary=forgeIsToken(g)?esc(gearDesc(g)):globalThis.equipmentTotalSummaryHTML(g);
    return `<div class="workshop-bench"><button type="button" class="workshop-slot filled item-quality-${gearQualityRank(g)}" aria-expanded="${workshopPickerOpen}" title="點擊更換" onclick="toggleWorkshopPicker()">${gearSlotHTML(g,{contentOnly:true})}<span class="workshop-slot-text"><b>${equipmentNameHTML(g)}</b><small>${esc(meta)}</small><span class="workshop-slot-summary equipment-total-summary">${summary}</span></span></button><div class="workshop-bench-actions"><button type="button" onclick="toggleWorkshopPicker()">更換</button><button type="button" onclick="clearWorkshopSlot()">取出</button></div></div>`;
  }

  // v0.180 rules (success rate, failure, destruction, cumulative bonus) live in js/equipment/enhancement-rules.js.
  function enhancePanel(g){
    const E=globalThis.__EMBERWILD_ENHANCE,controls=E?.controlsHTML(g)||'',table=E?uiHelp('強化表',E.tableHTML(),true):'';
    if(forgeIsToken(g))return `<section class="forge-action"><h3>信物強化</h3><p class="small">強化依裝備強化表：+4 起可能失敗退級，+11、+12 失敗會損毀信物。強化提高信物屬性，特殊能力保持原參數。</p>${controls}${table}</section>`;
    return `<section class="forge-action"><h3>強化基礎能力</h3><p class="small">強化依累計百分比或裝備需求等級的最低收益，取較高者增加原有基礎攻擊、生命、防禦；詞條、寶石與裝備技能不受影響。每次嘗試都會消耗材料，失敗可能退級或損毀。</p>${controls}${table}</section>`;
  }
  function rerollPanel(g){
    const draft=inlineAffixDrafts.has(affixDraftKey(g)),cost=rerollCostFor(g),poor=state.gold<cost.gold||state.dust<cost.dust;
    return `<section class="forge-action"><h3>洗鍊隨機詞條</h3>${uiHelp('洗鍊說明','每條詞條品質：'+qualityChanceText()+'。重骰時逐次扣款；自動洗鍊會在至少出現一條指定品質以上詞條時停止，每個未達條件的結果停留 1 秒。')}<p>◈ ${cost.gold} 金幣 ＋ ${itemSlotHTML('material','粉塵',{count:cost.dust})}／次</p><div class="actions"><button onclick="reroll('${g.id}')" ${draft||poor?'disabled':''}>洗鍊一次</button><button onclick="autoReroll('${g.id}',2)" ${draft||poor?'disabled':''}>自動洗到稀有+</button><button onclick="autoReroll('${g.id}',3)" ${draft||poor?'disabled':''}>自動洗到傳說</button></div></section>${inlineAffixComparison(g)}`;
  }
  function actionPanel(g,action){
    if(action==='enhance')return enhancePanel(g);
    if(action==='reroll')return rerollPanel(g);
    if(action==='power')return globalThis.equipmentPowerRerollHTML(g);
    if(action==='socket')return __EMBERWILD_SKILL_SYSTEM_UI.sockets(g);
    if(action==='extract')return __EMBERWILD_SKILL_EXTRACTION.workshopHTML(g);
    return '';
  }
  function abilityView(g){
    const body=forgeIsToken(g)?`<p>${esc(gearDesc(g))}</p>${globalThis.companionTokenDescription?.(g)?`<p class="small">${esc(companionTokenDescription(g))}</p>`:''}<p class="token-special">${esc(globalThis.companionTokenAbilityText?.(g)||'')}</p>`:`<p class="equipment-total-summary">${globalThis.equipmentTotalSummaryHTML(g)}</p>${globalThis.equipmentAttributeDetailsHTML(g)}`;
    return `<details class="workshop-ability forge-preview"><summary>目前能力</summary>${body}</details>`;
  }
  function operationsView(g){
    const actions=workshopActions(g);
    if(inlineAffixDrafts.has(affixDraftKey(g))&&actions.includes('reroll'))workshopAction='reroll';
    if(!actions.length)return `<section class="workshop-operations"><p class="eyebrow">目前裝備操作</p><p class="small">這件物品沒有可以在工坊進行的操作。</p></section>${abilityView(g)}`;
    if(!actions.includes(workshopAction))workshopAction=actions[0];
    const tabs=`<div class="workshop-action-tabs" role="tablist" aria-label="目前裝備操作">${actions.map(a=>`<button type="button" role="tab" data-workshop-action="${a}" aria-selected="${a===workshopAction}" class="${a===workshopAction?'selected':''}" onclick="setWorkshopAction('${a}')">${ACTION_LABELS[a]}</button>`).join('')}</div>`;
    // Every available panel is rendered; inactive panels are hidden so wrapper
    // modules that inspect the page HTML still see each control.
    const panels=actions.map(a=>`<div class="workshop-action-panel" role="tabpanel" data-workshop-panel="${a}" ${a===workshopAction?'':'hidden'}>${actionPanel(g,a)}</div>`).join('');
    const locked=g.starterPack?'<p class="small starter-forge-lock-note">新手專屬裝備使用固定詞條，無法洗鍊或重鑄基底。</p>':forgeIsToken(g)?'<p class="small">信物使用固定複合屬性，無法洗鍊或重鑄基底。</p>':'';
    return `<section class="workshop-operations"><p class="eyebrow">目前裝備操作</p>${tabs}${panels}${locked}</section>${abilityView(g)}`;
  }

  // Backpack no longer performs strengthening or rerolling directly; it only
  // sends the selected gear to the workshop.
  inventoryGearDetail=function(g){
    if(!g)return `<div class="inventory-detail-empty"><b>沒有可顯示的裝備</b><p class="small">調整左側篩選條件後選擇裝備。</p></div>`;
    const wearer=gearWearer(g.id),worn=!!wearer,draft=inlineAffixDrafts.has(affixDraftKey(g)),locked=!!g.locked;
    const manageActions=`<button type="button" onclick="openInventoryWear('${g.id}')">穿戴</button><button type="button" onclick="moveToWorkshop('${g.id}')">移到工坊</button><button onclick="toggleGearLock('${g.id}')">${locked?'解除鎖定':'鎖定'}</button><button onclick="sellGear('${g.id}')" ${worn||draft||locked||globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)===false?'disabled':''}>販賣 ${equipmentSellPrice(g)} 金幣</button><button class="danger" onclick="salvage('${g.id}')" ${worn||draft||locked?'disabled':''}>分解</button>`;
    return `<div class="inventory-detail-pane"><div class="inventory-detail-heading"><div><h2>${equipmentNameHTML(g)}</h2></div><span class="tag inventory-quality-tag item-quality-${gearQualityRank(g)}"><span class="effect-quality-${gearQualityRank(g)}">${qualityTag(g)}${locked?' · 已鎖定':''}</span></span></div><div class="inventory-detail-meta">${gearWearableJobsText(g)} · ${CLASS_GEAR[g.job][g.slot]} · LV ${gearRequiredLevel(g)} · ${Number.isInteger(g.powerTier)?'T'+g.powerTier:'T—'}${worn?' · 目前由 '+esc(characterName(wearer))+' 穿戴':''}</div><section class="inventory-detail-section"><h3>裝備能力</h3><p class="inventory-detail-stats equipment-total-summary">${globalThis.equipmentTotalSummaryHTML(g)}</p>${globalThis.equipmentAttributeDetailsHTML(g)}</section><section class="inventory-detail-section"><div class="actions inventory-detail-actions">${manageActions}</div>${draft?'<p class="inventory-detail-forge-note">這件裝備有待確認的洗鍊結果，請前往「裝備工坊」處理。</p>':''}</section></div>`;
  };
  // Shared entry for every "移到工坊" button (backpack, worn gear, tokens).
  globalThis.moveToWorkshop=function(id){if(!findGear(id))return false;openForge(id);return true;};

  forgeView=function(){
    ensureSharedGear();ensureAccountResources();
    const wearers=new Set(party.members.flatMap(h=>[...h.equipped,h.tokenId]).filter(Boolean));
    const selected=syncWorkshopSelection();
    if(!selected&&!categoryGear(workshopCategory).length)workshopPickerOpen=false;
    const categoryTabs=`<div class="workshop-categories" role="tablist" aria-label="工坊分類">${CATEGORIES.map(c=>{const count=categoryGear(c.id).length;return `<button type="button" role="tab" data-workshop-category="${c.id}" aria-selected="${c.id===workshopCategory}" class="${c.id===workshopCategory?'selected':''}" onclick="setWorkshopCategory('${c.id}')">${lucideSVG(c.icon)}<span>${c.label}</span><small>${count}</small></button>`;}).join('')}</div>`;
    const picker=workshopPickerOpen?pickerView(wearers,selected):'';
    const body=selected?operationsView(selected):`<p class="empty workshop-empty">${categoryGear(workshopCategory).length?'點擊上方空格放入物品後，下方會列出可進行的操作。':'物品欄目前沒有這個分類的物品。'}</p>`;
    const tag=selected?`<span class="tag">${esc(CATEGORIES.find(c=>c.id===workshopCategory).label)} · 已放入</span>`:'';
    return heading('WORKSHOP / 裝備工坊','裝備工坊',tag)+`<section class="panel forge-account-shell workshop-shell">${resourceLine()}${uiHelp('工坊說明','背包與工坊資源皆為帳號共用。先選擇分類，點擊中間空格從物品欄（含穿戴中）放入物品，下方只會顯示這件物品可以進行的操作。強化 +4 起可能失敗退級，+11 與 +12 失敗會損毀；飾品無法強化。')}${categoryTabs}${benchView(selected)}${picker}${body}</section>`;
  };

  const resetForgeSession=resetSession;
  resetSession=function(){const out=resetForgeSession();workshopCategory='weapon';workshopSlots={weapon:null,armor:null,accessory:null,token:null};workshopPickerOpen=false;workshopAction='enhance';forgeSortKey='quality';forgeSortDirection='desc';forgeWearFilter='all';forgePage=0;return out;};

  globalThis.__EMBERWILD_WORKSHOP=Object.freeze({categoryOf:workshopCategoryOf,actions:g=>workshopActions(g).slice(),state:()=>({category:workshopCategory,pickerOpen:workshopPickerOpen,action:workshopAction,slots:{...workshopSlots}})});

  if(state)render();
})();
