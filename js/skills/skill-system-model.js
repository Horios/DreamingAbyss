/* Stable skill IDs are authoritative. Positional rows are generated adapters for
   the existing effect engine and legacy affixes, never a second skill catalog. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EmberwildSkillSystem=api;})(globalThis,()=>{
  'use strict';
  const VERSION=1,copy=x=>JSON.parse(JSON.stringify(x));
  const types=['active','proc','support','passive'],sources=['class','quest','equipment','advanced','companion'];
  const emptyConditions=()=>({classMasteryLevel:0,quests:[],materials:[],bossKills:[],eliteKills:[],bossEquipment:[]});
  const integer=(v,min=0,max=1e12)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const finite=(v,min=0,max=1e9)=>Number.isFinite(v)&&v>=min&&v<=max;
  const safe=v=>typeof v==='string'&&/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v);
  const adapters=sk=>sk.adapters||[sk.adapter],adapterFor=(sk,job)=>adapters(sk).find(a=>a.job===job)||sk.adapter;
  function fromLegacy(d){
    const definitions=[];
    d.classes.forEach((c,job)=>{
      c.skills.forEach((sk,index)=>definitions.push({...copy(sk),id:sk.id||`job${job}-core${index}`,type:sk.activation,jobs:[job],adapter:{job,index,kind:'core'},sources:[{type:sk.partnerId!=null?'companion':sk.requiresAdvanced||index===4||index===5?'advanced':index===1?'quest':'equipment',...(sk.partnerId!=null?{companionId:sk.partnerId}:{})}]}));
      (d.supportSkills[job]||[]).forEach((sk,index)=>definitions.push({...copy(sk),id:sk.id||`job${job}-support${index}`,type:'support',jobs:[job],adapter:{job,index,kind:'support'},sources:[{type:sk.partnerId!=null?'companion':index>=2?'advanced':index===0?'quest':'equipment',...(sk.partnerId!=null?{companionId:sk.partnerId}:{})}]}));
    });
    for(const [index,sk] of (d.passiveDefinitions||[]).entries()){const j=d.companions.find(p=>p.id===sk.partnerId)?.job??0;definitions.push({...copy(sk),id:sk.id,type:'passive',jobs:sk.partnerId!=null?[j]:[0,1,2,3],adapter:{job:j,index,kind:'passive'},sources:[{type:sk.partnerId!=null?'companion':'quest',...(sk.partnerId!=null?{companionId:sk.partnerId}:{})}]});}
    const classRules=d.classes.map((_,job)=>({job,description:['堅守前線，以嘲諷與減傷保護隊伍。','以群體魔法清理敵群，兼具控制能力。','專注單體射擊，以連射與狙擊擊倒目標。','以聖光攻擊，透過治療與持續恢復支援隊伍。'][job],initial:[],advanced:[],slots:{first:{active:3,proc:1,support:1},advanced:{active:3,proc:2,support:2}}}));
    const names=[['嘲諷','減傷','重擊'],['魔爆','變形','火球'],['連射','狙擊','繩索陷阱'],['聖光','治療','癒合']];
    const descriptions=[['使敵人優先攻擊自己。','降低自身承受的傷害。','對單一敵人造成強力傷害。'],['以魔力爆發攻擊敵方群體。','使單一敵人變形，暫時無法行動；首領免疫。','以高倍率火球攻擊敵方群體，冷卻較長。'],['連續射擊同一敵人，穩定造成傷害。','瞄準單一敵人，造成高倍率爆發傷害。','布設繩索陷阱，降低敵方行動速度。'],['以聖光對單一敵人造成傷害。','恢復生命比例最低的一名存活隊友。','使全隊持續恢復生命。']];
    const templates=[
      [{effect:'tauntRage',systemEffect:'taunt',power:0,cooldown:6,duration:3,target:'enemies',maxTargets:99},{effect:'shield',systemEffect:'guard',power:.3,cooldown:6,duration:3,target:'self'},{effect:'damage',power:2.4,cooldown:3,target:'enemy'}],
      [{effect:'damage',power:1.8,cooldown:3,target:'enemies',maxTargets:3},{effect:'polymorph',power:1,cooldown:7,duration:2,target:'enemy'},{effect:'damage',power:3.8,cooldown:7,target:'enemies',maxTargets:3}],
      [{effect:'damage',power:1.2,cooldown:3,hitCount:2,target:'enemy'},{effect:'damage',power:4,cooldown:7,target:'enemy'},{effect:'damage',systemEffect:'slow',power:.25,cooldown:7,duration:3,target:'enemies',maxTargets:3}],
      [{effect:'damage',power:2.5,cooldown:3,target:'enemy'},{effect:'heal',power:1.8,cooldown:4,target:'weakest'},{effect:'heal',systemEffect:'regen',power:.025,cooldown:8,duration:4,target:'allies'}]
    ];
    for(let job=0;job<4;job++)for(let n=0;n<3;n++){
      const id=`class${job}-initial${n}`,index=d.classes[job].skills.length+n,t=templates[job][n];
      const sk={id,name:names[job][n],description:descriptions[job][n],type:'active',activation:'active',jobs:[job],adapter:{job,index,kind:'core'},sources:[{type:'class',level:[1,3,5][n]}],usageScope:'character',partnerId:null,requiredLevel:[1,3,5][n],requiresAdvanced:false,requiredMastery:null,requiredMasteryLevel:0,mastery:['sword','fire','bow','light'][job],weaponTypes:[],unlockConditions:emptyConditions(),iconType:'auto',powerPerLevel:0,element:job===1?'fire':job===3?'light':'physical',maxTargets:1,hitCount:1,baseCritRate:0,baseCritDamage:1.5,defensePenetration:0,defenseIgnore:0,commonEffectKeys:['target'],targetLimit:true,...t};
      if(!sk.systemEffect&&sk.hitCount>1)sk.commonEffectKeys.push('hitCount');
      definitions.push(sk);classRules[job].initial.push({skillId:id,level:sk.requiredLevel});
    }
    for(const sk of definitions)if(sk.sources.some(s=>s.type==='advanced'))classRules[sk.jobs[0]].advanced.push({skillId:sk.id,level:Math.max(15,sk.requiredLevel??sk.level??1)});
    const equipmentPool=definitions.filter(sk=>sk.sources.some(s=>s.type==='equipment')).map(sk=>({skillId:sk.id,jobs:sk.jobs,slots:[0,1,2,3],minLevel:1,maxLevel:999,weight:1,maps:[],monsters:[],bosses:[],allowShop:true,allowCraft:true}));
    const gems=[['atk','flat','effect',[.02,.04,.06]],['speed','flat','cooldown',[.05,.1,.15]],['crit','ratio','procChance',[.01,.02,.03]],['hp','flat','heal',[.03,.06,.09]],['def','flat','shield',[.01,.02,.03]]].map(([stat,unit,key,values],kind)=>({kind,base:{stat,unit,values:kind===0?[2,4,6]:kind===1?[1,2,3]:kind===2?[.01,.02,.03]:kind===3?[10,20,30]:[1,2,3]},skill:{key,values,types:kind===1?['active','support']:kind===2?['proc']:['active','proc','support'],effects:[],slots:[0]},cap:1}));
    return addClearingSkills({version:VERSION,gemSlotRuleVersion:2,definitions,classRules,equipment:{chanceByDifficulty:[.15,.15,.15],formRules:[],pool:equipmentPool,socketBands:[{minLevel:1,maxLevel:10,weights:[.7,.3,0,0]},{minLevel:11,maxLevel:20,weights:[.35,.5,.15,0]},{minLevel:21,maxLevel:999,weights:[.1,.35,.35,.2]}],sourceRules:[{source:'starter',weights:[1,0,0,0]},{source:'boss',weights:[0,.3,.4,.3]}]},gems},d);
  }
  function clearingStatus(){return {"id":"holy-prison-mark","name":"神聖光牢","tags":[],"polarity":"debuff","dispellable":true,"duration":99,"permanent":true,"durationClock":"target","stackable":true,"uses":1,"removeOnTrigger":true,"modifiers":[],"control":null,"periodic":[],"triggers":[{"event":"targetTurnEnd","effect":"damage","power":0.5,"target":"enemies","element":"light","allowDeathChain":true,"chainMultiplier":1},{"event":"targetDeath","effect":"damage","power":0.3,"target":"enemies","element":"light","allowDeathChain":true,"chainMultiplier":1}]};}
  function addClearingSkills(s,d){
    d.statusDefinitions??=[];if(!d.statusDefinitions.some(x=>x.id==='holy-prison-mark'))d.statusDefinitions.push(clearingStatus());
    const names=['順勢斬','魔力循環','箭雨','神聖光牢'],ids=['warrior-cleave-chain','mage-mana-cycle','archer-arrow-rain','priest-holy-prison'];
    const descriptions=['普攻或技能擊殺後，以 80% 攻擊追擊目前生命最低敵人；擊殺可連續追擊，最多 3 次。常駐生效、不占槽。','敵人死亡事件群組使自身所有技能冷卻減少 1 回合；獨立冷卻 2 個自身回合。常駐生效、不占槽。','對所有存活敵人各造成 130% 攻擊力的物理傷害。','對最多 3 名敵人施加可疊加的永久光牢；敵人回合結束（含受控）引爆 50%，死亡引爆 30% 光屬性全體傷害；每個標記僅引爆一次，死亡可連鎖。'];
    for(let job=0;job<4;job++){
      if(s.definitions.some(x=>x.id===ids[job]))continue;
      const passive=job<2,kind=passive?'passive':'core',legacyIndex=(passive?d.passiveDefinitions||[]:d.classes[job].skills).findIndex(x=>x.id===ids[job]),index=legacyIndex>=0?legacyIndex:passive?Math.max(d.passiveDefinitions?.length||0,...s.definitions.filter(x=>x.adapter.kind==='passive').map(x=>x.adapter.index+1)):Math.max(d.classes[job].skills.length,...s.definitions.flatMap(adapters).filter(x=>x.kind==='core'&&x.job===job).map(x=>x.index+1));
      const sk={id:ids[job],name:names[job],description:descriptions[job],type:passive?'passive':'active',...(passive?{}:{activation:'active'}),jobs:[job],adapter:{job,index,kind},sources:[{type:'class',level:3}],usageScope:'character',partnerId:null,requiredLevel:3,requiresAdvanced:false,requiredMastery:null,requiredMasteryLevel:0,mastery:null,weaponTypes:[],unlockConditions:emptyConditions(),iconType:'auto',powerPerLevel:0,power:job===2?1.3:0,cooldown:passive?0:3,element:job===3?'light':'physical',target:passive?'self':'enemies',maxTargets:job===3?3:99,hitCount:1,baseCritRate:0,baseCritDamage:1.5,defensePenetration:0,defenseIgnore:0,effect:job===3?'applyStatus':'damage'};
      if(passive)Object.assign(sk,{kind:'buff',effects:[],eventPassive:job===0?{event:'kill',power:.8,maxAttacks:3}:{event:'enemyDeath',reduction:1,cooldown:2}});
      else if(job===2)Object.assign(sk,{commonEffectKeys:['target'],targetLimit:false});
      else Object.assign(sk,{statusId:'holy-prison-mark',statusTarget:'enemies',statusMaxTargets:3});
      s.definitions.push(sk);s.classRules.find(r=>r.job===job).initial.push({skillId:sk.id,level:3});
    }
    s.clearingSkillsVersion=1;return s;
  }
  function validate(s){
    const fail=m=>{throw Error('技能系統：'+m);};
    if(!s||s.version!==VERSION||!Array.isArray(s.definitions)||s.definitions.length>1024||!Array.isArray(s.classRules)||s.classRules.length!==4)fail('版本或技能資料庫無效');
    const ids=new Map(),positions=new Set();
    for(const sk of s.definitions){
      const a=sk.adapter;
      if(sk.adapters&&(!Array.isArray(sk.adapters)||!sk.adapters.length)||sk.type!=='passive'&&sk.jobs.some(j=>!adapters(sk).some(a=>a.job===j&&a.kind===sk.adapter.kind)))fail('技能職業與引擎對照不符：'+sk.id);
      for(const b of adapters(sk)){if(!integer(b.job,0,3)||!sk.jobs.includes(b.job)||!integer(b.index,0,b.kind==='passive'?511:63)||!['core','support','passive'].includes(b.kind)||positions.has(`${b.job}:${b.kind}:${b.index}`))fail('技能引擎對照重複或無效：'+sk.id);positions.add(`${b.job}:${b.kind}:${b.index}`);}
      if(!safe(sk.id)||ids.has(sk.id)||typeof sk.name!=='string'||!sk.name.trim()||sk.name.length>80||!types.includes(sk.type)||!Array.isArray(sk.jobs)||!sk.jobs.length||sk.jobs.some(j=>!integer(j,0,3))||!Array.isArray(sk.sources)||sk.sources.some(x=>!sources.includes(x.type))||typeof sk.disabled!=='undefined'&&typeof sk.disabled!=='boolean')fail('技能 ID、名稱、類型或來源無效：'+sk.id);
      if(!a||!integer(a.job,0,3)||!integer(a.index,0,a.kind==='passive'?511:63)||!['core','support','passive'].includes(a.kind))fail('技能引擎對照重複或無效：'+sk.id);
      if(sk.type==='support'&&a.kind!=='support'||['active','proc'].includes(sk.type)&&a.kind!=='core')fail('技能類型與引擎對照不符：'+sk.id);
      for(const key of ['power','cooldown','duration','requiredLevel','procBaseChance','baseCritRate','defenseIgnore'])if(sk[key]!==undefined&&!finite(sk[key],0,key.includes('Chance')||['baseCritRate','defenseIgnore'].includes(key)?1:1e9))fail('技能數值無效：'+sk.id+' '+key);
      if(sk.eventPassive){const e=sk.eventPassive;if(sk.type!=='passive'||!['kill','enemyDeath'].includes(e.event)||e.event==='kill'&&(!finite(e.power,0,100)||!integer(e.maxAttacks,1,99))||e.event==='enemyDeath'&&(!integer(e.reduction,0,99)||!integer(e.cooldown,0,99)))fail('事件型被動設定無效：'+sk.id);}
      if(sk.systemEffect!==undefined&&!['taunt','guard','slow','regen'].includes(sk.systemEffect))fail('未知特殊效果：'+sk.id);
      if(sk.systemEffect&&(!integer(sk.duration,1,999)||!finite(sk.power,0,1)))fail('特殊效果持續時間或倍率無效：'+sk.id);
      for(const src of sk.sources)if(src.level!==undefined&&!integer(src.level,1,999))fail('技能取得等級無效：'+sk.id);
      ids.set(sk.id,sk);positions.add(`${a.job}:${a.kind}:${a.index}`);
    }
    const classJobs=new Set();
    for(const rule of s.classRules){
      if(!integer(rule.job,0,3)||classJobs.has(rule.job))fail('職業設定重複');classJobs.add(rule.job);
      for(const k of ['initial','advanced']){if(!Array.isArray(rule[k]))fail('職業技能清單無效');for(const row of rule[k])if(!ids.has(row.skillId)||!ids.get(row.skillId).jobs.includes(rule.job)||!integer(row.level,1,999))fail('職業引用不存在或等級無效：'+row.skillId);}
      for(const stage of ['first','advanced'])for(const type of ['active','proc','support'])if(!integer(rule.slots?.[stage]?.[type],0,type==='active'?3:2))fail('職業槽位超出上限');
    }
    const e=s.equipment;if(!e||!Array.isArray(e.pool)||!Array.isArray(e.chanceByDifficulty)||e.chanceByDifficulty.length!==3||e.chanceByDifficulty.some(x=>!finite(x,0,1)))fail('裝備技能機率無效');
    if(e.formRules!==undefined&&(!Array.isArray(e.formRules)||e.formRules.some(r=>!safe(r.formId)||r.skillId&&!ids.has(r.skillId)||r.skillChance!==undefined&&!finite(r.skillChance,0,1)||r.allowSkill!==undefined&&typeof r.allowSkill!=='boolean')))fail('固定裝備技能設定無效');
    for(const row of e.pool){const sk=ids.get(row.skillId);if(!sk||!sk.sources.some(x=>x.type==='equipment')||!Array.isArray(row.jobs)||row.jobs.some(x=>!integer(x,0,3))||!Array.isArray(row.slots)||row.slots.some(x=>!integer(x,0,3))||!integer(row.minLevel,1,999)||!integer(row.maxLevel,row.minLevel,999)||!finite(row.weight,0)||!['maps','monsters','bosses'].every(k=>Array.isArray(row[k]))||typeof row.allowShop!=='boolean'||typeof row.allowCraft!=='boolean')fail('裝備技能池引用或限制無效：'+row.skillId);}
    if(!Array.isArray(e.socketBands)||!e.socketBands.length||!Array.isArray(e.sourceRules))fail('鑲嵌孔分布無效');
    const weights=row=>Array.isArray(row.weights)&&row.weights.length===4&&row.weights.every(v=>finite(v,0,1))&&Math.abs(row.weights.reduce((a,v)=>a+v,0)-1)<1e-8;
    let end=0;for(const row of e.socketBands){if(!integer(row.minLevel,1,999)||row.minLevel!==end+1||!integer(row.maxLevel,row.minLevel,999)||!weights(row))fail('孔數等級區間必須連續且機率總和為 1');end=row.maxLevel;}if(end!==999)fail('孔數分布需涵蓋 LV1～999');
    for(const row of e.sourceRules)if(!['starter','boss','drop','shop','craft','legacy'].includes(row.source)||!weights(row))fail('來源孔數機率無效');
    if(!Array.isArray(s.gems)||s.gems.length!==5||new Set(s.gems.map(g=>g.kind)).size!==5)fail('寶石定義無效');
    for(const g of s.gems)if(!integer(g.kind,0,4)||!['atk','hp','def','speed','crit'].includes(g.base?.stat)||!['flat','ratio'].includes(g.base?.unit)||!['effect','cooldown','procChance','heal','shield'].includes(g.skill?.key)||![g.base.values,g.skill.values].every(a=>Array.isArray(a)&&a.length===3&&a.every(v=>finite(v,0,1e6)))||!Array.isArray(g.skill.types)||g.skill.types.some(x=>!types.includes(x))||!Array.isArray(g.skill.effects)||!Array.isArray(g.skill.slots)||g.skill.slots.some(x=>x!==0)||!finite(g.cap,0,1e6))fail('寶石效果、相容性或階級無效');
    for(const sk of s.definitions)for(const target of sk.induction?.targets||[])if(target.kind==='skill'&&!ids.has(target.skillId))fail('誘發技能引用不存在：'+target.skillId);
    return s;
  }
  function project(d){
    const raw=d.skillSystem;if(raw.gemSlotRuleVersion!==2){raw.gems.forEach(g=>g.skill.slots=g.skill.slots.filter(n=>n===0));raw.gemSlotRuleVersion=2;}
    const s=validate(raw);
    const maps=d.balanceSettings?.maps?.catalog,monsters=d.balanceSettings?.monsters?.catalog,forms=new Set();
    for(const [job,slots] of (d.equipmentForms||[]).entries())for(const [slot,rows] of slots.entries())for(const [i,row] of rows.entries())forms.add(row.id||`job${job}-slot${slot}-form${i}`);
    for(const row of s.equipment.pool)if(maps&&row.maps.some(i=>!integer(i,0,maps.length-1))||monsters&&row.monsters.some(id=>!monsters.some(m=>m.id===id))||maps&&row.bosses.some(i=>!integer(i,0,maps.length-1)))throw Error('技能系統：裝備技能池來源引用不存在：'+row.skillId);
    for(const row of s.equipment.formRules||[])if(forms.size&&!forms.has(row.formId))throw Error('技能系統：固定裝備引用不存在：'+row.formId);
    for(const sk of s.definitions){
      for(const adapter of adapters(sk)){
      const {adapters:unused,adapter:primary,type,jobs,sources,disabled,...row}=copy(sk),{job,index,kind}=adapter;
      if(sk.adapters)row.id=sk.id+'-job'+job;
      if(kind==='passive'){d.passiveDefinitions[index]=row;continue;}
      const list=kind==='core'?d.classes[job].skills:d.supportSkills[job];
      if(index>list.length)throw Error('技能引擎對照不可跳號：'+sk.id);
      if(kind==='core'){row.activation=type;row.requiredLevel??=1;row.requiresAdvanced=false;row.powerPerLevel??=0;if(type==='proc'){row.procChancePerLevel??=0;row.procBaseChance??=.245;}}
      else row.level??=1;
      list[index]=row;
      }
    }
    return d;
  }
  function normalizeDocument(input){const d=copy(input);d.skillSystem??=fromLegacy(d);if(!d.skillSystem.clearingSkillsVersion)addClearingSkills(d.skillSystem,d);return project(d);}
  function slots(system,job,advanced){return copy(system.classRules.find(r=>r.job===job)?.slots[advanced?'advanced':'first']||{active:3,proc:1,support:1});}
  function gear(g,{legacy=false,source='drop',system,random=Math.random}={}){
    if(!g||g.type==='companionToken')return g;
    if(g.skillSockets===undefined){
      const level=g.equipmentLevel||1,rows=system?.equipment,rule=rows?.sourceRules.find(x=>x.source===source&&(x.boss===undefined||x.boss===g.boss))||rows?.socketBands.find(x=>level>=x.minLevel&&level<=x.maxLevel),weights=rule?.weights||[1,0,0,0];
      let n=0;if(!legacy){let r=random();while(n<3&&r>=weights[n])r-=weights[n++];}
      g.skillSockets={version:VERSION,count:n,gems:Array(n).fill(null),firstMode:'skill'};
    }
    const x=g.skillSockets;
    if(x.version!==VERSION||!integer(x.count,0,3)||!Array.isArray(x.gems)||x.gems.length!==x.count||x.gems.some(id=>id!==null&&!integer(id,0,14))||!['skill','base'].includes(x.firstMode))throw Error('裝備寶石孔資料無效：'+g.id);
    if(g.skillId!==undefined&&g.skillId!==null&&(typeof g.skillId!=='string'||system&&!system.definitions.some(s=>s.id===g.skillId)))throw Error('裝備技能不存在：'+g.skillId);
    return g;
  }
  function migrateSave(input,system){
    const d=copy(input),members=d.version===3?d.members:[d];if(!Array.isArray(members)||!members[0])return d;
    const h=members[0],b=d.buildSystem;
    if(d.skillSystemVersion!==undefined&&d.skillSystemVersion!==VERSION)throw Error('不支援的技能存檔版本');
    const first=d.skillSystemVersion!==VERSION;
    if(first){
      const instances=b?.permanent?.gemInstances||{};
      if(b){for(const type of Object.values(instances)){if(!integer(type,0,14))throw Error('舊寶石實例無效');h.gems[type]=(h.gems[type]||0)+1;}b.permanent.gemInstances={};for(const p of b.plans||[])p.sockets=p.sockets?.map(()=>null)||[];}
      members.forEach((member,n)=>{if(!b||n>0)for(const type of member.sockets||[])if(type!==null){if(!integer(type,0,14))throw Error('舊技能寶石無效');h.gems[type]=(h.gems[type]||0)+1;}member.sockets=member.skills?.map(()=>null)||[];delete member.disabledCompanionSkills;});
    }
    const ids=new Set();for(const member of members)for(const g of member.bag||[]){if(ids.has(g.id))throw Error('重複裝備 ID：'+g.id);ids.add(g.id);gear(g,{legacy:true,source:'legacy',system});}
    d.skillSystemVersion=VERSION;return d;
  }
  return {VERSION,copy,adapters,adapterFor,types,sources,emptyConditions,fromLegacy,clearingStatus,addClearingSkills,validate,project,normalizeDocument,slots,gear,migrateSave};
});
