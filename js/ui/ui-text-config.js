
/* Update 17: editable main-screen/interface copy. */
const UI_TEXT_DEFAULTS={"browserTitle":"餘燼荒野 · Emberwild","gameTitle":"餘燼荒野","gameSubtitle":"EMBERWILD / IDLE RPG · 4.0","chapterTitle":"","chapterSubtitle":"","homeEyebrow":"EMBERWILD · 選擇你的遠征者","homeTitle":"","homeDescription":"一場沒有主線束縛的遠征。探索、收集、雕琢你的技能。\nLV{{beforeClearLevel}} 挑戰 {{finalBossLevel}} 級噬日者，通關後解鎖 LV{{afterClearLevel}} 與覺醒地圖。","homeFooter":"自動存檔 · 無離線戰鬥"};
let UI_TEXT=structuredClone(UI_TEXT_DEFAULTS);
function normalizeUIText(input){
  const src=input&&typeof input==='object'&&!Array.isArray(input)?input:{};
  const out={};
  for(const [key,def] of Object.entries(UI_TEXT_DEFAULTS)){
    const value=src[key]===undefined?def:src[key];
    if(typeof value!=='string')throw Error('介面文字 '+key+' 必須是文字');
    if(value.length>4000)throw Error('介面文字 '+key+' 過長（最多 4000 字元）');
    out[key]=value;
  }
  return out;
}
function resolveUIText(value){
  const g=globalThis.__EMBERWILD_GAMEPLAY_SETTINGS||GAMEPLAY_SETTINGS||{};
  const values={
    beforeClearLevel:g.progression?.levelCaps?.beforeClear??30,
    afterClearLevel:g.progression?.levelCaps?.afterClear??60,
    finalBossLevel:g.monsters?.finalBoss?.level??40,
    advanceLevel:g.progression?.advance?.level??15
  };
  return String(value??'').replace(/\{\{\s*(beforeClearLevel|afterClearLevel|finalBossLevel|advanceLevel)\s*\}\}/g,(_,key)=>String(values[key]));
}
function applyUITextDOM(){
  document.title=resolveUIText(UI_TEXT.browserTitle);
  const brandSpan=document.querySelector('header .brand span');
  if(brandSpan){
    let textNode=[...brandSpan.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
    if(!textNode){textNode=document.createTextNode('');brandSpan.prepend(textNode);}
    textNode.nodeValue=resolveUIText(UI_TEXT.gameTitle);
    const small=brandSpan.querySelector('small');if(small)small.textContent=resolveUIText(UI_TEXT.gameSubtitle);
  }
  const chapter=document.querySelector('header .chapter');
  if(chapter){
    let textNode=[...chapter.childNodes].find(n=>n.nodeType===Node.TEXT_NODE);
    if(!textNode){textNode=document.createTextNode('');chapter.prepend(textNode);}
    textNode.nodeValue=resolveUIText(UI_TEXT.chapterTitle)+' ';
    const b=chapter.querySelector('b');if(b)b.textContent=resolveUIText(UI_TEXT.chapterSubtitle);
  }
  const start=document.querySelector('#app .start');
  if(start){
    const eyebrow=start.querySelector(':scope > .eyebrow');if(eyebrow)eyebrow.textContent=resolveUIText(UI_TEXT.homeEyebrow);
    const h1=start.querySelector(':scope > h1');if(h1)h1.textContent=resolveUIText(UI_TEXT.homeTitle);
    const desc=start.querySelector(':scope > p:not(.small)');if(desc){desc.textContent=resolveUIText(UI_TEXT.homeDescription);desc.style.whiteSpace='pre-line';}
    const footer=[...start.querySelectorAll(':scope > p.small')].at(-1);if(footer)footer.textContent=resolveUIText(UI_TEXT.homeFooter);
  }
}
const uiTextRenderBase=render;
render=function(){const out=uiTextRenderBase();applyUITextDOM();return out;};
const uiTextExportBase=exportableBalance;
exportableBalance=function(){const out=uiTextExportBase();out.uiText=structuredClone(UI_TEXT);return out;};
const uiTextValidateBase=validateBalanceConfig;
validateBalanceConfig=function(input){
  const copy=JSON.parse(JSON.stringify(input));copy.uiText=normalizeUIText(copy.uiText);
  const out=uiTextValidateBase(copy);out.uiText=copy.uiText;return out;
};
const uiTextApplyBase=applyBalanceConfig;
applyBalanceConfig=function(input,{persist=true}={}){
  const copy=JSON.parse(JSON.stringify(input));copy.uiText=normalizeUIText(copy.uiText);
  const nextText=structuredClone(copy.uiText);
  const result=uiTextApplyBase(copy,{persist:false});
  UI_TEXT=nextText;
  if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
  render();
  return result;
};
const uiTextResetBase=resetBalanceJSON;
resetBalanceJSON=function(){const out=uiTextResetBase();UI_TEXT=structuredClone(UI_TEXT_DEFAULTS);render();return out;};
try{
  const saved=balanceSourceText();
  if(saved){const parsed=JSON.parse(saved);UI_TEXT=normalizeUIText(parsed.uiText);}
}catch(e){console.warn('介面文字載入失敗，改用預設文字',e);UI_TEXT=structuredClone(UI_TEXT_DEFAULTS);}

// Compact master-detail equipment inventory. Keep the existing filters and
// equipment actions, but show a dense selectable list at left and one detailed
// equipment pane at right.
let inventorySelectedGearId=null;
let inventorySortKey='job';
let inventorySortDirection='asc';
const inventoryVisibleSlots=new Set([0,1,2,3]);
const inventoryVisibleJobs=new Set([0,1,2,3]);
function selectInventoryGear(id){inventorySelectedGearId=id;render();}
function inventorySortValue(g,key){
  if(key==='quality')return gearQualityRank(g);
  if(key==='plus')return Number(g.plus)||0;
  if(key==='job')return g.slot===1?-1:(Number(g.job)||0);
  return 0;
}
function sortedFilteredGear(){
  const items=filteredGear().filter(g=>inventoryVisibleSlots.has(Number(g.slot))&&gearWearableJobs(g).some(job=>inventoryVisibleJobs.has(Number(job))));
  items.sort((a,b)=>{
    let diff=0;
    if(inventorySortKey==='job'){
      diff=inventorySortValue(a,'job')-inventorySortValue(b,'job');
      if(diff!==0)return inventorySortDirection==='asc'?diff:-diff;
      const slotDiff=(Number(a.slot)||0)-(Number(b.slot)||0);
      if(slotDiff!==0)return inventorySortDirection==='asc'?slotDiff:-slotDiff;
    }else{
      diff=inventorySortValue(a,inventorySortKey)-inventorySortValue(b,inventorySortKey);
      if(diff!==0)return inventorySortDirection==='asc'?diff:-diff;
    }
    const qualityDiff=gearQualityRank(b)-gearQualityRank(a);if(qualityDiff)return qualityDiff;
    const plusDiff=(Number(b.plus)||0)-(Number(a.plus)||0);if(plusDiff)return plusDiff;
    const tierDiff=(Number(b.tier)||0)-(Number(a.tier)||0);if(tierDiff)return tierDiff;
    return equipmentDisplayName(a).localeCompare(equipmentDisplayName(b),'zh-Hant');
  });
  return items;
}
function inventorySortControls(){
  const options=[['quality','稀有度'],['plus','強化度'],['job','職業']];
  const slotOptions=[[0,'武器'],[1,'護甲'],[2,'副手'],[3,'飾品']];
  const jobOptions=CLASSES.map((c,i)=>[i,c.name]);
  const checks=(kind,options,selected)=>'<div class="inventory-visibility-group"><span class="small">'+(kind==='slot'?'裝備種類':'職業裝備')+'</span>'+options.map(([value,label])=>'<label><input type="checkbox" '+(selected.has(value)?'checked':'')+' onchange="setInventoryVisibility(\''+kind+'\','+value+',this.checked)"> '+esc(label)+'</label>').join('')+'</div>';
  return '<div class="inventory-sortbar"><div class="inventory-sort-row"><label>排序 <select onchange="setInventorySort(this.value)">'+
    options.map(([value,label])=>'<option value="'+value+'" '+(inventorySortKey===value?'selected':'')+'>'+label+'</option>').join('')+
    '</select></label><button type="button" onclick="toggleInventorySortDirection()">'+(inventorySortDirection==='desc'?'高 → 低':'低 → 高')+'</button></div>'+
    '<div class="inventory-visibility-filters">'+checks('slot',slotOptions,inventoryVisibleSlots)+checks('job',jobOptions,inventoryVisibleJobs)+'<label class="inventory-hide-equipped"><input type="checkbox" '+(filters.hideEquipped?'checked':'')+' onchange="setFilter(\'hideEquipped\',this.checked)"> 隱藏已穿戴裝備</label></div></div>';
}
globalThis.setInventorySort=function(key){
  if(!['quality','plus','job'].includes(key))return;
  inventorySortKey=key;render();
};
globalThis.toggleInventorySortDirection=function(){
  inventorySortDirection=inventorySortDirection==='desc'?'asc':'desc';render();
};
globalThis.setInventoryVisibility=function(kind,value,checked){
  const target=kind==='slot'?inventoryVisibleSlots:kind==='job'?inventoryVisibleJobs:null;
  if(!target)return;
  value=Number(value);
  if(checked)target.add(value);else target.delete(value);
  render();
};
function inventoryGearListItem(g,selected){
  return gearSlotHTML(g,{selected,className:'inventory-list-item',onclick:`selectInventoryGear('${g.id}')`});
}
function inventoryGearDetail(g){
  if(!g)return `<div class="inventory-detail-empty"><b>沒有可顯示的裝備</b><p class="small">調整左側篩選條件後選擇裝備。</p></div>`;
  const wearer=gearWearer(g.id),worn=!!wearer,draft=inlineAffixDrafts.has(affixDraftKey(g)),locked=!!g.locked;
  return `<div class="inventory-detail-pane">
    <div class="inventory-detail-heading">
      <div><h2>${equipmentNameHTML(g)}</h2></div>
      <span class="tag">${qualityTag(g)}${locked?' · 已鎖定':''}</span>
    </div>
    <div class="inventory-detail-meta">${gearWearableJobsText(g)} · ${CLASS_GEAR[g.job][g.slot]} · LV ${gearRequiredLevel(g)}${worn?' · 目前由 '+esc(characterName(wearer))+' 穿戴':''}</div>
    <section class="inventory-detail-section"><h3>裝備能力</h3><p class="inventory-detail-stats equipment-total-summary">${globalThis.equipmentTotalSummaryHTML(g)}</p>${globalThis.equipmentAttributeDetailsHTML(g)}</section>
    <section class="inventory-detail-section"><div class="actions inventory-detail-actions"><button onclick="enhance('${g.id}')" ${g.plus>=RULES.enhanceMax||!canEnhance(g)?'disabled':''}>${g.plus>=RULES.enhanceMax?'已達 +'+RULES.enhanceMax:'強化 +'+(g.plus+1)+'／'+upgradeCostText(g)}</button><button onclick="reroll('${g.id}')" ${(()=>{const c=rerollCostFor(g);return draft||state.gold<c.gold||state.dust<c.dust;})()?'disabled':''}>洗鍊／${rerollCostFor(g).gold} 金幣＋${rerollCostFor(g).dust} 粉塵</button><button onclick="toggleGearLock('${g.id}')">${locked?'解除鎖定':'鎖定'}</button><button class="danger" onclick="salvage('${g.id}')" ${worn||draft||locked?'disabled':''}>分解</button></div></section>
    ${inlineAffixComparison(g)}
  </div>`;
}
inlineInventoryView=function(){
  const items=sortedFilteredGear();
  if(items.length && !items.some(g=>g.id===inventorySelectedGearId))inventorySelectedGearId=items[0].id;
  if(!items.length)inventorySelectedGearId=null;
  const selected=items.find(g=>g.id===inventorySelectedGearId)||null;
  return `<section class="panel compact-inventory-panel">${resourceLine()}${inventorySortControls()}<div class="inventory-advanced-controls">${gearFilters()}${bulkSalvageControls()}${uiHelp('裝備規則','背包與資源共用。主角可穿戴武器、護甲、副手各一件與兩件飾品；裝備須符合職業限制，武器固定屬性決定普攻屬性。')}</div>
    <div class="inventory-master-detail">
      <section class="inventory-master-pane">
        <div class="inventory-master-heading"><b>裝備列表</b><span class="small">顯示 ${items.length} 件</span></div>
        <div class="inline-equipment-list inventory-list-scroll">${items.map(g=>inventoryGearListItem(g,g===selected)).join('')||'<p class="inventory-list-empty">沒有符合篩選的裝備。</p>'}</div>
      </section>
      <section class="inventory-detail-wrap">${inventoryGearDetail(selected)}</section>
    </div>
  </section>`;
};

(function installCompactInventoryStyles(){
  const style=document.createElement('style');
  style.textContent=`
  .compact-inventory-panel{overflow:hidden}
  .inventory-master-detail{display:grid;grid-template-columns:minmax(290px,36%) minmax(0,1fr);gap:10px;height:min(620px,62dvh);min-height:390px;margin-top:10px;border-top:1px solid var(--line);padding-top:10px}
  .inventory-master-pane,.inventory-detail-wrap{min-height:0;border:1px solid var(--line);background:#141c1f}
  .inventory-master-pane{display:grid;grid-template-rows:38px minmax(0,1fr);overflow:hidden}
  .inventory-master-heading{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:7px 10px;border-bottom:1px solid var(--line);background:#182124}
  .inventory-sortbar{display:grid;gap:7px;margin-top:7px}
  .inventory-sort-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .inventory-sortbar label{display:flex;align-items:center;gap:5px;font-size:12px}
  .inventory-sortbar select{min-width:108px}
  .inventory-sortbar button{padding:4px 8px;font-size:11px}
  .inventory-visibility-filters{display:flex;gap:16px;flex-wrap:wrap;align-items:center}
  .inventory-visibility-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .inventory-visibility-group>.small{min-width:max-content}
  .inventory-visibility-group label{color:#d9dfdc}
  .inventory-visibility-group input{margin:0}
  .inventory-list-scroll{display:block;margin:0;overflow:auto;min-height:0;scrollbar-gutter:stable}
  .inventory-list-item{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;grid-template-rows:22px 18px;width:100%;height:48px;padding:4px 8px;text-align:left;border:0;border-bottom:1px solid #2e3b3f;border-radius:0;background:transparent;gap:0 8px;overflow:hidden}
  .inventory-list-item:hover{background:#202c30}.inventory-list-item.selected{background:#2a383c;box-shadow:inset 3px 0 var(--green)}
  .inventory-list-name{grid-column:1;grid-row:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;align-self:end}.inventory-list-name .enhanced-name{font-size:13px}
  .inventory-list-meta{grid-column:1/-1;grid-row:2;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;color:var(--muted);font-size:10px;line-height:16px}
  .inventory-list-quality{grid-column:2;grid-row:1;align-self:end;justify-self:end;min-width:max-content;font-size:10px;white-space:nowrap;padding-left:6px}
  .inventory-list-empty{padding:18px;color:var(--muted)}
  .inventory-detail-wrap{overflow:auto;scrollbar-gutter:stable}
  .inventory-detail-pane{padding:16px 18px;min-height:100%}
  .inventory-detail-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-bottom:12px;border-bottom:1px solid var(--line)}
  .inventory-detail-heading h2{font-size:21px;margin:3px 0 0}.inventory-detail-heading .tag{margin-top:2px;flex-shrink:0}
  .inventory-detail-meta{font-size:12px;color:var(--muted);padding:9px 0}
  .inventory-detail-section{padding:12px 0;border-top:1px solid #2d393d}.inventory-detail-section:first-of-type{border-top:0}
  .inventory-detail-section h3{font-size:13px;margin:0 0 7px;color:#dedfd7}.inventory-detail-section .row h3{margin:0}
  .inventory-detail-stats{font-size:14px;color:#e7e5dc;margin:0;line-height:1.7}
  .inventory-detail-affixes{font-size:13px;line-height:1.75}.inventory-detail-affixes .affix{font-size:13px}
  .inventory-detail-actions{margin-top:4px}.inventory-detail-actions button{font-size:12px;padding:5px 9px}
  .inventory-detail-pane>.inline-affix-comparison{margin-top:12px}
  .inventory-detail-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:30px;text-align:center;color:var(--muted)}
  @media(max-width:900px){.inventory-master-detail{grid-template-columns:1fr;grid-template-rows:230px minmax(360px,1fr);height:auto;min-height:0}.inventory-master-pane{height:230px}.inventory-detail-wrap{min-height:360px}}
  `;
  document.head.appendChild(style);
})();


// Update 18: final gameplay integration fixes.
// Later reward/combat wrappers had replaced the pending-loot wrapper and the
// defeat branch stopped exploration. Keep these behaviors attached to the final
// installed functions so future view-only overrides do not bypass them.
(function installFinalGameplayIntegrationFixes(){
  // Update 12 redefined initial() after the party-system wrapper, which left
  // newly recruited heroes without supportLevels/supportSlots. Re-attach the
  // party initializer to the final character factory.
  if(typeof initial==='function'&&typeof initHero==='function'){
    const finalInitialBase=initial;
    initial=function(job){const h=initHero(finalInitialBase(job));if(typeof syncHeroSkillArrays==='function')syncHeroSkillArrays(h);return h;};
  }

  if(typeof pacedRound==='function'){
    const finalAutoRetryPacedRoundBase=pacedRound;
    pacedRound=function*(){
      const startedRunning=!!running;
      yield* finalAutoRetryPacedRoundBase();
      // A wipe is the only normal round outcome that clears foes/enemy after
      // starting in the running state. Final-boss victory keeps the defeated
      // foe list, while a manual pause does not clear the encounter.
      if(startedRunning&&party&&!party.questChallenge&&!globalThis.isFinalMap?.(party.map)&&!running&&!foes.length&&!enemy&&living().length){
        running=true;
        note('全隊恢復後，自動重新挑戰目前區域。');
        save();
        if(tab==='battle'||!isEditingControl())render();
        else refreshGlobalJournal();
      }
    };
  }

  if(typeof resetSession==='function'){
    const finalInventoryResetSessionBase=resetSession;
    resetSession=function(){
      const result=finalInventoryResetSessionBase();
      if(typeof inventorySelectedGearId!=='undefined')inventorySelectedGearId=null;
      // resetSession() still came from the legacy filter model. Always restore
      // the current inventory filter schema so a new game/import does not
      // silently hide BOSS equipment.
      filters={slot:'all',job:'all',boss:'all',effectRank:'all'};
      return result;
    };
  }
})();

// Update 19: full functional-audit consistency fixes.
// These patches keep persisted state, configurable rules and player-facing text
// aligned with the final functions installed by all earlier update layers.
(function installFullFunctionalAuditFixes(){
  function clonePlain(value){return JSON.parse(JSON.stringify(value));}
  function clampQualityRank(value){return Math.max(0,Math.min(3,Math.round(Number(value)||0)));}

  // The unified equipment system defines quality by the highest affix rank.
  // Build a single affix at an exact requested rank using the game's own final
  // affix generator, rather than the obsolete g.rar field.
  function guaranteedRankAffix(g,rank){
    rank=clampQualityRank(rank);
    if(rank<=0)return null;
    const q=GAME_BALANCE.affixes.qualityChance,saved={...q};
    try{
      for(const key of balanceQualityKeys())q[key]=0;
      q[balanceQualityKey(rank)]=1;
      return rollAffixes(g)[0]||null;
    }finally{Object.assign(q,saved);}
  }
  globalThis.forceGearQuality=function(g,rank){
    rank=clampQualityRank(rank);g.rar=0;
    if(rank<=0){g.affix=[];return g;}
    const affix=guaranteedRankAffix(g,rank);
    g.affix=affix?[affix]:[];
    return g;
  };

  // Recruiting a hero must not mint account-wide currency/items. The new hero's
  // starter weapon is intentional, while gold/ore/dust/gems/materials/potions
  // and consumables belong to the shared account and are restored after recruit.
  if(typeof recruitHero==='function'){
    const auditedRecruitHeroBase=recruitHero;
    recruitHero=function(job){
      if(!party)return auditedRecruitHeroBase(job);
      ensureAccountResources();ensureSharedItems();ensureSharedGear();ensureAccountQuests();
      const beforeCount=party.members.length,r=party.accountResources,i=party.sharedItems;
      const snapshot={gold:r.gold,ore:r.ore,dust:r.dust,gems:[...r.gems],materials:{...r.materials},potions:i.potions,consumables:{...i.consumables}};
      const out=auditedRecruitHeroBase(job);
      if(party&&party.members.length>beforeCount){
        r.gold=snapshot.gold;r.ore=snapshot.ore;r.dust=snapshot.dust;r.gems.splice(0,r.gems.length,...snapshot.gems);r.materials={...snapshot.materials};
        i.potions=snapshot.potions;i.consumables={...snapshot.consumables};
        save();render();
      }
      return out;
    };
  }

  // Tutorial/board rewards expose a quality in the balance JSON and UI. Make
  // that quality exact under the final affix-based equipment quality model.
  claimTutorial=function(){
    const t=GAMEPLAY_SETTINGS.quests.tutorial;
    if(state.tutorial===0&&state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理再領取新手護甲');
    const ok=[state.totalKills>=t.killRequirement,state.bag.some(g=>g.plus>0),state.skills[0]>=t.skillLevelRequirement][state.tutorial];
    if(!ok)return;
    state.tutorial++;state.gold+=Math.round(t.rewardGold);state.ore+=Math.round(t.rewardOre);
    let armor=null;
    if(state.tutorial===1){
      const tier=Math.max(1,Math.round(t.armorTier)),slot=Math.max(0,Math.min(3,Math.round(t.armorSlot))),quality=clampQualityRank(t.armorQuality);
      armor=forceGearQuality(gear(tier,slot,0,state.job),quality);addGear(armor);
    }
    save();render();
    toast(armor?`獲得 ${AFFIX_RANK[gearQualityRank(armor)]} ${equipmentDisplayName(armor)}、${Math.round(t.rewardGold)} 金幣與 ${Math.round(t.rewardOre)} 鍛鐵`:`獲得 ${Math.round(t.rewardGold)} 金幣與 ${Math.round(t.rewardOre)} 鍛鐵`);
  };

  claimBoard=function(id){
    ensureBoard();const q=state.board.tasks.find(q=>q.id===id),b=GAMEPLAY_SETTINGS.quests.board;
    if(!q||q.done||(state.materials[q.mat]||0)<q.n)return;
    if(q.kind==='gear'&&state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理再領取裝備獎勵');
    state.materials[q.mat]-=q.n;q.done=true;state.gold+=Math.round(regionTier(q.map)*b.goldPerTier);state.ore+=Math.round(regionTier(q.map)*b.orePerTier);
    if(q.kind==='gear'){
      const reward=forceGearQuality(gear(regionTier(q.map),q.slot,0,q.job??rand(4)),q.rar);addGear(reward);
    }else state.gems[q.gem]+=Math.round(b.gemReward);
    state.repeat++;save();render();toast(q.kind==='gear'?'委託完成，裝備已放入背包':'委託完成，獎勵已領取');
  };

  // Configured ordinary equipment drops also describe "fine/rare" quality.
  // Preserve all non-equipment reward behavior and only repair this mapping.
  if(typeof grantConfiguredDrop==='function'){
    const auditedGrantConfiguredDropBase=grantConfiguredDrop;
    grantConfiguredDrop=function(rule,e,rng=Math.random){
      if(rule?.type!=='gear')return auditedGrantConfiguredDropBase(rule,e,rng);
      const qty=randomQuantity(rule,rng),mode=e.difficulty||0,mi=e.region??state.map,tier=regionTier(mi),r=GAMEPLAY_SETTINGS.rewards;
      for(let q=0;q<qty;q++){
        const first=rng(),quality=first<r.equipmentQuality.rareChance?2:(rng()<r.equipmentQuality.fineConditionalChance?1:0);
        const g=gear(tier,Math.floor(rng()*4),0);
        forceGearQuality(g,quality);modeAffixes(g,mode);addGear(g);
      }
      return {name:rule.name,count:qty};
    };
  }

  // The forge member renderer was captured before the affix-quality migration,
  // leaving the detail badge stuck on legacy rarity. Correct only that badge.
  if(typeof forgeView==='function'){
    const auditedForgeViewBase=forgeView;
    forgeView=function(){
      let html=auditedForgeViewBase();
      const h=typeof pageHero==='function'?pageHero('forge'):state;
      const selectedId=typeof teamForgeSelection!=='undefined'?teamForgeSelection.get(memberKey(h)):null;
      const g=h?.bag?.find(x=>x.id===selectedId)||(h?equipment(h)[0]:null)||h?.bag?.[0];
      if(g){
        const boss=g.boss!==undefined?' · BOSS 專屬':'';
        const legacy=`<span class="tag">${RARITY[g.rar]}${boss}</span>`;
        const current=`<span class="tag">${AFFIX_RANK[gearQualityRank(g)]}${boss}</span>`;
        html=html.replace(legacy,current);
      }
      return html;
    };
  }

  // Battle descriptions must report the same configurable group size and pacing
  // that spawnGroup()/tick() actually use.
  if(typeof battleView==='function'){
    const auditedBattleViewBase=battleView;
    battleView=function(){
      let html=auditedBattleViewBase();
      const gs=GAMEPLAY_SETTINGS.combat.groupSize,min=Math.max(1,Math.round(gs.min)),max=Math.max(min,Math.round(gs.max)),group=min===max?String(min):`${min}～${max}`;
      const seconds=Math.max(0,Number(GS('combat.pacing.roundMinimumMs',6000))||0)/1000,sec=Number.isInteger(seconds)?String(seconds):String(+seconds.toFixed(2));
      html=html.replace(/群怪 · \d+～\d+ 隻/g,`群怪 · ${group} 隻`).replace(/開始探索，遭遇\d+～\d+隻敵人。/g,`開始探索，遭遇${group}隻敵人。`).replace(/1倍速每回合至少 \d+(?:\.\d+)? 秒/g,`1倍速每回合至少 ${sec} 秒`);
      return html;
    };
  }

  function configuredBattleRates(){const raw=GS('combat.pacing.rates',[1,2,4]);return Array.isArray(raw)?raw.map(Number).filter(x=>Number.isFinite(x)&&x>0):[1,2,4];}
  function normalizeBattleRateToSettings(){const rates=configuredBattleRates();if(rates.length&&!rates.includes(battleRate))battleRate=rates[0];}
  normalizeBattleRateToSettings();
  if(typeof applyBalanceConfig==='function'){
    const auditedApplyBalanceConfigBase=applyBalanceConfig;
    applyBalanceConfig=function(...args){const out=auditedApplyBalanceConfigBase(...args);normalizeBattleRateToSettings();return out;};
  }

  // Final-boss completion text should follow configurable level caps as the
  // actual progression code does.
  if(typeof note==='function'){
    const auditedNoteBase=note;
    note=function(text,type){
      if(text==='噬日者已倒下！LV30 成員解鎖 LV60，其他成員達 LV30 時解鎖。'){
        const before=Math.floor(GS('progression.levelCaps.beforeClear',30)),after=Math.floor(GS('progression.levelCaps.afterClear',60));
        text=`噬日者已倒下！LV${before} 成員解鎖 LV${after}，其他成員達 LV${before} 時解鎖。`;
      }
      return auditedNoteBase(text,type);
    };
  }

})();



// Update 20: continued audit fixes.
// The party-page renderer wraps advance() in heroMenuAction(), so the older
// button-state patch no longer matched the final markup. Keep the displayed
// requirement and clickability aligned with the actual advance() guard.
(function installContinuedAuditFixes(){
  if(typeof characterView==='function'){
    const continuedAuditCharacterViewBase=characterView;
    characterView=function(){
      let html=continuedAuditCharacterViewBase();
      const h=typeof pageHero==='function'?pageHero('character'):state;
      const a=GAMEPLAY_SETTINGS.progression.advance;
      const shouldDisable=!!h&&(h.advanced||h.lv<a.level);
      html=html.replace(/<button class="primary" onclick="heroMenuAction\((\d+),\(\)=>\{advance\(\)\}\)"\s*(?:disabled)?\s*>/,function(full,job){
        return `<button class="primary" onclick="heroMenuAction(${job},()=>{advance()})"${shouldDisable?' disabled':''}>`;
      });
      return html;
    };
  }
})();

// The first save-load pass runs before late gameplay modules are installed. Run
// one final hydration unconditionally so fields introduced by late modules are
// not silently discarded even when the early/core load succeeded.
try{
  const raw=globalThis.__EMBERWILD_BOOT_SAVE_RAW??localStorage.getItem(KEY);
  if(raw&&(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)){
    const parsed=JSON.parse(raw),fallbackStats=party?.battleStatistics;
    loadParty(parsed);
    if(!parsed.battleStatistics){
      try{
        const statsRaw=typeof BATTLE_STATS_STORAGE_KEY!=='undefined'?localStorage.getItem(BATTLE_STATS_STORAGE_KEY):null;
        if(statsRaw)party.battleStatistics=normalizeBattleStatistics(JSON.parse(statsRaw));
        else if(fallbackStats)party.battleStatistics=normalizeBattleStatistics(fallbackStats);
      }catch(e){if(fallbackStats)party.battleStatistics=normalizeBattleStatistics(fallbackStats);}
    }
    // Early loaders may have normalized the save before late-module fields were
    // restored. Persist the fully hydrated final state so a second immediate
    // reload cannot lose pending loot or other late-module data.
    save();
  }
}catch(e){
  console.warn('最終存檔完整載入失敗',e);
  if(!state){state=null;party=null;if(!globalThis.__EMBERWILD_BALANCE_SOURCE||globalThis.__EMBERWILD_BALANCE_READY)toast('存檔未能載入：'+e.message+'；可匯入備份。');}
}
render();
