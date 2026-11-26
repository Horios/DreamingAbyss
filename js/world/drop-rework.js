/* v0.206 monster drop rework runtime (rules in js/world/drop-rework-model.js).
   - Old balance documents are migrated before validation: shared random gear, legendary gear, random gem, potion and
     dust drop rules are removed.
   - Every equipment granted by a monster's drop rules enters the bag unidentified. The item is fully generated at the drop
     (form, level, quality, stats, affixes, sockets, skills); identification only removes the flag, keeps the instance id
     and never rolls anything. Unidentified gear shows only its slot and level and cannot be worn, enhanced, rerolled,
     socketed, sold or salvaged.
   - Gem upgrade with dust replaces the dust gem craft: one gem of the chosen stack goes up one tier.
   Loaded late (after the reward, inventory and forge wrappers) so these wrappers are the outermost ones. */
(()=>{
  'use strict';
  const D=EmberwildDropRework,SLOT_NAMES=['武器','護甲','副手','飾品'];
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isToken=g=>!!globalThis.EmberwildTokens?.isToken(g);
  const hidden=g=>!!g?.unidentified;
  const unidentifiedName=g=>'未鑑定'+(SLOT_NAMES[g?.unidentified?.slot??g?.slot]||'裝備');
  globalThis.isUnidentifiedGear=hidden;globalThis.unidentifiedGearName=unidentifiedName;

  /* ---------- balance documents ---------- */
  const settingsDefaults=()=>GAMEPLAY_SETTINGS_DEFAULTS.equipment.exclusiveEnhance;
  if(typeof normalizeGameplaySettings==='function'){
    const base=normalizeGameplaySettings;
    normalizeGameplaySettings=function(input,...args){
      const src=D.migrateDocument(input);
      const out=base.call(this,src,...args);
      // The binding list is a free-length list of objects; the shape merge keeps only default rows, so it is copied here.
      const raw=src?.equipment?.exclusiveEnhance;
      out.equipment.exclusiveEnhance={quantityByLevel:[...out.equipment.exclusiveEnhance.quantityByLevel],bindings:clone(Array.isArray(raw?.bindings)?raw.bindings:settingsDefaults().bindings)};
      const errors=[...D.exclusiveIssues(out.equipment.exclusiveEnhance),...D.gemUpgradeIssues(out.skills?.gems?.dustUpgrade),...D.gemSalvageIssues(out.skills?.gems?.dustSalvage)];
      if(errors.length)throw Error(errors.join('\n'));
      return out;
    };
  }
  for(const name of ['validateBalanceConfig','applyBalanceConfig']){
    if(typeof globalThis[name]!=='function')continue;
    const base=globalThis[name];
    globalThis[name]=function(input,...args){return base.call(this,D.migrateDocument(input),...args);};
  }

  /* ---------- labels for drop tables and the bestiary ---------- */
  function formName(key){const r=D.parseForm(key),f=r&&(typeof ITEM_FORMS!=='undefined'?ITEM_FORMS:[])[r.job]?.[r.slot]?.[r.index];return f?.name||key;}
  globalThis.dropRulePoolLabel=function(rule){
    if(rule?.type==='monsterGear')return (rule.pool||[]).map(p=>formName(p.key)).join('／')+'（未鑑定）';
    if(rule?.type==='gemPool'){const total=(rule.pool||[]).reduce((n,p)=>n+p.weight,0);return (rule.pool||[]).map(p=>GEMS[Number(p.key)]?.name+(rule.pool.length>1?' '+Math.round(p.weight/total*100)+'%':'')).join('／');}
    return rule?.name||'';
  };

  /* ---------- unidentified monster loot ---------- */
  let lootContext=null;
  if(typeof rollConfiguredDrops==='function'){
    const base=rollConfiguredDrops;
    rollConfiguredDrops=function(e,...args){
      const previous=lootContext;
      lootContext={monsterId:e?.monsterId||(typeof resolveMonsterCatalogId==='function'?resolveMonsterCatalogId(e):null)||null,kind:e?.kind||'normal',difficulty:e?.difficulty||0,region:e?.region??party?.map??0,level:e?.lv??null};
      try{return base.call(this,e,...args);}finally{lootContext=previous;}
    };
  }
  const baseAddGear=addGear;
  addGear=function(g,...args){
    if(!lootContext||!g||hidden(g)||isToken(g))return baseAddGear.call(this,g,...args);
    g.unidentified={version:1,slot:g.slot,level:typeof gearRequiredLevel==='function'?gearRequiredLevel(g):g.equipmentLevel??null,source:{...lootContext},at:Date.now()};
    // Journal lines written while the item is added name only the slot, never the quality or the item.
    const realNote=note;note=function(text,...rest){return realNote.call(this,/背包已滿/.test(String(text))?text:'獲得 '+unidentifiedName(g),...rest);};
    try{return baseAddGear.call(this,g,...args);}finally{note=realNote;}
  };

  /* ---------- presentation: slot and level only ---------- */
  const baseDisplay=equipmentDisplayName;equipmentDisplayName=function(g,...args){return hidden(g)?unidentifiedName(g):baseDisplay.call(this,g,...args);};
  if(typeof equipmentNameHTML==='function'){const base=equipmentNameHTML;equipmentNameHTML=function(g,...args){return hidden(g)?`<span class="gear-unidentified-name">${esc(unidentifiedName(g))}</span>`:base.call(this,g,...args);};}
  if(typeof equipmentNameClass==='function'){const base=equipmentNameClass;equipmentNameClass=function(g,...args){return hidden(g)?'gear-unidentified-name':base.call(this,g,...args);};}
  if(typeof gearDesc==='function'){const base=gearDesc;gearDesc=function(g,...args){return hidden(g)?'尚未鑑定':base.call(this,g,...args);};}
  for(const name of ['equipmentTotalSummaryHTML','equipmentAttributeDetailsHTML']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(g,...args){return hidden(g)?'':base.call(this,g,...args);};}
  function unidentifiedDetail(g){
    const u=g.unidentified;
    return `<div class="gear-unidentified-detail" data-unidentified-gear="${esc(g.id)}"><p><b>${esc(unidentifiedName(g))}</b> · <span class="tag">未鑑定</span></p><p>部位：${esc(SLOT_NAMES[u.slot]||'—')} · 裝等 ${esc(u.level??'—')}</p><p class="small">鑑定後才會顯示名稱、品質、能力、詞條、孔位與技能。鑑定免費，必定成功，不會改變裝備內容。</p><div class="actions"><button type="button" class="primary" onclick="identifyGear('${esc(g.id)}')">鑑定</button></div></div>`;
  }
  globalThis.unidentifiedGearDetailHTML=unidentifiedDetail;
  if(typeof globalThis.gearInfoDetailHTML==='function'){const base=globalThis.gearInfoDetailHTML;globalThis.gearInfoDetailHTML=function(g,...args){return hidden(g)?unidentifiedDetail(g):base.call(this,g,...args);};}
  if(typeof inventoryGearDetail==='function'){const base=inventoryGearDetail;inventoryGearDetail=function(g,...args){return hidden(g)?unidentifiedDetail(g):base.call(this,g,...args);};}
  if(typeof inlineInventoryView==='function'){
    const base=inlineInventoryView;
    inlineInventoryView=function(...args){
      const n=(state?.bag||[]).filter(hidden).length;
      return `<div class="identify-bar"><span class="small">未鑑定裝備 ${n} 件</span><button type="button" class="${n?'primary':''}" onclick="identifyAllGear()" ${n?'':'disabled'}>一鍵鑑定</button></div>`+base.apply(this,args);
    };
  }

  /* ---------- actions blocked before identification ---------- */
  const refuse=()=>{toast('請先鑑定這件裝備');return false;};
  const byId=id=>typeof findGear==='function'?findGear(id):null;
  if(typeof eligibleWearers==='function'){const base=eligibleWearers;eligibleWearers=function(g,...args){return hidden(g)?[]:base.call(this,g,...args);};}
  const guard=(name,pick=args=>byId(args[0]))=>{const base=globalThis[name];if(typeof base!=='function')return;globalThis[name]=function(...args){return hidden(pick(args))?refuse():base.apply(this,args);};};
  for(const name of ['equipSharedGear','previewEquip','enhance','reroll','salvage','sellGear','moveToWorkshop','socketEquipmentGem','rerollEquipmentPowerTier','openInventoryWear','extractGearSkill'])guard(name);
  if(typeof canEnhance==='function'){const base=canEnhance;canEnhance=function(g,...args){return !hidden(g)&&base.call(this,g,...args);};globalThis.canEnhance=canEnhance;}
  /* Bulk sale and salvage never include unidentified gear: they are set aside for the call and put back in place. */
  function withoutUnidentified(fn){
    const all=state.bag,keep=all.filter(hidden);if(!keep.length)return fn();
    const positions=new Map(all.map((g,i)=>[g.id,i]));state.bag=all.filter(g=>!hidden(g));
    try{return fn();}finally{const rest=state.bag.slice();for(const g of keep)rest.push(g);rest.sort((a,b)=>(positions.get(a.id)??1e9)-(positions.get(b.id)??1e9));state.bag=rest;}
  }
  for(const name of ['salvageAll','sellAllGearByQuality']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(...args){return withoutUnidentified(()=>base.apply(this,args));};}

  /* ---------- identification (single and all share one function) ---------- */
  function identify(ids){
    const list=[...new Set(ids)].map(byId).filter(hidden);
    if(!list.length)return {count:0,byQuality:[0,0,0,0],exclusive:0};
    const saved=list.map(g=>[g,g.unidentified]);
    for(const g of list){delete g.unidentified;g.identifiedAt=Date.now();}
    if(save()===false){for(const [g,u] of saved){g.unidentified=u;delete g.identifiedAt;}toast(typeof saveFailureText==='function'?saveFailureText():'無法儲存，未鑑定');return null;}
    const byQuality=[0,0,0,0];let exclusive=0;
    for(const g of list){byQuality[Math.max(0,Math.min(3,gearQualityRank(g)))]++;if(g.boss!==undefined||g.formJob===4)exclusive++;}
    return {count:list.length,byQuality,exclusive};
  }
  function summary(r){
    const parts=r.byQuality.map((n,i)=>n?`${AFFIX_RANK[i]} ${n} 件`:'').filter(Boolean);
    return `鑑定完成，共鑑定 ${r.count} 件裝備。`+(parts.length?parts.join('、'):'')+(r.exclusive?`；怪物專屬裝備 ${r.exclusive} 件`:'');
  }
  globalThis.identifyGear=function(id){
    const r=identify([id]);if(!r||!r.count)return r?.count?r:false;
    render();if($('modal')?.open&&typeof refreshInventoryItemDetail==='function')refreshInventoryItemDetail();toast(summary(r));return r;
  };
  globalThis.identifyAllGear=function(){
    const ids=(state?.bag||[]).filter(hidden).map(g=>g.id);if(!ids.length){toast('沒有未鑑定的裝備');return {count:0};}
    const r=identify(ids);if(!r)return null;render();toast(summary(r));return r;
  };
  globalThis.__EMBERWILD_IDENTIFY={identify,summary,hidden,name:unidentifiedName};

  /* ---------- gem upgrade with dust (replaces the dust gem craft) ---------- */
  const upgradeSettings=()=>GAMEPLAY_SETTINGS.skills?.gems?.dustUpgrade;
  function gemUpgradeQuote(i){
    const g=GEMS[i];if(!g)return null;
    if(g.tier>=3)return {gem:i,max:true};
    const target=i+GEM_KINDS,cost=D.gemUpgradeCost(upgradeSettings(),g.tier+1);
    return {gem:i,target,cost,have:state.dust,count:state.gems[i]||0,max:false,ok:cost!==null&&(state.gems[i]||0)>0&&state.dust>=cost};
  }
  globalThis.gemUpgradeQuote=gemUpgradeQuote;
  /* ---------- gem salvage (v0.213): gems in the bag become gem dust; all or nothing, rolled back on a failed save ---------- */
  const salvageSettings=()=>GAMEPLAY_SETTINGS.skills?.gems?.dustSalvage;
  function gemSalvageQuote(counts){
    const rows=[];let dust=0,gems=0;
    for(const [k,v] of Object.entries(counts||{})){
      const i=Number(k),n=Number(v),g=GEMS[i];if(!g||!Number.isSafeInteger(n)||n<1)continue;
      const each=D.gemSalvageDust(salvageSettings(),g.tier);if(each===null)return null;
      rows.push({gem:i,name:g.name,count:n,have:state.gems[i]||0,dust:each*n});dust+=each*n;gems+=n;
    }
    return {rows,dust,gems,ok:rows.length>0&&rows.every(r=>r.count<=r.have)};
  }
  globalThis.gemSalvageQuote=gemSalvageQuote;
  globalThis.salvageGems=function(counts){
    const q=gemSalvageQuote(counts);if(!q||!q.ok){toast('寶石數量不足或設定無效');return false;}
    const items=globalThis.EmberwildItems,cost=Object.fromEntries(q.rows.map(r=>['gem:'+r.gem,r.count]));
    if(!items.removeMany(cost)){toast('寶石數量不足');return false;}
    items.add('material:粉塵',q.dust);
    if(save()===false){items.remove('material:粉塵',q.dust);for(const [id,n] of Object.entries(cost))items.add(id,n);toast('無法儲存，分解未完成');return false;}
    closeModal();render();toast(`分解 ${q.gems} 顆寶石，獲得 ${q.dust} 寶石粉塵`);return q;
  };
  let pendingGemSalvage=null;
  globalThis.openGemSalvage=function(counts){
    const q=gemSalvageQuote(counts);if(!q||!q.rows.length){toast('沒有可分解的寶石');return false;}
    pendingGemSalvage={counts:{...counts},signature:JSON.stringify(q)};
    $('modal').innerHTML=`<h2>確認分解寶石</h2><table class="gem-upgrade-table"><tbody>${q.rows.map(r=>`<tr><th>${esc(r.name)}</th><td>${r.count} 顆 → ${r.dust} 粉塵</td></tr>`).join('')}</tbody></table><p>共分解 ${q.gems} 顆寶石，獲得 ${q.dust} 寶石粉塵。分解後無法復原。</p><div class="actions"><button class="danger" onclick="confirmGemSalvage()" ${q.ok?'':'disabled'}>確認分解</button><button onclick="closeModal()">取消</button></div>`;
    if(!$('modal').open)$('modal').showModal();return true;
  };
  globalThis.confirmGemSalvage=function(){
    const p=pendingGemSalvage;pendingGemSalvage=null;if(!p)return false;
    const q=gemSalvageQuote(p.counts);if(JSON.stringify(q)!==p.signature){toast('寶石數量已變更，請重新確認');return openGemSalvage(p.counts);}
    return salvageGems(p.counts);
  };
  globalThis.upgradeGemWithDust=function(i){
    i=Number(i);const q=gemUpgradeQuote(i);if(!q)return false;
    if(q.max){toast('已是最高等級的寶石');return false;}
    if(!q.ok){toast(q.count<1?'沒有這種寶石':'需要 '+q.cost+' 寶石粉塵');return false;}
    // All or nothing: one gem of the stack and the dust leave together, then the higher-tier gem joins its own stack.
    const items=globalThis.EmberwildItems;
    if(!items.removeMany({['gem:'+i]:1,'material:粉塵':q.cost})){toast('材料不足');return false;}
    items.add('gem:'+q.target,1);
    if(save()===false){items.remove('gem:'+q.target,1);items.add('gem:'+i,1);items.add('material:粉塵',q.cost);toast('無法儲存，升級未完成');return false;}
    closeModal();render();toast(`${GEMS[i].name} 升級為 ${GEMS[q.target].name}（消耗 ${q.cost} 粉塵）`);return true;
  };
  globalThis.openGemUpgrade=function(i){
    i=Number(i);const q=gemUpgradeQuote(i);if(!q)return false;
    const g=GEMS[i],next=q.max?null:GEMS[q.target];
    $('modal').innerHTML=`<h2>粉塵升級 · ${esc(g.name)}</h2>${q.max?'<p>已是最高等級，無法再升級。</p>':`<table class="gem-upgrade-table"><tbody><tr><th>等級</th><td>${g.tier} 階 → ${next.tier} 階</td></tr><tr><th>效果</th><td>${esc(g.desc)} → ${esc(next.desc)}</td></tr><tr><th>所需寶石粉塵</th><td>${q.cost}</td></tr><tr><th>目前持有粉塵</th><td>${q.have}</td></tr><tr><th>持有此寶石</th><td>${q.count}</td></tr></tbody></table><p class="small">每次只升級 1 顆寶石；升級後的寶石放入對應等級的堆疊。</p>`}<div class="actions">${q.max?'':`<button class="primary" onclick="upgradeGemWithDust(${i})" ${q.ok?'':'disabled'}>升級</button>`}<button onclick="closeModal()">取消</button></div>`;
    if(!$('modal').open)$('modal').showModal();return true;
  };
  if(typeof accountGemsView==='function'){
    const base=accountGemsView;
    accountGemsView=function(...args){
      const html=base.apply(this,args);
      const rows=GEMS.map((g,i)=>({g,i})).filter(({i})=>(state.gems[i]||0)>0).map(({g,i})=>{const q=gemUpgradeQuote(i);return `<li data-gem-upgrade="${i}"><span>${esc(g.name)} ×${state.gems[i]}</span>${q.max?'<span class="small">最高等級</span>':`<button type="button" onclick="openGemUpgrade(${i})">粉塵升級 · ${q.cost} 粉塵</button>`}</li>`;}).join('');
      return html+`<section class="panel gem-dust-upgrade"><h3>寶石粉塵升級</h3><p class="small">消耗寶石粉塵，將 1 顆寶石直接提升一個等級。</p><ul class="gem-upgrade-list">${rows||'<li class="empty">目前沒有可升級的寶石。</li>'}</ul></section>`;
    };
  }
})();
