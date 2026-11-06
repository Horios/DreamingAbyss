/* All manual disposal paths share the existing prices/reward functions and the
   same reference audit. Battle overflow stays in the bag and pauses exploration. */
(()=>{
  const T=__EMBERWILD_TEAMS,M=EmberwildTeams,copy=M.copy;
  const disposable=g=>g&&!g.locked&&!inlineAffixDrafts.has(affixDraftKey(g));


  // Combat owns the persisted snapshot; inventory and comparisons read live gear.
  const liveEquipment=equipment;
  function withLiveEquipment(read){return globalThis.EmberwildBattleConfiguration?EmberwildBattleConfiguration.editable(read):read();}
  function currentBattleGearIds(){
    const ids=new Set();
    if(!party||!T.busy())return ids;
    for(const h of heroes())for(const g of liveEquipment(h))if(g?.id)ids.add(g.id);
    return ids;
  }

  function dispose(ids,mode,includeEnhance=true,options={}){
    if(!party)return false;
    ensureBoard();T.capture();
    let items=[...new Set(ids)].map(findGear).filter(g=>disposable(g)&&!globalThis.__EMBERWILD_STORY?.protectedGear(g)&&(mode!=='sell'||globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)!==false)&&(!options.batch||!gearWearer(g.id)&&!M.references(T.build(),g.id).length));if(!items.length)return false;
    const verb=mode==='sell'?'販售':'分解',activeIds=currentBattleGearIds(),blocked=items.filter(g=>activeIds.has(g.id));
    items=items.filter(g=>!activeIds.has(g.id));
    if(!items.length){toast('目前戰鬥隊伍正在使用的裝備無法'+verb);return false;}
    const refs=new Map();for(const g of items)for(const p of M.references(T.build(),g.id))refs.set(p.id,p.name);
    if(refs.size&&!confirm(`此${items.length>1?'批裝備':'裝備'}正在其他隊伍或目前未出戰的配置中使用：${[...refs.values()].join('、')}。\n目前戰鬥隊伍使用中的裝備不會被處理；若繼續${verb}，相關裝備／信物欄位會清空且不自動補裝。確定繼續？`))return false;
    if(!options.reviewed&&!refs.size&&(items.length>1||items.some(g=>g.boss!==undefined))&&!confirm(`確定${verb} ${items.length} 件裝備？物品實體將失去，無法復原。`))return false;
    if(mode==='sell'&&state.gold+items.reduce((n,g)=>n+equipmentSellPrice(g),0)>1e12){toast('金幣已達上限，裝備已保留');return false;}
    const b=copy(T.build()),bag=state.bag,selected=party.selected,hp=party.members.map(h=>h.hp),memberGear=party.members.map(x=>({equipped:copy(x.equipped),tokenId:x.tokenId})),h=T.player(),resource={};
    for(const k of ['gold','ore','dust','gems','materials','potions','consumables'])resource[k]=copy(h[k]);
    const healingPotions=copy(healingInventory()),oldBoard=copy(h.board);
    const removed=new Set(items.map(g=>g.id));
    try{
      M.clearReferences(T.build(),[...removed]);
      for(const x of party.members){x.equipped=x.equipped.map(id=>removed.has(id)?null:id);if(removed.has(x.tokenId))x.tokenId=null;}
      let total=0;for(const g of items){globalThis.__EMBERWILD_EQUIPMENT_SKILLS?.refund(g,h);if(mode==='sell'){const price=equipmentSellPrice(g);h.gold+=price;total+=price;}else grantSalvageRewards(g,includeEnhance);}
      state.bag=bag.filter(g=>!removed.has(g.id));if(mode==='salvage')globalThis.recordDailyProgress?.('salvage','',items.length);
      for(const x of party.members)x.hp=Math.min(x.hp,stats(x).hp);
      if(save()===false)throw Error('儲存失敗');pruneGearSelections();render();toast(`已${verb} ${items.length} 件装備${mode==='sell'?'，獲得 '+total+' 金幣':''}${blocked.length?'；略過 '+blocked.length+' 件目前戰鬥隊伍裝備':''}`);return true;
    }catch(e){h.board=oldBoard;party.buildSystem=b;state.bag=bag;for(const k of Object.keys(resource))h[k]=resource[k];const inv=healingInventory();for(const k of Object.keys(inv))delete inv[k];Object.assign(inv,healingPotions);party.selected=selected;state=partyMember(selected)||h;party.members.forEach((x,i)=>{x.equipped=copy(memberGear[i].equipped);x.tokenId=memberGear[i].tokenId;x.hp=hp[i];});toast('操作未保存：'+e.message);return false;}
  }
  salvage=id=>dispose([id],'salvage');globalThis.sellGear=id=>dispose([id],'sell');
  globalThis.sellAllGearByQuality=q=>Number.isInteger(q)&&q>=0&&q<=3&&dispose(state.bag.filter(g=>gearQualityRank(g)===q).map(g=>g.id),'sell',true,{batch:true});
  salvageAll=()=>dispose(state.bag.filter(g=>!MToken(g)&&gearQualityRank(g)===0&&(g.plus||0)===0&&!g.affix.length&&g.boss===undefined).map(g=>g.id),'salvage',false,{batch:true});
  const MToken=g=>EmberwildTokens.isToken(g);
  massSalvageTargets=ids=>{const active=currentBattleGearIds();return state.bag.filter(g=>ids.includes(g.id)&&disposable(g)&&!gearWearer(g.id)&&!M.references(T.build(),g.id).length&&!active.has(g.id));};
  requestMassSalvage=q=>Number.isInteger(q)&&q>=0&&q<=3&&dispose(state.bag.filter(g=>!MToken(g)&&gearQualityRank(g)===q).map(g=>g.id),'salvage',true,{batch:true});
  confirmMassSalvage=()=>{if(!massSalvageIds)return false;const ok=dispose(massSalvageIds,'salvage',true,{batch:true});if(ok){massSalvageIds=null;closeModal();}return ok;};

  // Enhancing or accepting new affixes on an item used by the current encounter
  // is allowed. The encounter snapshot above keeps its old combat values until
  // the next group is spawned.
  const enhanceBase=enhance;
  enhance=function(id){
    const g=findGear(id),deferred=!!g&&T.busy()&&currentBattleGearIds().has(id),before=g?.plus;
    const out=enhanceBase(id);
    if(deferred&&g&&g.plus!==before)toast('已強化至 +'+g.plus+'；目前戰鬥沿用原裝備能力，下一場戰鬥生效');
    return out;
  };
  const resolveInlineAffixBase=typeof resolveInlineAffix==='function'?resolveInlineAffix:null;
  if(resolveInlineAffixBase)resolveInlineAffix=function(id,accept){
    const g=findGear(id),deferred=!!accept&&!!g&&T.busy()&&currentBattleGearIds().has(id),before=g?JSON.stringify(g.affix):'';
    const out=resolveInlineAffixBase(id,accept);
    if(deferred&&g&&JSON.stringify(g.affix)!==before)toast('已套用洗鍊詞條；目前戰鬥沿用原裝備能力，下一場戰鬥生效');
    return out;
  };

  // Existing detail UI disabled worn gear. Other-team references now have a
  // force-confirm path; only gear used by the current encounter remains locked.
  const detailBase=inventoryGearDetail;
  inventoryGearDetail=function(g){
    let html=detailBase(g);if(!g)return html;
    const combatLocked=T.busy()&&currentBattleGearIds().has(g.id);
    // The final forge-navigation renderer replaced the earlier sale UI.
    if(!html.includes('onclick="sellGear('))html=html.replace('<div class="actions inventory-detail-actions">',`<div class="actions inventory-detail-actions"><button class="sell-gear-button" onclick="sellGear('${g.id}')" ${!disposable(g)||combatLocked?'disabled':''}>販售 ${equipmentSellPrice(g)} 金幣</button>`);
    if(disposable(g)&&!combatLocked)html=html.replace(/(<button\b[^>]*onclick="(?:sellGear|salvage)\([^\"]*"[^>]*)\sdisabled/g,'$1');
    const refs=T.build()?M.references(T.build(),g.id):[];
    if(combatLocked)html+=`<p class="small">目前戰鬥隊伍正在使用此裝備，戰鬥／遭遇結束前不可販售或分解；強化與洗鍊可進行，但能力從下一場戰鬥開始生效。</p>`;
    else if(refs.length)html+=`<p class="small">此裝備正在其他隊伍或目前未出戰的配置中使用：${refs.map(p=>esc(p.name)).join('、')} · 販售或分解前會再次確認，確認後清空所有引用。</p>`;
    return html;
  };
  const bulkBase=bulkSalvageControls;
  bulkSalvageControls=function(){return bulkBase().replace('已鎖定、已穿戴、待確認洗鍊的裝備不會分解。BOSS 專屬裝備會再次確認。','已鎖定與待確認洗鍊的裝備保留；目前戰鬥隊伍裝備不會分解，其他隊伍引用會先提醒。');};
  const equipmentBase=equipmentView;equipmentView=function(){let html=equipmentBase();const active=currentBattleGearIds();html=html.replace(/(<button\b[^>]*onclick="salvage\('([^']+)'\)"[^>]*)\sdisabled/g,(full,prefix,id)=>disposable(findGear(id))&&!active.has(id)?prefix:full);return html;};
  globalThis.__EMBERWILD_TEAM_EQUIPMENT={dispose,references:id=>M.references(T.build(),id),currentBattleGearIds,withLiveEquipment};
})();
