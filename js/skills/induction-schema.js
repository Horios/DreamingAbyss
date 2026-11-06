/* Shared induction contract; embedded verbatim in the standalone balance editor. */
(function(root){
  'use strict';
  const TAG='induce',EFFECT='induceSkill',MAX_TARGETS=2;
  const tagged=sk=>Array.isArray(sk?.tags)&&sk.tags.includes(TAG);
  const blocked=sk=>tagged(sk)||sk?.effect===EFFECT;
  const idFor=(sk,job,index)=>sk?.id||`job${job}-core${index}`;
  function validate(doc){
    const issues=[],pool=new Map();
    for(const [job,c] of (doc?.classes||[]).entries())for(const [index,sk] of (c.skills||[]).entries())pool.set(idFor(sk,job,index),{job,sk});
    for(const [job,c] of (doc?.classes||[]).entries())for(const [index,sk] of (c.skills||[]).entries()){
      const label=`技能 ${job}-${index}「${sk.name||''}」`;
      if(sk.tags!==undefined&&(!Array.isArray(sk.tags)||sk.tags.some(x=>typeof x!=='string')||new Set(sk.tags).size!==sk.tags.length))issues.push(label+'：tags 必須是不重複的文字陣列');
      if(sk.effect===EFFECT&&!tagged(sk))issues.push(label+'：誘發技能效果必須帶有誘發標籤');
      if(!tagged(sk)&&sk.induction===undefined)continue;
      if(!['active','proc'].includes(sk.activation))issues.push(label+'：誘發僅支援主動／觸發技能');
      const config=sk.induction,targets=config?.targets;
      if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>k!=='targets'))issues.push(label+'：誘發設定只支援 targets，連鎖深度固定為一次');
      if(!Array.isArray(targets)||targets.length>MAX_TARGETS||tagged(sk)&&!targets?.length){issues.push(label+'：誘發需設定 1～2 個目標');continue;}
      const seen=new Set();
      for(const target of targets){
        if(!target||typeof target!=='object'||Array.isArray(target)){issues.push(label+'：誘發目標無效');continue;}
        if(typeof target.chance!=='number'||!Number.isFinite(target.chance)||target.chance<0||target.chance>1)issues.push(label+'：誘發機率必須介於 0～1');
        let key;
        if(target.kind==='activeSlot'||target.kind==='procSlot'){
          if(!Number.isInteger(target.slot)||target.slot<0||target.slot>(target.kind==='activeSlot'?2:1))issues.push(label+'：主動槽必須是 0～2，觸發槽必須是 0～1');
          key=target.kind+':'+target.slot;
        }else if(target.kind==='skill'){
          const row=pool.get(target.skillId);key='skill:'+target.skillId;
          if(!row||row.job!==job)issues.push(label+'：指定誘發技能不存在或職業不符');
          else if(blocked(row.sk))issues.push(label+'：不可誘發帶有誘發標籤／誘發效果的技能');
        }else issues.push(label+'：誘發目標類型無效');
        if(seen.has(key))issues.push(label+'：誘發目標不可重複');seen.add(key);
      }
    }
    return issues;
  }
  const api={TAG,EFFECT,MAX_TARGETS,tagged,blocked,idFor,validate};
  root.EmberwildInduction=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
