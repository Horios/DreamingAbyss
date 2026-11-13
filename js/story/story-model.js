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
 /* Prologue: one quest flagged with `prologue`. Text is free data; system behaviour is bound to these fixed action ids only. */
 const PROLOGUE_ACTIONS={nameHero:'角色命名',chooseClass:'選擇初始職業',equipLesson:'發放並穿戴新手裝備',skillLesson:'技能安裝教學',recruitHelper:'臨時隊友加入與上陣',enterWorld:'降臨並結束序章'};
 const PROLOGUE_ORDER=Object.keys(PROLOGUE_ACTIONS),PROLOGUE_SOURCES={original:'開發者原文',draft:'暫定續寫'},PROLOGUE_SCENES=8;
 const prologueQuest=d=>d?.quests?.find(q=>q&&q.prologue)||null;
 // Whether a quest's dialogue may be skipped as a whole. The prologue never is; any quest can opt out with skippable:false.
 const skippable=q=>!!q&&!q.prologue&&q.skippable!==false;
 function prologueIssues(q,ctx={}){
  const out=[],add=m=>out.push('序章：'+m),p=q.prologue,text=(v,max=400)=>typeof v==='string'&&v.length<=max,line=x=>x&&['npc','player','narrator'].includes(x.kind)&&text(x.speaker,40)&&text(x.text,2000)&&(x.source===undefined||Object.hasOwn(PROLOGUE_SOURCES,x.source));
  if(q.id!=='prologue'||q.type!=='main')add('任務 ID 必須是 prologue，類型為主線');
  if(!p||p.version!==1||!Array.isArray(p.scenes)||p.scenes.length!==PROLOGUE_SCENES||p.scenes.some((s,i)=>!s||s.id!==i+1||!text(s.name,60)||!s.name.trim()||!text(s.description)))add('需要 '+PROLOGUE_SCENES+' 個場景（id 1～'+PROLOGUE_SCENES+'，含名稱與說明）');
  if(!p||!p.helper||!text(p.helper.name,20)||!p.helper.name.trim()||!text(p.helper.title,40)||!text(p.helper.description)||!Array.isArray(p.helper.templates)||p.helper.templates.length!==4||p.helper.templates.some(id=>!Number.isInteger(id)))add('臨時隊友設定無效（名稱、說明與四個職業的範本夥伴）');
  if(!p||!p.training||!text(p.training.name,20)||!p.training.name.trim())add('訓練對象名稱無效');
  if(!p||!p.chapter||!text(p.chapter.title,60)||!p.chapter.title.trim()||!Array.isArray(p.chapter.lines)||p.chapter.lines.some(x=>!line(x)))add('章節標題或轉場文字無效');
  if(!p||!p.ui||typeof p.ui!=='object'||Object.values(p.ui).some(v=>!text(v,120)))add('介面文字無效');
  const stages=Array.isArray(q.stages)?q.stages:[],byId=new Map(stages.map(s=>[s?.id,s])),chain=[];
  for(let s=byId.get(q.entry),guard=0;s&&guard<200;s=byId.get(s.next),guard++){if(chain.includes(s))break;chain.push(s);}
  if(chain.length!==stages.length)add('階段必須是單一路線，不可有無法抵達的階段');
  const seen=[];
  for(const s of stages){const x=s?.prologue,label='階段 '+s?.id+'：';
   if(!x||!Number.isInteger(x.scene)||x.scene<1||x.scene>PROLOGUE_SCENES||!(x.action===''||Object.hasOwn(PROLOGUE_ACTIONS,x.action))||!text(x.hint)||!Array.isArray(x.steps)||x.steps.some(t=>!text(t,200))||!Array.isArray(x.after)||x.after.some(l=>!line(l))){add(label+'場景、系統事件、提示或後續對話無效');continue;}
   if((s.dialogue||[]).some(l=>!line(l)))add(label+'對話來源標記無效');
   if(s.choices?.length||s.branches?.length)add(label+'序章不使用任務選項或條件分歧');
   if(x.action)seen.push(x.action);
   if(x.action==='chooseClass'){const o=x.options;if(!Array.isArray(o)||o.length!==(ctx.classes?.length||4)||o.some((c,i)=>!c||c.job!==i||!text(c.text,40)||!c.text.trim()||!text(c.description,200)))add(label+'職業選項必須依序對應全部初始職業');}
   if(s.encounter?.enabled&&(s.encounter.training!==true||s.encounter.repeatable))add(label+'序章戰鬥必須是不可重複的訓練戰（training）');
  }
  if(seen.join()!==PROLOGUE_ORDER.join())add('系統事件必須各出現一次並依序排列：'+PROLOGUE_ORDER.map(k=>PROLOGUE_ACTIONS[k]).join(' → ')+'（目前：'+(seen.map(k=>PROLOGUE_ACTIONS[k]).join(' → ')||'無')+'）');
  else{
   const at=a=>chain.findIndex(s=>s.prologue?.action===a),plain=s=>!s.conditions?.conditions?.length&&!s.encounter?.enabled&&!s.rewards?.gold&&!s.rewards?.ore&&!s.rewards?.items?.length&&!s.effects?.length;
   // The class stage completes right after the character is created, so it may hand over items; nothing else.
   const pick=chain[at('chooseClass')];
   if(chain.slice(0,at('chooseClass')).some(s=>!plain(s))||pick.conditions?.conditions?.length||pick.encounter?.enabled||pick.rewards?.gold||pick.rewards?.ore||pick.effects?.length)add('選擇職業之前的階段不可設定條件、戰鬥、獎勵或效果（角色尚未建立）；選擇職業的階段只能發放道具');
   if(at('enterWorld')!==chain.length-1)add('降臨事件必須是最後一個階段');
   const fights=chain.filter(s=>s.encounter?.enabled),h=at('recruitHelper');
   if(!fights.some(s=>chain.indexOf(s)>at('skillLesson')&&chain.indexOf(s)<h)||!fights.some(s=>chain.indexOf(s)>h)||fights.some(s=>chain.indexOf(s)<at('equipLesson')))add('需要一場單人訓練戰（技能教學之後）與一場隊伍訓練戰（臨時隊友加入之後）；訓練戰都必須在裝備教學之後');
   // The gear lesson can only ask for story gear the stage before it has just handed over.
   const lesson=chain[at('equipLesson')],giver=chain[at('equipLesson')-1],given=new Set((giver?.rewards?.items||[]).filter(x=>x.type==='gear').map(x=>x.key));
   if(lesson.conditions.conditions.some(c=>c.type!=='gearWorn'||!given.has(c.key)))add('裝備教學階段只能要求穿戴前一個階段發放的任務裝備');
   for(const s of fights)if(!s.conditions.conditions.some(c=>c.type==='encounter'&&c.key===q.id+'/'+s.id))add('階段 '+s.id+'：訓練戰階段需要以該場戰鬥通關作為條件');
  }
  if(q.rewards?.gold||q.rewards?.ore||q.rewards?.items?.length||q.nextQuests?.length||q.prerequisites?.length||q.unlock?.conditions?.length)add('序章任務本身不設定獎勵、前置或後續任務');
  return out;
 }
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
  const pro=d.quests.filter(q=>q&&q.prologue);if(pro.length>1)add('只能有一個序章任務');for(const q of pro)if(qs.has(q.id))errors.push(...prologueIssues(q,ctx));
  // Prerequisites and explicit links both describe forward quest dependencies.
  for(const q of d.quests)for(const p of q?.prerequisites||[])if(edges.has(p))edges.get(p).push(q.id);
  acyclic(edges,'任務鏈');return [...new Set(errors)];
 }
 function validate(d,ctx){const e=issues(d,ctx);if(e.length)throw Error(e.join('\n'));return copy(d);}
 const api={copy,TYPES,GUIDES,condition,group,encounter,stage,quest,defaults,issues,validate,PROLOGUE_ACTIONS,PROLOGUE_ORDER,PROLOGUE_SOURCES,PROLOGUE_SCENES,prologueQuest,prologueIssues,skippable};root.EmberwildStory=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
