/* Ownership uses the existing skill pools and stable indices; migration only appends. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('../character/achievement-model.js'):root.EmberwildAchievements);if(typeof module==='object'&&module.exports)module.exports=api;else root.EmberwildCompanionSkills=api;})(globalThis,function(Achievements){
  const copy=x=>JSON.parse(JSON.stringify(x));
  const availabilityLabels={visible:'顯示',hidden:'隱藏'};
  const unlockTypes={initial:'初始開放',achievement:'達成指定成就（目前不發放招募券）',ticket:'商店隨機招募券（目前不上架）'};
  function availability(p){let value=p.availability??(p.id>=15&&p.id<=29?'hidden':'visible');if(['unlocked','locked'].includes(value))value='visible';if(!Object.hasOwn(availabilityLabels,value))throw Error('夥伴顯示狀態無效：'+p.id);return value;}
  function duplicateTicketGold(p){const value=p.duplicateTicketGold??100;if(!Number.isSafeInteger(value)||value<0||value>1e9)throw Error('重複招募券轉換金幣無效：'+p.id);return value;}
  function unlockCondition(p,maps){
    const c=p.unlockCondition??{type:p.availability==='locked'?'region':'initial',mapIndex:1};
    if(!c||typeof c!=='object'||Array.isArray(c)||!Object.hasOwn(unlockTypes,c.type)&&!['region','elite'].includes(c.type))throw Error('夥伴解鎖條件無效：'+p.id);
    if(['region','elite'].includes(c.type)){
      if(!Number.isInteger(c.mapIndex)||c.mapIndex<0||c.mapIndex>999||maps&&!maps[c.mapIndex])throw Error('夥伴解鎖地區無效：'+p.id);
      if(c.type==='elite'&&(!Number.isSafeInteger(c.count)||c.count<1||c.count>1000))throw Error('夥伴菁英數量無效：'+p.id);
      return {type:'achievement',achievementIds:Achievements.conditions([Achievements.id(c.mapIndex,c.type==='region'?'open':'elite',c.type==='elite'?Math.ceil(c.count/50)*50:0)],maps)};
    }
    if(c.type==='achievement')return {type:'achievement',achievementIds:Achievements.conditions(c.achievementIds,maps)};
    if(c.type==='ticket'){
      if(!Number.isFinite(c.chance)||c.chance<=0||c.chance>1||!Number.isSafeInteger(c.price)||c.price<0||c.price>1000000000)throw Error('夥伴招募券設定無效：'+p.id);
      return {type:'ticket',chance:c.chance,price:c.price};
    }
    return {type:'initial'};
  }
  function normalizeUnlocks(doc){for(const p of doc.companions||[]){p.unlockCondition=unlockCondition(p,doc.balanceSettings?.maps?.catalog);p.availability=availability(p);p.duplicateTicketGold=duplicateTicketGold(p);}return doc;}
  function validateUnlockProgress(raw){
    if(raw===undefined)return {version:1,unlocked:[],regions:[],eliteKills:{}};
    if(!raw||raw.version!==1||!Array.isArray(raw.unlocked)||raw.unlocked.length>512||new Set(raw.unlocked).size!==raw.unlocked.length||raw.unlocked.some(id=>!Number.isInteger(id)||id<10||id>1e9)||!Array.isArray(raw.regions)||raw.regions.length>1000||new Set(raw.regions).size!==raw.regions.length||raw.regions.some(i=>!Number.isInteger(i)||i<0||i>999)||!raw.eliteKills||typeof raw.eliteKills!=='object'||Array.isArray(raw.eliteKills)||Object.entries(raw.eliteKills).some(([key,n])=>! /^(0|[1-9]\d{0,2})$/.test(key)||!Number.isSafeInteger(n)||n<0||n>1e12))throw Error('夥伴解鎖進度無效');
    return copy(raw);
  }
  function cloneSkills(doc,p,ownerId){
    const core=doc.classes[p.job].skills,support=doc.supportSkills[p.job],remap=new Map();
    const indices=[...new Set([...p.core,...core.flatMap((sk,i)=>ownerId!==undefined&&sk.partnerId===ownerId?[i]:[])])];
    for(const i of indices){const sk=core[i];if(!sk)throw Error('夥伴核心技能不存在：'+p.id);if(core.length>=64)throw Error('此職業核心技能最多 64 個');const next=copy(sk);next.id='partner'+p.id+'-core'+core.length;next.partnerId=p.id;next.usageScope='character';next.requiresAdvanced=false;next.mastery=null;next.requiredMastery=null;next.requiredMasteryLevel=0;remap.set(i,core.length);core.push(next);}
    for(const [old,index] of remap){const next=core[index];for(const target of next.induction?.targets||[])if(target.kind==='skill'){const match=[...remap].find(([source])=>core[source].id===target.skillId);if(match)target.skillId=core[match[1]].id;}}
    p.core=p.core.map(i=>remap.get(i));p.active=p.active.map(i=>remap.get(i));p.proc=p.proc.map(i=>remap.get(i));
    const supportMap=new Map(),supportIndices=[...new Set([...p.support,...support.flatMap((sk,i)=>ownerId!==undefined&&sk.partnerId===ownerId?[i]:[])])];
    for(const i of supportIndices){const sk=support[i];if(!sk)throw Error('夥伴輔助技能不存在：'+p.id);if(support.length>=64)throw Error('此職業輔助技能最多 64 個');const next=copy(sk);next.id='partner'+p.id+'-support'+support.length;next.partnerId=p.id;next.mastery=null;next.requiredMastery=null;next.requiredMasteryLevel=0;supportMap.set(i,support.length);support.push(next);}p.support=p.support.map(i=>supportMap.get(i));
  }
  function clonePassives(doc,p,ownerId){
    const ids=[...new Set([...(p.passives||[]),...doc.passiveDefinitions.filter(d=>ownerId!==undefined&&d.partnerId===ownerId).map(d=>d.id)])],remap=new Map();
    for(const id of ids){const d=doc.passiveDefinitions.find(x=>x.id===id);if(!d)throw Error('夥伴被動不存在：'+p.id);if(doc.passiveDefinitions.length>=512)throw Error('被動最多 512 個');const next=copy(d);let n=1;while(doc.passiveDefinitions.some(x=>x.id==='partner'+p.id+'-passive'+n))n++;next.id='partner'+p.id+'-passive'+n;next.partnerId=p.id;next.requiredLevel=d.requiredLevel??1;doc.passiveDefinitions.push(next);remap.set(id,next.id);}p.passives=(p.passives||[]).map(id=>remap.get(id));
  }
  function migrate(doc){
    if(doc.companionSkillVersion!==1){
      if(doc.companionSkillVersion!==undefined)throw Error('夥伴技能版本無效');
      for(const p of doc.companions||[]){
        if(!(p.core||[]).every(i=>doc.classes[p.job].skills[i]?.partnerId===p.id)||!(p.support||[]).every(i=>doc.supportSkills[p.job][i]?.partnerId===p.id))cloneSkills(doc,p);
        if(!(p.passives||[]).every(id=>doc.passiveDefinitions.find(d=>d.id===id)?.partnerId===p.id))clonePassives(doc,p);
      }
      doc.companionSkillVersion=1;
    }
    if(doc.companionNameVersion===1)return normalizeUnlocks(doc);
    if(doc.companionNameVersion!==undefined)throw Error('夥伴名稱版本無效');
    // Work on a copy so an oversized legacy name pool cannot leave a partial migration.
    const next=copy(doc),list=[],used=new Set();let id=Math.max(14,...(next.companions||[]).map(p=>p.id))+1;
    for(const p of next.companions||[]){
      const names=p.name!==undefined?[p.name]:[...new Set(p.names||[])];
      if(!names.length)throw Error('夥伴缺少角色名稱：'+p.id);
      for(let n=0;n<names.length;n++){
        const name=names[n];
        if(typeof name!=='string'||!name.trim()||name!==name.trim()||Array.from(name).length>20||/[\u0000-\u001f\u007f]/.test(name)||used.has(name))throw Error('夥伴名稱無效或重複：'+name);
        used.add(name);const person=n===0?p:copy(p);person.name=name;delete person.role;delete person.names;
        if(n){person.statTemplateId=p.statTemplateId??p.id;person.id=id++;cloneSkills(next,person,p.id);clonePassives(next,person,p.id);}
        list.push(person);if(list.length>512||person.id>1000000000)throw Error('拆分後夥伴數量或 ID 超過上限');
      }
    }
    next.companions=list;next.companionNameVersion=1;Object.assign(doc,next);return normalizeUnlocks(doc);
  }
  function validate(doc){
    if(doc.companionSkillVersion!==1)throw Error('夥伴技能版本無效');
    if(doc.companionNameVersion!==1)throw Error('夥伴名稱版本無效');
    const names=new Set();for(const p of doc.companions||[]){availability(p);duplicateTicketGold(p);unlockCondition(p,doc.balanceSettings?.maps?.catalog);if(typeof p.name!=='string'||!p.name.trim()||p.name!==p.name.trim()||Array.from(p.name).length>20||/[\u0000-\u001f\u007f]/.test(p.name)||names.has(p.name)||p.role!==undefined||p.names!==undefined)throw Error('夥伴角色名稱無效或重複：'+p.id);names.add(p.name);}
    for(let job=0;job<doc.classes.length;job++)for(const pool of [doc.classes[job].skills,doc.supportSkills[job]]){
      if(!Array.isArray(pool)||pool.length>64)throw Error('技能池最多 64 個');
      for(const sk of pool)if(sk.partnerId!=null&&(!Number.isInteger(sk.partnerId)||!doc.companions.some(p=>p.id===sk.partnerId&&p.job===job)))throw Error('技能指定夥伴不存在或職業不符：'+sk.name);
    }
    for(const c of doc.classes)for(const sk of c.skills)for(const t of sk.induction?.targets||[])if(t.kind==='skill'){const target=c.skills.find(s=>s.id===t.skillId);if(target&&(target.partnerId??null)!==(sk.partnerId??null))throw Error('誘發技能必須屬於同一角色：'+sk.name);}
    for(const d of doc.passiveDefinitions||[])if(d.partnerId!=null&&(!Number.isInteger(d.partnerId)||!doc.companions.some(p=>p.id===d.partnerId)))throw Error('被動指定夥伴不存在：'+d.id);
    for(const p of doc.companions||[]){
      for(const id of p.passives||[])if(doc.passiveDefinitions.find(d=>d.id===id)?.partnerId!==p.id)throw Error('夥伴只能配置自己的被動：'+p.id);
      for(const i of p.core||[])if(doc.classes[p.job].skills[i]?.partnerId!==p.id)throw Error('夥伴只能配置自己的核心技能：'+p.id);
      for(const i of p.support||[])if(doc.supportSkills[p.job][i]?.partnerId!==p.id)throw Error('夥伴只能配置自己的輔助技能：'+p.id);
    }
    return doc;
  }
  // Built-in catalog only; positional pools stay intact for existing saves.
  function configureDefaults(doc){
    const profiles={
      10:{names:['裂地斬','反擊之刃'],passive:'attackPct',description:'專注劍術輸出；技能：裂地斬、反擊之刃、攻擊強化。'},
      11:{names:['嘲諷','堅毅壁壘'],passive:'defensePct',description:'專注承受敵方攻勢；技能：嘲諷、堅毅壁壘、防禦強化。'},
      12:{names:['火焰箭','餘燼爆發'],passive:'attackPct',description:'專注火焰法術輸出；技能：火焰箭、餘燼爆發、攻擊強化。'},
      13:{names:['治癒禱言','生命泉源'],passive:'healingPct',description:'專注隊伍治療；技能：治癒禱言、生命泉源、治療強化。'},
      14:{names:['穿透箭','連射'],passive:'attackPct',description:'專注箭術輸出；技能：穿透箭、連射、攻擊強化。'}
    };
    for(const p of doc.companions||[]){
      const profile=profiles[p.statTemplateId??p.id];if(!profile)continue;
      const pool=doc.classes[p.job].skills;
      const core=profile.names.map(name=>pool.findIndex(sk=>sk.partnerId===p.id&&sk.name===name));
      const passive=doc.passiveDefinitions.find(d=>d.partnerId===p.id&&d.effects.some(e=>e.key===profile.passive));
      if(core.some(i=>i<0)||!passive)throw Error('內建夥伴技能不存在：'+p.id);
      p.core=core;p.active=core.filter(i=>pool[i].activation==='active');p.proc=core.filter(i=>pool[i].activation==='proc');p.support=[];p.passives=[passive.id];p.description=profile.description;p.availability=p.id>=10&&p.id<=14?'visible':'hidden';p.unlockCondition={type:'initial'};p.duplicateTicketGold=100;
      core.forEach((i,n)=>pool[i].requiredLevel=n?3:1);
      passive.requiredLevel=8;passive.name=({attackPct:'攻擊強化',defensePct:'防禦強化',healingPct:'治療強化'})[profile.passive];passive.description='達到解鎖的精通等級且啟用時常駐生效，不占技能槽。';
    }
    return doc;
  }
  return {copy,cloneSkills,clonePassives,migrate,validate,configureDefaults,availability,availabilityLabels,unlockCondition,unlockTypes,normalizeUnlocks,validateUnlockProgress,duplicateTicketGold};
});
