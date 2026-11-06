/* Shared, DOM-free contract. Embedded verbatim in the private balance editor. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EmberwildTeams=api;})(globalThis,()=>{
  'use strict';
  const VERSION=1,copy=v=>JSON.parse(JSON.stringify(v));
  const defaults={maxPlans:6};
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const int=(v,min=0,max=1e12)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  function settings(raw){const out={...defaults,...raw};delete out.defaultLearnCost;if(!int(out.maxPlans,1,12))throw Error('隊伍數量無效');return out;}
  function rules(raw){
    const r=raw||{},out={unlockConditions:copy(r.unlockConditions??{})},u=out.unlockConditions;
    if(!object(u))throw Error('技能永久解鎖設定無效');
    u.classMasteryLevel??=0;u.quests??=[];u.materials??=[];u.bossKills??=[];u.eliteKills??=[];u.bossEquipment??=[];
    if(!int(u.classMasteryLevel,0,100)||!Array.isArray(u.quests)||!Array.isArray(u.materials)||!Array.isArray(u.bossKills)||!Array.isArray(u.eliteKills)||!Array.isArray(u.bossEquipment))throw Error('技能永久解鎖設定無效');
    const safe=s=>typeof s==='string'&&s.length>0&&s.length<=80&&!/[<>\u0000-\u001f]/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
    const killRow=x=>object(x)&&int(x.mapIndex,-1,999)&&int(x.count,1,1e9),gearRow=x=>object(x)&&int(x.mapIndex,-1,999)&&int(x.quantity,1,100);
    if(u.quests.length>32||new Set(u.quests).size!==u.quests.length||u.quests.some(s=>!safe(s))||u.materials.length>32||u.materials.some(m=>!object(m)||!safe(m.name)||!int(m.quantity,1,1e9))||new Set(u.materials.map(m=>m.name)).size!==u.materials.length||u.bossKills.length>32||u.bossKills.some(x=>!killRow(x))||new Set(u.bossKills.map(x=>x.mapIndex)).size!==u.bossKills.length||u.eliteKills.length>32||u.eliteKills.some(x=>!killRow(x))||new Set(u.eliteKills.map(x=>x.mapIndex)).size!==u.eliteKills.length||u.bossEquipment.length>32||u.bossEquipment.some(x=>!gearRow(x))||new Set(u.bossEquipment.map(x=>x.mapIndex)).size!==u.bossEquipment.length)throw Error('技能永久任務、戰鬥或裝備條件無效');
    return out;
  }
  function normalizeDocument(input){
    const d=copy(input);d.teamSettings=settings(d.teamSettings);d.balanceSettings??={};d.balanceSettings.meta??={};
    const p=d.balanceSettings.progression??={};p.starting??={};p.levelRewards??={};delete p.starting.skillPoints;delete p.levelRewards.skillPoints;delete p.starting.abilityPoints;delete p.levelRewards.abilityPoints;delete p.statsPerPoint;d.balanceSettings.meta.teamBuildVersion=VERSION;
    for(const cls of d.classes||[])for(const sk of cls.skills||[]){delete sk.learnCost;Object.assign(sk,rules(sk));}
    for(const list of d.supportSkills||[])for(const sk of list){delete sk.learnCost;Object.assign(sk,rules(sk));}
    return d;
  }
  function budget(){return {};}
  const key=(job,kind,i)=>`${job}:${kind}:${i}`;
  function blank(id,name,job=null,coreCount=0,supportCount=0){return {id,name,job,playerActive:true,skills:Array(coreCount).fill(0),supportLevels:Array(supportCount).fill(0),active:[null,null],procSlots:[null,null],supportSlots:[null,null],equipped:Array(5).fill(null),sockets:Array(coreCount).fill(null),companions:[],enlisted:[],tokens:{},skillLoadout:null,activeSkillEquipmentId:null,passiveEnabled:{}};}
  function spent(){return 0;}
  function references(build,id){return build.plans.filter(p=>p.equipped.includes(id)||Object.values(p.tokens).includes(id)).map(p=>({id:p.id,name:p.name}));}
  function clearReferences(build,ids){const set=new Set(ids);for(const p of build.plans){p.equipped=p.equipped.map(id=>set.has(id)?null:id);for(const k of Object.keys(p.tokens))if(set.has(p.tokens[k]))p.tokens[k]=null;}}
  function prepareSave(input){
    const d=copy(input),rows=d?.version===3?d.members:[d];if(!Array.isArray(rows))return d;
    const ids=new Set(rows.flatMap(h=>Array.isArray(h?.bag)?h.bag.map(g=>g.id):[]));
    for(const h of rows){delete h.sp;delete h.ap;delete h.stats;if(Array.isArray(h?.equipped))h.equipped=h.equipped.map(id=>id!==null&&!ids.has(id)?null:id);if(h?.tokenId!==null&&h?.tokenId!==undefined&&!ids.has(h.tokenId))h.tokenId=null;}
    if(d?.buildSystem?.permanent){delete d.buildSystem.permanent.skillCredit;delete d.buildSystem.permanent.abilityCredit;}for(const p of d?.buildSystem?.plans||[])delete p.stats;
    return d;
  }
  function validate(build,{classes,supports,members,items,progression,level,config=defaults,wearable=()=>true}){
    const b=copy(build),cfg=settings(config),fail=message=>{throw Error(message);},perm=b?.permanent;
    if(b?.version!==VERSION||!int(b.serial,2,1e9)||!Array.isArray(b.plans)||!b.plans.length||b.plans.length>12||!object(perm)||!int(perm.playerKey,0,1e9)||!object(perm.classes)||!object(perm.masteries)||!object(perm.unlocks)||!object(perm.payments)||!object(perm.gemInstances)||!int(perm.gemSerial,1,1e9))fail('永久養成或隊伍資料無效');
    const skillKeys=new Set();classes.forEach((c,j)=>{c.skills.forEach((_,i)=>skillKeys.add(key(j,'core',i)));(supports[j]||[]).forEach((_,i)=>skillKeys.add(key(j,'support',i)));});
    for(const [k,v] of Object.entries(perm.unlocks))if(!skillKeys.has(k)||v!==true)fail('永久技能解鎖無效');
    for(const [k,v] of Object.entries(perm.payments))if(!skillKeys.has(k)||v!==true||!perm.unlocks[k])fail('技能材料消耗成果無效');
    for(const [k,v] of Object.entries(perm.classes))if(!/^\d+$/.test(k)||!classes[Number(k)]||!object(v)||typeof v.activated!=='boolean'||typeof v.advanced!=='boolean'||!int(v.xp)||!v.activated&&(v.xp||v.advanced))fail('職業永久成長無效');
    for(const [k,v] of Object.entries(perm.masteries))if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(k)||!int(v))fail('武器／元素精通無效');
    for(const [k,v] of Object.entries(perm.gemInstances))if(!/^gem-\d+$/.test(k)||!int(v,0,14))fail('技能寶石實體無效');
    if(Object.keys(perm.gemInstances).some(k=>Number(k.slice(4))>=perm.gemSerial))fail('技能寶石序號無效');
    if(perm.playerKey!==(members[0].playerId??members[0].job))fail('主角永久識別不符');
    const owned=new Map(items.map(g=>[g.id,g])),people=new Set(members.slice(1).map(h=>h.companionId??h.job)),ids=new Set();
    for(const p of b.plans){
      if(!p||!/^team-\d+$/.test(p.id)||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||Array.from(p.name).length>24||/[\u0000-\u001f]/.test(p.name)||p.job!==null&&(!int(p.job,0,classes.length-1)||!perm.classes[p.job]?.activated))fail('隊伍名稱或職業無效');ids.add(p.id);
      const c=p.job===null?0:classes[p.job].skills.length,s=p.job===null?0:(supports[p.job]||[]).length;
      // Skill pools grow append-only (including independently owned companion skills).
      // Old plans keep their indices; new positions are unlearned and have no gems.
      // Never trim extra saved entries or replace malformed/nonempty data here.
      for(const [field,count,empty] of [['skills',c,0],['supportLevels',s,0],['sockets',c,null]]){
        if(Array.isArray(p[field])&&p[field].length<count)p[field].push(...Array(count-p[field].length).fill(empty));
      }
      if(!Array.isArray(p.skills)||p.skills.length!==c||p.skills.some(n=>!int(n,0,1))||!Array.isArray(p.supportLevels)||p.supportLevels.length!==s||p.supportLevels.some(n=>!int(n,0,1)))fail('隊伍技能學習資料無效');
      for(const [kind,list] of [['core',p.skills],['support',p.supportLevels]])if(list.some((v,i)=>v&&!perm.unlocks[key(p.job,kind,i)]))fail('隊伍學習了尚未永久解鎖的技能');
      for(const [field,list,type] of [['active',p.skills,'active'],['procSlots',p.skills,'proc'],['supportSlots',p.supportLevels,null]]){const slots=p[field];if(!Array.isArray(slots)||slots.length!==(p.skillLoadout?globalThis.__EMBERWILD_SKILLS?.slotCounts({job:p.job??0,advanced:!!perm.classes[p.job]?.advanced})[type||'support']??2:2)||new Set(slots.filter(v=>v!==null)).size!==slots.filter(v=>v!==null).length||slots.some(i=>i!==null&&(!int(i,0,list.length-1)||!list[i]||type&&classes[p.job].skills[i].activation!==type)))fail('隊伍技能槽無效：'+p.id+'/'+field+'（槽數 '+(slots?.length??'缺少')+'）');}
      if(p.passiveEnabled!==undefined&&(!object(p.passiveEnabled)||Object.entries(p.passiveEnabled).some(([id,v])=>!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)||typeof v!=='boolean')))fail('隊伍被動啟用設定無效');
      p.passiveEnabled??={};
      p.playerActive??=true;
      const activeCount=Number(p.playerActive)+(p.companions?.length||0);
      if(typeof p.playerActive!=='boolean'||activeCount<1||activeCount>3||!Array.isArray(p.equipped)||p.equipped.length!==5||!object(p.tokens)||!Array.isArray(p.companions)||p.companions.length>3||!Array.isArray(p.enlisted)||p.enlisted.length>512||new Set(p.enlisted).size!==p.enlisted.length||new Set(p.companions).size!==p.companions.length||p.enlisted.some(k=>!people.has(k))||p.companions.some(k=>!p.enlisted.includes(k)))fail('隊伍編成無效');
      p.equipped=p.equipped.map((id,i)=>{if(id===null)return null;if(typeof id!=='string')fail('装備 UID 無效');const g=owned.get(id);if(!g)return null;if(p.job===null||!wearable(g,p.job,i))fail('隊伍裝備不符職業或位置');return id;});
      for(const [k,id] of Object.entries(p.tokens)){if(!people.has(Number(k))||id!==null&&typeof id!=='string')fail('隊伍信物引用無效');if(id!==null&&!owned.has(id))p.tokens[k]=null;else if(id!==null&&owned.get(id).type!=='companionToken')fail('隊伍信物類型無效');}
      const used=[...p.equipped.filter(Boolean),...Object.values(p.tokens).filter(Boolean)];if(new Set(used).size!==used.length)fail('同一隊伍重複使用物品實體');
      if(!Array.isArray(p.sockets)||p.sockets.length!==c||p.sockets.some((id,i)=>id!==null&&(!p.skills[i]||!Object.hasOwn(perm.gemInstances,id)))||new Set(p.sockets.filter(Boolean)).size!==p.sockets.filter(Boolean).length)fail('隊伍技能寶石引用無效');
      if(p.job===null&&(p.skills.some(Boolean)||p.equipped.some(Boolean)||p.companions.length||p.enlisted.length||Object.values(p.tokens).some(Boolean)))fail('空白隊伍含有配置');
    }
    if(!ids.has(b.activeId)||Number(b.plans.reduce((n,p)=>Math.max(n,Number(p.id.slice(5))),0))>=b.serial)fail('目前隊伍或序號無效');
    const fields=[...Object.keys(blank('team-1','隊伍')),'skillLoadout','activeSkillEquipmentId'];
    b.plans=b.plans.map(p=>Object.fromEntries(fields.filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));
    return b;
  }
  return {VERSION,defaults,copy,settings,rules,normalizeDocument,budget,key,blank,spent,references,clearReferences,prepareSave,validate};
});
