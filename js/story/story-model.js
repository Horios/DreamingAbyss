/* Shared, data-only story contract. No quest-specific execution rules. */
(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const TYPES={gearWorn:'穿戴指定裝備',gearSkillActive:'啟用指定裝備技能',skillSlotted:'配置技能至合法槽位',gearSkillGem:'第一孔技能加成生效',gearBaseGem:'指定孔基礎能力生效',encounter:'任務關卡通關',companions:'招募夥伴數',party:'上陣人數',region:'解鎖地區',visit:'到達地區',explore:'地區擊殺進度',kill:'指定怪物擊殺',kills:'任意怪物擊殺',boss:'指定地區 BOSS',bosses:'任意 BOSS',stock:'持有道具',acquired:'累積取得道具',gatherItem:'採集指定素材',gather:'採集次數',recipe:'完成指定配方',alchemy:'煉金次數',enhance:'強化次數',enhanceLevel:'裝備最高強化',level:'主角等級',quest:'完成任務',stage:'完成階段',flag:'任務 Flag',unlock:'永久解鎖'};
 const GUIDES={battle:'前往探索',partnerRoster:'前往夥伴',roster:'前往隊伍',equipment:'前往背包',worn:'前往裝備',forge:'前往強化',gather:'前往採集',alchemy:'前往煉金',shop:'前往商店',skills:'前往技能'};
 const condition=(type='kills',key='',count=1,mode='lifetime')=>({type,key,count,mode,itemType:'material'});
 const group=conditions=>({mode:'all',conditions:conditions||[]});
 const encounter=()=>({enabled:false,name:'任務關卡',mapIndex:0,repeatable:false,enemies:[]});
 const stage=(id='stage_1',name='新階段')=>({id,name,encounter:encounter(),speaker:'旁白',description:'',dialogue:[{speaker:'旁白',kind:'narrator',text:'請填寫劇情。'}],conditions:group(),rewards:{gold:0,ore:0,items:[]},effects:[],next:'',branches:[],choices:[],guides:[]});
 const quest=(id='quest_1',name='新任務',type='side',npc='')=>({id,name,type,npc,description:'',enabled:true,hidden:false,unlock:group(),prerequisites:[],entry:'stage_1',stages:[stage()],rewards:{gold:0,ore:0,items:[]},effects:[],nextQuests:[]});
 function defaults(){return {version:1,quests:[]};}
 function issues(d,ctx={}){
  const errors=[],add=m=>errors.push('劇情：'+m),id=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(v)&&!['constructor','prototype','__proto__'].includes(v),key=v=>typeof v==='string'&&v.length<160&&!['constructor','prototype','__proto__'].includes(v),num=n=>Number.isSafeInteger(n)&&n>=0&&n<=1e9;
  if(!d||d.version!==1||!Array.isArray(d.quests))return ['劇情：版本或任務列表無效'];
  const gear=new Map();for(const g of d.gearRewards||[]){if(!g||!id(g.id)||gear.has(g.id)||typeof g.name!=='string'||!id(g.formId)||!id(g.skillId)||!num(g.socketCount)||g.socketCount>3||!num(g.level)||g.level<1||!num(g.powerTier)||g.powerTier<1||!num(g.rarity)||g.rarity>4)add('裝備獎勵設定無效');else gear.set(g.id,g);if(ctx.skills&&!ctx.skills.some(s=>s.id===g.skillId&&s.sources.some(x=>x.type==='equipment')))add('裝備獎勵技能不存在');if(ctx.forms&&!ctx.forms.flat(2).some(f=>f.id===g.formId))add('裝備獎勵外觀不存在');}
  const qs=new Map();for(const q of d.quests){if(!q||!id(q.id)||qs.has(q.id)){add('任務 ID 無效或重複');continue;}qs.set(q.id,q);}
  function conditions(g,label){if(!g||!['all','any'].includes(g.mode)||!Array.isArray(g.conditions)){add(label+'條件群組無效');return;}
   for(const c of g.conditions){if(!c||!Object.hasOwn(TYPES,c.type)||!key(c.key)||!num(c.count)||c.count<1||!['lifetime','stage'].includes(c.mode)||!['material','item'].includes(c.itemType)){add(label+'條件無效');continue;}
    if(['gearWorn','gearSkillActive','gearSkillGem','gearBaseGem'].includes(c.type)&&(!gear.has(c.key)||c.mode!=='lifetime'||c.count!==1||c.type==='gearBaseGem'&&(!num(c.slot)||c.slot>2)))add(label+'裝備條件引用或孔位無效');
    if(c.type==='skillSlotted'&&(c.mode!=='lifetime'||c.count!==1||ctx.skills&&!ctx.skills.some(s=>s.id===c.key)))add(label+'配置技能引用無效');
    if(['region','visit','explore','boss'].includes(c.type)&&(!/^\d+$/.test(c.key)||ctx.maps&& !ctx.maps[Number(c.key)]))add(label+'不存在的地區 '+c.key);
    if(c.type==='kill'&&ctx.monsters&&!ctx.monsters.some(m=>m.id===c.key))add(label+'不存在的怪物 '+c.key);
    if(c.type==='recipe'&&ctx.recipes&&!Object.hasOwn(ctx.recipes,c.key))add(label+'不存在的配方 '+c.key);
    if(c.type==='quest'&&!qs.has(c.key))add(label+'不存在的任務 '+c.key);
    if(c.type==='encounter'){const [q,s]=c.key.split('/');if(!qs.get(q)?.stages?.some(x=>x.id===s&&x.encounter?.enabled))add(label+'不存在的任務關卡 '+c.key);}
    if(c.type==='stage'){const [q,s]=c.key.split('/');if(!qs.get(q)?.stages?.some(x=>x.id===s))add(label+'不存在的任務階段 '+c.key);}
    if(['stock','acquired','gatherItem'].includes(c.type)&&(!c.key||c.itemType==='item'&&ctx.items&&!ctx.items.some(x=>x.id===c.key)))add(label+'道具引用無效 '+c.key);
   }
  }
  function rewards(r,label){if(!r||!num(r.gold)||!num(r.ore)||!Array.isArray(r.items)){add(label+'獎勵無效');return;}for(const x of r.items){if(!x||!['material','item','gear','gem','skill'].includes(x.type)||!key(x.key)||!x.key||!num(x.quantity)||x.quantity<1||x.job!==undefined&&(!num(x.job)||x.job>3)){add(label+'獎勵道具無效');continue;}if(x.type==='item'&&ctx.items&&!ctx.items.some(i=>i.id===x.key)||x.type==='gear'&&(!gear.has(x.key)||x.quantity!==1)||x.type==='gem'&&(!/^\d+$/.test(x.key)||Number(x.key)>14))add(label+'獎勵引用無效');if(x.type==='skill'&&(x.quantity!==1||ctx.skills&&!ctx.skills.some(s=>s.id===x.key&&s.type==='support'&&s.sources.some(t=>t.type==='quest')&&(!('job'in x)||s.jobs.includes(x.job))&&!s.requiresAdvanced&&!s.sources.some(t=>t.type==='advanced'))))add(label+'任務輔助技能獎勵無效');}}
  function effects(list,label){if(!Array.isArray(list)){add(label+'效果無效');return;}for(const e of list)if(!e||!['flag','unlock','vip'].includes(e.type)||!key(e.key)||e.type!=='vip'&&!e.key||e.type==='vip'&&e.value!==1||e.type!=='vip'&&typeof e.value!=='boolean')add(label+'效果無效');}
  const edges=new Map();
  function refs(list,label){if(!Array.isArray(list)){add(label+'後續任務無效');return [];}return list.map(x=>{if(!x||!qs.has(x.questId))add(label+'不存在的後續任務');conditions(x?.conditions,label);return x?.questId;});}
  function acyclic(graph,label){const visiting=new Set(),done=new Set();function visit(n){if(visiting.has(n)){add(label+'存在循環：'+n);return;}if(done.has(n))return;visiting.add(n);for(const v of graph.get(n)||[])if(graph.has(v))visit(v);visiting.delete(n);done.add(n);}for(const n of graph.keys())visit(n);}
  for(const q of d.quests){if(!q||!qs.has(q.id))continue;const label=q.id+'：';
   if(typeof q.name!=='string'||typeof q.npc!=='string'||typeof q.description!=='string'||!['main','side','npc'].includes(q.type)||typeof q.enabled!=='boolean'||typeof q.hidden!=='boolean')add(label+'基本欄位無效');
   if(q.recovery){const r=q.recovery;if(!num(r.limit)||r.limit>5||!gear.has(r.gearKey)||!q.stages?.some(s=>s.id===r.afterStage&&s.rewards.items.some(x=>x.type==='gear'&&x.key===r.gearKey))||!/^\d+$/.test(r.gemKey)||Number(r.gemKey)>14||!num(r.gemQuantity)||r.gemQuantity>3)add(label+'補發設定無效');}
   if(q.completionGuides&&(!Array.isArray(q.completionGuides)||q.completionGuides.some(g=>!Object.hasOwn(GUIDES,g))))add(label+'完成導引無效');
   conditions(q.unlock,label);rewards(q.rewards,label);effects(q.effects,label);
   const links=refs(q.nextQuests,label);edges.set(q.id,links);
   if(!Array.isArray(q.prerequisites))add(label+'前置任務無效');else for(const p of q.prerequisites){if(!qs.has(p))add(label+'不存在的前置任務 '+p);}
   if(!Array.isArray(q.stages)||!q.stages.length){add(label+'至少需要一個階段');continue;}
   const graph=new Map();for(const s of q.stages){if(!s||!id(s.id)||graph.has(s.id)){add(label+'階段 ID 無效或重複');continue;}graph.set(s.id,[]);}
   if(!graph.has(q.entry))add(label+'開始階段不存在');
   for(const s of q.stages){if(!s||!graph.has(s.id))continue;const sl=label+s.id+'：';
    if(s.encounter!==undefined){const e=s.encounter;
     if(!e||typeof e.enabled!=='boolean'||typeof e.name!=='string'||typeof e.repeatable!=='boolean'||!Number.isInteger(e.mapIndex)||e.mapIndex<0||ctx.maps&&!ctx.maps[e.mapIndex]||!Array.isArray(e.enemies))add(sl+'任務關卡設定無效');
     else if(e.enabled){if(!e.name.trim()||ctx.maps?.[e.mapIndex]?.mapType==='final'||!e.enemies.length||e.enemies.reduce((n,x)=>n+x.count,0)>20)add(sl+'任務關卡需一般地區與 1～20 隻敵人');for(const x of e.enemies){const m=ctx.monsters?.find(m=>m.id===x.monsterId);if(!x||typeof x.monsterId!=='string'||!Number.isInteger(x.count)||x.count<1||x.count>20||ctx.monsters&&(!m||m.mapIndex!==e.mapIndex||m.kind==='final'))add(sl+'任務關卡敵人引用無效');}}
    }
    conditions(s.conditions,sl);rewards(s.rewards,sl);effects(s.effects,sl);
    if(typeof s.name!=='string'||typeof s.speaker!=='string'||typeof s.description!=='string'||!Array.isArray(s.dialogue)||s.dialogue.some(x=>!x||!['npc','player','narrator'].includes(x.kind)||typeof x.speaker!=='string'||typeof x.text!=='string'))add(sl+'劇情文字無效');
    if(!Array.isArray(s.guides)||s.guides.some(g=>!Object.hasOwn(GUIDES,g)))add(sl+'導引無效');
    const targets=[s.next];
    if(!Array.isArray(s.branches)||!Array.isArray(s.choices)){add(sl+'分歧無效');continue;}
    const ids=new Set();for(const c of s.choices){if(!c||!id(c.id)||ids.has(c.id)||typeof c.text!=='string'){add(sl+'選項 ID 或文字無效');continue;}ids.add(c.id);conditions(c.conditions,sl);effects(c.effects,sl);targets.push(c.next);links.push(...refs(c.nextQuests,sl));}
    for(const b of s.branches){conditions(b?.conditions,sl);targets.push(b?.next);}
    for(const t of targets)if(t!==''&&!graph.has(t))add(sl+'下一階段不存在 '+t);else if(t)graph.get(s.id).push(t);
   }
   acyclic(graph,label);const reachable=new Set();function reach(n){if(reachable.has(n))return;reachable.add(n);for(const v of graph.get(n)||[])reach(v);}reach(q.entry);for(const s of graph.keys())if(!reachable.has(s))add(label+'無法抵達階段 '+s);
  }
  // Prerequisites and explicit links both describe forward quest dependencies.
  for(const q of d.quests)for(const p of q?.prerequisites||[])if(edges.has(p))edges.get(p).push(q.id);
  acyclic(edges,'任務鏈');return [...new Set(errors)];
 }
 function validate(d,ctx){const e=issues(d,ctx);if(e.length)throw Error(e.join('\n'));return copy(d);}
 const api={copy,TYPES,GUIDES,condition,group,encounter,stage,quest,defaults,issues,validate};root.EmberwildStory=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
