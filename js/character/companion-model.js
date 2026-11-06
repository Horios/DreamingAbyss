/* Shared game/editor contract. Ratings classify design; budgets only emit warnings. */
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('../balance/progression-model.js'):root.EmberwildProgression);if(node)module.exports=api;else root.EmberwildCompanions=api;})(globalThis,function(Progression){
  const ratings=['D','C','B','A','S','SS','SSS'],statKeys=['hp','atk','def','crit','critDamage','speed','pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage'];
  const copy=x=>JSON.parse(JSON.stringify(x));
  const defaultPlans=[
    {id:10,job:0,role:'攻擊戰士',description:'劍術輸出、戰吼與破甲；優先提升攻擊。',names:['洛恩','雷昂','凱斯','艾伯'],core:[0,2,4],active:[4,0],proc:[2],support:[0,2],weapon:'sword'},
    {id:11,job:0,role:'保護戰士',description:'堅毅壁壘、守護誓言與嘲諷；優先提升防禦與生命。',names:['維恩','瑟琳','賽德','塔莉'],core:[0,1,2,6],active:[6,1,0],proc:[2],support:[1],weapon:'sword'},
    {id:12,job:1,role:'法師',description:'火焰箭、餘燼爆發與奧術共鳴；優先提升攻擊。',names:['伊瑟','梅洛','席昂','菲娜'],core:[0,2,4],active:[4,0],proc:[2],support:[0,1],weapon:'staff'},
    {id:13,job:3,role:'祭司',description:'治癒禱言、晨光祝福與聖光庇護；偏重續航。',names:['艾琳','露薇','諾雅','米菈'],core:[0,1,3,5],active:[1,0],proc:[3,5],support:[0,1],weapon:'holyStaff'},
    {id:14,job:2,role:'弓箭手',description:'穿透箭、連射與鷹眼指引；優先提升攻擊。',names:['希雅','凜羽','緹亞','菲爾'],core:[0,2,4],active:[4,0],proc:[2],support:[0,1],weapon:'bow'}
  ].map(p=>({...p,rating:'D'}));
  function definition(plan,classes,settings){
    const cls=classes[plan.job],speed=settings?.combat?.speed||{},per=settings?.progression?.statsPerLevel||{};
    const out={initialStats:{...Object.fromEntries(statKeys.map(k=>[k,0])),hp:cls.hp,atk:cls.atk,def:cls.def,crit:plan.job===2?(settings?.progression?.baseCrit?.archer??.17):(settings?.progression?.baseCrit?.default??.07),critDamage:settings?.combat?.baseCritDamage??1.5,...cls.initialStats,speed:cls.initialStats?.speed??(speed.heroBase||[102,108,116,96])[plan.job]+(speed.heroPerLevel??.5),...plan.initialStats},growthPerLevel:{...Object.fromEntries(statKeys.map(k=>[k,0])),hp:per.hp??4,atk:per.attack??1,def:per.defense??1,...cls.growthPerLevel,speed:cls.growthPerLevel?.speed??speed.heroPerLevel??.5,...plan.growthPerLevel},growthSteps:copy(plan.growthSteps??cls.growthSteps??[])};
    // Old definitions keep their custom growth and gain a conservative equipment
    // budget once. Explicit v1 definitions contain that budget in their own fields.
    if(plan.id!==undefined&&plan.equipmentInternalized!==1){const b=({10:[17,6,2,1.1,.65,.2],11:[21,5,3,1.5,.4,.35],12:[14,6,2,.85,.7,.18],13:[20,5,2,1.25,.5,.25],14:[15,6,2,.95,.65,.2]})[plan.statTemplateId??plan.id]||[17,6,2,1,.6,.2];['hp','atk','def'].forEach((k,i)=>{out.initialStats[k]+=b[i];out.growthPerLevel[k]+=b[i+3];});}
    return out;
  }
  function validatePlanStats(p){
    if(p.statTemplateId!==undefined&&(!Number.isInteger(p.statTemplateId)||p.statTemplateId<10||p.statTemplateId>1000000000))throw Error('夥伴原有成長來源無效：'+p.id);
    if(p.rating!==undefined&&!ratings.includes(p.rating))throw Error('夥伴評級無效：'+p.id);
    if(p.equipmentInternalized!==undefined&&p.equipmentInternalized!==1)throw Error('夥伴裝備內化版本無效：'+p.id);
    for(const field of ['initialStats','growthPerLevel'])if(p[field]!==undefined){
      const values=p[field];if(!values||typeof values!=='object'||Array.isArray(values)||Object.entries(values).some(([k,v])=>!statKeys.includes(k)||!Number.isFinite(v)||v<0)||field==='initialStats'&&['hp','atk'].some(k=>values[k]!==undefined&&values[k]<=0))throw Error('夥伴初始／成長資料無效：'+p.id);
    }
    if(p.growthSteps!==undefined&&(!Array.isArray(p.growthSteps)||p.growthSteps.length>12||p.growthSteps.some(s=>!s||!Number.isInteger(s.every)||s.every<1||s.every>60||['hp','atk','def'].some(k=>!Number.isInteger(s[k])||s[k]<0))))throw Error('夥伴階梯成長無效：'+p.id);
    const {points:_legacyPoints,...clean}=copy(p);return {...clean,rating:p.rating??'D'};
  }
  function totals(plan,classes,settings,weights){
    const def=definition(plan,classes,settings),base={...def.initialStats,...Progression.naturalStats(def,1)},last=Progression.naturalStats(def,60),growth={...def.growthPerLevel},levels=59;
    for(const key of ['hp','atk','def'])growth[key]=(last[key]-base[key])/levels;
    
    const sum=v=>statKeys.reduce((n,k)=>n+(v[k]||0)*(weights[k]||0),0);
    return {base:sum(base),growth:sum(growth),baseStats:base,effectiveGrowth:growth,rawBase:base.hp+base.atk+base.def,rawGrowth:growth.hp+growth.atk+growth.def};
  }
  function defaults(classes,settings){
    const weights={...Object.fromEntries(statKeys.map(k=>[k,0])),hp:1/3,atk:1,def:1,crit:100,critDamage:10,speed:.1};
    const rows=defaultPlans.map(p=>totals(p,classes,settings,weights)),range=key=>({min:Math.floor(Math.min(...rows.map(r=>r[key]))*100)/100,max:Math.ceil(Math.max(...rows.map(r=>r[key]))*100)/100}),base=range('base'),growth=range('growth');
    const gap=key=>Math.ceil((Math.max(...rows.map(r=>r[key]))/Math.min(...rows.map(r=>r[key]))-1)*100);
    return {activeLimit:6,ratings:{weights,maxBaseGapPercent:gap('base'),maxGrowthGapPercent:gap('growth'),ranges:Object.fromEntries(ratings.map(r=>[r,{base:copy(base),growth:copy(growth)}]))}};
  }
  function normalizeSettings(raw,classes,settings){
    const out=defaults(classes,settings);if(raw===undefined)return out;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('夥伴平衡設定無效');
    out.activeLimit=raw.activeLimit??out.activeLimit;
    if(!Number.isInteger(out.activeLimit)||out.activeLimit<3||out.activeLimit>512)throw Error('現役上限需為 3～512 人');
    const r=raw.ratings||{};Object.assign(out.ratings.weights,r.weights||{});
    for(const k of statKeys)if(!Number.isFinite(out.ratings.weights[k])||out.ratings.weights[k]<0)throw Error('夥伴總量權重無效');
    for(const k of ['maxBaseGapPercent','maxGrowthGapPercent']){out.ratings[k]=r[k]??out.ratings[k];if(!Number.isFinite(out.ratings[k])||out.ratings[k]<0)throw Error('夥伴評級最大差距無效');}
    for(const grade of ratings)for(const metric of ['base','growth']){Object.assign(out.ratings.ranges[grade][metric],r.ranges?.[grade]?.[metric]||{});const v=out.ratings.ranges[grade][metric];if(!Number.isFinite(v.min)||!Number.isFinite(v.max)||v.min<0||v.max<v.min)throw Error('夥伴評級建議範圍無效：'+grade);}
    return out;
  }
  function warnings(plans,classes,settings,config){
    const rows=plans.map(p=>({p,...totals(p,classes,settings,config.ratings.weights)})),out=[];
    for(const row of rows){const grade=row.p.rating||'D',range=config.ratings.ranges[grade];for(const metric of ['base','growth'])if(row[metric]<range[metric].min-1e-8||row[metric]>range[metric].max+1e-8)out.push({id:row.p.id,message:`此角色的${metric==='base'?'總基礎數值':'總成長量'}超出目前 ${grade} 評級建議範圍。`});
      for(const metric of ['base','growth']){const others=rows.filter(r=>(r.p.rating||'D')!==grade);if(!others.length)continue;const min=Math.min(...others.map(r=>r[metric])),limit=config.ratings[metric==='base'?'maxBaseGapPercent':'maxGrowthGapPercent'];if(row[metric]>min*(1+limit/100)+1e-8)out.push({id:row.p.id,message:`此角色的${metric==='base'?'總基礎數值':'總成長量'}與其他評級的差距超出設定的 ${limit}%。`});}
    }
    return out;
  }
  return {ratings,statKeys,defaultPlans,definition,validatePlanStats,totals,defaults,normalizeSettings,warnings};
});
