/* Single companion slot, existing stat/loot/save paths, bounded combat events. */
(()=>{
  'use strict';
  const M=EmberwildTokens,copy=M.copy;
  let config=M.normalize(),context=null,extraDepth=0,preparingRound=false;
  const combat=new Map();
  const companion=h=>!!h&&h.companionId!==undefined;
  const item=h=>companion(h)?h.bag.find(g=>M.isToken(g)&&g.id===h.tokenId&&M.canEquip(g,h)):null;
  function clear(h){if(h){combat.delete(memberKey(h));effects=effects.filter(e=>e.tokenOwner!==memberKey(h));}else{combat.clear();effects=effects.filter(e=>e.tokenOwner===undefined);}}
  function runtime(h){const key=memberKey(h);if(!combat.has(key))combat.set(key,{round:partyClock,started:false,count:0,used:0,next:0,target:null,hits:0});return combat.get(key);}
  const eventClock=()=>partyClock+(preparingRound?1:0);
  function ready(h,event){const g=item(h),a=g?.snapshot.ability;if(!a||a.event!==event||h.hp<=0)return null;const r=runtime(h);if(eventClock()<r.next||a.maxTriggers>0&&r.used>=a.maxTriggers)return null;if(a.chance<=0||Math.random()>=a.chance)return null;r.used++;r.next=eventClock()+(globalThis.EmberwildSecondsCombat?.active?EmberwildSecondsCombat.tokenTiming(g).cooldownSeconds:a.cooldown);return {g,a,r};}
  function trigger(h,event,target=null){
    const hit=ready(h,event);if(!hit)return false;const {g,a}=hit,v=battleStats(h),before=h.hp;
    if(['attack','guard','critical','power'].includes(a.action)){
      effects=effects.filter(e=>!(e.tokenOwner===memberKey(h)&&e.tokenId===g.id));
      const duration=globalThis.EmberwildSecondsCombat?.active?EmberwildSecondsCombat.tokenTiming(g).durationSeconds:a.duration;
      effects.push({source:heroKey(h),skill:-1,target:heroKey(h),kind:a.action,value:a.value,until:eventClock()+duration,name:g.snapshot.name,tokenOwner:memberKey(h),tokenId:g.id});
    }else if(a.action==='heal'){h.hp=Math.min(v.hp,h.hp+Math.round(healingAmount(h,v.hp*a.value)));if(h.hp>before)recordCombatContribution(h,'healing',h.hp-before);}
    else if(a.action==='shield')applyPureShield(h,v.hp*a.value);
    else if(a.action==='extraDamage'&&target?.hp>0&&!extraDepth){
      extraDepth++;try{const dealt=resolveHit(target,v.atk*a.value,h,weaponElement(h),false,{tokenExtra:true});note(g.snapshot.name+'・追擊 → '+combatEnemyName(target)+' '+dealt+' 傷害','playerDamage');}finally{extraDepth--;}
    }
    note(characterName(h)+'・'+g.snapshot.name+' 觸發','playerAction');return true;
  }
  function ensureBattle(h){if(!companion(h)||h.hp<=0||!foes.some(e=>e.hp>0))return;const r=runtime(h);if(!r.started){r.started=true;r.round=eventClock();trigger(h,'battleStart');}}
  function afterDamage(h,e,before,after){
    if(!companion(h)||before<=0)return;if(after<=0){clear(h);return;}if(after>=before)return;
    ensureBattle(h);trigger(h,'receivedHit',e);const a=item(h)?.snapshot.ability;if(a?.event==='lowHealth'&&h.hp/stats(h).hp<=a.threshold)trigger(h,'lowHealth',e);
  }
  globalThis.EmberwildTokenRuntime={afterDamage};
  const baseResolve=resolveHit;
  resolveHit=function(e,amount,h,element,crit,options={}){
    if(!e||!h)return 0;ensureBattle(h);const before=e.hp,g=item(h),a=g?.snapshot.ability;
    if(!extraDepth&&a){
      if(a.event==='sameTarget'&&context?.kind==='basic'&&context.h===h){const r=runtime(h);if(r.target===e.id)r.hits++;else{r.target=e.id;r.hits=1;}if(r.hits>=a.threshold&&ready(h,'sameTarget'))amount*=1+a.value;}
      if(context?.h===h&&a.action==='damageBonus'&&a.event===(context.kind==='active'?'activeSkill':context.kind==='proc'?'procSkill':'')){if(context.bonus===undefined)context.bonus=!!ready(h,a.event);if(context.bonus)amount*=1+a.value;}
    }
    const dealt=baseResolve(e,amount,h,element,crit,options);
    if(!extraDepth&&companion(h)&&dealt>0){trigger(h,'damage',e);if(context?.kind==='basic'&&context.h===h)trigger(h,'basicHit',e);if(before>0&&e.hp<=0)trigger(h,'kill',e);}
    return dealt;
  };
  const baseBasic=performHeroBasic;
  performHeroBasic=function(h){ensureBattle(h);const previous=context;context={h,kind:'basic'};try{return baseBasic(h);}finally{context=previous;}};
  const baseCast=castPartySkill;
  castPartySkill=function(h,i,v){
    ensureBattle(h);const sk=CLASSES[h?.job]?.skills[i],previous=context;context={h,kind:sk?.[1]==='active'?'active':'proc'};
    try{
      const a=item(h)?.snapshot.ability,healing=['heal','shield','shieldLowest'].includes(sk?.[5]);let reserved=null;
      if(healing&&a?.action==='healingBonus'&&a.event===(context.kind==='active'?'activeSkill':'procSkill')){const r=runtime(h),before={used:r.used,next:r.next};if(ready(h,a.event)){reserved={r,before};v={...(v||battleStats(h)),atk:(v||battleStats(h)).atk*(1+a.value)};}}
      const out=baseCast(h,i,v);if(out!==false)trigger(h,'skillCast');else if(reserved)Object.assign(reserved.r,reserved.before);return out;
    }finally{context=previous;}
  };
  globalThis.EmberwildTokenCombatState={pack:()=>[...combat],restore:rows=>{combat.clear();for(const [k,v] of rows||[])combat.set(k,v);}};
  const baseRound=pacedRound;
  pacedRound=function*(){if(!globalThis.__EMBERWILD_RESUMING_ROUND&&running&&!$('modal').open){preparingRound=true;try{for(const h of living()){ensureBattle(h);const r=companion(h)?runtime(h):null,a=item(h)?.snapshot.ability;if(r?.started&&a?.event==='round'&&eventClock()-r.round+1>=a.threshold)trigger(h,'round');}}finally{preparingRound=false;}}yield* baseRound();if(!foes.some(e=>e.hp>0)||!living().length)clear();};
  const baseReset=resetEncounter;
  resetEncounter=function(){clear();return baseReset();};
  function makeToken(id,quality=null){const d=config.catalog.find(x=>x.id===id);if(!d)return null;const q=quality??d.quality;const g={id:uid(),type:M.TYPE,tokenId:d.id,name:d.name,slot:4,job:0,tier:1,rar:q,plus:0,affix:[],locked:false,snapshot:copy(d),qualityMultipliers:copy(config.qualityMultipliers)};M.validateItem(g,RULES.enhanceMax);return g;}
  function addToken(g){ensureSharedGear();addGear(g);}
  globalThis.createCompanionToken=makeToken;
  globalThis.grantConfiguredToken=function(id,rng=Math.random){
    const def=config.catalog.find(t=>t.id===id);if(!def)return null;
    const quality=def.qualityFixed?def.quality:M.weighted([0,1,2,3],config.drop.qualityWeights,rng),g=makeToken(id,quality);addToken(g);return g;
  };
  function tokenDropChance(e){
    // Match ordinary equipment rules for this monster/kind/difficulty, including
    // timed boosts and level-gap attenuation; keep token pool eligibility below.
    const rules=configuredDropRules(e).filter(r=>['gear','equipment'].includes(r.type));
    return 1-rules.reduce((miss,r)=>miss*(1-effectiveDropChance(r,e)),1);
  }
  function rollTokens(e,rng=Math.random){
    if(!e||e.__tokenDropRolled)return [];e.__tokenDropRolled=true;
    const d=config.drop;if(!M.eligible(d,e)||(monsterCatalogEntry(e.monsterId)?.maxDrops??e.maxDrops??99)===0)return [];
    const pool=config.catalog.filter(t=>M.eligible(t.drop,e));if(!pool.length)return [];
    if(rng()>=tokenDropChance(e))return [];
    const def=M.weighted(pool,pool.map(t=>t.drop.weight),rng),quality=M.weighted([0,1,2,3],d.qualityWeights,rng);if(!def||quality===null)return [];
    const g=makeToken(def.id,def.qualityFixed?def.quality:quality);addToken(g);return [g];
  }
  const baseDrops=rollConfiguredDrops;
  rollConfiguredDrops=function(e,rng=Math.random){const result=baseDrops(e,rng);rollTokens(e,rng);return result;};
  const basePack=packParty;
  packParty=function(){const d=basePack();d.companionEquipmentVersion=M.VERSION;for(const h of d.members){h.tokenId??=null;if(h.companionId!==undefined)h.equipped=Array(5).fill(null);}return d;};
  const baseLoad=loadParty;
  loadParty=function(data){const out=baseLoad(M.prepareSave(data,RULES.bagCapacity));syncTokens();for(const h of party.members.filter(companion))withHero(h,clampVitals);return out;};
  function syncTokens(){if(!party)return;for(const g of state.bag.filter(M.isToken)){const d=config.catalog.find(x=>x.id===g.tokenId);if(d){g.snapshot=copy(d);g.name=d.name;g.qualityMultipliers=copy(config.qualityMultipliers);}}for(const h of party.members.filter(companion)){const g=findGear(h.tokenId);if(g&&!M.canEquip(g,h))h.tokenId=null;}}
  const baseValidate=validateBalanceConfig;
  validateBalanceConfig=function(input){const next=M.normalize(input?.companionTokens),out=baseValidate(input);for(const d of [next.drop,...next.catalog.map(x=>x.drop)])if(d.maps.some(i=>!out.balanceSettings.maps.catalog[i])||d.monsters.some(id=>!out.balanceSettings.monsters.catalog.some(m=>m.id===id)))throw Error('信物掉落指定了不存在的地圖或怪物');out.companionTokens=next;return out;};
  const baseExport=exportableBalance;
  exportableBalance=function(){const out=baseExport();out.companionTokens=copy(config);out.companions=out.companions.map(p=>{const d=EmberwildCompanions.definition(p,out.classes,out.balanceSettings);return {...p,...d,equipmentInternalized:1};});return out;};
  const baseApply=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){const full=validateBalanceConfig(input),next=M.normalize(full.companionTokens),out=baseApply(full,{persist:false});config=next;syncTokens();clear();if(state){for(const h of party.members)withHero(h,clampVitals);save();render();}if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));return out;};
  const baseResetBalance=resetBalanceJSON;
  resetBalanceJSON=function(){const out=baseResetBalance();config=M.normalize();clear();if(state)render();return out;};
  function equipToken(id,key){
    const h=partyMember(key),g=findGear(id);if(!companion(h)||!M.canEquip(g,h)||gearWearer(id)&&gearWearer(id)!==h)return false;
    if(foes.some(e=>e.hp>0))resetEncounter();const previous=h.tokenId,previousHp=h.hp;h.tokenId=id;clear(h);withHero(h,clampVitals);
    if(save()===false){h.tokenId=previous;h.hp=previousHp;return false;}render();return true;
  }
  function unequipToken(key){const h=partyMember(key);if(!companion(h))return false;if(foes.some(e=>e.hp>0))resetEncounter();const previous=h.tokenId,hp=h.hp;h.tokenId=null;clear(h);withHero(h,clampVitals);if(save()===false){h.tokenId=previous;h.hp=hp;return false;}render();return true;}
  globalThis.equipCompanionToken=equipToken;globalThis.unequipCompanionToken=unequipToken;
  const baseUnequip=unequipSharedGear;
  unequipSharedGear=function(id){const h=gearWearer(id);return M.isToken(findGear(id))?h&&unequipToken(memberKey(h)):baseUnequip(id);};
  const basePositions=gearEquipPositions,baseJobs=gearWearableJobs;
  gearEquipPositions=function(g){return M.isToken(g)?[]:basePositions(g);};gearWearableJobs=function(g){return M.isToken(g)?[]:baseJobs(g);};
  const baseFilter=filteredGear;
  filteredGear=function(){return baseFilter().filter(g=>!M.isToken(g));};
  const baseNameHTML=equipmentNameHTML,baseDisplay=equipmentDisplayName,baseDesc=gearDesc;
  equipmentDisplayName=function(g){return M.isToken(g)?`+${g.plus} ${g.snapshot.name}`:baseDisplay(g);};
  equipmentNameHTML=function(g){return M.isToken(g)?`<span class="effect-quality-${g.rar}">${esc(equipmentDisplayName(g))}</span>`:baseNameHTML(g);};
  gearDesc=function(g){return M.isToken(g)?tokenStatsText(g):baseDesc(g);};
  for(const name of ['reroll','rerollGear','rerollAffix','autoReroll','rerollEquipmentPowerTier','setAffixLock','toggleAffixLock']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(id,...args){if(M.isToken(findGear(id)))return toast('信物使用固定複合屬性');return base(id,...args);};}
  const baseEnhance=enhance;
  enhance=function(id){const h=gearWearer(id),out=baseEnhance(id);if(h)withHero(h,clampVitals);return out;};
  try{const saved=JSON.parse(balanceSourceText()||'null');if(saved?.companionTokens)config=M.normalize(saved.companionTokens);}catch(e){console.warn('信物設定載入失敗',e);}
  globalThis.__EMBERWILD_TOKEN_TEST={makeToken,rollTokens,tokenDropChance,trigger,ensureBattle,clear,item,ready,get config(){return copy(config);},get combat(){return combat;}};
  // UI is below so all controls use the same validated mutations above.
  function tokenStatsText(g){
    // Merge identical stat targets after quality and enhancement scaling.
    const totals=new Map();
    for(const e of M.effectsFor(g,GS('equipment.enhance.statPerLevel',.05))){
      const key=JSON.stringify([e.key,e.element,e.race,e.skill]);
      if(totals.has(key)&&typeof e.value==='number')totals.get(key).value+=e.value;
      else totals.set(key,{...e});
    }
    return [...totals.values()].map(e=>equipmentIdentityEffectText({...e,value:typeof e.value==='number'?Number(e.value.toFixed(6)):e.value})
      .replace(/此裝備攻擊力/g,'攻擊力').replace(/此裝備最大生命/g,'生命上限').replace(/此裝備防禦/g,'防禦力')
      .replace(/角色總攻擊力/g,'攻擊力').replace(/角色最大生命/g,'生命上限').replace(/角色總防禦/g,'防禦力')
      .replace(/此武器攻擊屬性/g,'普攻屬性').replace('（固定屬性 basicElement）','')).join(' / ');
  }
  function abilityText(g){
    const a=g.snapshot.ability,t=globalThis.EmberwildSecondsCombat?.active?EmberwildSecondsCombat.tokenTiming(g):null,percent=Number((a.value*100).toFixed(2)),chance=Number((a.chance*100).toFixed(2));
    const action={attack:`攻擊力提升 ${percent}%`,guard:`受到的傷害減少 ${percent}%`,critical:`暴擊率提升 ${percent}%`,power:`技能威力提升 ${percent}%`,heal:`回復生命上限 ${percent}% 的生命`,shield:`獲得生命上限 ${percent}% 的護盾`,extraDamage:`追加攻擊力 ${percent}% 的傷害`,damageBonus:`傷害增幅 ${percent}%`,healingBonus:`治療與護盾效果增幅 ${percent}%`}[a.action];
    const event={battleStart:'戰鬥開始時',kill:'擊殺敵人時',receivedHit:'受到傷害時',basicHit:'普攻命中時',skillCast:'施放技能後',damage:'造成傷害時',sameTarget:`連續普攻同一目標達 ${a.threshold} 次後`,lowHealth:`受到傷害且生命不高於 ${Number((a.threshold*100).toFixed(2))}% 時`,round:t?`戰鬥 ${t.firstTriggerSeconds} 秒起，每 ${t.triggerIntervalSeconds} 秒`:`戰鬥第 ${a.threshold} 回合起，每回合`}[a.event];
    const skill=a.event==='activeSkill'?'主動技能':a.event==='procSkill'?'觸發技能':null;
    const text=skill?`${skill}${action}`:`${event}${action}`;
    const extras=[];
    if(a.chance<1)extras.push(`觸發機率 ${chance}%`);
    if(a.duration)extras.push(t?`持續 ${t.durationSeconds} 秒`:`持續 ${a.duration} 回合`);
    if(a.cooldown||t?.cooldownSeconds)extras.push(t?`冷卻 ${t.cooldownSeconds} 秒`:`冷卻 ${a.cooldown} 回合`);
    if(a.maxTriggers)extras.push(`每場最多 ${a.maxTriggers} 次`);
    return [text,...extras].join(' · ');
  }
  function tokenDescription(g){return (globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('token',g.tokenId)??'').replace(/(?:所有)?夥伴通用的?單一信物[。]?/g,'').replace(/^[^：]*：\s*$/,'').trim();}
  globalThis.companionTokenJobLabel=g=>g.snapshot.job===undefined||g.snapshot.job==='all'?'通用':CLASSES[g.snapshot.job].name;

  globalThis.companionTokenDescription=tokenDescription;
  globalThis.companionTokenAbilityText=abilityText;
  function tokenIcon(g){
    const key=({berserk:'swords',guardian:'shield',pursuit:'crosshair',arcane:'wand-sparkles',echo:'audio-lines',hunt:'bow-arrow',prayer:'hand-heart',revival:'heart-pulse',plunder:'droplets',endurance:'hourglass'})[g.tokenId]||'medal';
    return `<span class="inventory-item-icon effect-quality-${g.rar}" aria-hidden="true">${globalThis.__EMBERWILD_INVENTORY_ICON?.('token',g.tokenId,'lucide:'+key,{size:26})||__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+key,[],{size:26})}</span>`;
  }
  function tokenIdentity(g){return `<div class="token-identity">${tokenIcon(g)}<b>${equipmentNameHTML(g)}</b><span class="tag token-job-tag">${esc(companionTokenJobLabel(g))}</span>${gearWearer(g.id)?`<span class="small token-wearer">${esc(characterName(gearWearer(g.id)))} · 已裝備</span>`:''}</div>`;}
  function detail(g){const description=tokenDescription(g);return `${tokenIdentity(g)}${description?`<p>${esc(description)}</p>`:''}<p class="small">${esc(gearDesc(g))}</p><p class="token-special">${esc(abilityText(g))}</p>`;}
  function companionCards(){return `<section class="panel companion-token-panel"><h2>夥伴信物</h2><p class="small">夥伴依自身等級成長，只使用一件信物；後備與名冊夥伴保留穿戴。更換或卸下信物會放棄目前遭遇。</p><div class="token-grid">${party.members.filter(companion).map(h=>{const g=item(h);return `<article class="card token-slot" data-token-owner="${memberKey(h)}"><h3>${esc(characterName(h))} · ${esc(CLASSES[h.job].name)}</h3>${g?gearSlotHTML(g):'<p class="empty">未穿戴信物</p>'}<div class="actions"><button onclick="showCompanionTokens(${memberKey(h)})">更換信物</button>${g?`<button onclick="unequipCompanionToken(${memberKey(h)})">卸下</button><button onclick="openForge('${g.id}')">強化</button><button type="button" disabled title="信物目前沒有鑲嵌孔">鑲嵌</button><button type="button" onclick="showWornTokenDetail('${g.id}')">詳情</button>`:''}</div></article>`;}).join('')||'<p>招募夥伴後即可使用信物。</p>'}</div></section>`;}
  globalThis.showWornTokenDetail=function(id){const g=findGear(id);if(!M.isToken(g)||!gearWearer(id))return false;const modal=$('modal');modal.innerHTML=`<h2>信物詳情</h2>${detail(g)}<p class="small">品質：${AFFIX_RANK[g.rar]} · 強化 +${g.plus} · ${esc(companionTokenJobLabel(g))}</p><div class="actions"><button type="button" onclick="closeModal()">關閉</button></div>`;if(!modal.open)modal.showModal();return true;};
  globalThis.showCompanionTokens=function(key){const h=partyMember(key);if(!companion(h))return;const current=item(h);$('modal').innerHTML=`<div class="token-dialog-header"><h2>${esc(characterName(h))} · 信物管理</h2><button type="button" onclick="closeModal()">關閉</button></div>${current?detail(current):'<p>目前未穿戴信物</p>'}<div class="token-grid">${state.bag.filter(g=>M.canEquip(g,h)&&(!gearWearer(g.id)||gearWearer(g.id)===h)).map(g=>`<article class="card">${detail(g)}${comparison(h,g)}<button data-token-id="${g.id}" onclick="if(equipCompanionToken('${g.id}',${key}))closeModal()" ${g===current?'disabled':''}>${g===current?'已穿戴':'穿戴'}</button></article>`).join('')||'<p>背包目前沒有可穿戴的信物。</p>'}</div>`;$('modal').showModal();};
  function comparison(h,g){const before=stats(h),after=stats({...h,tokenId:g.id});return `<p class="small">換裝比較：${['hp','atk','def','crit','critDamage','speed','pierce','defenseIgnore','lifesteal','evasion'].filter(k=>before[k]!==after[k]).map(k=>`${({hp:'HP',atk:'攻擊',def:'防禦',crit:'暴擊',critDamage:'暴傷',speed:'速度',pierce:'穿透',defenseIgnore:'無視',lifesteal:'竊取',evasion:'閃避'})[k]} ${Number(before[k].toFixed(3))} → ${Number(after[k].toFixed(3))}`).join(' / ')||'面板相同，請比較特殊效果'}</p>`;}
  const tokenDefaults=()=>({name:'',job:'all',quality:'all',locked:'all',worn:'all',plusMin:'',plusMax:'',stat:'',op:'gte',value:'',upper:''});
  let tokenFilter=tokenDefaults(),tokenSort='quality',tokenDirection='desc',tokenMulti=false,tokenAdvanced=false,tokenSelected=new Set(),tokenReview=null,tokenDetailId=null;
  const tokenOwned=g=>!!gearWearer(g.id)||!!globalThis.__EMBERWILD_TEAM_EQUIPMENT?.references(g.id).length;
  const tokenActionable=(g,mode)=>M.isToken(g)&&!g.locked&&!tokenOwned(g)&&(mode!=='sell'||globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)!==false);
  const tokenBound=(n,v,lower)=>v===''||Number.isFinite(Number(v))&&(lower?n>=Number(v):n<=Number(v));
  function tokenNumeric(g){
    const totals={atk:0,hp:0,def:0,speed:0},flat={flatAttack:'atk',flatHp:'hp',flatDefense:'def',speed:'speed'};
    for(const e of M.effectsFor(g,GS('equipment.enhance.statPerLevel',.05))){
      if(e.key==='basicElement')continue;
      const key=flat[e.key]||(['attackPct','hpPct','defensePct'].includes(e.key)?e.key:[e.key,e.element||'',e.race||'',e.skill??''].join(':'));
      totals[key]=Number(((totals[key]||0)+e.value).toFixed(6));
    }
    return totals;
  }
  function tokenRows(){
    const f=tokenFilter,fields=equipmentNumericFields();
    return state.bag.filter(M.isToken).map((g,index)=>({g,index,stats:tokenNumeric(g)})).filter(({g,stats})=>{
      const job=g.snapshot.job===undefined||g.snapshot.job==='all'?'common':String(g.snapshot.job);
      if(f.name&&!g.snapshot.name.includes(f.name)||f.job!=='all'&&job!==f.job||f.quality!=='all'&&g.rar!==Number(f.quality)||f.locked!=='all'&&!!g.locked!==(f.locked==='yes')||f.worn!=='all'&&!!gearWearer(g.id)!==(f.worn==='yes')||!tokenBound(g.plus,f.plusMin,true)||!tokenBound(g.plus,f.plusMax,false))return false;
      if(f.stat&&f.value!==''&&fields.some(x=>x.key===f.stat)){
        const n=stats[f.stat],v=Number(f.value),u=Number(f.upper);
        if(!Number.isFinite(n)||n===0||!Number.isFinite(v))return false;
        const checks={gt:()=>n>v,gte:()=>n>=v,eq:()=>n===v,lte:()=>n<=v,lt:()=>n<v,range:()=>f.upper!==''&&Number.isFinite(u)&&n>=v&&n<=u};
        if(!checks[f.op]?.())return false;
      }
      return true;
    }).map(row=>({...row,value:tokenSort==='name'?row.g.snapshot.name:tokenSort==='quality'?row.g.rar:tokenSort==='enhance'?row.g.plus:tokenSort==='price'?equipmentSellPrice(row.g):tokenSort==='acquired'?row.g.acquiredAt??null:row.stats[tokenSort]||null})).sort((a,b)=>{
      const missingA=a.value==null,missingB=b.value==null;if(missingA!==missingB)return missingA?1:-1;
      const diff=missingA?0:typeof a.value==='string'?a.value.localeCompare(b.value):a.value-b.value;
      return (tokenDirection==='asc'?diff:-diff)||(tokenSort==='quality'?b.g.plus-a.g.plus:0)||a.index-b.index;
    });
  }
  const tokenRedraw=()=>{tokenReview=null;render();};
  globalThis.setTokenFilter=(key,value)=>{if(!Object.hasOwn(tokenFilter,key))return false;tokenFilter[key]=String(value);tokenSelected.clear();tokenRedraw();return true;};
  globalThis.clearTokenFilters=()=>{tokenFilter=tokenDefaults();tokenSelected.clear();tokenRedraw();};
  globalThis.setTokenSort=value=>{if(!['quality','enhance','name','acquired','price',...equipmentNumericFields().map(f=>f.key)].includes(value))return false;tokenSort=value;tokenRedraw();return true;};
  globalThis.toggleTokenDirection=()=>{tokenDirection=tokenDirection==='desc'?'asc':'desc';tokenRedraw();};
  globalThis.setTokenAdvanced=value=>{tokenAdvanced=!!value;};
  globalThis.toggleTokenMulti=()=>{tokenMulti=!tokenMulti;tokenSelected.clear();tokenRedraw();};
  globalThis.toggleTokenSelected=(id,checked)=>{if(!tokenMulti||!tokenActionable(findGear(id))||!tokenRows().some(r=>r.g.id===id))return false;if(checked)tokenSelected.add(id);else tokenSelected.delete(id);tokenRedraw();return true;};
  globalThis.selectVisibleTokens=()=>{if(!tokenMulti)return;tokenSelected=new Set(tokenRows().map(r=>r.g).filter(g=>tokenActionable(g)).map(g=>g.id));tokenRedraw();};
  globalThis.clearSelectedTokens=()=>{tokenSelected.clear();tokenRedraw();};
  function tokenBatchReview(mode){
    const items=tokenRows().map(r=>r.g).filter(g=>tokenSelected.has(g.id)&&tokenActionable(g,mode)),quote=__EMBERWILD_GEAR_INVENTORY.quote(items,mode),ids=items.map(g=>g.id);
    return {mode,ids,quote,signature:JSON.stringify([ids,quote])};
  }
  globalThis.requestTokenBatch=mode=>{
    if(!tokenMulti||!['sell','salvage'].includes(mode))return false;
    tokenReview=tokenBatchReview(mode);if(!tokenReview.ids.length){toast('沒有可操作的選取信物');return false;}
    const verb=mode==='sell'?'出售':'分解';$('modal').innerHTML=`<h2>確認批次${verb}信物</h2><p>實際${verb} ${tokenReview.quote.count} 件信物</p><p>${esc(tokenReview.quote.text)}</p><p class="small">鎖定、已裝備與隊伍配置使用中的信物會保留。</p><div class="actions"><button class="danger" onclick="confirmTokenBatch()">確認${verb}</button><button onclick="closeModal()">取消</button></div>`;$('modal').showModal();return true;
  };
  globalThis.confirmTokenBatch=()=>{
    if(!tokenReview)return false;
    const next=tokenBatchReview(tokenReview.mode);
    if(next.signature!==tokenReview.signature){if(!next.ids.length){tokenReview=null;closeModal();render();toast('信物狀態已變更，沒有可操作信物');return false;}requestTokenBatch(next.mode);toast('信物或產出已變更，請確認更新後的明細');return false;}
    const ok=__EMBERWILD_TEAM_EQUIPMENT.dispose(next.ids,next.mode,true,{batch:true,reviewed:true});
    if(ok){tokenSelected.clear();tokenReview=null;closeModal();render();}return ok;
  };
  const tokenChoose=(key,label,options)=>`<label>${label}<select aria-label="信物${label}" onchange="setTokenFilter('${key}',this.value)">${options.map(([v,text])=>`<option value="${esc(String(v))}" ${String(v)===tokenFilter[key]?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  const tokenInput=(key,label,type='number')=>`<label>${label}<input type="${type}" aria-label="信物${label}" value="${esc(tokenFilter[key])}" onchange="setTokenFilter('${key}',this.value)"></label>`;
  globalThis.selectInventoryToken=id=>{if(!M.isToken(findGear(id)))return false;tokenDetailId=id;tokenRedraw();return true;};
  function tokenInventoryDetail(g){
    if(!g)return '<div class="inventory-detail-empty">選擇左側信物查看詳細說明。</div>';
    const wearer=gearWearer(g.id),targets=party.members.filter(h=>M.canEquip(g,h)&&(!wearer||wearer===h)),can=tokenActionable(g);
    return `<div class="inventory-detail-pane">${detail(g)}<p class="small">品質：${AFFIX_RANK[g.rar]} · 強化 +${g.plus}${g.locked?' · 已鎖定':''}</p><div class="actions token-detail-actions"><select id="token-detail-owner" aria-label="信物穿戴對象">${targets.map(h=>`<option value="${memberKey(h)}">${esc(characterName(h))}</option>`).join('')}</select><button onclick="equipCompanionToken('${g.id}',Number(document.getElementById('token-detail-owner').value))" ${targets.length&&!wearer?'':'disabled'}>穿戴</button><button onclick="toggleGearLock('${g.id}')">${g.locked?'解除鎖定':'鎖定'}</button><button onclick="sellGear('${g.id}')" ${tokenActionable(g,'sell')?'':'disabled'}>出售 ${equipmentSellPrice(g)} 金幣</button><button class="danger" onclick="salvage('${g.id}')" ${can?'':'disabled'}>分解</button></div>${tokenOwned(g)?'<p class="small">已裝備或隊伍配置使用中的信物不會被批次出售或分解。</p>':''}</div>`;
  }
  function tokenInventory(){
    const rows=tokenRows(),visible=new Set(rows.map(r=>r.g.id)),all=[['all','全部']],fields=equipmentNumericFields();
    tokenSelected=new Set([...tokenSelected].filter(id=>visible.has(id)&&tokenActionable(findGear(id))));
    if(!visible.has(tokenDetailId))tokenDetailId=rows[0]?.g.id??null;
    return heading('COMPANION TOKENS / 共用背包','夥伴信物')+`<section class="panel token-management-panel">${resourceLine()}<div class="gear-management-controls"><div class="gear-basic-filters">${tokenInput('name','名稱','search')}${tokenChoose('job','職業',[...all,['common','通用'],...CLASSES.map((c,i)=>[String(i),c.name])])}${tokenChoose('quality','品質',[...all,...AFFIX_RANK.map((q,i)=>[i,q])])}${tokenChoose('locked','鎖定',[...all,['yes','已鎖定'],['no','未鎖定']])}${tokenChoose('worn','穿戴',[...all,['yes','已裝備'],['no','未裝備']])}${tokenInput('plusMin','強化下限')}${tokenInput('plusMax','強化上限')}<button onclick="clearTokenFilters()">清除篩選</button></div><details ${tokenAdvanced?'open':''} ontoggle="setTokenAdvanced(this.open)"><summary>屬性數值篩選</summary><p class="small">依信物自身數值（含品質與強化），不含角色能力或戰鬥觸發效果。</p><div class="gear-numeric-filters">${tokenChoose('stat','屬性',[['','不限制'],...fields.map(f=>[f.key,f.label])])}${tokenChoose('op','比較',[['gt','大於'],['gte','大於等於'],['eq','等於'],['lte','小於等於'],['lt','小於'],['range','區間（含上下限）']])}${tokenInput('value','數值／下限')}${tokenFilter.op==='range'?tokenInput('upper','數值上限'):''}</div></details><div class="gear-sort-controls"><label>排序<select aria-label="信物排序" onchange="setTokenSort(this.value)">${[['quality','品質'],['enhance','強化'],['name','名稱'],['acquired','取得時間'],['price','出售價格'],...fields.map(f=>[f.key,f.label])].map(([v,text])=>`<option value="${v}" ${tokenSort===v?'selected':''}>${esc(text)}</option>`).join('')}</select></label><button onclick="toggleTokenDirection()">${tokenDirection==='desc'?'高 → 低':'低 → 高'}</button><button onclick="toggleTokenMulti()" aria-pressed="${tokenMulti}">${tokenMulti?'結束多選':'多選信物'}</button><span class="small">顯示 ${rows.length} 件 · 背包 ${state.bag.length} / ${RULES.bagCapacity}</span></div></div>${tokenMulti?`<div class="gear-batch-controls"><b>已選 ${tokenSelected.size} 件</b><button onclick="selectVisibleTokens()">全選目前結果</button><button onclick="clearSelectedTokens()">清除選取</button><button onclick="requestTokenBatch('sell')" ${tokenSelected.size?'':'disabled'}>批次出售</button><button onclick="requestTokenBatch('salvage')" ${tokenSelected.size?'':'disabled'}>批次分解</button></div>`:''}<div class="token-inventory-layout"><section class="token-inventory-master"><div class="token-grid token-inventory-list">${rows.map(({g})=>`<article class="token-management-row" data-token-id="${g.id}">${tokenMulti?`<label class="gear-selection"><input type="checkbox" aria-label="選取 ${esc(equipmentDisplayName(g))}" ${tokenSelected.has(g.id)?'checked':''} ${tokenActionable(g)?'':'disabled'} onchange="toggleTokenSelected('${g.id}',this.checked)"></label>`:''}${gearSlotHTML(g,{className:'token-inventory-row',context:'inventory',selected:tokenDetailId===g.id,onclick:`selectInventoryToken('${g.id}')`})}<button class="gear-lock" onclick="toggleGearLock('${g.id}')" aria-pressed="${!!g.locked}">${g.locked?'已鎖定':'鎖定'}</button></article>`).join('')||'<p class="empty">沒有符合條件的信物。</p>'}</div></section><section class="token-inventory-detail" aria-label="信物詳細說明">${tokenInventoryDetail(rows.find(r=>r.g.id===tokenDetailId)?.g)}</section></div></section>`;
  }
  const tokenReset=resetSession;
  resetSession=function(){const out=tokenReset();tokenFilter=tokenDefaults();tokenSort='quality';tokenDirection='desc';tokenMulti=false;tokenAdvanced=false;tokenSelected.clear();tokenReview=null;tokenDetailId=null;return out;};
  globalThis.__EMBERWILD_TOKEN_INVENTORY={rows:tokenRows,selection:()=>[...tokenSelected],review:()=>tokenReview};
  const baseTabs=inventoryTabs;
  inventoryTabs=function(){return baseTabs().replace('</div>',`<button onclick="setInventoryCategory('tokens')" class="${inventoryCategory==='tokens'?'primary':''}">信物</button></div>`);};
  const baseCategory=setInventoryCategory;
  setInventoryCategory=function(value){if(value==='tokens'){inventoryCategory=value;render();return;}return baseCategory(value);};
  const baseInventory=equipmentView;
  equipmentView=function(){return inventoryCategory==='tokens'?inventoryTabs()+`<div class="companion-management-page">${tokenInventory()}</div>`:baseInventory();};
  const baseWorn=wornEquipmentView;
  wornEquipmentView=function(){pageHeroSelection.set('worn',memberKey(party.members[0]));return `<div class="companion-management-page worn-token-page">${baseWorn()+companionCards()}</div>`;};
  for(const name of ['rosterView','partnerRosterView']){const base=globalThis[name];globalThis[name]=function(){return `<div class="companion-management-page">${base()}</div>`;};}
  const baseForge=openForge;
  openForge=function(id){const g=findGear(id);if(!M.isToken(g))return baseForge(id);$('modal').innerHTML=`<h2>信物強化</h2>${detail(g)}<p>每級屬性 +${GS('equipment.enhance.statPerLevel',.05)*100}%；特殊能力保持原參數。</p><p>${esc(upgradeCostText(g))}</p><div class="actions"><button onclick="enhance('${g.id}');closeModal();openForge('${g.id}')" ${g.plus>=RULES.enhanceMax||!canEnhance(g)?'disabled':''}>強化</button><button onclick="closeModal()">關閉</button></div>`;$('modal').showModal();};
  globalThis.__EMBERWILD_TOKEN_READY=true;
  if(state&&party){syncTokens();for(const h of party.members.filter(companion)){h.equipped=Array(5).fill(null);h.tokenId??=null;withHero(h,clampVitals);}render();}
})();
