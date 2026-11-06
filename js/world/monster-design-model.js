/* Shared rules for configurable monster roles and BOSS-stage lineups. */
(function(root){
  const roaming=m=>['normal','elite'].includes(m.kind)&&m.enabled!==false;
  const stageEligible=m=>m.kind!=='final'&&(m.kind!=='boss'||m.enabled!==false)&&(m.bossStageCount||0)>0;
  function stagePool(maps,monsters,mi){
    return monsters.filter(m=>m.mapIndex===mi&&stageEligible(m)).map(row=>({row,kind:row.kind==='boss'?'boss':row.kind==='elite'||row.bossStageElite?'elite':'normal',count:row.bossStageCount,order:row.bossStageOrder??(row.kind==='boss'?100:10)}));
  }
  function stageIssues(maps,monsters,limit=20){
    const issues=[];
    for(const [mi,map]of maps.entries()){
      if(map.mapType==='final')continue;
      if(map.bossStageMode!==undefined&&!['fixed','random'].includes(map.bossStageMode))issues.push('BOSS 關卡模式無效：'+map.name);
      const pool=stagePool(maps,monsters,mi),total=pool.reduce((n,s)=>n+s.count,0);
      if(map.bossEnabled===false)continue;
      if(!pool.some(s=>s.kind==='boss'))issues.push('BOSS 關卡至少需要一隻啟用且數量大於零的 BOSS：'+map.name);
      const count=map.bossStageMode==='random'?(map.bossStageRandomCount??1):total;
      if(!Number.isInteger(count)||count<1||count>limit||count>total)issues.push('BOSS 出場數須為 1～'+limit+'，且不可超過候選數量：'+map.name);
    }
    return issues;
  }
  function stageRows(maps,monsters,mi,rng=Math.random,{preview=false}={}){
    const pool=stagePool(maps,monsters,mi),map=maps[mi];
    if(map?.bossEnabled===false)return [];
    if(!pool.some(s=>s.kind==='boss'))throw Error('BOSS 關卡首領未設定');
    const sort=list=>list.sort((a,b)=>a.order-b.order||((a.kind==='boss')-(b.kind==='boss'))||String(a.row.id).localeCompare(String(b.row.id)));
    if(map?.bossStageMode!=='random'||preview)return sort(pool);
    const available=pool.map(s=>({...s})),chosen=new Map(),count=map.bossStageRandomCount??1;
    if(!Number.isInteger(count)||count<1||count>available.reduce((n,s)=>n+s.count,0))throw Error('BOSS 隨機出場數無效');
    for(let i=0;i<count;i++){
      const candidates=available.filter(s=>s.count>0&&(i!==0||s.kind==='boss'));
      const weight=s=>Math.max(.0001,Number(s.row.spawnWeight)||1)*s.count;
      let pick=rng()*candidates.reduce((n,s)=>n+weight(s),0),selected=candidates.at(-1);
      for(const s of candidates){pick-=weight(s);if(pick<0){selected=s;break;}}
      if(!selected)throw Error('BOSS 隨機候選不足');selected.count--;
      if(chosen.has(selected.row.id))chosen.get(selected.row.id).count++;
      else chosen.set(selected.row.id,{...selected,count:1});
    }
    return sort([...chosen.values()]);
  }
  function equipmentRef(key,doc){
    let match=String(key).match(/^form:(\d+):(\d+):(\d+)$/);
    if(match){const [job,slot,index]=match.slice(1).map(Number),form=doc.equipmentForms?.[job]?.[slot]?.[index];return form?{job,slot,index,form}:null;}
    match=String(key).match(/^boss:(\d+):(\d+)$/);
    if(match){const [region,job]=match.slice(1).map(Number),map=doc.balanceSettings?.maps?.catalog?.[region];return map&&map.mapType!=='final'&&doc.classes?.[job]?{region,job}:null;}
    return null;
  }
  const api={roaming,stageEligible,stagePool,stageIssues,stageRows,equipmentRef};
  root.EmberwildMonsterDesign=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
