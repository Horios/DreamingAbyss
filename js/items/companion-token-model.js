/* Shared token contract; loaded before save validation and embedded in the editor. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EmberwildTokens=api;})(globalThis,function(){
  'use strict';
  const TYPE='companionToken',VERSION=1,copy=x=>JSON.parse(JSON.stringify(x));
  const stats=['hp','atk','def','crit','critDamage','speed','pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage'];
  const effectKeys=['flatAttack','flatHp','flatDefense','attackPct','hpPct','defensePct','crit','critDamage','pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamagePct','speed','allCooldownReduction','dropRateBonus','basicAdvanceNextRound','basicElement','elementDamagePct','elementResistPct','raceDamagePct','skillEffectPct','skillCooldownReduction'];
  const events=['battleStart','kill','receivedHit','basicHit','activeSkill','procSkill','skillCast','sameTarget','lowHealth','damage','round'];
  const actions=['attack','guard','critical','power','heal','shield','extraDamage','damageBonus','healingBonus'];
  const elements=['physical','fire','ice','wind','light','shadow'],races=['beast','plant','undead','construct','demon','spirit'];
  const ability=(event,action,value,extra={})=>({event,action,value,chance:1,duration:2,cooldown:1,maxTriggers:0,threshold:0,...extra});
  const token=(id,name,effects,ability)=>({id,name,description:'',job:'all',quality:1,effects,ability,drop:{enabled:true,weight:1,minLevel:1,maxLevel:60,maps:[],monsters:[],kinds:['normal','elite','boss','final']}});
  const fx=(key,value)=>({key,value});
  const defaults={schemaVersion:VERSION,qualityMultipliers:[1,1.12,1.25,1.4],drop:{enabled:true,chanceByDifficulty:[.008,.012,.016],qualityWeights:[61,26,11,2],minLevel:1,maxLevel:60,maps:[],monsters:[],kinds:['normal','elite','boss','final']},catalog:[
    token('berserk','狂戰信物',[fx('flatAttack',2),fx('critDamage',5),fx('flatHp',6)],ability('kill','attack',.12)),
    token('guardian','守護信物',[fx('flatHp',10),fx('flatDefense',2),fx('elementResistPct',3)],ability('receivedHit','guard',.10,{cooldown:2})),
    token('pursuit','追擊信物',[fx('flatAttack',2),fx('speed',2),fx('crit',2)],ability('basicHit','extraDamage',.35,{chance:.18,duration:0})),
    token('arcane','魔導信物',[fx('flatAttack',3),fx('pierce',1),fx('critDamage',3)],ability('activeSkill','damageBonus',.08,{duration:0,cooldown:0})),
    token('echo','迴響信物',[fx('flatAttack',2),fx('speed',3),fx('flatHp',4)],ability('skillCast','power',.08,{cooldown:2})),
    token('hunt','狩獵信物',[fx('flatAttack',2),fx('crit',2),fx('critDamage',5)],ability('sameTarget','damageBonus',.10,{threshold:3,duration:0,cooldown:0})),
    token('prayer','祈禱信物',[fx('flatAttack',2),fx('flatHp',8),fx('flatDefense',1)],ability('activeSkill','healingBonus',.12,{duration:0,cooldown:0})),
    token('revival','復甦信物',[fx('flatHp',12),fx('flatDefense',2),fx('evasion',1)],ability('lowHealth','shield',.18,{threshold:.3,maxTriggers:1,duration:0})),
    token('plunder','掠奪信物',[fx('flatAttack',2),fx('flatHp',6),fx('speed',1)],ability('damage','heal',.04,{chance:.15,duration:0})),
    token('endurance','持久信物',[fx('flatHp',10),fx('flatAttack',1),fx('flatDefense',1)],ability('round','attack',.10,{threshold:4,duration:3,maxTriggers:1}))
  ]};
  defaults.catalog[1].effects[2].element='physical';
  function assert(ok,message){if(!ok)throw Error(message);}
  const number=(n,lo=0,hi=1e6)=>typeof n==='number'&&Number.isFinite(n)&&n>=lo&&n<=hi;
  const integer=(n,lo=0,hi=1e6)=>Number.isSafeInteger(n)&&n>=lo&&n<=hi;
  const ident=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
  function validateEffects(list){
    assert(Array.isArray(list)&&list.length<=32,'信物複合屬性無效');
    for(const e of list){assert(e&&effectKeys.includes(e.key)&&(e.key==='basicElement'?elements.includes(e.value):number(e.value)),'信物屬性無效');if(['elementDamagePct','elementResistPct'].includes(e.key))assert(elements.includes(e.element),'信物屬性元素無效');if(e.key==='raceDamagePct')assert(races.includes(e.race),'信物種族無效');if(['skillEffectPct','skillCooldownReduction'].includes(e.key))assert(integer(e.skill,0,63),'信物技能索引無效');}
    return copy(list);
  }
  function validateAbility(a){
    assert(a&&events.includes(a.event)&&actions.includes(a.action)&&number(a.value,0,10)&&number(a.chance,0,1)&&integer(a.duration,0,100)&&integer(a.cooldown,0,100)&&integer(a.maxTriggers,0,100)&&number(a.threshold,0,100),'信物特殊能力無效');
    const allowed={battleStart:['attack','guard','critical','power','heal','shield'],kill:['attack','guard','critical','power','heal','shield'],receivedHit:['attack','guard','critical','power','heal','shield'],basicHit:['extraDamage','attack','critical','heal'],activeSkill:['damageBonus','healingBonus'],procSkill:['damageBonus','healingBonus'],skillCast:['attack','guard','critical','power','heal','shield'],sameTarget:['damageBonus'],lowHealth:['heal','shield','guard'],damage:['heal','shield'],round:['attack','guard','critical','power','heal','shield']};
    assert(allowed[a.event].includes(a.action),'此信物事件不支援所選效果');
    if(['attack','guard','critical','power'].includes(a.action))assert(a.duration>=1,'信物增益需要至少一回合');
    else assert(a.duration===0,'立即信物效果的持續回合需為 0');
    if(a.event==='lowHealth')assert(a.threshold>0&&a.threshold<=1,'低血量門檻需為 0～1');
    if(['sameTarget','round'].includes(a.event))assert(integer(a.threshold,1,100),'攻擊次數／回合門檻需為正整數');
    if(!['sameTarget','round','lowHealth'].includes(a.event))assert(a.threshold===0,'此信物事件不使用條件門檻');
    if(a.timing){const t=a.timing;assert(number(t.cooldownSeconds,0,1e9)&&number(t.durationSeconds,0,1e9)&&number(t.triggerIntervalSeconds,.000001,1e9)&&number(t.firstTriggerSeconds,0,1e9),'信物秒數設定無效');}
    return copy(a);
  }
  function validateDrop(d,global=false){
    assert(d&&typeof d.enabled==='boolean'&&integer(d.minLevel,1,60)&&integer(d.maxLevel,d.minLevel,60)&&Array.isArray(d.maps)&&d.maps.every(x=>integer(x,0,999))&&Array.isArray(d.monsters)&&d.monsters.every(ident)&&Array.isArray(d.kinds)&&d.kinds.every(x=>['normal','elite','boss','final'].includes(x)),'信物掉落條件無效');
    if(global){assert(Array.isArray(d.chanceByDifficulty)&&d.chanceByDifficulty.length===3&&d.chanceByDifficulty.every(x=>number(x,0,1))&&Array.isArray(d.qualityWeights)&&d.qualityWeights.length===4&&d.qualityWeights.every(x=>number(x))&&d.qualityWeights.some(x=>x>0),'信物掉落機率／品質權重無效');}else assert(number(d.weight),'信物掉落權重無效');
    return copy(d);
  }
  function validateDefinition(d){assert(d&&ident(d.id)&&typeof d.name==='string'&&d.name.trim()&&d.name.length<=80&&!/[<>]/.test(d.name)&&typeof d.description==='string'&&d.description.length<=2000&&integer(d.quality,0,3)&&(d.qualityFixed===undefined||typeof d.qualityFixed==='boolean'),'信物定義無效');assert(d.job===undefined||['all','0','1','2','3'].includes(d.job),'信物職業無效');return {...copy(d),job:d.job??'all',effects:validateEffects(d.effects),ability:validateAbility(d.ability),drop:validateDrop(d.drop)};}
  function normalize(raw){
    if(raw===undefined)return copy(defaults);
    assert(raw&&raw.schemaVersion===VERSION&&Array.isArray(raw.catalog)&&raw.catalog.length<=512&&Array.isArray(raw.qualityMultipliers)&&raw.qualityMultipliers.length===4&&raw.qualityMultipliers.every(x=>number(x,.01,10)),'信物設定無效');
    const out={...copy(raw),catalog:raw.catalog.map(validateDefinition),drop:validateDrop(raw.drop,true)};
    assert(new Set(out.catalog.map(x=>x.id)).size===out.catalog.length,'信物定義 ID 重複');return out;
  }
  const isToken=g=>g?.type===TYPE;
  const canEquip=(g,h)=>isToken(g)&&h?.companionId!==undefined&&(g.snapshot.job===undefined||g.snapshot.job==='all'||g.snapshot.job===String(h.job));
  function validateItem(g,maxPlus=10){assert(isToken(g)&&ident(g.id)&&ident(g.tokenId)&&g.slot===4&&integer(g.job,0,0)&&integer(g.tier,1,12)&&integer(g.rar,0,3)&&integer(g.plus,0,maxPlus)&&typeof g.name==='string'&&g.name.length<=80&&!/[<>]/.test(g.name)&&Array.isArray(g.affix)&&g.affix.length===0&&(g.locked===undefined||typeof g.locked==='boolean'),'存檔信物無效');validateDefinition(g.snapshot);assert(g.snapshot.id===g.tokenId,'信物快照 ID 不符');assert(Array.isArray(g.qualityMultipliers)&&g.qualityMultipliers.length===4&&g.qualityMultipliers.every(x=>number(x,.01,10)),'信物品質快照無效');return g;}
  function effectsFor(g,enhance=.05){const factor=g.qualityMultipliers[g.rar]*(1+g.plus*enhance);return g.snapshot.effects.map(e=>({...e,value:['basicElement','allCooldownReduction','skillCooldownReduction','basicAdvanceNextRound'].includes(e.key)?e.value:Number((e.value*factor).toFixed(6)),source:'token'}));}
  function eligible(d,e){return d.enabled&&e.lv>=d.minLevel&&e.lv<=d.maxLevel&&(!d.maps.length||d.maps.includes(e.region))&&(!d.monsters.length||d.monsters.includes(e.monsterId))&&d.kinds.includes(e.kind);}
  function weighted(list,weights,rng=Math.random){const sum=weights.reduce((a,b)=>a+b,0);if(sum<=0)return null;let v=rng()*sum;for(let i=0;i<list.length;i++){v-=weights[i];if(v<0)return list[i];}return list.at(-1);}
  function prepareSave(raw,capacity){
    if(raw?.version!==3)return raw;
    const data=copy(raw);if(!Array.isArray(data.members))return data;
    for(const h of data.members.slice(1))if(Array.isArray(h.equipped))h.equipped=h.equipped.map(()=>null);
    // Preserve excess legacy gear in the shared bag; exploration pauses until space is available.
    data.companionEquipmentVersion=VERSION;return data;
  }
  return {TYPE,VERSION,stats,effectKeys,events,actions,defaults,copy,isToken,canEquip,normalize,validateEffects,validateAbility,validateItem,effectsFor,eligible,weighted,prepareSave};
});
