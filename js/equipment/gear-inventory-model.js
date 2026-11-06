/* Legacy pending loot is folded into the existing bag before save validation.
   Work on a copy: a failed validation/save leaves the original save intact. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EmberwildGearInventory=api;})(globalThis,()=>{
  const SAVE_LIMIT=100000;
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  function prepareSave(raw){
    if(!raw||raw.pendingGearLoot===undefined)return raw;
    if(!Array.isArray(raw.pendingGearLoot)||raw.pendingGearLoot.length>SAVE_LIMIT)throw Error('舊待領裝備資料無效，原始存檔已保留');
    const data=JSON.parse(JSON.stringify(raw)),members=data.version===3?data.members:[data];
    if(!Array.isArray(members)||!members.length||!members.every(h=>Array.isArray(h.bag)))throw Error('舊待領裝備無法轉入背包，原始存檔已保留');
    const seen=new Map();
    for(const h of members)for(const g of h.bag)seen.set(g?.id,g);
    for(const g of data.pendingGearLoot){
      if(!g||typeof g.id!=='string')throw Error('舊待領裝備 ID 無效，原始存檔已保留');
      const existing=seen.get(g.id);
      if(existing){if(JSON.stringify(canonical(existing))!==JSON.stringify(canonical(g)))throw Error('舊待領裝備 ID 衝突，原始存檔已保留');continue;}
      members[0].bag.push(g);seen.set(g.id,g);
    }
    if(seen.size>SAVE_LIMIT)throw Error('裝備資料超出可保存範圍，原始存檔已保留');
    delete data.pendingGearLoot;
    return data;
  }
  return {SAVE_LIMIT,prepareSave};
});
