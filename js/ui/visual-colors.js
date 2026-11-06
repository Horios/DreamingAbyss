/* v0.079 display colors set in the balance editor (#RRGGBB):
   - balanceSettings.maps.catalog[].battlefieldColor: battlefield backdrop of that region (default: the map's color)
   - balanceSettings.monsters.catalog[].cardColor: that monster's battle card (default: by element)
   - classes[].cardColor: battle cards of heroes and companions of that class (default: the earlier class colors)
   The core normalizers do not carry these fields, so they are read from the document on apply and written back on
   export. Only explicitly set colors are exported; unset ones use the defaults above. Colors never affect combat. */
(()=>{
 'use strict';
 const HEX=/^#[0-9a-fA-F]{6}$/;
 const CLASS_DEFAULTS=Object.freeze(['#c4563a','#7d5fd0','#4f9a55','#c9a540']);
 const ELEMENT_DEFAULTS=Object.freeze({physical:'#3f6a56',fire:'#8a3d2e',ice:'#2f5f86',wind:'#3d7a4a',light:'#8a7a36',shadow:'#5a3d7a'});
 const FIELD_DEFAULT='#34483a',MONSTER_DEFAULT=ELEMENT_DEFAULTS.physical,CLASS_FALLBACK='#6f8a9a';
 const ok=v=>typeof v==='string'&&HEX.test(v);
 let store={maps:{},monsters:{},classes:{}};
 function read(doc){
  const out={maps:{},monsters:{},classes:{}},errors=[];
  const take=(value,label,put)=>{if(value===undefined||value===null||value==='')return;if(!ok(value)){errors.push(label+'必須是 #RRGGBB 色碼');return;}put(value.toLowerCase());};
  (doc?.balanceSettings?.maps?.catalog||[]).forEach((m,i)=>{if(m&&typeof m==='object')take(m.battlefieldColor,`地圖「${m.name||i+1}」戰場底色`,v=>{if(typeof m.id==='string')out.maps[m.id]=v;});});
  for(const m of doc?.balanceSettings?.monsters?.catalog||[])if(m&&typeof m==='object')take(m.cardColor,`怪物「${m.name||m.id}」卡片顏色`,v=>{if(m.id!==undefined)out.monsters[String(m.id)]=v;});
  (doc?.classes||[]).forEach((c,i)=>{if(c&&typeof c==='object')take(c.cardColor,`職業「${c.name||i}」卡片顏色`,v=>{out.classes[i]=v;});});
  return {out,errors};
 }
 const baseApply=applyBalanceConfig;
 applyBalanceConfig=function(input,...rest){
  const {out,errors}=read(input);if(errors.length)throw Error(errors.join('；'));
  const previous=store;store=out;
  try{const result=baseApply.call(this,input,...rest);if(result===false)store=previous;return result;}
  catch(error){store=previous;throw error;}
 };
 const baseExport=exportableBalance;
 exportableBalance=function(...args){
  const doc=baseExport.apply(this,args);
  for(const m of doc?.balanceSettings?.maps?.catalog||[])if(m&&store.maps[m.id])m.battlefieldColor=store.maps[m.id];
  for(const m of doc?.balanceSettings?.monsters?.catalog||[])if(m&&store.monsters[String(m.id)])m.cardColor=store.monsters[String(m.id)];
  (doc?.classes||[]).forEach((c,i)=>{if(c&&store.classes[i])c.cardColor=store.classes[i];});
  return doc;
 };
 function mapRow(map){return typeof worldMapConfig==='function'?worldMapConfig(map):null;}
 function battlefield(map=party?.map){const m=mapRow(map);return (m&&store.maps[m.id])||(ok(m?.color)?m.color.toLowerCase():FIELD_DEFAULT);}
 function monster(e){
  const row=e&&typeof monsterCatalogEntry==='function'?monsterCatalogEntry(e.monsterId):null;
  return (row&&store.monsters[String(row.id)])||ELEMENT_DEFAULTS[row?.element||e?.element]||MONSTER_DEFAULT;
 }
 function cls(job){return store.classes[job]||CLASS_DEFAULTS[job]||CLASS_FALLBACK;}
 globalThis.EmberwildVisualColors={battlefield,monster,cls,CLASS_DEFAULTS,ELEMENT_DEFAULTS,FIELD_DEFAULT,get explicit(){return JSON.parse(JSON.stringify(store));}};
})();
