/* Shared real-time consumable contract. Percentages are source contributions, not multipliers. */
(function(root){
  'use strict';
  const TYPE='timedBoost',KINDS=['exp','drop'],MAX_STACK_MS=24*60*60*1000;
  const LABELS={exp:'經驗值',drop:'掉寶率'};
  // Battle speed was removed: legacy speed tickets and their effects are dropped
  // from catalogs and saves without compensation.
  const REMOVED_KINDS=['speed2','speed4'],REMOVED_ITEM=/^speed[24]_/;
  const removedItem=item=>REMOVED_KINDS.includes(item?.boostType)||REMOVED_ITEM.test(String(item?.id??item?.itemId??item?.key??''));
  const copy=v=>JSON.parse(JSON.stringify(v));
  const isItem=item=>item?.type===TYPE;
  const ELEMENTAL_TYPES=['ward','elementTonic'];
  const isElementalItem=item=>ELEMENTAL_TYPES.includes(item?.type);
  function expiryTime(minutes,now=Date.now()){
    const duration=Math.round(minutes*60000),expiresAt=now+duration;
    if(!Number.isFinite(minutes)||minutes<=0||!Number.isSafeInteger(duration)||duration<1||!Number.isSafeInteger(expiresAt)||expiresAt>8.64e15)throw Error('現實時間分鐘必須為有效正數');
    return expiresAt;
  }
  const remainingMs=(buff,now=Date.now())=>Math.max(0,buff?.remainingMs??((buff?.expiresAt||0)-now));
  function migrateBuff(buff,now=Date.now(),enabled=true){
    if(!buff||typeof buff!=='object')throw Error('限時增益資料無效');
    if(Object.hasOwn(buff,'remainingMs')?(!Number.isSafeInteger(buff.remainingMs)||buff.remainingMs<0):(!Number.isSafeInteger(buff.expiresAt)||buff.expiresAt<0||buff.expiresAt>8.64e15))throw Error('限時增益時間無效');
    const left=remainingMs(buff,now);
    if(!Number.isSafeInteger(left)||left<0||left>8.64e15||buff.enabled!==undefined&&typeof buff.enabled!=='boolean')throw Error('限時增益剩餘時間或啟用狀態無效');
    const out={...copy(buff),remainingMs:left,enabled:left>0&&(buff.enabled??enabled)};delete out.expiresAt;return out;
  }
  const buffRows=buff=>buff==null?[]:Array.isArray(buff)?buff:[buff];
  const compactBuffs=rows=>rows.length>1?rows:rows[0]||null;
  const elementalActive=(buff,now=Date.now())=>buffRows(buff).filter(b=>remainingMs(b,now)>0&&b.enabled!==false);
  // A changed strength/element/stat payload remains an independent timed source,
  // even if the designer gave both versions the same display name.
  function sourceKey(b){return JSON.stringify([b.name??b.itemId,b.boostType??'',b.bonusPercent??b.effectPercent,b.element??'',Object.entries(b.statEffects||{}).filter(([,v])=>v!==0).sort(([a],[c])=>a.localeCompare(c))]);}
  function stackBuff(rows,buff,now=Date.now()){
    const live=rows.filter(b=>remainingMs(b,now)>0),index=live.findIndex(b=>sourceKey(b)===sourceKey(buff));
    if(remainingMs(buff,now)+(index<0?0:remainingMs(live[index],now))>MAX_STACK_MS)throw Error('本次使用會超過單一狀態 24 小時上限，未消耗道具');
    if(index<0){if(live.length>=200)throw Error('有效增益來源已達上限');return [...live,migrateBuff(buff,now)];}
    const previous=migrateBuff(live[index],now);
    live[index]={...previous,remainingMs:remainingMs(previous,now)+remainingMs(buff,now)};return live;
  }
  function timeText(ms,hours=false){const sec=Math.max(0,Math.ceil(ms/1000)),h=Math.floor(sec/3600),m=Math.floor(sec/60)%60,s=sec%60;return (hours||h?String(h).padStart(2,'0')+':':'')+(hours||h?String(m).padStart(2,'0'):String(Math.floor(sec/60)).padStart(2,'0'))+':'+String(s).padStart(2,'0');}
  const elementalPercent=(type,settings)=>100*(type==='ward'?(settings?.combat?.supply?.wardResistance??.25):(settings?.combat?.supply?.elementTonicDamage??.2));
  function validateElementalItem(item){
    if(!isElementalItem(item)||item.duration!==0||!Number.isFinite(item.effectPercent)||item.effectPercent<0||item.effectPercent>(item.type==='ward'?100:1e6))throw Error('屬性藥水效果百分比或時間單位無效：'+(item?.id||'未知'));
    expiryTime(item.durationMinutes);return item;
  }
  function createElementalBuff(item,now=Date.now()){
    validateElementalItem(item);
    return {itemId:item.id,name:item.name,element:item.element,effectPercent:item.effectPercent,durationMinutes:item.durationMinutes,remainingMs:expiryTime(item.durationMinutes,0),enabled:true,until:0,statEffects:copy(item.statEffects||{})};
  }
  function migrateElementalConfig(cfg){
    cfg.timeUnits??={};
    if(cfg.timeUnits.elementPotionDuration!=='realMinutes'){
      const unit=cfg.timeUnits.itemDuration==='battleRounds'?Math.max(1,Number(cfg.balanceSettings?.combat?.pacing?.roundMinimumMs)||6000):1000;
      for(const item of cfg.items||[])if(isElementalItem(item)){
        if(!Object.prototype.hasOwnProperty.call(item,'durationMinutes'))item.durationMinutes=Number(item.duration)>0?Number(item.duration)*unit/60000:5;
        if(!Object.prototype.hasOwnProperty.call(item,'effectPercent'))item.effectPercent=elementalPercent(item.type,cfg.balanceSettings);
        item.duration=0;
      }
      cfg.timeUnits.elementPotionDuration='realMinutes';
    }
    return cfg;
  }
  function migrateElementalBuff(buff,type,{item=null,settings=null,now=Date.now()}={}){
    if(!buff)return null;
    if(Object.prototype.hasOwnProperty.call(buff,'remainingMs')){validateElementalItem({...buff,type,duration:0});const out=migrateBuff(buff,now);if(!out.name)out.name=item?.name??type+'_'+buff.element;if(!out.itemId&&item?.id)out.itemId=item.id;return out;}
    if(Object.prototype.hasOwnProperty.call(buff,'expiresAt')){
      if(!Number.isSafeInteger(buff.expiresAt)||buff.expiresAt<0||buff.expiresAt>8.64e15)throw Error('屬性藥水到期時間無效');
      validateElementalItem({...buff,type,duration:0});return remainingMs(buff,now)>0?migrateBuff({...buff,name:buff.name??item?.name??type+'_'+buff.element},now):null;
    }
    const roundMs=Math.max(1,Number(settings?.combat?.pacing?.roundMinimumMs)||6000);
    const left=Number.isFinite(buff.remainingTurns)?Math.max(0,Math.ceil(buff.remainingTurns))*roundMs:Math.max(0,(Number(buff.until)||0)-now);
    if(left<=0)return null;
    const total=Number.isFinite(buff.totalTurns)?Math.max(left,Math.ceil(buff.totalTurns)*roundMs):left;
    const out={...copy(buff),name:buff.name??item?.name??type+'_'+buff.element,durationMinutes:total/60000,effectPercent:item?.effectPercent??elementalPercent(type,settings),remainingMs:left,enabled:true,until:0};
    delete out.remainingTurns;delete out.totalTurns;validateElementalItem({...out,type,duration:0});return out;
  }
  function itemName(kind,percent,minutes){return LABELS[kind]+'＋'+percent+'％ '+minutes+'分鐘';}
  const DEFAULT_ITEMS=[
    {id:'exp_100_30m',type:TYPE,boostType:'exp',bonusPercent:100,durationMinutes:30,duration:0,cost:600,sellPrice:150,shopEnabled:false,name:itemName('exp',100,30),description:''},
    {id:'drop_50_30m',type:TYPE,boostType:'drop',bonusPercent:50,durationMinutes:30,duration:0,cost:600,sellPrice:150,shopEnabled:false,name:itemName('drop',50,30),description:''}
  ];
  const DEFAULT_RULES=DEFAULT_ITEMS.map((item,i)=>({id:item.id,enabled:true,type:'item',key:item.id,name:'',description:'',quantityMin:1,quantityMax:1,unitPrice:null,weight:.35,selection:'weighted',chance:1,quantityScalesWithTier:false,priceScalesWithTier:false}));
  function removeSpeedConfig(cfg){
    if(!cfg||typeof cfg!=='object')return cfg;
    if(Array.isArray(cfg.items))cfg.items=cfg.items.filter(item=>!(isItem(item)&&removedItem(item))&&!REMOVED_ITEM.test(String(item?.id??'')));
    const rows=cfg.shopSettings?.randomOffers?.entries;if(Array.isArray(rows))cfg.shopSettings.randomOffers.entries=rows.filter(rule=>!(rule?.type==='item'&&REMOVED_ITEM.test(String(rule.key??''))));
    if(Array.isArray(cfg.inventoryIcons))cfg.inventoryIcons=cfg.inventoryIcons.filter(row=>!(row?.kind==='item'&&REMOVED_ITEM.test(String(row.key??''))));
    if(cfg.balanceSettings?.combat?.pacing)delete cfg.balanceSettings.combat.pacing.rates;
    return cfg;
  }
  function migrateConfig(cfg){
    migrateElementalConfig(cfg);
    removeSpeedConfig(cfg);
    cfg.timeUnits??={};
    if(cfg.timeUnits.timedBoostDuration!=='realMinutes'){
      cfg.items??=[];
      if(!cfg.items.some(isItem)){
        cfg.items.push(...copy(DEFAULT_ITEMS));
        const rows=cfg.shopSettings?.randomOffers?.entries;
        // Explicitly empty pools stay empty; otherwise extend old catalogs once.
        if(Array.isArray(rows)&&rows.length)for(const rule of DEFAULT_RULES)if(!rows.some(x=>x.type==='item'&&x.key===rule.key)){
          let id=rule.id,n=1;while(rows.some(x=>x.id===id))id=rule.id+'_'+n++;
          const index=rows.findIndex(x=>x.selection==='extra');
          rows.splice(index<0?rows.length:index,0,{...copy(rule),id});
        }
      }
      cfg.timeUnits.timedBoostDuration='realMinutes';
    }
    cfg.timeUnits.consumableClock='wall';
    return cfg;
  }
  function validateItem(item){
    const id=item?.id||'未知';
    if(!isItem(item)||typeof item.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(item.id)||typeof item.name!=='string'||!item.name.trim()||typeof item.description!=='string'||!KINDS.includes(item.boostType))throw Error('限時增益道具資料無效：'+id);
    if(!Number.isSafeInteger(item.durationMinutes)||item.durationMinutes<=0)throw Error('限時增益分鐘必須為有效正整數：'+id);
    expiryTime(item.durationMinutes);
    if(!Number.isSafeInteger(item.bonusPercent)||item.bonusPercent<=0)throw Error('限時增益百分比必須為正整數：'+id);
    if(item.duration!==0||!Number.isSafeInteger(item.cost)||item.cost<0||item.sellPrice!==undefined&&(!Number.isSafeInteger(item.sellPrice)||item.sellPrice<0)||item.element!==undefined&&item.element!==null&&item.element!=='')throw Error('限時增益價格或時間單位無效：'+id);
    return item;
  }
  function available(party,now=Date.now()){return (party?.timedBoosts||[]).filter(b=>remainingMs(b,now)>0);}
  function active(party,now=Date.now()){return available(party,now).filter(b=>b.enabled!==false);}
  function bonus(party,kind,now=Date.now()){return active(party,now).filter(b=>b.boostType===kind).reduce((sum,b)=>sum+b.bonusPercent,0);}
  function removeSpeedSave(data){
    if(!data||typeof data!=='object')return data;
    if(Array.isArray(data.timedBoosts))data.timedBoosts=data.timedBoosts.filter(b=>!removedItem(b));
    for(const h of Array.isArray(data.members)?data.members:[])if(h?.consumables&&typeof h.consumables==='object'&&!Array.isArray(h.consumables))for(const k of Object.keys(h.consumables))if(REMOVED_ITEM.test(k))delete h.consumables[k];
    if(data.combatSession&&typeof data.combatSession==='object'){delete data.combatSession.speed;delete data.combatSession.pauseBoostsOnSpeedEnd;}
    return data;
  }
  function prepareSave(data){
    const out=removeSpeedSave(copy(data)),now=Date.now();
    if(Array.isArray(out?.timedBoosts))out.timedBoosts=out.timedBoosts.map(b=>migrateBuff(b,now));
    return out;
  }
  // One wall-clock delta per running expedition,
  // including when a background callback arrives after several effects expire.
  function consume(party,elapsed){
    if(!party||!Number.isSafeInteger(elapsed)||elapsed<=0)return false;
    for(const b of party.timedBoosts||[]){if(!b.enabled)continue;b.remainingMs=Math.max(0,remainingMs(b)-elapsed);if(!b.remainingMs)b.enabled=false;}
    for(const h of party.members||[])for(const k of ELEMENTAL_TYPES)for(const b of buffRows(h[k]))if(b.enabled){b.remainingMs=Math.max(0,remainingMs(b)-elapsed);if(!b.remainingMs)b.enabled=false;}
    return false;
  }
  function validateState(data){
    data=prepareSave(data);
    const rows=data?.timedBoosts??[],names=new Set();
    if(!Array.isArray(rows)||rows.length>200)throw Error('限時增益存檔無效');
    for(const b of rows){
      validateItem({id:b?.itemId,type:TYPE,name:b?.name,description:'',boostType:b?.boostType,bonusPercent:b?.bonusPercent,durationMinutes:b?.durationMinutes,duration:0,cost:0});
      const key=sourceKey(b);
      if(!Number.isSafeInteger(b.remainingMs)||b.remainingMs<0||typeof b.enabled!=='boolean'||names.has(key))throw Error('限時增益到期時間或同名來源無效');
      names.add(key);
    }
    const raw=data?.combatSession??{},idleTimeMs=raw.idleTimeMs??0,reportPaused=raw.reportPaused??false,filter=raw.filter??'all';
    if(!Number.isSafeInteger(idleTimeMs)||idleTimeMs<0||typeof reportPaused!=='boolean'||!['all','playerDamage','enemyDamage','exp','item'].includes(filter))throw Error('掛機時間／戰報存檔無效');
    return {timedBoosts:copy(rows),combatSession:{idleTimeMs,reportPaused,filter}};
  }
  root.EmberwildTimedBoosts=Object.freeze({TYPE,KINDS,LABELS,MAX_STACK_MS,DEFAULT_ITEMS,DEFAULT_RULES,REMOVED_ITEM,removedItem,removeSpeedConfig,removeSpeedSave,prepareSave,isItem,itemName,migrateConfig,validateItem,available,migrateBuff,consume,active,bonus,validateState,ELEMENTAL_TYPES,isElementalItem,expiryTime,remainingMs,buffRows,compactBuffs,elementalActive,sourceKey,stackBuff,timeText,validateElementalItem,createElementalBuff,migrateElementalConfig,migrateElementalBuff});
})(globalThis);
