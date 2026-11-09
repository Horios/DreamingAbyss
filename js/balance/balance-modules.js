/* Modular balance sources: data/balance/<module>.json are the only edited sources; data/balance.json is
   generated from them for the game. This file is shared by the game, its build tools and the balance editor.
   It never changes values: split() and assemble() are exact inverses, including key order. */
(function(root){
 'use strict';
 const SCHEMA='dreaming-abyss-balance-modules-v1',FORMAT_VERSION=1,DOCUMENT_SCHEMA='emberwild-balance-v1';
 const SOURCE_DIR='data/balance',INTEGRATED_FILE='data/balance.json',MANIFEST_FILE='data/balance/manifest.json';
 // Containers whose children are kept in separate modules. '' is the document root.
 const CONTAINERS=['','balanceSettings','skillSystem'];
 // [id, title, container, key | keys[] | '*' (the container's keys not owned by another module)]
 const LAYOUT=[
  ['meta/document','文件版本與共用設定','', '*'],
  ['meta/reference','欄位說明（僅供閱讀）','', '_reference'],
  ['meta/notes','設計備註（僅供閱讀）','', 'notes'],
  ['meta/balance-settings','平衡設定版本旗標','balanceSettings','*'],
  ['interface/presentation','介面文字與圖示樣式','', ['uiText','textStyles','skillIcons','iconColorTemplates']],
  ['interface/navigation','遊戲導覽','', 'navigation'],
  ['world/maps','地圖','balanceSettings','maps'],
  ['world/monsters','怪物','balanceSettings','monsters'],
  ['world/drops','掉落規則','balanceSettings','drops'],
  ['world/difficulty','難度','balanceSettings','difficulty'],
  ['combat/rules','戰鬥規則與秒數','balanceSettings','combat'],
  ['combat/skill-settings','技能共用設定','balanceSettings','skills'],
  ['combat/skills','技能定義','skillSystem','definitions'],
  ['combat/skill-system','技能系統規則與寶石','skillSystem','*'],
  ['combat/statuses','自訂狀態','', 'statusDefinitions'],
  ['characters/classes','職業','', 'classes'],
  ['characters/support-skills','輔助技能','', 'supportSkills'],
  ['characters/progression','等級與成長','balanceSettings','progression'],
  ['characters/companions','夥伴','', 'companions'],
  ['characters/passives','被動能力','', 'passiveDefinitions'],
  ['characters/companion-settings','夥伴設定與信物','', ['companionSettings','companionTokens']],
  ['equipment/forms','裝備型態','', 'equipmentForms'],
  ['equipment/affix-pools','詞綴池與基礎戰鬥係數','', 'balance'],
  ['equipment/power-system','裝備詞綴與強度','', 'equipmentPowerSystem'],
  ['equipment/settings','裝備強化與分解','balanceSettings','equipment'],
  ['items/items','消耗道具','', 'items'],
  ['items/inventory-icons','全域物品目錄','', 'inventoryIcons'],
  ['items/starter-packs','新手禮包','', 'starterPacks'],
  ['systems/economy','經濟','balanceSettings','economy'],
  ['systems/rewards','戰鬥獎勵','balanceSettings','rewards'],
  ['systems/quests','委託與支線','balanceSettings','quests'],
  ['systems/story','任務與劇情','', 'story'],
  ['systems/shop','商店','', 'shopSettings'],
  ['systems/life-skills','生活技能','', 'lifeSkills'],
  ['systems/wishing-lake','許願湖','', 'wishingLake']
 ];
 const MODULES=LAYOUT.map(([id,title,container,own])=>Object.freeze({id,title,container,file:id+'.json',
  key:typeof own==='string'&&own!=='*'?own:undefined,keys:Array.isArray(own)?Object.freeze(own.slice()):undefined,rest:own==='*'}));
 const BY_ID=new Map(MODULES.map(m=>[m.id,m]));
 // Arrays whose rows are records. Fields listed are "key fields": other modules or shared validators read them.
 // A change limited to other fields stays inside the record's own module.
 const RECORDS={
  'balanceSettings.maps.catalog':{id:'id',label:'地圖',position:true,keys:['id','name','mapType','min','max','family','enabled']},
  'balanceSettings.monsters.catalog':{id:'id',label:'怪物',keys:['id','name','mapIndex','kind','material','enabled','bossStageCount','timing']},
  'balanceSettings.drops.entries':{id:'id',label:'掉落規則',keys:['id','name','type','key','sources','kinds','enabled']},
  'balanceSettings.quests.design.side':{id:'id',label:'支線',keys:['id']},
  'balanceSettings.quests.side':{id:'id',label:'支線',keys:['id']},
  'balanceSettings.economy.materialPrices':{label:'材料價格',keys:[]},
  'skillSystem.definitions':{id:'id',label:'技能',keys:['id','name','jobs','partnerId','usageScope','activation','type','disabled','deleted','timing']},
  'statusDefinitions':{id:'id',label:'狀態',keys:['id']},
  'classes':{id:'id',label:'職業',position:true,keys:['id','name']},
  'supportSkills':{label:'輔助技能',position:true,keys:[]},
  'companions':{id:'id',label:'夥伴',keys:['id','name','job','availability']},
  'passiveDefinitions':{id:'id',label:'被動',keys:['id']},
  'items':{id:'id',label:'道具',keys:['id','name','type','element','shopEnabled','timing']},
  'inventoryIcons':{id:'id',label:'物品目錄',keys:['id']},
  'story.quests':{id:'id',label:'任務',keys:['id','enabled']},
  'shopSettings.equipmentStages':{id:'id',label:'裝備商店階段',keys:['id']},
  'shopSettings.randomOffers.entries':{id:'id',label:'隨機商品',keys:['id']},
  'shopSettings.fixedOffers.entries':{id:'id',label:'固定商品',keys:['id']},
  'companionTokens.catalog':{id:'id',label:'信物',keys:['id']},
  'lifeSkills.gathering':{id:'id',label:'採集',keys:['id']},
  'equipmentPowerSystem.prefixes':{id:'id',label:'前綴',keys:['id']},
  'equipmentPowerSystem.suffixes':{id:'id',label:'後綴',keys:['id']},
  'equipmentPowerSystem.bossAffixes':{id:'id',label:'BOSS 詞綴',keys:['id']}
 };
 const RECORD_PATHS=Object.keys(RECORDS).map(p=>p.split('.')).sort((a,b)=>b.length-a.length);

 const isObject=x=>!!x&&typeof x==='object'&&!Array.isArray(x),has=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
 const toPath=p=>Array.isArray(p)?p.map(String):p===''||p==null?[]:String(p).replace(/^\$\.?/,'').split('.').filter(x=>x!=='');
 const pathText=p=>toPath(p).join('.');
 const serialize=value=>JSON.stringify(value,null,2)+'\n';
 function get(doc,path){let x=doc;for(const k of toPath(path)){if(x==null||typeof x!=='object')return undefined;x=x[k];}return x;}
 function containerOf(doc,name){if(name==='')return isObject(doc)?doc:null;const v=isObject(doc)?doc[name]:undefined;return isObject(v)?v:null;}
 const activeContainers=doc=>CONTAINERS.filter(c=>c===''||containerOf(doc,c));
 function owned(container){const out=new Set();for(const m of MODULES)if(m.container===container){if(m.key)out.add(m.key);if(m.keys)m.keys.forEach(k=>out.add(k));}return out;}
 const OWNED=new Map(CONTAINERS.map(c=>[c,owned(c)]));
 function restKeys(doc,container){const obj=containerOf(doc,container);if(!obj)return [];const mine=OWNED.get(container),nested=new Set(container===''?activeContainers(doc).filter(Boolean):[]);return Object.keys(obj).filter(k=>!mine.has(k)&&!nested.has(k));}
 function moduleValue(doc,m){
  const obj=containerOf(doc,m.container);
  if(m.key)return obj&&has(obj,m.key)?obj[m.key]:undefined;
  const out={};if(!obj)return out;
  for(const k of m.keys||restKeys(doc,m.container))if(has(obj,k))out[k]=obj[k];
  return out;
 }
 // Split a complete document. Values are shared, not copied; callers serialize or clone as needed.
 function split(doc){
  if(!isObject(doc))throw Error('平衡資料必須為 JSON 物件');
  const layout={};for(const c of activeContainers(doc))layout[c]=Object.keys(containerOf(doc,c));
  const modules={};for(const m of MODULES)modules[m.id]=moduleValue(doc,m);
  return {layout,modules};
 }
 // Exact inverse of split(): same keys, same order. Throws when two modules supply one key.
 function assemble(modules,layout={}){
  const entries=new Map(CONTAINERS.map(c=>[c,new Map()])),owner=new Map();
  const put=(c,k,v,id)=>{const key=c+'\u0000'+k;if(owner.has(key))throw Object.assign(Error('資料「'+(c?c+'.':'')+k+'」同時由 '+owner.get(key)+' 與 '+id+' 維護'),{module:id,path:(c?c+'.':'')+k});owner.set(key,id);entries.get(c).set(k,v);};
  for(const m of MODULES){
   const v=modules[m.id];if(v===undefined)continue;
   if(m.key){put(m.container,m.key,v,m.id);continue;}
   if(!isObject(v))throw Object.assign(Error('模組 '+m.id+' 必須為物件'),{module:m.id});
   const allowed=m.keys?new Set(m.keys):null,mine=OWNED.get(m.container);
   for(const [k,x] of Object.entries(v)){
    if(allowed&&!allowed.has(k))throw Object.assign(Error('模組 '+m.id+' 含有不屬於它的欄位：'+k),{module:m.id,path:k});
    if(!allowed&&mine.has(k))throw Object.assign(Error('模組 '+m.id+' 含有應由其他模組維護的欄位：'+k),{module:m.id,path:k});
    put(m.container,k,x,m.id);
   }
  }
  const build=c=>{const map=entries.get(c),out={},order=layout[c]||[];for(const k of order)if(map.has(k))out[k]=map.get(k);for(const [k,v] of map)if(!has(out,k))out[k]=v;return out;};
  const nested={};for(const c of CONTAINERS.slice(1)){if(entries.get(c).size||layout[c])nested[c]=build(c);}
  for(const [c,v] of Object.entries(nested))put('',c,v,'(container '+c+')');
  return build('');
 }
 function moduleForPath(path){
  const p=toPath(path);if(!p.length)return null;
  for(const c of CONTAINERS.slice(1))if(p[0]===c){if(p.length===1)return MODULES.filter(m=>m.container===c).map(m=>m.id);const k=p[1];return (MODULES.find(m=>m.container===c&&m.key===k)||MODULES.find(m=>m.container===c&&m.rest)).id;}
  const k=p[0];return (MODULES.find(m=>m.container===''&&(m.key===k||m.keys?.includes(k)))||MODULES.find(m=>m.container===''&&m.rest)).id;
 }
 function modulePaths(id,doc){const m=BY_ID.get(id);if(!m)throw Error('未知模組：'+id);const base=m.container?[m.container]:[];if(m.key)return [pathText([...base,m.key])];if(m.keys)return m.keys.map(k=>pathText([...base,k]));return doc?restKeys(doc,m.container).map(k=>pathText([...base,k])):[pathText(base)||'(root)'];}
 function sourceOf(m){return m.key?(m.container?m.container+'.':'')+m.key:m.keys?m.keys.map(k=>(m.container?m.container+'.':'')+k).join(', '):(m.container||'(root)')+'.*';}

 // Paths that differ between two JSON values, as arrays. Record arrays recurse row by row only while row
 // identities line up; an insertion, deletion or reorder reports the array itself (a structural change).
 function changes(before,after,base=[]){
  const out=[];
  (function walk(a,b,p){
   if(a===b)return;
   if(Array.isArray(a)&&Array.isArray(b)){
    const rec=recordInfo(p);
    if(a.length!==b.length){out.push(p);return;}
    if(rec?.id)for(let i=0;i<a.length;i++)if(a[i]?.[rec.id]!==b[i]?.[rec.id]){out.push(p);return;}
    for(let i=0;i<a.length;i++)walk(a[i],b[i],[...p,String(i)]);return;
   }
   if(isObject(a)&&isObject(b)){
    const ka=Object.keys(a),kb=Object.keys(b);
    for(const k of kb)if(!has(a,k))out.push([...p,k]);
    for(const k of ka){if(!has(b,k))out.push([...p,k]);else walk(a[k],b[k],[...p,k]);}
    // Same members in another order changes the serialized source; report the object itself.
    if(ka.length===kb.length&&ka.every(k=>has(b,k))&&ka.some((k,i)=>kb[i]!==k))out.push(p);
    return;
   }
   if(typeof a==='number'&&typeof b==='number'&&Object.is(a,b))return;
   out.push(p);
  })(before,after,toPath(base));
  return out;
 }
 function recordInfo(path){const p=toPath(path);for(const r of RECORD_PATHS)if(r.length===p.length&&r.every((k,i)=>k===p[i]))return RECORDS[r.join('.')];return null;}
 function recordContext(path){
  const p=toPath(path);
  for(const r of RECORD_PATHS)if(p.length>=r.length&&r.every((k,i)=>k===p[i]))return {collection:r.join('.'),info:RECORDS[r.join('.')],index:p.length>r.length?Number(p[r.length]):null,field:p.length>r.length+1?p[r.length+1]:null,rest:p.slice(r.length+2)};
  return null;
 }
 // Describe each changed path: module, record, field and whether other modules can observe it.
 function classify(paths,{before,after}={}){
  return paths.map(raw=>{
   const p=toPath(raw),ctx=recordContext(p),mod=moduleForPath(p),modules=Array.isArray(mod)?mod:[mod];
   let kind='value',record=null;
   if(!ctx)kind=p.length<=2&&CONTAINERS.includes(p[0]||'')?'structure':'value';
   else if(ctx.index===null)kind='structure';
   else{
    const row=get(after,[...ctx.collection.split('.'),String(ctx.index)])??get(before,[...ctx.collection.split('.'),String(ctx.index)]);
    record={collection:ctx.collection,label:ctx.info.label,index:ctx.index,id:ctx.info.id?row?.[ctx.info.id]??null:null,field:ctx.field};
    if(ctx.field===null||ctx.info.keys.includes(ctx.field))kind='key';
   }
   return {path:p.join('.'),modules,module:modules[0],kind,record};
  });
 }
 // Scope object understood by EmberwildBalanceDocument.inspect(doc,{scope}).
 // A read is {path, keys?:true, fields?:[...], shallow?:true}. A change matches when either path contains the
 // other; below a record collection, keys/fields limit which fields of a row count.
 function touches(change,read){
  const c=toPath(change),r=toPath(read.path);const n=Math.min(c.length,r.length);
  for(let i=0;i<n;i++)if(c[i]!==r[i])return false;
  if(c.length<=r.length)return true;
  if(read.shallow)return false;
  if(!read.keys&&!read.fields)return true;
  const info=RECORDS[r.join('.')];const rest=c.slice(r.length);
  if(rest.length<2)return true;
  const list=read.fields||info?.keys||[];return list.includes(rest[1]);
 }
 function scope(paths){
  const list=paths.map(toPath);
  return Object.freeze({changes:list,touches(reads){return list.some(c=>reads.some(r=>touches(c,r)));},full:false});
 }

 // References between records. Each rule names the module that holds the reference and the one it points to.
 const REFERENCES=[
  {id:'drop-source',from:'world/drops',to:'world/monsters',kind:'monster',label:'掉落來源怪物',each(d,add){(get(d,'balanceSettings.drops.entries')||[]).forEach((r,i)=>(Array.isArray(r?.sources)?r.sources:[]).forEach((id,j)=>add(id,'balanceSettings.drops.entries.'+i+'.sources.'+j,r)));}},
  {id:'drop-item',from:'world/drops',to:'items/items',kind:'item',label:'掉落道具',each(d,add){(get(d,'balanceSettings.drops.entries')||[]).forEach((r,i)=>{if(r?.type==='item')add(r.key,'balanceSettings.drops.entries.'+i+'.key',r);});}},
  {id:'monster-map',from:'world/monsters',to:'world/maps',kind:'map',label:'怪物所在地圖',each(d,add){(get(d,'balanceSettings.monsters.catalog')||[]).forEach((r,i)=>add(r?.mapIndex,'balanceSettings.monsters.catalog.'+i+'.mapIndex',r));}},
  {id:'monster-skill',from:'world/monsters',to:'combat/skills',kind:'skill',label:'怪物技能',each(d,add){(get(d,'balanceSettings.monsters.catalog')||[]).forEach((r,i)=>(Array.isArray(r?.skillAssignments)?r.skillAssignments:[]).forEach((a,j)=>{if(a?.skillId)add(a.skillId,'balanceSettings.monsters.catalog.'+i+'.skillAssignments.'+j+'.skillId',r);}));}},
  {id:'class-skill-quest',from:'characters/classes',to:'systems/quests',kind:'quest',label:'技能解鎖任務',each(d,add){(get(d,'classes')||[]).forEach((c,job)=>(Array.isArray(c?.skills)?c.skills:[]).forEach((s,i)=>(Array.isArray(s?.unlockConditions?.quests)?s.unlockConditions.quests:[]).forEach((q,j)=>add(q,'classes.'+job+'.skills.'+i+'.unlockConditions.quests.'+j,s))));}},
  {id:'class-skill-map',from:'characters/classes',to:'world/maps',kind:'map',label:'技能解鎖地圖',each(d,add){(get(d,'classes')||[]).forEach((c,job)=>(Array.isArray(c?.skills)?c.skills:[]).forEach((s,i)=>{for(const key of ['bossKills','eliteKills','bossEquipment'])(Array.isArray(s?.unlockConditions?.[key])?s.unlockConditions[key]:[]).forEach((row,j)=>{if(row?.mapIndex!==-1)add(row?.mapIndex,'classes.'+job+'.skills.'+i+'.unlockConditions.'+key+'.'+j+'.mapIndex',s);});}));}},
  {id:'skill-class',from:'combat/skills',to:'characters/classes',kind:'class',label:'技能職業',each(d,add){(get(d,'skillSystem.definitions')||[]).forEach((s,i)=>(Array.isArray(s?.jobs)?s.jobs:[]).forEach((job,j)=>add(job,'skillSystem.definitions.'+i+'.jobs.'+j,s)));}},
  {id:'skill-companion',from:'combat/skills',to:'characters/companions',kind:'companion',label:'技能所屬夥伴',each(d,add){(get(d,'skillSystem.definitions')||[]).forEach((s,i)=>{if(s?.partnerId!=null)add(s.partnerId,'skillSystem.definitions.'+i+'.partnerId',s);});}},
  {id:'life-item',from:'systems/life-skills',to:'items/items',kind:'item',label:'生活技能道具',each(d,add){const life=get(d,'lifeSkills')||{};(Array.isArray(life.gathering)?life.gathering:[]).forEach((r,i)=>{if(r?.outputType==='item')add(r.output,'lifeSkills.gathering.'+i+'.output',r);});for(const [id,r] of Object.entries(isObject(life.recipes)?life.recipes:{})){if(r?.outputType==='item')add(r.output,'lifeSkills.recipes.'+id+'.output',r);(Array.isArray(r?.inputs)?r.inputs:[]).forEach((row,j)=>{if(Array.isArray(row)&&row[2]==='item')add(row[0],'lifeSkills.recipes.'+id+'.inputs.'+j,r);});}}},
  {id:'shop-item',from:'systems/shop',to:'items/items',kind:'item',label:'商店道具',each(d,add){for(const pool of ['randomOffers','fixedOffers'])(get(d,'shopSettings.'+pool+'.entries')||[]).forEach((r,i)=>{if(r?.type==='item')add(r.key,'shopSettings.'+pool+'.entries.'+i+'.key',r);});}},
  {id:'shop-map',from:'systems/shop',to:'world/maps',kind:'mapId',label:'裝備商店地圖',each(d,add){(get(d,'shopSettings.equipmentStages')||[]).forEach((r,i)=>{if(r?.mapId)add(r.mapId,'shopSettings.equipmentStages.'+i+'.mapId',r);(Array.isArray(r?.unlockMapIds)?r.unlockMapIds:[]).forEach((id,j)=>add(id,'shopSettings.equipmentStages.'+i+'.unlockMapIds.'+j,r));});}},
  {id:'story-gear-skill',from:'systems/story',to:'combat/skills',kind:'skill',label:'劇情裝備技能',each(d,add){(get(d,'story.gearRewards')||[]).forEach((r,i)=>{if(r?.skillId)add(r.skillId,'story.gearRewards.'+i+'.skillId',r);});}}
 ];
 const TARGETS={
  monster:d=>new Set((get(d,'balanceSettings.monsters.catalog')||[]).map(r=>r?.id)),
  item:d=>new Set((get(d,'items')||[]).map(r=>r?.id)),
  map:d=>{const n=(get(d,'balanceSettings.maps.catalog')||[]).length;return {has:v=>Number.isInteger(v)&&v>=0&&v<n};},
  mapId:d=>new Set((get(d,'balanceSettings.maps.catalog')||[]).map(r=>r?.id)),
  skill:d=>new Set((get(d,'skillSystem.definitions')||[]).filter(s=>!s?.deleted).map(r=>r?.id)),
  class:d=>{const n=(get(d,'classes')||[]).length;return {has:v=>Number.isInteger(v)&&v>=0&&v<n};},
  companion:d=>new Set((get(d,'companions')||[]).map(r=>r?.id)),
  quest:d=>new Set(['tutorial',...(get(d,'balanceSettings.quests.design.side')||get(d,'balanceSettings.quests.side')||[]).map(r=>r?.id)])
 };
 // Index of every reference: key "kind:id" -> [{rule, module, path, owner}]. Rebuilt per document version;
 // reverse lookups then cost O(1) instead of a scan of every module.
 function referenceIndex(doc,{rules=REFERENCES}={}){
  const index=new Map();
  for(const rule of rules)rule.each(doc,(id,path,owner)=>{const key=rule.kind+':'+id;if(!index.has(key))index.set(key,[]);index.get(key).push({rule:rule.id,label:rule.label,module:rule.from,target:rule.to,path,owner:owner?.id??owner?.name??null});});
  return {index,referencesTo(kind,id){return index.get(kind+':'+id)||[];},
   // References whose target is missing in `doc` (optionally only for rules touching the given modules).
   broken(modules){const want=modules?new Set(modules):null,out=[],cache=new Map();for(const rule of rules){if(want&&!want.has(rule.from)&&!want.has(rule.to))continue;const t=cache.get(rule.kind)||TARGETS[rule.kind](doc);cache.set(rule.kind,t);rule.each(doc,(id,path,owner)=>{if(!t.has(id))out.push({rule:rule.id,label:rule.label,module:rule.from,target:rule.to,kind:rule.kind,id,path,owner:owner?.id??owner?.name??null});});}return out;}};
 }
 // Validators of the shared document check (EmberwildBalanceDocument.inspect) and the modules whose data they read.
 const VALIDATORS={
  'document-preflight':['meta/document'],'field-rules':['*'],'healing-potions':['items/items','world/drops'],'seconds-timing':['combat/rules','meta/balance-settings','world/monsters','systems/rewards','combat/skills','combat/statuses','items/items','characters/companion-settings','equipment/forms','meta/document'],
  'skill-system':['combat/skills','combat/skill-system'],'status-definitions':['combat/statuses'],'equipment-effects':['equipment/power-system'],'drop-references':['world/drops','items/items','world/monsters'],
  'class-unlocks':['characters/classes','systems/quests','world/maps'],'wishing-lake':['systems/wishing-lake','items/items','items/inventory-icons','characters/companions','equipment/settings','world/monsters','characters/progression','world/maps'],
  'life-skills':['systems/life-skills','items/items'],'story':['systems/story','world/maps','world/monsters','items/items','systems/life-skills','combat/skills','equipment/forms'],
  'inventory-catalogue':['items/inventory-icons','items/items','systems/shop','systems/life-skills','characters/companion-settings','equipment/power-system','characters/companions','characters/classes','equipment/forms','characters/support-skills','items/starter-packs','interface/presentation','world/drops','systems/economy','equipment/settings','world/maps','world/monsters','characters/progression','systems/quests','combat/skill-settings']
 };
 // Direct dependencies: modules whose key data a module's validation reads. Derived from REFERENCES and VALIDATORS,
 // not maintained separately.
 function dependencies(){
  const deps=new Map(MODULES.map(m=>[m.id,new Set()]));
  for(const r of REFERENCES)if(r.from!==r.to)deps.get(r.from).add(r.to);
  for(const mods of Object.values(VALIDATORS)){if(mods.includes('*'))continue;const [owner,...reads]=mods;for(const m of reads)if(m!==owner)deps.get(owner).add(m);}
  return new Map([...deps].map(([k,v])=>[k,[...v].sort()]));
 }
 function validatorsFor(id){return Object.entries(VALIDATORS).filter(([,m])=>m.includes(id)||m.includes('*')).map(([k])=>k);}
 function dependents(id){const out=[];for(const [m,d] of dependencies())if(d.includes(id))out.push(m);return out.sort();}

 // Manifest: module list, versions and content hashes. hashes = {moduleId:{sha256,bytes}|undefined}.
 function createManifest({layout,hashes,integrated,previous=null}){
  const prev=new Map((previous?.modules||[]).map(m=>[m.id,m])),deps=dependencies();let changed=false;
  const modules=MODULES.map(m=>{
   const h=hashes[m.id],p=prev.get(m.id),same=p&&h&&p.sha256===h.sha256&&p.present!==false||p&&!h&&p.present===false;
   if(!same)changed=true;
   const row={id:m.id,title:m.title,file:m.file,source:sourceOf(m),present:!!h,version:same?p.version:(p?.version||0)+1};
   if(h){row.sha256=h.sha256;row.bytes=h.bytes;}
   row.dependsOn=deps.get(m.id);row.validators=validatorsFor(m.id);
   return row;
  });
  return {schema:SCHEMA,formatVersion:FORMAT_VERSION,documentSchema:DOCUMENT_SCHEMA,dataRevision:(previous?.dataRevision||0)+(changed||!previous?1:0),
   integrated:{file:INTEGRATED_FILE,sha256:integrated.sha256,bytes:integrated.bytes},layout,
   compatibility:{loader:'data/balance.json',positionalReferences:['balanceSettings.monsters.catalog[].mapIndex','classes[] (job index)','skillSystem.definitions[].jobs'],note:'data/balance.json 由模組自動產生，請勿直接修改。'},
   modules};
 }
 function checkManifest(manifest){
  const errors=[];
  if(!isObject(manifest))return ['manifest 必須為物件'];
  if(manifest.schema!==SCHEMA)errors.push('manifest schema 不支援：'+manifest.schema);
  if(manifest.formatVersion!==FORMAT_VERSION)errors.push('manifest formatVersion 不支援：'+manifest.formatVersion);
  const ids=new Set();for(const m of Array.isArray(manifest.modules)?manifest.modules:[]){if(!BY_ID.has(m.id))errors.push('manifest 含未知模組：'+m.id);if(ids.has(m.id))errors.push('manifest 模組重複：'+m.id);ids.add(m.id);if(BY_ID.get(m.id)&&BY_ID.get(m.id).file!==m.file)errors.push('模組 '+m.id+' 檔案路徑不符：'+m.file);}
  for(const m of MODULES)if(!ids.has(m.id))errors.push('manifest 缺少模組：'+m.id);
  if(!isObject(manifest.layout))errors.push('manifest 缺少 layout');
  if(!/^[a-f0-9]{64}$/.test(manifest.integrated?.sha256||''))errors.push('manifest 缺少整合檔雜湊');
  return errors;
 }
 const api={SCHEMA,FORMAT_VERSION,DOCUMENT_SCHEMA,SOURCE_DIR,INTEGRATED_FILE,MANIFEST_FILE,CONTAINERS,MODULES,RECORDS,REFERENCES,VALIDATORS,
  module:id=>BY_ID.get(id),serialize,get,toPath,pathText,split,assemble,moduleForPath,modulePaths,sourceOf,changes,classify,recordContext,touches,scope,
  referenceIndex,dependencies,dependents,validatorsFor,createManifest,checkManifest};
 root.EmberwildBalanceModules=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
