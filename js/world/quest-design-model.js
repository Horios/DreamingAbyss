/* Shared, versioned quest contract. The standalone editor embeds this file verbatim. */
(function(root){
  'use strict';
  const copy=v=>JSON.parse(JSON.stringify(v)),ID=/^[a-zA-Z0-9_-]{1,80}$/,TYPES=['material','potion','item','kill','totalKills','level','region','bossKill','eliteKill','nearKill','salvage','enhance'];
  const int=(v,min=0,max=1e9)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const text=(v,max=80)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[<>\u0000-\u001f]/.test(v)&&!['__proto__','constructor','prototype'].includes(v);
  const reward=()=>({gold:0,goldPerTier:0,ore:0,orePerTier:0,dust:0,xp:0,randomGems:0,gemCounts:[0,0,0],materials:[],potions:[],items:[],gear:[],choice:'all',gearChance:.5});
  const objective=(type='material',key='紅色草',quantity=1)=>({type,key,quantity,quantityMax:quantity,perTier:0,consume:['material','potion','item'].includes(type)});
  const entry=(id,title)=>({id,title,description:'',enabled:true,weight:1,minLevel:1,maxLevel:0,mapIndices:[],prerequisites:[],objectives:[objective()],rewards:reward()});
  function defaults(legacy={}){
    const side=[['wolves','縫補獵人的披肩','林間野狼的狼牙，是獵人交換皮革的憑證。','完整狼牙',5,300,20],['witch','淨化沼澤','採集女巫符印，協助營地研究暮色詛咒。','女巫符印',2,800,55],['stars','鍛造師的最後一課','取得星隕監視者的稜鏡，準備迎戰噬日者。','星隕稜鏡',3,2000,120]].map(([id,title,description,key,n,gold,ore],i)=>{
      const old=legacy.side?.[i]||{},q=entry(id,title);q.description=description;q.objectives=[objective('material',key,Math.round(old.required??n))];q.rewards={...reward(),gold:Math.round(old.gold??gold),ore:Math.round(old.ore??ore),randomGems:Math.round(old.gem??1)};return q;
    });
    const make=(id,title,type,key,n,max=n)=>{const q=entry(id,title);q.objectives=[{...objective(type,key,n),quantityMax:max}];q.rewards=reward();q.description=['salvage','enhance'].includes(type)?'開始任務後進行裝備作業，協助營地整備。':'完成日常委託，協助營地補給。';return q;};
    const expanded=[make('daily_hunt','附近怪物討伐','nearKill','@nearLevel',12,20),make('daily_salvage','裝備回收作業','salvage','',3,5),make('daily_enhance','裝備強化作業','enhance','',1,2),make('daily_explore','探索物資募集','material','@currentMap',6,10),make('daily_herb','紅色草募集','material','紅色草',8,12),make('daily_paste','紅色草泥募集','material','紅色草泥',3,5),make('daily_potion','營地治療補給','potion','heal_small',2,3)];
    return {version:1,daily:{version:2,enabled:true,entries:expanded,materialRewards:materialRewards()},side};
  }
  function materialRewards(){return [{key:'鍛鐵',min:4,max:8},{key:'粉塵',min:3,max:6},{key:'紅色草',min:4,max:8},{key:'紅色草泥',min:2,max:4}];}
  function migrate(d){const out=copy(d);if(!out||!out.daily||!Array.isArray(out.daily.entries))return out;if(out.daily.version!==2){const def=defaults();const builtin=new Set(['daily_explore','daily_herb','daily_paste','daily_potion']);out.daily.entries=[...def.daily.entries,...out.daily.entries.filter(q=>!builtin.has(q.id))];out.daily.version=2;out.daily.materialRewards=materialRewards();}return out;}
  function objectivesIssues(rows,{daily=false,resolved=false,mapCount=1000,items}={}){
    const errors=[];
    if(!Array.isArray(rows)||!rows.length||rows.length>16)return ['需求必須有 1～16 項'];
    const seen=new Set();
    for(const o of rows){
      if(!o||!TYPES.includes(o.type)||!int(o.quantity,1,1000000)||!int(o.quantityMax,o.quantity,1000000)||!int(o.perTier,0,10000)||typeof o.consume!=='boolean'){errors.push('需求類型、數量或消耗設定無效');continue;}
      const inventory=['material','potion','item'].includes(o.type);
      if(!inventory&&o.consume)errors.push('進度型需求不能消耗');
      if((!daily||resolved)&&(o.quantityMax!==o.quantity||o.perTier!==0))errors.push('支線或已抽取需求使用固定數量');
      if(['level','region'].includes(o.type)&&o.quantity!==1&&o.type==='region')errors.push('開放地圖需求數量固定為 1');
      if(['region','bossKill','eliteKill'].includes(o.type)&&!(int(o.key,0,mapCount-1)||o.key===-1&&o.type!=='region'))errors.push('需求地圖不存在');
      if(['material','potion','item','kill'].includes(o.type)&&!text(o.key))errors.push('需求名稱或 ID 無效');
      if(['level','totalKills','salvage','enhance'].includes(o.type)&&o.key!=='')errors.push('等級與全怪擊殺不指定品項');
      if(o.type==='nearKill'&&(!text(o.key)||(!resolved&&o.key!=='@nearLevel')))errors.push('附近怪物需求必須使用 @nearLevel');
      if(o.type==='nearKill'&&resolved&&(!int(o.levelMin,1,1000)||!int(o.levelMax,o.levelMin,1000)||o.key==='@nearLevel'))errors.push('附近怪物等級快照無效');
      if(o.progress!==undefined&&(!['nearKill','salvage','enhance'].includes(o.type)||!int(o.progress,0,1000000)))errors.push('任務進度無效');
      if(['nearKill','salvage','enhance'].includes(o.type)&&!daily)errors.push('作業與附近怪物需求只支援每日委託');
      if(o.key==='@currentMap'&&(o.type!=='material'||!daily||resolved))errors.push('本地素材只支援每日委託範本');
      if(items&&['potion','item'].includes(o.type)){const item=items.find(i=>i.id===o.key);if(!item||o.type==='potion'&&item.type!=='healPotion'||o.type==='item'&&item.type==='healPotion')errors.push('需求道具引用不存在或類型不符');}
      const key=o.type+':'+o.key;if(seen.has(key))errors.push('同一需求不可重複');seen.add(key);
    }return errors;
  }
  function rewardIssues(r,{items}={}){
    if(!r||typeof r!=='object')return ['獎勵設定無效'];const errors=[];
    for(const k of ['gold','goldPerTier','ore','orePerTier','dust','xp','randomGems'])if(!int(r[k],0,k==='randomGems'?1000:['gold','ore','dust'].includes(k)?1e12:1e9))errors.push('獎勵 '+k+' 必須為非負整數');
    if(!Array.isArray(r.gemCounts)||r.gemCounts.length!==3||r.gemCounts.some(n=>!int(n,0,1000)))errors.push('指定寶石獎勵無效');
    if(!['all','gearOrGems'].includes(r.choice)||!Number.isFinite(r.gearChance)||r.gearChance<0||r.gearChance>1)errors.push('獎勵抽選機率無效');
    for(const kind of ['materials','potions','items']){
      const rows=r[kind];if(!Array.isArray(rows)||rows.length>16){errors.push('獎勵清單無效：'+kind);continue;}
      const seen=new Set();for(const x of rows){if(!x||!text(x.key)||!int(x.quantity,1,1000000)||seen.has(x.key))errors.push('獎勵數量、名稱或重複引用無效：'+kind);seen.add(x?.key);
        if(items&&kind!=='materials'){const item=items.find(i=>i.id===x?.key);if(!item||(kind==='potions')!==(item.type==='healPotion'))errors.push('獎勵道具不存在或類型不符：'+x?.key);}}
    }
    if(!Array.isArray(r.gear)||r.gear.length>8)errors.push('裝備獎勵清單無效');else for(const g of r.gear)if(!g||!int(g.quantity,1,10)||!int(g.tier,0,100)||!int(g.slot,-1,3)||!int(g.rar,0,3)||!int(g.job,-1,3)||!Number.isFinite(g.legendaryChance)||g.legendaryChance<0||g.legendaryChance>1)errors.push('裝備獎勵無效');
    if(r.choice==='gearOrGems'&&(!r.gear?.length||!(r.randomGems>0||r.gemCounts?.some(n=>n>0))))errors.push('裝備／寶石二選一需同時設計兩種獎勵');
    return errors;
  }
  function issues(d,context={}){
    const errors=[];if(!d||d.version!==1||!d.daily||typeof d.daily.enabled!=='boolean'||!Array.isArray(d.daily.entries)||d.daily.entries.length>150||!Array.isArray(d.side)||d.side.length>120)return ['委託設計版本或清單無效'];
    if(d.daily.version!==2||!Array.isArray(d.daily.materialRewards)||!d.daily.materialRewards.length||d.daily.materialRewards.length>16||d.daily.materialRewards.some(x=>!text(x.key)||!int(x.min,1,1000)||!int(x.max,x.min,1000)))errors.push('每日隨機素材獎勵無效');
    const ids=new Set(),sideIds=new Set(d.side.map(q=>q?.id));
    for(const [kind,rows] of [['每日委託',d.daily.entries],['支線',d.side]])for(const q of rows){
      const prefix=kind+' '+(q?.id||'未命名')+'：',add=s=>errors.push(prefix+s);
      if(!q||typeof q.id!=='string'||!ID.test(q.id)||ids.has(q.id)){add('ID 無效或重複');continue;}ids.add(q.id);
      if(!text(q.title,80)||typeof q.description!=='string'||q.description.length>2000||/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(q.description)||typeof q.enabled!=='boolean')add('名稱、說明或啟用設定無效');
      if(!int(q.minLevel,1,1000)||!int(q.maxLevel,0,1000)||q.maxLevel>0&&q.maxLevel<q.minLevel||!Number.isFinite(q.weight)||q.weight<=0||q.weight>1000000)add('等級範圍或抽選權重無效');
      if(!Array.isArray(q.mapIndices)||q.mapIndices.length>100||new Set(q.mapIndices).size!==q.mapIndices.length||q.mapIndices.some(i=>!int(i,0,(context.mapCount??1000)-1)))add('出現地圖無效');
      if(!Array.isArray(q.prerequisites)||q.prerequisites.length>32||new Set(q.prerequisites).size!==q.prerequisites.length||q.prerequisites.some(id=>!sideIds.has(id)||id===q.id))add('前置支線不存在、自我引用或重複');
      for(const e of objectivesIssues(q.objectives,{...context,daily:kind==='每日委託'}))add(e);
      for(const e of rewardIssues(q.rewards,context))add(e);
    }
    const byId=new Map(d.side.map(q=>[q?.id,q])),visited=new Set(),active=new Set();
    function visit(id){if(active.has(id)){errors.push('支線前置條件形成循環：'+id);return;}if(visited.has(id))return;visited.add(id);active.add(id);const deps=byId.get(id)?.prerequisites;for(const p of Array.isArray(deps)?deps:[])if(byId.has(p))visit(p);active.delete(id);}
    for(const id of byId.keys())visit(id);return [...new Set(errors)];
  }
  function validate(d,context={}){d=migrate(d);const e=issues(d,context);if(e.length)throw Error(e.join('；'));return copy(d);}
  function eligible(q,{level,map,claimed}){return q.enabled&&level>=q.minLevel&&(!q.maxLevel||level<=q.maxLevel)&&(!q.mapIndices.length||q.mapIndices.includes(map))&&q.prerequisites.every(id=>claimed.includes(id));}
  function weighted(rows,rng=Math.random){const total=rows.reduce((n,q)=>n+q.weight,0);if(!total)return null;let roll=rng()*total;for(const q of rows){roll-=q.weight;if(roll<0)return q;}return rows.at(-1);}
  function validSnapshot(q){return !!q&&q.designVersion===1&&typeof q.templateId==='string'&&ID.test(q.templateId)&&text(q.title,80)&&typeof q.description==='string'&&q.description.length<=2000&&!/[<>]/.test(q.description)&&typeof q.done==='boolean'&&objectivesIssues(q.objectives,{daily:true,resolved:true}).length===0&&rewardIssues(q.rewards).length===0&&q.rewards.choice==='all'&&q.rewards.goldPerTier===0&&q.rewards.orePerTier===0&&q.rewards.gear.every(g=>g.tier>0&&g.slot>=0&&g.job>=0&&g.legendaryChance===0);}
  const api={copy,TYPES,ID,reward,objective,entry,defaults,migrate,materialRewards,issues,validate,eligible,weighted,validSnapshot};root.EmberwildQuestDesign=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
