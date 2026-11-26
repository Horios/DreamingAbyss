/* v0.206 monster drop rework: shared rules for the game, tests and the balance editor (no DOM, no save).
   - monsterGear: each monster has its own pool of 1–2 general equipment forms ("form:<job>:<slot>:<index>").
     One success of the rule picks one form by weight, so adding a second form never raises the total output.
   - gemPool: map-bound gems. Normal/elite rules carry the map's single gem; boss rules carry up to three gems with weights.
   - Removed sources: the shared random gear pools (gear, gearLegendary), random gems (gem with key "random") and direct
     dust drops (dust). Older documents still load: migrateEntries drops those rules before validation. */
(function(root){
  'use strict';
  const NEW_TYPES=['monsterGear','gemPool'];
  const OBSOLETE_TYPES=new Set(['gear','gearLegendary','dust']);
  const isObsolete=r=>!!r&&(OBSOLETE_TYPES.has(r.type)||r.type==='gem'&&r.key==='random'||r.type==='potion');
  const FORM=/^form:([0-3]):([0-3]):(\d{1,2})$/;
  function migrateEntries(entries){
    if(!Array.isArray(entries))return {entries,removed:[]};
    const removed=entries.filter(isObsolete).map(r=>r.id);
    return {entries:removed.length?entries.filter(r=>!isObsolete(r)):entries,removed};
  }
  /* Returns a migrated shallow copy of a balance document (or of balanceSettings) without touching the input. */
  function migrateDocument(doc){
    if(!doc||typeof doc!=='object')return doc;
    const settings=doc.balanceSettings&&typeof doc.balanceSettings==='object'?doc.balanceSettings:doc.drops?doc:null;
    if(!settings||!Array.isArray(settings.drops?.entries))return doc;
    const {entries,removed}=migrateEntries(settings.drops.entries);if(!removed.length)return doc;
    const nextSettings={...settings,drops:{...settings.drops,entries}};
    return settings===doc?nextSettings:{...doc,balanceSettings:nextSettings};
  }
  function parseForm(key){const m=String(key).match(FORM);return m?{job:Number(m[1]),slot:Number(m[2]),index:Number(m[3])}:null;}
  /* formExists(ref) checks the general equipment catalogue (optional); gemCount is the number of gem ids. */
  function ruleIssues(r,{formExists,gemCount=15}={}){
    const out=[];if(!r||!NEW_TYPES.includes(r.type))return out;
    const pool=r.pool,max=r.type==='monsterGear'?2:3;
    if(!Array.isArray(pool)||pool.length<1||pool.length>max){out.push((r.type==='monsterGear'?'怪物一般裝備池需要 1～2 種裝備：':'寶石掉落池需要 1～3 種寶石：')+r.id);return out;}
    const keys=new Set();
    for(const p of pool){
      if(!p||typeof p.key!=='string'||keys.has(p.key)||!Number.isFinite(p.weight)||p.weight<=0||p.weight>1e6){out.push('掉落池項目無效或重複：'+r.id);continue;}
      keys.add(p.key);
      if(r.type==='monsterGear'){const ref=parseForm(p.key);if(!ref||formExists&&!formExists(ref))out.push('怪物一般裝備池引用不存在的一般裝備：'+r.id+' '+p.key);}
      else if(!/^\d{1,2}$/.test(p.key)||Number(p.key)>=gemCount)out.push('寶石掉落池引用不存在的寶石：'+r.id+' '+p.key);
    }
    if(r.type==='monsterGear'&&r.sources?.length!==1)out.push('怪物一般裝備池只能對應一種怪物：'+r.id);
    return out;
  }
  /* v0.211 class weights inside a monster gear pool. Weapons, armor and off-hands the player's current class can wear
     weigh 70%, the others 10% (each other class); the pool keeps its forms, its total drop rate and the share of its
     accessories (worn by every class), so only pools with two class gear entries change. formOf(ref) returns the form. */
  const CLASS_WEIGHTS=Object.freeze({own:70,other:10});
  function formWearable(form,ref,job){const jobs=Array.isArray(form?.wearableJobs)?form.wearableJobs:ref.slot===1?[0,1,2,3]:[ref.job];return jobs.includes(job);}
  function classWeightedPool(pool,{job,formOf,weights=CLASS_WEIGHTS}={}){
    if(!Array.isArray(pool)||!Number.isInteger(job)||typeof formOf!=='function')return pool;
    const rows=pool.map(p=>{const ref=parseForm(p.key),form=ref&&formOf(ref);return {p,ref,form,classed:!!(ref&&form&&ref.slot!==3)};});
    const classed=rows.filter(r=>r.classed);if(classed.length<2)return pool;
    const before=classed.reduce((n,r)=>n+r.p.weight,0),scaled=classed.map(r=>r.p.weight*(formWearable(r.form,r.ref,job)?weights.own:weights.other)),after=scaled.reduce((n,w)=>n+w,0);
    if(!(after>0))return pool;
    let k=0;return rows.map(r=>r.classed?{key:r.p.key,weight:scaled[k++]*before/after}:{key:r.p.key,weight:r.p.weight});
  }
  function pick(pool,rng=Math.random){
    const total=pool.reduce((n,p)=>n+p.weight,0);let x=rng()*total;
    for(const p of pool){x-=p.weight;if(x<0)return p;}
    return pool[pool.length-1];
  }
  /* Exclusive equipment enhancement: the material bound to the equipment definition and the quantity per target level. */
  function exclusiveIssues(cfg){
    const out=[];if(cfg===undefined)return out;
    if(!cfg||typeof cfg!=='object'||Array.isArray(cfg))return ['怪物專屬裝備強化設定必須是物件'];
    if(!Array.isArray(cfg.quantityByLevel)||cfg.quantityByLevel.some(n=>!Number.isSafeInteger(n)||n<0||n>9999))out.push('專屬素材消耗量必須是 0～9999 的整數陣列');
    if(!Array.isArray(cfg.bindings))out.push('專屬素材對應必須是陣列');
    else{const seen=new Set();for(const b of cfg.bindings){
      if(!b||typeof b.equipment!=='string'||!/^(?:form:4:\d:\d{1,2}|boss:\d{1,2})$/.test(b.equipment)||seen.has(b.equipment)||typeof b.material!=='string'||!b.material.trim()||b.material.length>100||typeof b.monster!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(b.monster)){out.push('專屬素材對應無效或重複：'+(b?.equipment??''));continue;}
      seen.add(b.equipment);}}
    return out;
  }
  /* Gem upgrade with dust: cost = ceil(base dust of the target tier × multiplier). Tier is 1-based; targetTier 2 or 3. */
  function gemUpgradeCost(settings,targetTier){
    const base=Number(settings?.baseDustByTargetTier?.[targetTier-1]),mul=Number(settings?.multiplier);
    if(!Number.isFinite(base)||base<=0||!Number.isFinite(mul)||mul<=0)return null;
    return Math.ceil(base*mul-1e-9);
  }
  function gemUpgradeIssues(settings){
    const out=[];if(settings===undefined)return out;
    if(!Number.isFinite(settings?.multiplier)||settings.multiplier<=0||settings.multiplier>100)out.push('寶石粉塵升級倍率必須大於 0');
    const b=settings?.baseDustByTargetTier;if(!Array.isArray(b)||b.length!==3||b.some(n=>!Number.isFinite(n)||n<0||n>1e9))out.push('寶石粉塵升級成本基準必須是 3 個非負數');
    return out;
  }
  const api={NEW_TYPES,OBSOLETE_TYPES,isObsolete,migrateEntries,migrateDocument,parseForm,ruleIssues,CLASS_WEIGHTS,classWeightedPool,pick,exclusiveIssues,gemUpgradeCost,gemUpgradeIssues};
  root.EmberwildDropRework=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
