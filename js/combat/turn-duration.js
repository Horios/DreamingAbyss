
/* Update 30: combat status durations use battle turns instead of seconds. */
(function installTurnDurationSystem(){
  const TIME_UNITS={supportDuration:'battleRounds',itemDuration:'battleRounds'};
  const SUPPLY_KEYS=['imbue','ward','elementTonic'];
  const api=EmberwildTimedBoosts;
  const roundReferenceMs=cfg=>Math.max(1,Number(cfg?.balanceSettings?.combat?.pacing?.roundMinimumMs ?? (typeof GS==='function'?GS('combat.pacing.roundMinimumMs',6000):6000))||6000);
  const clone=v=>JSON.parse(JSON.stringify(v));
  function turnsFromLegacySeconds(seconds,cfg){return Math.max(1,Math.ceil(Math.max(0,Number(seconds)||0)/(roundReferenceMs(cfg)/1000)));}
  function normalizeTurnConfig(input){
    const out=clone(input||{}),legacyItems=out?.timeUnits?.itemDuration!=='battleRounds';
    api.migrateElementalConfig(out);
    if(Array.isArray(out.supportSkills))for(const list of out.supportSkills||[])for(const sk of list||[]){
      if(Number.isFinite(sk.duration))sk.duration=Math.max(0,Math.round(sk.duration));
      if(Number.isFinite(sk.cooldown))sk.cooldown=Math.max(0,Math.round(sk.cooldown));
    }
    if(Array.isArray(out.items))for(const item of out.items){
      if(api.isItem(item)||api.isElementalItem(item))continue;
      if(Number.isFinite(item.duration))item.duration=legacyItems&&item.duration>0?turnsFromLegacySeconds(item.duration,out):Math.max(0,Math.round(item.duration));
    }
    out.timeUnits={...(out.timeUnits||{}),...TIME_UNITS};
    return out;
  }
  function migrateSupplyBuff(buff){
    if(!buff||typeof buff!=='object')return null;
    if(Number.isFinite(buff.remainingTurns)){
      const left=Math.max(0,(buff.clock==='battleSeconds'?buff.remainingTurns:Math.ceil(buff.remainingTurns)));if(left<=0)return null;
      return {...buff,remainingTurns:left,totalTurns:Math.max(left,(buff.clock==='battleSeconds'?Number(buff.totalTurns)||left:Math.ceil(Number(buff.totalTurns)||left))),until:0};
    }
    if(Number.isFinite(buff.until)&&buff.until>Date.now()){
      const left=Math.max(1,Math.ceil((buff.until-Date.now())/roundReferenceMs()));
      return {element:buff.element,remainingTurns:left,totalTurns:left,until:0};
    }
    return null;
  }
  function migrateHeroSupplyTurns(h){if(!h)return;for(const key of SUPPLY_KEYS)h[key]=key==='imbue'?migrateSupplyBuff(h[key]):api.compactBuffs(api.buffRows(h[key]).map(b=>api.migrateElementalBuff(b,key,{item:SHOP.find(x=>x.id===b.itemId)||SHOP.find(x=>x.type===key&&x.element===b.element),settings:GAMEPLAY_SETTINGS})).filter(Boolean));}
  function migratePartySupplyTurns(){if(party?.members)for(const h of party.members)migrateHeroSupplyTurns(h);else if(state)migrateHeroSupplyTurns(state);}
  function decrementSupplyTurns(){
    if(!party)return;
    for(const h of heroes()){const b=activeSupply(h,'imbue');if(!b)continue;b.remainingTurns=Math.max(0,Math.ceil(b.remainingTurns)-1);b.until=0;if(b.remainingTurns<=0)h.imbue=null;}
  }

  EFFECT_NAMES.regen='每回合回復生命';
  globalThis.activeSupplies=function(h,key){const b=h?.[key];return api.ELEMENTAL_TYPES.includes(key)?api.elementalActive(b):b&&Number.isFinite(b.remainingTurns)&&b.remainingTurns>0?[b]:[];};
  activeSupply=function(h,key){return activeSupplies(h,key)[0]||null;};
  useSupply=function(id){const item=SHOP.find(x=>x.id===id);if(!item||(state.consumables[id]||0)<1)return;const turns=Math.max(1,Math.round(Number(item.duration)||1)),buff=api.isElementalItem(item)?api.createElementalBuff(item):{element:item.element,remainingTurns:turns,totalTurns:turns,until:0};state.consumables[id]--;state[item.type]=buff;save();render();toast('已使用'+item.name);};
  supplyStatus=function(h){return SUPPLY_KEYS.flatMap(key=>activeSupplies(h,key).map(b=>ELEMENTS[b.element]+{imbue:'附魔',ward:'抗性',elementTonic:'增幅'}[key]+' '+(key==='imbue'?Math.ceil(b.remainingTurns)+' 回合':api.timeText(api.remainingMs(b))+'（現實時間）'))).join(' ／ ');};
  supplyDetail=function(item){const effect=item.type==='imbue'?`普通攻擊轉為${ELEMENTS[item.element]}屬性`:item.type==='ward'?`${ELEMENTS[item.element]}屬性傷害減少 ${item.effectPercent}%`:item.type==='elementTonic'?`${ELEMENTS[item.element]}屬性傷害增加 ${item.effectPercent}%`:'依道具效果生效',duration=api.isElementalItem(item)?`持續 ${item.durationMinutes} 分鐘（現實時間） · 同名同效果累加時間；不同倍率獨立計時；單一狀態上限 24 小時`:item.duration?`持續 ${Math.round(item.duration)} 戰鬥回合`:'立即生效';return `${effect} · ${duration} · 單價 ${item.cost} 金幣`;};
  globalThis.supplyBuffDetails=function(b,key){const real=api.ELEMENTAL_TYPES.includes(key),labels={imbue:['附魔藥水','普攻改為'+ELEMENTS[b.element]+'屬性'],ward:['抗性藥水',ELEMENTS[b.element]+'傷害減免 '+b.effectPercent+'%'],elementTonic:['增幅藥水',ELEMENTS[b.element]+'傷害增加 '+b.effectPercent+'%']};return {name:b.name||ELEMENTS[b.element]+labels[key][0],detail:labels[key][1],time:real?api.timeText(api.remainingMs(b))+'（剩餘）':Math.ceil(b.remainingTurns)+' / '+Math.ceil(b.totalTurns||b.remainingTurns)+' 回合',clock:real?'現實時間':'出戰回合'};};

  castSupport=function(h,index){const sk=SUPPORT[h.job][index];let targets=sk.target==='allies'?living().map(heroKey):sk.target==='weakest'?[heroKey([...living()].sort((a,b)=>a.hp/solo.stats(a).hp-b.hp/solo.stats(b).hp)[0])]:sk.target==='enemies'?foes.filter(e=>e.hp>0).map(e=>e.id):[foes.find(enemyAvailableForSingleTarget)?.id];for(const target of targets.filter(Boolean)){effects=effects.filter(e=>!((e.sourceKey??e.source)===memberKey(h)&&e.skill===index&&e.target===target));effects.push({source:h.job,sourceKey:memberKey(h),skill:index,target,kind:sk.kind,value:supportAmount(h.job,index),until:partyClock+Math.max(0,Math.round(sk.duration)),name:sk.name});if(sk.kind==='regen'){const ally=party.members.find(a=>heroKey(a)===target);ally.hp=Math.min(solo.stats(ally).hp,ally.hp+solo.stats(ally).hp*supportAmount(h.job,index));}}note(characterName(h)+'施放 '+sk.name+' · '+Math.round(sk.duration)+' 回合');};
  supportSkillDetail=function(job,i,h=state){const sk=SUPPORT[job]?.[i];if(!sk)return '';const level=Math.max(1,h?.supportLevels?.[i]||1),value=+((sk.value+Math.max(0,level-1)*(Number.isFinite(sk.effectPerLevel)?sk.effectPerLevel:GS('skills.support.effectPerExtraLevel',.2)))*100).toFixed(1),cd=supportSkillCooldown(h,i);return `${actionTurnElementLabel(sk.element)} · 目標 ${TARGET_NAMES[sk.target]} · ${EFFECT_NAMES[sk.kind]} ${value}% · 持續 ${Math.round(sk.duration)} 戰鬥回合 · 冷卻 ${cd} 回合 · 需求 LV${sk.level}${i===2?'／二轉':''}`;};

  battleBuffRows=function(){
    const rows=[],row=(who,name,detail,time,clock)=>`<tr><td>${esc(who)}</td><td>${esc(name)}</td><td>${esc(detail)}</td><td class="buff-time">${esc(time)}</td><td>${esc(clock)}</td></tr>`,names={attack:'攻擊提升',power:'技能威力提升',guard:'傷害減免',fracture:'防禦降低',weaken:'攻擊降低',vulnerable:'承受傷害增加',critical:'暴擊率提升',regen:'每回合恢復最大生命'};
    for(const e of effects.filter(e=>e.until>partyClock)){
      const h=party.members.find(h=>heroKey(h)===e.target),foe=foes.find(f=>f.id===e.target);if(!h&&!foe)continue;const sk=SUPPORT[e.source]?.[e.skill],total=Math.max(0,Math.round(sk?.duration??0));
      rows.push(row(h?characterName(h):foe.name,e.name,(names[e.kind]||e.kind)+' '+Number((e.value*100).toFixed(1))+'%',Math.max(0,Math.ceil(e.until-partyClock))+' / '+(total||'—')+' 回合','戰鬥回合'));
    }
    for(const h of party.members){
      const who=characterName(h)+(party.active.includes(memberKey(h))?'':'（候補）');
      for(const key of SUPPLY_KEYS)for(const b of activeSupplies(h,key)){const d=supplyBuffDetails(b,key);rows.push(row(who,d.name,d.detail,d.time,d.clock));}
      if(h.shield>0)rows.push(row(who,'護盾','可抵擋所有來源傷害 · 剩餘 '+Math.round(h.shield),'無回合期限','耗盡或戰鬥結束'));
    }
    return rows.join('')||'<tr><td colspan="5" class="no-buffs">目前沒有生效中的 BUFF、DEBUFF 或消耗品效果。</td></tr>';
  };
  showBattleEffects=function(){if(!party)return;const modal=$('modal');modal.innerHTML=`<h2>生效效果與持續時間</h2><p class="small">BUFF／DEBUFF 依戰鬥回合計時；附魔只扣出戰回合；抗性、屬性增幅依現實時間計時，可在探索控制區獨立停用；暫停、停止與關閉頁面仍會扣時。</p><div class="effects-modal-scroll"><table class="effects-modal-table"><thead><tr><th>對象</th><th>效果</th><th>能力變化</th><th>剩餘／總時間</th><th>計時方式</th></tr></thead><tbody id="battle-effect-modal-rows">${battleBuffRows()}</tbody></table></div><button onclick="closeModal()">關閉</button>`;modal.showModal();};

  const pacedRoundTurnDurationBase=pacedRound;
  pacedRound=function*(){const hadCombat=!!party&&(globalThis.__EMBERWILD_RESUMING_ROUND||foes.some(e=>e.hp>0)),priorRound=round-(globalThis.__EMBERWILD_RESUMING_ROUND?1:0);yield* pacedRoundTurnDurationBase();if(hadCombat&&party&&round>priorRound)decrementSupplyTurns();};

  if(typeof battleView==='function'){
    const turnDurationBattleViewBase=battleView;
    battleView=function(){return turnDurationBattleViewBase().replace(/第 (\d+) 秒/g,'第 $1 回合');};
  }
  if(typeof shopView==='function'){
    const turnDurationShopBase=shopView;
    shopView=function(){return turnDurationShopBase().replace(/消耗品按現實時間計時，暫停或關閉遊戲仍會到期。/g,'消耗品效果以戰鬥回合計時；只有角色出戰的戰鬥回合會扣減，暫停或關閉遊戲不會消耗回合。').replace(/持續 (\d+) 秒/g,'持續 $1 回合');};
  }
  if(typeof guideView==='function'){
    const turnDurationGuideBase=guideView;
    guideView=function(){return `<section class="panel"><h2>BUFF／DEBUFF 與消耗品計時</h2><p>輔助技能的 BUFF／DEBUFF 使用戰鬥回合，回復效果每回合觸發一次。附魔藥水只扣該角色的出戰回合；抗性與屬性增幅藥水使用現實分鐘，暫停、停止或關閉頁面仍會扣時。同名且同效果的藥水累加剩餘時間；不同倍率、屬性或能力加成各自保留狀態並獨立計時。每個狀態最多累積 24 小時，超過時提醒且不消耗道具。</p><p>技能冷卻使用施放者自己的行動回合；護盾在耗盡或戰鬥結束時消失。</p></section>`+turnDurationGuideBase();};
  }

  if(typeof exportableBalance==='function'){
    const turnDurationExportBase=exportableBalance;
    exportableBalance=function(){const out=turnDurationExportBase();out.timeUnits={...(out.timeUnits||{}),...TIME_UNITS,elementPotionDuration:'realMinutes'};out.notes=[...(out.notes||[]),'supportSkills[].duration 為戰鬥回合；附魔 items[].duration 為出戰回合。','ward / elementTonic 使用 items[].durationMinutes（現實分鐘）與 effectPercent（百分比）；duration=0。同名同效果累加時間，不同倍率狀態各自計時；單一狀態上限 24 小時，超過時不消耗道具；暫停、停止與離線仍會扣時。'];return out;};
  }
  if(typeof validateBalanceConfig==='function'){
    const turnDurationValidateBase=validateBalanceConfig;
    validateBalanceConfig=function(input){const copy=normalizeTurnConfig(input),out=turnDurationValidateBase(copy);for(const [job,list] of (out.supportSkills||[]).entries())for(const [i,sk] of (list||[]).entries()){if(!Number.isInteger(sk.duration)||sk.duration<0)throw Error(`輔助技能持續回合無效：${job}-${i}`);if(!Number.isInteger(sk.cooldown)||sk.cooldown<0)throw Error(`輔助技能冷卻回合無效：${job}-${i}`);}for(const item of out.items||[])if(!Number.isInteger(item.duration)||item.duration<0)throw Error('道具持續回合無效：'+(item.id||'未知'));out.timeUnits={...(out.timeUnits||{}),...TIME_UNITS};return out;};
  }
  if(typeof balanceReference==='function'){
    const turnDurationReferenceBase=balanceReference;
    balanceReference=function(){const r=turnDurationReferenceBase();r.units??={};r.units.duration='BUFF／DEBUFF 為戰鬥回合；附魔為出戰回合；抗性／屬性增幅為現實分鐘';r.units.cooldown='技能冷卻為施放者自身行動回合';r.balancePaths={...(r.balancePaths||{}),'items[].effectPercent':'抗性或屬性增幅百分比，各道具獨立設定。'};return r;};
  }
  if(typeof applyBalanceConfig==='function'){
    const turnDurationApplyBase=applyBalanceConfig;
    applyBalanceConfig=function(input,{persist=true}={}){const copy=normalizeTurnConfig(input),result=turnDurationApplyBase(copy,{persist:false});if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));if(state)render();return result;};
  }

  /* Migrate an already loaded old balance/save once. Support duration numbers are
     preserved because the old runtime already advanced them by partyClock rounds. */
  try{
    const raw=balanceSourceText();let legacyBalance=null;
    if(raw){try{legacyBalance=JSON.parse(raw);}catch{}}
    if(!raw || legacyBalance?.timeUnits?.itemDuration!=='battleRounds'){
      const ref=legacyBalance||{balanceSettings:GAMEPLAY_SETTINGS};
      for(const item of SHOP)if(item.type!=='healPotion'&&!api.isItem(item)&&!api.isElementalItem(item))item.duration=turnsFromLegacySeconds(item.duration,ref);
      // Migrate the complete input; later module fields are not exportable yet.
      if(raw)localStorage.setItem(BALANCE_KEY,JSON.stringify(normalizeTurnConfig(legacyBalance)));
    }
    migratePartySupplyTurns();
    if(party)save();
  }catch(e){console.warn('回合制 BUFF／消耗品遷移失敗',e);}
  if(state)render();
})();
