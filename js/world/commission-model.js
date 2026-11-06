/* Save validation is loaded before bootstrap, including life-product commissions. */
(()=>{
  const DAY=86400000,OFFSET=8*3600000;
  const day=now=>new Date(now+OFFSET).toISOString().slice(0,10);
  const next=now=>(Math.floor((now+OFFSET)/DAY)+1)*DAY-OFFSET;
  function validSource(q,maps){
    if(q.designVersion===1)return EmberwildQuestDesign.validSnapshot(q);
    if(q.source==='gather')return q.mat==='紅色草'&&q.item===undefined;
    if(q.source==='alchemy')return q.mat==='紅色草泥'&&q.item===undefined;
    if(q.source==='potion')return q.mat==='簡易治療藥水'&&q.item==='heal_small';
    return (q.source===undefined||q.source==='monster')&&q.item===undefined&&!!maps[q.map]?.mobs?.some(m=>m[2]===q.mat);
  }
  function validBoard(b){
    if(b.dailyVersion===2)return b.designVersion===1&&typeof b.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.day)&&new Date(Date.parse(b.day)).toISOString().slice(0,10)===b.day&&b.next===Date.parse(b.day+'T16:00:00Z')&&b.tasks.length<=5&&b.tasks.filter(q=>q.done).length<=4&&typeof b.bonusClaimed==='boolean'&&(!b.bonusClaimed||b.tasks.filter(q=>q.done).length===4)&&b.tasks.every(q=>EmberwildQuestDesign.validSnapshot(q)&&typeof q.started==='boolean'&&(!q.done||q.started)&&q.objectives.every(o=>!['nearKill','salvage','enhance'].includes(o.type)||Number.isSafeInteger(o.progress)&&o.progress>=0));
    if(b.designVersion!==undefined&&b.designVersion!==1)return false;
    if(b.tasks.some(q=>q?.designVersion!==undefined&&q.designVersion!==1))return false;
    if(b.dailyVersion===undefined)return b.day===undefined&&b.designVersion===undefined&&b.tasks.every(q=>q?.designVersion===undefined);
    return b.dailyVersion===1&&typeof b.day==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.day)&&Number.isFinite(Date.parse(b.day))&&new Date(Date.parse(b.day)).toISOString().slice(0,10)===b.day&&(b.tasks.length===1||b.designVersion===1&&b.tasks.length===0)&&b.next===Date.parse(b.day+'T16:00:00Z')&&b.tasks.every(q=>q&&(q.designVersion===1?EmberwildQuestDesign.validSnapshot(q):['monster','gather','alchemy','potion'].includes(q.source))&&Number.isInteger(q.job)&&q.job>=0&&q.job<4);
  }
  globalThis.EmberwildCommissions={day,next,validSource,validBoard};
})();
