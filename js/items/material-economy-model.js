/* Shared material-yield calibration. Samples defeated monsters, never encounter count. */
(function(root){
 const maps=d=>d.balanceSettings.maps.catalog,monsters=d=>d.balanceSettings.monsters.catalog;
 const weight=m=>Math.max(.0001,Number(m.spawnWeight)||1);
 function killMix(d,mi){
  const m=maps(d)[mi],cat=monsters(d).filter(x=>x.mapIndex===mi&&x.enabled!==false);
  if(m.mapType==='final'){const rows=cat.filter(x=>x.kind==='final'||['normal','elite'].includes(x.kind)).map(x=>({id:x.id,kind:x.kind==='final'?'final':x.kind==='elite'||x.stageElite?'elite':'normal',count:x.kind==='final'?1:x.stageCount??1})),total=rows.reduce((s,x)=>s+x.count,0);return rows.map(x=>({...x,share:x.count/total}));}
  const roaming=cat.filter(x=>['normal','elite'].includes(x.kind)),elites=roaming.filter(x=>x.kind==='normal'&&x.eliteEnabled!==false),p=m.eliteEnabled&&elites.length?m.eliteChance:0,total=roaming.reduce((s,x)=>s+weight(x),0),et=elites.reduce((s,x)=>s+weight(x),0);
  return [...roaming.map(x=>({id:x.id,kind:x.kind,share:(1-p)*weight(x)/total})),...elites.map(x=>({id:x.id,kind:'elite',share:p*weight(x)/et}))].filter(x=>x.share>0);
 }
 function expected(d,mi,{mode=0,killsPerHour=720}={}){
  const rules=d.balanceSettings.drops.entries,out={dust:0,ore:0,ether:0},mix=killMix(d,mi);
  for(const x of mix)for(const r of rules){if(r.enabled===false||!r.sources.includes(x.id)||!r.kinds.includes(x.kind))continue;const k=r.type==='ore'?'ore':r.type==='material'&&r.key==='粉塵'?'dust':r.type==='material'&&r.key==='以太鍛鐵'?'ether':null;if(!k)continue;if(!r.independent)throw Error('素材預估需使用獨立掉落：'+r.id);out[k]+=killsPerHour*x.share*r.chanceByDifficulty[mode]*(r.quantityMin+r.quantityMax)/2;}
  return {...out,eliteShare:mix.filter(x=>x.kind==='elite').reduce((s,x)=>s+x.share,0)};
 }
 function calibrateDust(d){
  const rows=d.balanceSettings.drops.entries;d.balanceSettings.drops.entries=rows.filter(r=>!(r.type==='material'&&r.key==='粉塵'));
  maps(d).forEach((m,mi)=>{const mix=killMix(d,mi),mult=k=>k==='elite'?3:1,denom=mix.reduce((s,x)=>s+x.share*mult(x.kind),0),base=m.recommendedGearLevel/36/denom;
   for(const kind of [...new Set(mix.map(x=>x.kind))]){const target=base*mult(kind),quantity=Math.max(1,Math.ceil(target*1.8));if(quantity>999)throw Error('粉塵掉落數量超過上限');d.balanceSettings.drops.entries.push({id:`base_dust_map${mi}_${kind}`,name:'粉塵',enabled:true,type:'material',key:'粉塵',kinds:[kind],chanceByDifficulty:[1,1.4,1.8].map(x=>target*x/quantity),quantityMin:quantity,quantityMax:quantity,sources:[...new Set(mix.filter(x=>x.kind===kind).map(x=>x.id))],independent:true});}
  });return d;
 }
 const api={killMix,expected,calibrateDust};root.EmberwildMaterialEconomy=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis==='object'?globalThis:this);
