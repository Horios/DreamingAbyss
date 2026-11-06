/* Shared, side-effect-free lake rules. The editor simulator calls this same draw. */
(function(root){
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x)),types=['gold','item','equipment'];
 const DEFAULTS={version:1,enabled:true,unlock:{source:'mapClears',mapId:'map0'},dailyLimit:1,reset:{timezone:'Asia/Taipei',hour:0},allowEquipment:false,allowTokens:false,allowSpecial:false,
  typeWeights:{gold:50,item:30,equipment:20},
  gold:{min:500,max:20000,bands:[{min:500,max:1999,weight:50},{min:2000,max:4999,weight:30},{min:5000,max:9999,weight:15},{min:10000,max:20000,weight:5}]},
  equipment:{progressSource:'mapClears',rangeSource:'regionTier',aheadChance:.1,aheadLevels:5,qualitySource:'normalDrops',tierSource:'normalDrops'},
  inputs:[['gel','黏稠凝膠',50],['fang','完整狼牙',50],['herb','紅色草',20],['bug','小蟲',10]].map(([id,key,n])=>({id,kind:'material',key,enabled:true,quantityMode:'fixed',min:n,max:n,poolId:'daily',specialTrigger:''})),
  pools:[{id:'daily',name:'每日湖泊回贈',rewards:[{id:'gold',type:'gold',enabled:true,weight:1,minMapId:'map0',allowAhead:false},{id:'heal',type:'item',kind:'item',key:'heal_small',min:2,max:5,enabled:true,weight:50,minMapId:'map0',allowAhead:false},{id:'iron',type:'item',kind:'material',key:'鍛鐵',min:5,max:12,enabled:true,weight:30,minMapId:'map0',allowAhead:false},{id:'herb',type:'item',kind:'material',key:'紅色草',min:10,max:20,enabled:true,weight:20,minMapId:'map0',allowAhead:false},{id:'gear',type:'equipment',enabled:true,weight:1,minMapId:'map0',allowAhead:true}]}],
  future:{fairyEvents:[],companionQuests:[],festivals:[],stateFields:{festivalClaims:'object',fairyEvents:'object',companionTriggers:'object',questCompletions:'object'}}};
 const maps=d=>d.balanceSettings?.maps?.catalog||[];
 function catalog(d){return root.EmberwildInventoryIcons.entries(d);}
 function safe(d,kind,key,rows=catalog(d)){
  const row=rows.find(r=>r.kind===kind&&r.key===key);if(!row)return false;
  const meta=d.inventoryIcons?.find(r=>r.kind===kind&&r.key===key),item=d.items?.find(r=>r.id===key);
  if(meta?.locked||meta?.questItem||meta?.unique||meta?.saleEnabled===false||item?.questItem||item?.unique||item?.special||item?.locked||item?.consumable===false)return false;
  if(kind==='item'&&!['healPotion','imbue','ward','elementTonic','timedBoost','gearTierReroll'].includes(item?.type))return false;
  return !['日蝕王冠','升級卷軸'].includes(key)&&!key.startsWith('companion-ticket-');
 }
 function region(d,clears){return maps(d).map((m,i)=>({...m,index:i})).filter(m=>clears?.[m.id]===true).sort((a,b)=>b.max-a.max||b.min-a.min||a.index-b.index)[0]||null;}
 function range(d,m){
  if(!m)throw Error('尚無通關地區');
  const e=d.balanceSettings.equipment,p=d.balanceSettings.progression,cap=Math.max(p.levelCaps.beforeClear,p.levelCaps.afterClear);
  // Ordinary drops use regionTier and have one required level per region.
  const tier=m.index===6?6:Math.ceil(m.min/5);
  const level=Math.min(cap,Math.max(1,Math.round(e.requiredLevel.base+(tier-1)*e.requiredLevel.perTier)));
  return {min:level,max:level,cap,tier};
 }
 function issues(c,d){
  const out=[],fail=s=>out.push(s),obj=x=>x&&typeof x==='object'&&!Array.isArray(x),num=(x,a,b)=>Number.isFinite(x)&&x>=a&&x<=b,int=(x,a,b)=>Number.isSafeInteger(x)&&x>=a&&x<=b;
  if(!obj(c))return ['許願湖設定必須為物件'];
  // The document does not change during one check: build its item catalogue once, on first use.
  let catalogRows;const rows=()=>catalogRows??=catalog(d);
  if(c.version!==1)fail('許願湖版本必須為 1');
  const ids=new Set(maps(d).map(m=>m.id)),map=id=>typeof id==='string'&&ids.has(id);
  if(c.unlock?.source!=='mapClears'||!map(c.unlock?.mapId))fail('解鎖必須引用正式地區通關紀錄');
  if(!int(c.dailyLimit,0,100)||typeof c.enabled!=='boolean')fail('每日次數必須為 0～100 整數');
  if(c.reset?.timezone!=='Asia/Taipei'||c.reset?.hour!==0)fail('第一階段只支援台灣時間 00:00 重置');
  for(const k of ['allowEquipment','allowTokens','allowSpecial'])if(typeof c[k]!=='boolean')fail(k+' 必須為布林值');
  if(!types.every(t=>num(c.typeWeights?.[t],0,1e9))||!types.some(t=>c.typeWeights?.[t]>0))fail('獎勵類型權重無效');
  const g=c.gold;
  if(!int(g?.min,500,20000)||!int(g?.max,g?.min,20000)||!Array.isArray(g?.bands)||!g.bands.length||!g.bands.some(b=>b.weight>0))fail('金幣範圍限 500～20000，且需設定分段權重');
  else for(const b of g.bands)if(!int(b.min,g.min,g.max)||!int(b.max,b.min,g.max)||!num(b.weight,0,1e9))fail('金幣分段無效');
  const e=c.equipment;
  if(e?.progressSource!=='mapClears'||e?.rangeSource!=='regionTier'||e?.qualitySource!=='normalDrops'||e?.tierSource!=='normalDrops'||!num(e?.aheadChance,0,1)||!int(e?.aheadLevels,0,5))fail('裝備須沿用通關地區、普通掉落品質／T 級，超前最多 5 級');
  function unique(rows,label){if(!Array.isArray(rows)||rows.length>1000){fail(label+' 必須為至多 1000 筆陣列');return [];}const seen=new Set();for(const r of rows){if(!obj(r)||typeof r.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(r.id)||seen.has(r.id))fail(label+' ID 無效或重複');seen.add(r?.id);}return rows.filter(obj);}
  const pools=unique(c.pools,'回贈池'),poolIds=new Set(pools.map(p=>p.id));
  for(const p of pools){const rewards=unique(p.rewards,'回贈列'),weights=p.typeWeights??c.typeWeights;
   if(p.enabled!==undefined&&typeof p.enabled!=='boolean')fail(p.id+' 啟用狀態無效');
   if(!types.every(t=>num(weights?.[t],0,1e9))||!types.some(t=>weights?.[t]>0))fail(p.id+' 類型權重無效');
   for(const r of rewards){
   if(!types.includes(r.type)||typeof r.enabled!=='boolean'||!num(r.weight,0,1e9)||!map(r.minMapId)||typeof r.allowAhead!=='boolean')fail(p.id+'/'+r.id+' 回贈設定無效');
   if(r.type==='item'&&(!['material','item'].includes(r.kind)||!safe(d,r.kind,r.key,rows())||!int(r.min,1,1e6)||!int(r.max,r.min,1e6)))fail(p.id+'/'+r.id+' 引用不存在、特殊或無法正常入包的道具／數量');
  }if(p.enabled!==false&&!rewards.some(r=>r.enabled&&r.weight>0&&weights?.[r.type]>0))fail(p.id+' 沒有有效回贈');}
  const triggers=new Set((c.future?.companionQuests||[]).map(r=>r.triggerItemId).filter(Boolean));
  for(const r of unique(c.inputs,'投入規則')){
   if(!['material','item','equipment','token'].includes(r.kind)||!rows().some(x=>x.kind===r.kind&&x.key===r.key))fail(r.id+' 投入引用不存在');
   if(['material','item'].includes(r.kind)&&!safe(d,r.kind,r.key,rows()))fail(r.id+' 不可投入特殊或任務關鍵道具');
   if(typeof r.enabled!=='boolean'||!['fixed','range'].includes(r.quantityMode)||!int(r.min,1,1e6)||!int(r.max,r.min,1e6)||r.quantityMode==='fixed'&&r.min!==r.max||['equipment','token'].includes(r.kind)&&r.max!==1||!poolIds.has(r.poolId)||typeof r.specialTrigger!=='string')fail(r.id+' 投入數量／回贈池無效');
   if(r.enabled&&(r.specialTrigger||triggers.has(r.key)))fail(r.id+' 尚未實作的特殊觸發道具不可啟用');
  }
  if(!obj(c.future)||!obj(c.future.stateFields))fail('缺少未來事件與存檔欄位定義');
  else for(const k of ['fairyEvents','companionQuests','festivals'])for(const r of unique(c.future[k],k)){
   if(r.enabled!==false)fail(k+'/'+r.id+' 第一階段必須停用');
   if(r.poolId&&!poolIds.has(r.poolId))fail(k+'/'+r.id+' 回贈池引用不存在');
   if(r.triggerItemId&&!rows().some(x=>x.kind==='item'&&x.key===r.triggerItemId))fail(k+'/'+r.id+' 觸發道具引用不存在');
   if(k==='companionQuests'&&r.companionId!==null&&!d.companions?.some(x=>x.id===r.companionId))fail(k+'/'+r.id+' 夥伴引用不存在');
  }
  return [...new Set(out)];
 }
 function normalize(raw,d){const c=raw===undefined?copy(DEFAULTS):copy(raw),errors=issues(c,d);if(errors.length)throw Error(errors.join('\n'));return c;}
 function eligible(c,d,poolId,clears){
  const highest=region(d,clears);if(!highest)return [];
  if(c.pools.find(p=>p.id===poolId)?.enabled===false)return [];
  return (c.pools.find(p=>p.id===poolId)?.rewards||[]).filter(r=>r.enabled&&r.weight>0&&(clears?.[r.minMapId]||maps(d).find(m=>m.id===r.minMapId)?.max<=highest.max)&&!(r.type==='item'&&!r.allowAhead&&r.kind==='material'&&(d.balanceSettings.monsters.catalog||[]).some(m=>m.material===r.key&&maps(d)[m.mapIndex]?.min>highest.max)));
 }
 function pick(rows,rng){const total=rows.reduce((n,r)=>n+r.weight,0);if(!(total>0))throw Error('沒有可用回贈');let n=rng()*total;for(const r of rows)if((n-=r.weight)<0)return r;return rows.at(-1);}
 const integer=(a,b,rng)=>a+Math.min(b-a,Math.floor(rng()*(b-a+1)));
 function probabilities(c,d,poolId,clears){const rows=eligible(c,d,poolId,clears),weights=c.pools.find(p=>p.id===poolId)?.typeWeights??c.typeWeights,ts=types.filter(t=>rows.some(r=>r.type===t)&&weights[t]>0),total=ts.reduce((n,t)=>n+weights[t],0);return rows.map(r=>({...r,probability:ts.includes(r.type)?weights[r.type]/total*r.weight/rows.filter(x=>x.type===r.type).reduce((n,x)=>n+x.weight,0):0}));}
 function draw(c,d,poolId,clears,rng=Math.random){
  const rows=eligible(c,d,poolId,clears),weights=c.pools.find(p=>p.id===poolId)?.typeWeights??c.typeWeights,type=pick(types.filter(t=>rows.some(r=>r.type===t)).map(type=>({type,weight:weights[type]})),rng).type,r=pick(rows.filter(r=>r.type===type),rng),result={type,ruleId:r.id};
  if(type==='gold'){const b=pick(c.gold.bands,rng);return {...result,amount:integer(b.min,b.max,rng)};}
  if(type==='item')return {...result,kind:r.kind,key:r.key,quantity:integer(r.min,r.max,rng)};
  const m=region(d,clears),limits=range(d,m),top=Math.min(limits.cap,limits.max+c.equipment.aheadLevels),ahead=r.allowAhead&&top>limits.max&&rng()<c.equipment.aheadChance;
  const level=ahead?integer(limits.max+1,top,rng):integer(limits.min,limits.max,rng),e=d.balanceSettings.equipment.requiredLevel;
  return {...result,mapId:m.id,mapIndex:m.index,level,ahead:!!ahead,tier:Math.max(1,Math.min(12,1+Math.floor((level-e.base)/e.perTier)))};
 }
 function simulate(c,d,{mapId,inputId,quantity,count=1000},rng=Math.random){
  normalize(c,d);const m=maps(d).find(m=>m.id===mapId),input=c.inputs.find(r=>r.id===inputId&&r.enabled&&!r.specialTrigger);
  if(!m||!input||c.pools.find(p=>p.id===input.poolId)?.enabled===false||!Number.isInteger(quantity)||quantity<input.min||quantity>input.max||![100,1000,10000].includes(count))throw Error('模擬地區、投入或次數無效，或回贈池已停用');
  const clears=Object.fromEntries(maps(d).filter(x=>x.max<=m.max).map(x=>[x.id,true]));clears[c.unlock.mapId]=true;
  const out={count,types:{gold:0,item:0,equipment:0},goldTotal:0,goldMin:null,goldMax:null,items:{},levels:{},ahead:0,invalid:0};
  for(let i=0;i<count;i++)try{const r=draw(c,d,input.poolId,clears,rng);out.types[r.type]++;if(r.type==='gold'){out.goldTotal+=r.amount;out.goldMin=Math.min(out.goldMin??Infinity,r.amount);out.goldMax=Math.max(out.goldMax??0,r.amount);}else if(r.type==='item'){const id=r.kind+':'+r.key;out.items[id]=(out.items[id]||0)+r.quantity;}else{out.levels[r.level]=(out.levels[r.level]||0)+1;out.ahead+=Number(r.ahead);}}catch{out.invalid++;}
  out.goldAverage=out.types.gold?out.goldTotal/out.types.gold:0;out.goldPerOffering=out.goldTotal/count;out.aheadRatio=out.types.equipment?out.ahead/out.types.equipment:0;return out;
 }
 const day=(now=Date.now())=>new Date(now+8*3600000).toISOString().slice(0,10);
 const defaults=()=>copy(DEFAULTS);
 root.EmberwildWishingLake={VERSION:1,defaults,normalize,issues,catalog,safe,region,range,eligible,probabilities,draw,simulate,day};
 if(typeof module==='object'&&module.exports)module.exports=root.EmberwildWishingLake;
})(globalThis);
