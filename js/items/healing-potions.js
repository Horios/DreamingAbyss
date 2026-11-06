
/* Update 31: configurable automatic healing potions. Healing potions use the shared account inventory;
   the selected potion is consumed automatically at the start of that hero's own
   basic-action turn when HP is at/below the configured threshold. */
(function installHealingPotionSystem(){
  const HEAL_POTION_TYPE='healPotion';
  const HEAL_POTION_DEFAULTS=EmberwildHealingPotions.defaults;
  const clone=v=>JSON.parse(JSON.stringify(v));
  const isHealPotion=item=>item?.type===HEAL_POTION_TYPE;
  const healPotionItems=()=>SHOP.filter(isHealPotion);
  const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(id);

  function addDefaultHealPotionsTo(items){
    const out=Array.isArray(items)?items:[];
    if(!out.some(isHealPotion))out.push(...HEAL_POTION_DEFAULTS.map(clone));
    return out;
  }
  addDefaultHealPotionsTo(SHOP);

  if(typeof normalizeDescriptionBalance==='function'){
    const baseNormalize=normalizeDescriptionBalance;
    normalizeDescriptionBalance=function(input){const out=baseNormalize(input);addDefaultHealPotionsTo(out.items);EmberwildHealingPotions.migrate(out);return out;};
  }
  if(typeof validateDescriptionItems==='function'){
    const baseValidate=validateDescriptionItems;
    validateDescriptionItems=function(items){
      if(!Array.isArray(items))throw Error('道具資料無效');
      const fixed=items.filter(x=>!isHealPotion(x));
      baseValidate(fixed);
      const heals=items.filter(isHealPotion),ids=new Set(fixed.map(x=>x.id));
      if(!heals.length)throw Error('至少需要 1 種治療藥水');
      for(const item of heals){
        if(!item||!validId(item.id)||ids.has(item.id)||typeof item.name!=='string'||!item.name.trim()||typeof item.description!=='string')throw Error('治療藥水基本資料無效：'+(item?.id||'未知'));
        ids.add(item.id);
        if(item.element!==undefined&&item.element!==null&&item.element!=='')throw Error('治療藥水不可設定元素：'+item.id);
        if(!Number.isFinite(item.cost)||item.cost<0||EmberwildHealingPotions.issues(item).length>0||!Number.isInteger(item.cooldown)||item.cooldown<0||item.cooldown>99||!Number.isInteger(item.duration??0)||(item.duration??0)!==0)throw Error('治療藥水數值無效：'+item.id);
        if(item.sellPrice!==undefined&&(!Number.isFinite(item.sellPrice)||item.sellPrice<0))throw Error('治療藥水賣價無效：'+item.id);
      }
      return items;
    };
  }
  if(typeof balanceReference==='function'){
    const baseReference=balanceReference;
    balanceReference=function(){const r=baseReference();r.itemTypes={...(r.itemTypes||{}),healPotion:'治療藥水；healAmount=固定恢復 HP，shopAvailable=商店販售狀態，requiredVip=最低商店 VIP 等級，timing.cooldownSeconds=使用後等待的戰鬥秒數；cooldown 為舊版相容欄位；只能由自動喝藥機制使用。'};return r;};
  }
  if(typeof exportableBalance==='function'){
    const baseExport=exportableBalance;
    exportableBalance=function(){const out=baseExport();out.notes=[...(out.notes||[]),'items 中 type=healPotion 為治療藥水；healAmount 使用固定 HP，shopAvailable / requiredVip 控制所有商店購買入口，timing.cooldownSeconds 使用戰鬥秒數。治療藥水沒有手動使用按鈕，只會依角色自動喝藥設定觸發。'];return out;};
  }

  const baseInitial=initial;initial=function(...args){const h=baseInitial(...args),n=h.potions||0;h.healingPotions={...(h.healingPotions||{}),heal_small:(h.healingPotions?.heal_small||0)+n};h.potions=0;h.autoPotionId='heal_small';return h;};
  function defaultHealPotionId(){return healPotionItems().find(x=>x.id==='heal_standard')?.id||healPotionItems()[0]?.id||'';}
  function healingInventory(){
    if(party?.members?.length){const owner=party.members[0];if(!owner.healingPotions||Array.isArray(owner.healingPotions)||typeof owner.healingPotions!=='object')owner.healingPotions={};return owner.healingPotions;}
    if(state){if(!state.healingPotions||Array.isArray(state.healingPotions)||typeof state.healingPotions!=='object')state.healingPotions={};return state.healingPotions;}
    return {};
  }
  function normalizeHeroHealingSettings(h){
    if(!h)return;
    if(typeof h.autoPotion!=='boolean')h.autoPotion=true;
    if(!Number.isFinite(h.autoPotionThresholdPct))h.autoPotionThresholdPct=Math.round((typeof GS==='function'?GS('combat.autoPotionThreshold',.35):.35)*100);
    h.autoPotionThresholdPct=Math.max(1,Math.min(99,Math.round(h.autoPotionThresholdPct)));
    if(h.autoPotionPriority!==undefined)h.autoPotionPriority=[...new Set(Array.isArray(h.autoPotionPriority)?h.autoPotionPriority.filter(id=>healPotionItems().some(x=>x.id===id)):[])];
    if(typeof h.autoPotionId!=='string'||!healPotionItems().some(x=>x.id===h.autoPotionId))h.autoPotionId=defaultHealPotionId();
    if(!(globalThis.EmberwildSecondsCombat?.active?Number.isFinite(h.healPotionCooldownRemaining):Number.isInteger(h.healPotionCooldownRemaining))||h.healPotionCooldownRemaining<0)h.healPotionCooldownRemaining=0;
  }
  const baseEnsureSharedItems=typeof ensureSharedItems==='function'?ensureSharedItems:null;
  function ensureHealingPotionState(){
    if(!party?.members?.length){if(state)normalizeHeroHealingSettings(state);return;}
    const owner=party.members[0],inv=healingInventory();
    for(let i=1;i<party.members.length;i++){
      const src=party.members[i].healingPotions;
      if(src&&typeof src==='object'&&!Array.isArray(src)){for(const [id,n] of Object.entries(src))if(Number.isInteger(n)&&n>0)inv[id]=(inv[id]||0)+n;delete party.members[i].healingPotions;}
    }
    if(party.sharedItems&&Number.isInteger(party.sharedItems.potions)&&party.sharedItems.potions>0){inv[defaultHealPotionId()]=(inv[defaultHealPotionId()]||0)+party.sharedItems.potions;party.sharedItems.potions=0;}
    for(const [id,n] of Object.entries(inv))if(!validId(id)||!Number.isInteger(n)||n<0||!healPotionItems().some(x=>x.id===id))delete inv[id];
    for(const h of party.members)normalizeHeroHealingSettings(h);
    owner.healingPotions=inv;
  }
  if(baseEnsureSharedItems){ensureSharedItems=function(){const out=baseEnsureSharedItems();ensureHealingPotionState();return out;};}

  function selectedHealPotion(h){normalizeHeroHealingSettings(h);return healPotionItems().find(x=>x.id===h.autoPotionId)||healPotionItems()[0]||null;}
  function healPotionCount(id){return Math.max(0,Math.floor(Number(healingInventory()[id])||0));}
  function setHealPotionCount(id,n){healingInventory()[id]=Math.max(0,Math.floor(Number(n)||0));}
  function useAutoHealingPotion(h){
    const visual=globalThis.EmberwildBattleEffects;
    if(!visual?.capturing)return useAutoHealingPotionCore(h);
    return visual.scope({source:h,mode:'potion'},()=>useAutoHealingPotionCore(h));
  }
  function useAutoHealingPotionCore(h){
    normalizeHeroHealingSettings(h);
    if(h.healPotionCooldownRemaining>0){if(!globalThis.EmberwildSecondsCombat?.active)h.healPotionCooldownRemaining--;return false;}
    if(!h.autoPotion||h.hp<=0)return false;
    const item=[selectedHealPotion(h),...(h.autoPotionPriority||[]).map(id=>healPotionItems().find(x=>x.id===id))].find(x=>x&&healPotionCount(x.id)>0);if(!item)return false;
    const v=battleStats(h),threshold=Math.max(1,Math.min(99,h.autoPotionThresholdPct))/100;
    if(h.hp/v.hp>threshold||h.hp>=v.hp)return false;
    setHealPotionCount(item.id,healPotionCount(item.id)-1);
    const before=h.hp,amount=Math.max(1,Math.round(item.healAmount));h.hp=Math.min(v.hp,h.hp+amount);
    const actual=Math.max(0,Math.round(h.hp-before));if(actual>0)recordCombatContribution(h,'healing',actual);h.healPotionCooldownRemaining=globalThis.EmberwildSecondsCombat?.active?item.timing.cooldownSeconds:Math.max(0,Math.round(item.cooldown));
    note(`${characterName(h)}自動使用${item.name} · 恢復 ${actual} 生命（藥水固定恢復 ${item.healAmount} HP）· 冷卻 ${globalThis.EmberwildSecondsCombat?.active?item.timing.cooldownSeconds:item.cooldown} ${globalThis.EmberwildSecondsCombat?.active?'秒':'回合'}`);
    return true;
  }
  globalThis.useAutoHealingPotion=useAutoHealingPotion;
  let manaProvider=null;
  const manaItems=()=>manaProvider?.items?.()||[];
  function manaSettings(h){h.autoManaPotion??=false;h.autoManaPotionThresholdPct=Number.isFinite(h.autoManaPotionThresholdPct)?Math.max(1,Math.min(99,h.autoManaPotionThresholdPct)):35;h.autoManaPotionPriority=Array.isArray(h.autoManaPotionPriority)?[...new Set(h.autoManaPotionPriority.filter(validId))]:[];h.manaPotionCooldownRemaining=Math.max(0,Number(h.manaPotionCooldownRemaining)||0);}
  function useAutoManaPotion(h){manaSettings(h);const C=globalThis.EmberwildSecondsCombat;if(!C?.active||!manaProvider||!h.autoManaPotion||h.hp<=0||h.manaPotionCooldownRemaining>0)return false;const max=C.resourceProfile(h).maxMp,current=C.timeline?.actors.some(a=>a.definition.id===heroKey(h))?C.timeline.actor(heroKey(h)).mp:h.mp??max;if(current>=max||current/max>h.autoManaPotionThresholdPct/100)return false;const item=h.autoManaPotionPriority.map(id=>manaItems().find(x=>x.id===id)).find(x=>x&&manaProvider.count(x.id)>0);if(!item||!Number.isFinite(item.restoreMp)||item.restoreMp<=0||!Number.isFinite(item.cooldownSeconds)||item.cooldownSeconds<0||manaProvider.consume(item.id)===false)return false;h.mp=Math.min(max,current+item.restoreMp);if(C.timeline?.actors.some(a=>a.definition.id===heroKey(h)))C.timeline.setMp(heroKey(h),h.mp);h.manaPotionCooldownRemaining=item.cooldownSeconds;note(characterName(h)+'自動使用'+item.name+' · 恢復 '+(h.mp-current)+' MP');return true;}
  globalThis.EmberwildAutoPotions={manaItems,manaSettings,useMana:useAutoManaPotion,registerManaProvider(provider){if(!provider||!['items','count','consume'].every(k=>typeof provider[k]==='function'))throw Error('魔力藥水介面無效');manaProvider=provider;},configureMana(key,{enabled,threshold,priority}){const h=partyMember(key);if(!h||typeof enabled!=='boolean'||!Number.isFinite(threshold)||threshold<1||threshold>99||!Array.isArray(priority)||priority.some(id=>!validId(id)))return false;globalThis.EmberwildOffline?.sync();if(globalThis.EmberwildOffline?.busy||globalThis.EmberwildOffline?.failed)return false;Object.assign(h,{autoManaPotion:enabled,autoManaPotionThresholdPct:threshold,autoManaPotionPriority:[...new Set(priority)]});manaSettings(h);save();return true;},configureHealingPriority(key,ids){const h=partyMember(key);if(!h||!Array.isArray(ids)||ids.some(id=>!healPotionItems().some(x=>x.id===id)))return false;globalThis.EmberwildOffline?.sync();if(globalThis.EmberwildOffline?.busy||globalThis.EmberwildOffline?.failed)return false;h.autoPotionPriority=[...new Set(ids)];save();return true;}};
  globalThis.setHeroAutoPotion=function(key,on){const h=partyMember(key);if(!h)return;h.autoPotion=!!on;save();render();refreshHealingSettingsModal();};
  globalThis.setHeroAutoPotionThreshold=function(key,value){const h=partyMember(key);if(!h)return;const n=Number(value);h.autoPotionThresholdPct=Number.isFinite(n)?Math.max(1,Math.min(99,Math.round(n))):35;save();render();refreshHealingSettingsModal();};
  globalThis.setHeroAutoPotionItem=function(key,id){const h=partyMember(key);if(!h||!healPotionItems().some(x=>x.id===id))return;h.autoPotionId=id;save();render();refreshHealingSettingsModal();};
  globalThis.buyHealingPotion=function(id){const item=healPotionItems().find(x=>x.id===id);if(!item)return;const locked=globalThis.healingPotionShopLock?.(item)||EmberwildHealingPotions.lockReason(item,party?.story?.vip||0);if(locked)return toast(locked);if(state.gold<item.cost)return toast('金幣不足');state.gold-=item.cost;setHealPotionCount(id,healPotionCount(id)+1);save();render();};

  if(typeof tickHeroCooldowns==='function'){
    const baseTickHeroCooldowns=tickHeroCooldowns;
    tickHeroCooldowns=function(h){useAutoHealingPotion(h);return baseTickHeroCooldowns(h);};
  }
  if(typeof resetEncounter==='function'){
    const baseReset=resetEncounter;
    resetEncounter=function(){const out=baseReset();if(party)for(const h of party.members){normalizeHeroHealingSettings(h);if(!globalThis.EmberwildSecondsCombat?.active)h.healPotionCooldownRemaining=0;}return out;};
  }
  if(typeof spawnGroup==='function'){
    const baseSpawn=spawnGroup;
    spawnGroup=function(){const out=baseSpawn();if(party)for(const h of heroes()){normalizeHeroHealingSettings(h);if(!globalThis.EmberwildSecondsCombat?.active)h.healPotionCooldownRemaining=0;}return out;};
  }

  if(typeof supplyDetail==='function'){
    const baseSupplyDetail=supplyDetail;
    supplyDetail=function(item){if(isHealPotion(item))return `恢復 ${item.healAmount} HP · 自動使用冷卻 ${globalThis.EmberwildSecondsCombat?.active?item.timing.cooldownSeconds:Math.round(item.cooldown)} ${globalThis.EmberwildSecondsCombat?.active?'秒':'回合'} · 單價 ${Math.round(item.cost)} 金幣`;return baseSupplyDetail(item);};
  }
  if(typeof useSupply==='function'){
    const baseUseSupply=useSupply;
    useSupply=function(id){const item=SHOP.find(x=>x.id===id);if(isHealPotion(item))return toast('治療藥水僅由自動喝藥設定使用');return baseUseSupply(id);};
  }

  const settingIcon=name=>__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+name,[],{size:16});
  // v0.068: heroes may cast equipped heal skills between encounters (脫戰恢復) to reach the recovery HP target sooner.
  function recoveryHealingSetting(h){const skills=(h.skillLoadout?.active||[]).map(id=>globalThis.__EMBERWILD_SKILLS?.byId(id)).filter(sk=>sk&&['heal','regen'].includes(sk.effect||sk.kind));return `<label class="heal-recovery-skill"><input type="checkbox" ${h.recoveryHealing===true?'checked':''} onchange="setHeroRecoveryHealing(${memberKey(h)},this.checked)">戰鬥外使用治療技能回血<span class="small">${skills.length?'已配置：'+esc(skills.map(sk=>sk.name).join('、')):'目前沒有配置治療技能'}</span></label>`;}
  globalThis.setHeroRecoveryHealing=function(key,on){const h=partyMember(key);if(!h)return false;h.recoveryHealing=!!on;save();refreshHealingSettingsModal();return true;};
  function prioritySettings(h){const ids=h.autoPotionPriority||[],items=healPotionItems(),ordered=[...ids.map(id=>items.find(x=>x.id===id)),...items.filter(x=>!ids.includes(x.id))].filter(x=>x&&x.id!==h.autoPotionId);return `<details><summary>備用藥水順序（主藥水缺貨時使用）</summary><div class="heal-priority-list">${ordered.map(x=>{const at=ids.indexOf(x.id);return `<div><label><input type="checkbox" ${at>=0?'checked':''} onchange="setHeroHealingFallback(${memberKey(h)},'${esc(x.id)}',this.checked)">${esc(x.name)}</label>${at<0?'':`<button aria-label="${esc(x.name)}往前" onclick="moveHeroHealingFallback(${memberKey(h)},'${esc(x.id)}',-1)" ${at===0?'disabled':''}>${settingIcon('arrow-up')}</button><button aria-label="${esc(x.name)}往後" onclick="moveHeroHealingFallback(${memberKey(h)},'${esc(x.id)}',1)" ${at===ids.length-1?'disabled':''}>${settingIcon('arrow-down')}</button>`}</div>`;}).join('')}</div></details>`;}
  globalThis.setHeroHealingFallback=function(key,id,on){const h=partyMember(key);if(!h)return;const ids=(h.autoPotionPriority||[]).filter(x=>x!==id);if(on)ids.push(id);if(EmberwildAutoPotions.configureHealingPriority(key,ids))refreshHealingSettingsModal();};
  globalThis.moveHeroHealingFallback=function(key,id,delta){const h=partyMember(key);if(!h)return;const ids=[...(h.autoPotionPriority||[])],at=ids.indexOf(id),next=at+delta;if(at<0||next<0||next>=ids.length)return;[ids[at],ids[next]]=[ids[next],ids[at]];if(EmberwildAutoPotions.configureHealingPriority(key,ids))refreshHealingSettingsModal();};
  function manaSettingsView(h){manaSettings(h);const m={threshold:h.autoManaPotionThresholdPct,priority:h.autoManaPotionPriority},items=manaItems(),available=items.length>0;return `<section class="heal-mana-settings"><b>魔力藥水</b><label><input type="checkbox" ${h.autoManaPotion?'checked':''} ${available?'':'disabled'} onchange="setHeroManaSettings(${memberKey(h)},this.checked,${m.threshold},JSON.stringify(partyMember(${memberKey(h)}).autoManaPotionPriority))">自動使用</label><label>MP ≤ <input aria-label="${esc(characterName(h))} MP 藥水門檻" type="number" min="1" max="99" value="${m.threshold}" ${available?'':'disabled'} onchange="setHeroManaSettings(${memberKey(h)},${h.autoManaPotion===true},Number(this.value),JSON.stringify(partyMember(${memberKey(h)}).autoManaPotionPriority))">%</label><label>使用順序<select multiple aria-label="${esc(characterName(h))} 魔力藥水順序" ${available?'':'disabled'} onchange="setHeroManaPriority(${memberKey(h)},Array.from(this.selectedOptions,o=>o.value))">${[...m.priority.map(id=>items.find(x=>x.id===id)),...items.filter(x=>!m.priority.includes(x.id))].filter(Boolean).map(x=>`<option value="${esc(x.id)}" ${m.priority.includes(x.id)?'selected':''}>${esc(x.name)}</option>`).join('')}</select></label><small>${available?'獨立冷卻，不影響普攻及技能。使用順序：'+m.priority.map(id=>items.find(x=>x.id===id)?.name||id).join('、'):'目前沒有正式可取得的魔力藥水；保留設定接口，未新增道具來源。'}</small></section>`;}
  globalThis.setHeroManaPriority=function(key,priority){const h=partyMember(key);if(h&&EmberwildAutoPotions.configureMana(key,{enabled:h.autoManaPotion,threshold:h.autoManaPotionThresholdPct,priority}))refreshHealingSettingsModal();};
  globalThis.setHeroManaSettings=function(key,enabled,threshold,priority){if(EmberwildAutoPotions.configureMana(key,{enabled,threshold,priority:JSON.parse(priority)}))refreshHealingSettingsModal();};
  function healingSettingsRows(){
    const items=healPotionItems();
    return heroes().map(h=>{
      normalizeHeroHealingSettings(h);
      const item=selectedHealPotion(h);
      return `<div class="heal-auto-row"><b>${esc(characterName(h))} · ${esc(CLASSES[h.job].name)}</b><label><input type="checkbox" ${h.autoPotion?'checked':''} onchange="setHeroAutoPotion(${memberKey(h)},this.checked)">自動喝藥</label><label>HP ≤ <input type="number" min="1" max="99" step="1" value="${h.autoPotionThresholdPct}" onchange="setHeroAutoPotionThreshold(${memberKey(h)},this.value)">%</label><label>使用 <select onchange="setHeroAutoPotionItem(${memberKey(h)},this.value)">${items.map(x=>`<option value="${esc(x.id)}" ${x.id===h.autoPotionId?'selected':''}>${esc(x.name)} ×${healPotionCount(x.id)}</option>`).join('')}</select></label><span class="heal-auto-detail">${item?`${esc(item.name)}：恢復 ${item.healAmount} HP · 冷卻 ${globalThis.EmberwildSecondsCombat?.active?item.timing.cooldownSeconds:item.cooldown} ${globalThis.EmberwildSecondsCombat?.active?'秒':'回合'} · <span class="heal-stock">共用庫存 ${healPotionCount(item.id)}</span>`:'沒有可用治療藥水'}${h.healPotionCooldownRemaining>0?`<br><span class="heal-auto-cd">目前冷卻剩餘 ${Number(h.healPotionCooldownRemaining.toFixed(1))} ${globalThis.EmberwildSecondsCombat?.active?'秒':'回合'}</span>`:''}</span>${recoveryHealingSetting(h)}${prioritySettings(h)}${manaSettingsView(h)}</div>`;
    }).join('');
  }

  globalThis.openHealingSettings=function(refresh=false){
    if(!party)return;
    ensureHealingPotionState();
    const modal=$('modal');
    modal.dataset.view='healing-settings';
    modal.innerHTML=`<h2>自動喝水設定</h2><p class="small">設定上陣角色的 HP 門檻與使用藥水；後備成員會保留原設定，重新上陣時沿用。藥水使用獨立冷卻，不占普攻或技能行動；冷卻依戰鬥秒數倒數，切換遭遇不會重置。</p><div class="heal-settings-modal">${healingSettingsRows()}</div><div class="actions"><button class="primary" onclick="closeModal()">完成</button></div>`;
    if(!modal.open)modal.showModal();
  };

  function refreshHealingSettingsModal(){
    const modal=$('modal');
    if(modal?.open&&modal.dataset.view==='healing-settings')openHealingSettings(true);
  }

  function healingControlPanel(){
    if(!party)return '';
    ensureHealingPotionState();
    const deployed=heroes();
    let enabled=0;
    const chips=deployed.map(h=>{
      normalizeHeroHealingSettings(h);
      const item=selectedHealPotion(h);
      if(h.autoPotion)enabled++;
      const text=h.autoPotion?`${esc(characterName(h))} ≤${h.autoPotionThresholdPct}% · ${item?esc(item.name):'無藥水'}`:`${esc(characterName(h))} 關閉`;
      return `<span class="heal-auto-chip ${h.autoPotion?'':'off'}" title="${text}">${text}</span>`;
    }).join('');
    return `<section class="panel heal-auto-panel" aria-label="自動喝水設定摘要"><div class="heal-auto-title"><h2>自動喝水</h2><span class="heal-auto-state">${enabled}/${deployed.length} 啟用</span><div class="heal-auto-summary">${chips}</div><button class="heal-auto-settings-button" onclick="openHealingSettings()">設定</button></div></section>`;
  }

  if(typeof battleView==='function'){
    const baseBattleView=battleView;
    battleView=function(){
      let html=baseBattleView();
      html=html.replace(/<details><summary>隊伍補給<\/summary>[\s\S]*?<\/details>/g,'');
      html=html.replace(/<label class="auto-potion">[\s\S]*?<\/label>/g,'');
      html=html.replace(/<button[^>]*onclick="[^"]*(?:buyPotion|\bpotion\()[^"]*"[^>]*>[\s\S]*?<\/button>/g,'');
      const panel=healingControlPanel(),marker='<div class="text-battle-layout">';
      return html.includes(marker)?html.replace(marker,panel+marker):panel+html;
    };
  }
  if(typeof shopView==='function'){
    shopView=function(){
      ensureHealingPotionState();if(typeof ensureMarket==='function')ensureMarket();const h=pageHero('shop'),inv=healingInventory();
      const healCards=healPotionItems().map(item=>`<article class="card heal-shop-card"><h3>${esc(item.name)}</h3><p class="item-flavor"><b>說明：</b>${esc(globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('item',item.id)??'')}</p><p class="heal-spec"><b>詳細：</b>恢復 ${item.healAmount} HP · 冷卻 ${globalThis.EmberwildSecondsCombat?.active?item.timing.cooldownSeconds:item.cooldown} ${globalThis.EmberwildSecondsCombat?.active?'秒':'回合'}</p><div class="row"><span>共用 ${healPotionCount(item.id)} 瓶</span><span>${item.cost} 金幣／瓶</span></div><div class="actions">${ownerControls(`<button onclick="buyHealingPotion('${item.id}')" ${h.gold<item.cost?'disabled':''}>購買 1 瓶</button>`,h.job)}</div><p class="heal-no-manual">治療藥水沒有手動使用按鈕；由戰鬥頁的角色自動治療設定觸發。</p></article>`).join('');
      const supplyCards=SHOP.filter(x=>!isHealPotion(x)).map(item=>`<article class="card"><h3>${esc(item.name)}</h3><p class="item-flavor"><b>說明：</b>${esc(globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('item',item.id)??'')}</p><p class="item-detail small"><b>詳細：</b>${esc(supplyDetail(item))}</p><div class="row"><span>共用 ${h.consumables[item.id]||0} 瓶</span><span>${item.cost} 金幣</span></div><div class="actions">${ownerControls(`<button onclick="buySupply('${item.id}')" ${h.gold<item.cost?'disabled':''}>購買</button><button onclick="useSupply('${item.id}')" ${!h.consumables[item.id]?'disabled':''}>對${esc(characterName(h))}使用</button>`,h.job)}</div></article>`).join('');
      const market=typeof marketCards==='function'?marketCards():'';
      const marketHead=party?.market?`<div class="actions market-refresh"><span>素材商品 · 第 ${party.market.serial} 批</span><button onclick="refreshMarket()">刷新商店 · ${MARKET_REFRESH_COST} 金幣</button></div>`:'';
      return `<div class="actions"><button onclick="showTestCodes()">兌換碼</button></div>`+heading('SUPPLIES / 全隊共用','商店')+pageSelector('shop')+`<section class="panel shared-shop-info"><b>道具設定角色：${esc(characterName(h))} · ${h.gold} 金幣</b>${uiHelp('補給說明','治療藥水購買後進入全隊共用庫存，依戰鬥事件與自動治療設定使用；沒有手動喝藥。元素附魔、抗性與增幅藥水仍可手動使用，附魔效果依角色出戰的戰鬥秒數計時，抗性與增幅依現實時間計時。')}<p class="supply-countdown" data-job="${h.job}">${supplyStatus(h)||'目前無持續型消耗品效果'}</p></section>${marketHead}<div class="shared-shop-grid">${healCards}${market}${supplyCards}</div>`;
    };
  }

  if(typeof guideView==='function'){
    const baseGuide=guideView;
    guideView=function(){return `<section class="panel"><h2>自動治療藥水</h2><p>每名角色可設定自動喝藥開關、HP 百分比門檻與指定治療藥水。判定發生在戰鬥事件結算時；使用治療藥水不會取消角色的攻擊。治療藥水使用後依品項進入秒數冷卻，冷卻期間不會再喝。治療藥水不提供手動使用按鈕。</p></section>`+baseGuide();};
  }

  if(typeof save==='function'){
    const baseSave=save;
    save=function(show=false){ensureHealingPotionState();return baseSave(show);};
  }

  // Recover a balance file containing healing potions even if an earlier boot pass
  // rejected its extended item list before this module was installed.
  try{
    ensureHealingPotionState();
    const raw=balanceSourceText();
    if(raw){const cfg=JSON.parse(raw);applyBalanceConfig(cfg,{persist:false});}
    ensureHealingPotionState();
    if(state)save();
  }catch(e){console.warn('治療藥水設定載入失敗，使用內建預設值',e);addDefaultHealPotionsTo(SHOP);ensureHealingPotionState();}
  // Expose the healing inventory helpers for later shop / inventory UI modules.
  globalThis.ensureHealingPotionState=ensureHealingPotionState;
  globalThis.healPotionItems=healPotionItems;
  globalThis.isHealPotion=isHealPotion;
  globalThis.healPotionCount=healPotionCount;
  globalThis.setHealPotionCount=setHealPotionCount;
  globalThis.healingInventory=healingInventory;
  if(state)render();
})();
