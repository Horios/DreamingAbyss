
(()=>{
  function coreSkillNextCapLevel(skillLevel){
    if(skillLevel>=RULES.skillMax)return null;
    const current=state.lv;
    for(let lv=current+1;lv<=Math.max(current+120,120);lv++){
      if(skillCap({...state,lv})>skillLevel)return lv;
    }
    return null;
  }
  function coreSkillUpgradeReason(i){
    const sk=CLASSES[state.job]?.skills?.[i];if(!sk)return '技能資料不存在。';
    const reasons=[],level=state.skills[i]||0,advanced=skillRequiresAdvanced(sk,i),cap=skillCap();
    if(level>=RULES.skillMax)return `已達技能最高等級 Lv.${RULES.skillMax}。`;
    if(state.lv<sk[2])reasons.push(`需要角色 LV${sk[2]}（目前 LV${state.lv}）`);
    if(advanced&&!state.advanced)reasons.push('需要完成二轉');
    for(const req of skillPrerequisites(sk)){
      const have=skillPrerequisiteLevel(req,state),name=skillPrerequisiteName(state.job,req);
      if(have<req.level)reasons.push(`需要 ${name} Lv.${req.level}（目前 Lv.${have}）`);
    }
    if(level>=cap){const next=coreSkillNextCapLevel(level);reasons.push(next?`目前技能等級上限 Lv.${cap}；角色達 LV${next} 後可再升級`:`目前技能等級上限 Lv.${cap}`);}
    if(state.sp<1){const gain=Math.max(0,Math.round(GS('progression.levelRewards.skillPoints',2)));reasons.push(`需要 1 技能點（目前 ${state.sp}${gain?`；角色升級時獲得 ${gain} 點`:''}）`);}
    return reasons.length?'無法升級：'+reasons.join('；')+'。':'';
  }
  function supportSkillUpgradeReason(i){
    const sk=SUPPORT[state.job]?.[i];if(!sk)return '技能資料不存在。';
    const reasons=[],level=state.supportLevels[i]||0,max=Math.max(1,Math.floor(GS('skills.support.maxLevel',5)));
    if(level>=max)return `已達輔助技能最高等級 Lv.${max}。`;
    if(state.lv<sk.level)reasons.push(`需要角色 LV${sk.level}（目前 LV${state.lv}）`);
    if(i===2&&!state.advanced)reasons.push('需要完成二轉');
    for(const req of skillPrerequisites(sk)){
      const have=skillPrerequisiteLevel(req,state),name=skillPrerequisiteName(state.job,req);
      if(have<req.level)reasons.push(`需要 ${name} Lv.${req.level}（目前 Lv.${have}）`);
    }
    if(state.sp<1){const gain=Math.max(0,Math.round(GS('progression.levelRewards.skillPoints',2)));reasons.push(`需要 1 技能點（目前 ${state.sp}${gain?`；角色升級時獲得 ${gain} 點`:''}）`);}
    return reasons.length?'無法升級：'+reasons.join('；')+'。':'';
  }
  function skillUpgradeButton(html,reason){
    if(!reason)return `<span class="skill-upgrade-tip">${html}</span>`;
    const tip=esc(reason);
    return `<span class="skill-upgrade-tip" tabindex="0" data-tooltip="${tip}" title="${tip}" aria-label="${tip}">${html}</span>`;
  }

  function procEffectDetail(i){
    const sk=CLASSES[state.job].skills[i];
    if(sk[5]==='nextActiveDamage')return '觸發後：下次主動技能傷害 +'+Number((skillPower(i,state)*100).toFixed(1))+'%；使用下一個主動技能後消耗';
    if(sk[5]==='advanceNextRound')return '觸發後：下回合行動順序提前 1 格';
    if(sk[5]==='shieldLowest')return '觸發後：生命比例最低隊友獲得施放者攻擊力 '+Number((skillPower(i,state)*100).toFixed(1))+'% 的純護盾';
    return coreSkillDetail(state.job,i,state);
  }
  function compactCoreSkillRows(kind){
    syncHeroSkillArrays(state);ensureProcSlots(state);
    const slots=kind==='active'?Array.from({length:2},(_,i)=>state.active?.[i]??null):state.procSlots,clearFn=kind==='active'?'clearActiveSkill':'clearProcSkill',slotFn=kind==='active'?'equipSkill':'slotProcSkill';
    return `<div class="actions active-slot-summary">${slots.map((id,i)=>`<span>槽 ${i+1}：${id===null?'未配置':esc(CLASSES[state.job].skills[id]?.[0]||'未知技能')+skillTypeBadges(state.job,id)} <button onclick="${clearFn}(${i})">清空</button></span>`).join('')}</div><div class="skill-list">${CLASSES[state.job].skills.map((sk,i)=>({sk,i})).filter(x=>x.sk[1]===kind).map(({sk,i})=>{
      const advanced=skillRequiresAdvanced(sk,i),prereqs=skillPrerequisites(sk),prereqsMet=skillPrerequisitesMet(sk,state),locked=state.lv<sk[2]||(advanced&&!state.advanced)||!prereqsMet,gem=state.sockets[i]??null,reason=coreSkillUpgradeReason(i),disabled=!!reason,label=locked?'尚未解鎖':state.skills[i]?'升級1點':'學習',upgrade=skillUpgradeButton(`<button onclick="learn(${i})" ${disabled?'disabled':''}>${label}</button>`,reason),meta=kind==='proc'?ensureProcSkillMeta(state.job,i):null,chance=kind==='proc'?'<p>Lv1 基礎 '+Number((meta.procBaseChance*100).toFixed(1))+'% · 每升 1 級 +'+Number((meta.procChancePerLevel*100).toFixed(1))+'% · 目前 '+Number((procChance(i,state)*100).toFixed(1))+'%</p>':'',requirement=prereqs.length?'<p class="small">前置：'+esc(skillPrerequisiteLabel(state.job,sk))+'</p>':'';
      return `<article class="skill-list-row"><div><div class="skill-list-title"><b>${esc(sk[0])}</b><span>Lv.${state.skills[i]}/${RULES.skillMax}</span><span>${kind==='proc'?'普攻觸發':'主動'}</span></div>${skillTypeBadges(state.job,i)}${skillMechanicsDetails(state.job,i)}<p class="skill-flavor"><b>說明：</b>${esc(coreSkillFlavor(state.job,i))||'<span class="small">尚未填寫</span>'}</p><p class="skill-detail"><b>詳細：</b>${esc(kind==='proc'?procEffectDetail(i):coreSkillDetail(state.job,i,state))}</p>${requirement}${chance}</div><div class="skill-list-controls">${upgrade}${[0,1].map(slot=>`<button onclick="${slotFn}(${i},${slot})" ${!state.skills[i]?'disabled':''}>${slots[slot]===i?'已配置槽':'設為槽'} ${slot+1}</button>`).join('')}<label>寶石 <select aria-label="${esc(sk[0])}寶石" onchange="socket(${i},this.value)" ${!state.skills[i]?'disabled':''}><option value="-1" ${gem===null?'selected':''}>不鑲嵌</option>${GEMS.map((g,j)=>`<option value="${j}" ${gem===j?'selected':''} ${state.gems[j]<1&&gem!==j?'disabled':''}>${esc(g.name)} ×${state.gems[j]} · ${esc(g.desc)}</option>`).join('')}</select></label></div></article>`;
    }).join('')}</div>`;
  }
  coreSkillRows=function(){return compactCoreSkillRows('active');};
  globalThis.procSkillRows=function(){return `<div class="skill-page-intro"><h2>普攻觸發技能</h2><p class="small">配置 2 個普攻觸發槽；只有放入槽位的觸發技能會在普通攻擊後判定。</p></div>`+compactCoreSkillRows('proc');};

  supportSkillRows=function(){
    const max=Math.max(1,Math.floor(GS('skills.support.maxLevel',5)));
    return `<div class="actions">${state.supportSlots.map((id,i)=>`<span>槽 ${i+1}：${id===null?'未配置':esc(SUPPORT[state.job][id].name)+skillTypeBadges(state.job,id,'support')} <button onclick="slotSupport(null,${i})">清空</button></span>`).join('')}</div><div class="skill-list">${SUPPORT[state.job].map((sk,i)=>{
      const prereqs=skillPrerequisites(sk),reason=supportSkillUpgradeReason(i),disabled=!!reason,label=state.supportLevels[i]?'升級1點':'學習',requirement=prereqs.length?'<p class="small">前置：'+esc(skillPrerequisiteLabel(state.job,sk))+'</p>':'';
      const upgrade=skillUpgradeButton(`<button onclick="learnSupport(${i})" ${disabled?'disabled':''}>${label}</button>`,reason);
      return `<article class="skill-list-row"><div><div class="skill-list-title"><b>${esc(sk.name)}</b><span>Lv.${state.supportLevels[i]}/${max}</span><span>${ELEMENTS[sk.element]}</span></div>${skillTypeBadges(state.job,i,'support')}${skillMechanicsDetails(state.job,i,'support')}${requirement}<p class="skill-flavor"><b>說明：</b>${esc(sk.description||'')||'<span class="small">尚未填寫</span>'}</p><p class="skill-detail"><b>詳細：</b>${esc(supportSkillDetail(state.job,i,state))}</p></div><div class="skill-list-controls">${upgrade}${[0,1].map(slot=>`<button onclick="slotSupport(${i},${slot})" ${state.supportLevels[i]?'':'disabled'}>${state.supportSlots[slot]===i?'已配置槽':'設為槽'} ${slot+1}</button>`).join('')}</div></article>`;
    }).join('')}</div>`;
  };

  const autoRerollJobs=new Map();
  const autoRerollDelay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  function autoRerollJobKey(id){const g=findGear(id);return g?affixDraftKey(g):'shared:'+id;}
  function autoRerollTitle(meta){
    if(!meta)return '費用已扣除';
    const spent=`共花費 ${meta.gold} 金幣／${meta.dust} 粉塵`;
    if(meta.running)return `自動洗鍊第 ${meta.attempts} 次 · 未達${AFFIX_RANK[meta.target]}以上 · 1 秒後繼續 · ${spent}`;
    if(meta.reached)return `自動洗鍊 ${meta.attempts} 次 · 已達${AFFIX_RANK[meta.target]}以上 · ${spent}`;
    if(meta.stopped)return `自動洗鍊 ${meta.attempts} 次 · 已手動停止 · ${spent}`;
    if(meta.saveFailed)return `自動洗鍊 ${meta.attempts} 次 · 儲存失敗，已停止 · ${spent}`;
    return `自動洗鍊 ${meta.attempts} 次 · 資源不足，未達${AFFIX_RANK[meta.target]} · ${spent}`;
  }

  inlineAffixComparison=function(g){
    const key=affixDraftKey(g),draft=inlineAffixDrafts.get(key);if(!draft)return affixLockControls(g);
    const meta=autoRerollMeta.get(key),job=autoRerollJobs.get(key),running=!!job&&!job.stopped;
    const actions=running
      ?`<button class="danger" onclick="stopAutoReroll('${g.id}')">停止自動洗鍊</button><span class="small">目前結果會保留；停止後可選擇採用或保留原詞條。</span>`
      :`<button class="primary" onclick="resolveInlineAffix('${g.id}',true)">採用新詞條</button><button onclick="resolveInlineAffix('${g.id}',false)">保留原詞條</button>`;
    return `<section class="inline-affix-comparison${running?' auto-reroll-running':''}"><h3>洗鍊結果${meta?` <span class="auto-reroll-status">${esc(autoRerollTitle(meta))}</span>`:''}</h3><div class="affix-compare-columns"><div><b>目前詞條</b>${g.affix.map(a=>affixHTML(a,g)).join('')||'<p>無詞條</p>'}</div><div><b>${running?'本次結果':'新詞條'}</b>${draft.map(a=>affixHTML(a,g)).join('')}</div></div><div class="actions">${actions}</div></section>`;
  };

  function stopAutoReroll(id){
    const g=findGear(id);if(!g)return;
    const key=affixDraftKey(g),job=autoRerollJobs.get(key);if(!job)return toast('這件裝備目前沒有自動洗鍊');
    job.stopped=true;autoRerollJobs.delete(key);
    const meta=autoRerollMeta.get(key);if(meta){meta.running=false;meta.stopped=true;}
    render();toast(`已停止自動洗鍊；目前保留第 ${meta?.attempts||0} 次結果`);
  }
  globalThis.stopAutoReroll=stopAutoReroll;

  async function runAutoReroll(job){
    const {id,targetRank,hero,key}=job;
    while(!job.stopped){
      if(!party?.members?.includes(hero)){job.stopped=true;break;}
      const g=withHero(hero,()=>findGear(id));if(!g){job.stopped=true;break;}
      const cost=withHero(hero,()=>rerollCostFor(g));
      if(hero.gold<cost.gold||hero.dust<cost.dust)break;
      const previous={gold:hero.gold,dust:hero.dust,rerolled:g.rerolled,draft:inlineAffixDrafts.get(key),meta:autoRerollMeta.get(key)};
      const draft=withHero(hero,()=>rollAffixes(g));
      job.attempts++;
      job.gold+=cost.gold;job.dust+=cost.dust;
      hero.gold-=cost.gold;hero.dust-=cost.dust;g.rerolled=true;
      inlineAffixDrafts.set(key,draft);
      const reached=draft.some(a=>(a.rank??0)>=targetRank);
      autoRerollMeta.set(key,{attempts:job.attempts,target:targetRank,reached,running:!reached,stopped:false,gold:job.gold,dust:job.dust});
      const saved=withHero(hero,()=>save());
      if(!saved){
        hero.gold=previous.gold;hero.dust=previous.dust;
        if(previous.rerolled===undefined)delete g.rerolled;else g.rerolled=previous.rerolled;
        if(previous.draft===undefined)inlineAffixDrafts.delete(key);else inlineAffixDrafts.set(key,previous.draft);
        if(previous.meta===undefined)autoRerollMeta.delete(key);else autoRerollMeta.set(key,previous.meta);
        job.gold-=cost.gold;job.dust-=cost.dust;job.attempts--;
        autoRerollMeta.set(key,{attempts:job.attempts,target:targetRank,reached:false,running:false,stopped:false,saveFailed:true,gold:job.gold,dust:job.dust});
        autoRerollJobs.delete(key);render();return;
      }
      render();
      if(reached){
        autoRerollJobs.delete(key);
        const meta=autoRerollMeta.get(key);if(meta)meta.running=false;
        render();toast(`自動洗鍊 ${job.attempts} 次，已出現${AFFIX_RANK[targetRank]}以上詞條`);return;
      }
      await autoRerollDelay(1000);
    }
    if(job.stopped)return;
    autoRerollJobs.delete(key);
    const meta=autoRerollMeta.get(key);
    if(meta){meta.running=false;meta.stopped=false;}
    render();toast(job.attempts?`資源不足：已洗鍊 ${job.attempts} 次，尚未出現${AFFIX_RANK[targetRank]}以上詞條`:'金幣或粉塵不足');
  }

  autoReroll=function(id,targetRank){
    const g=findGear(id);if(!g)return;targetRank=Number(targetRank);if(![2,3].includes(targetRank))return;
    const key=affixDraftKey(g);if(autoRerollJobs.has(key))return toast('這件裝備正在自動洗鍊');
    if(inlineAffixDrafts.has(key))return toast('請先採用或保留這件裝備的詞條');
    if(g.affixLock!==undefined)return toast('自動洗鍊不支援鎖定詞條，請先取消鎖定');
    const cost=rerollCostFor(g);if(state.gold<cost.gold||state.dust<cost.dust)return toast('金幣或粉塵不足');
    const job={id,targetRank,hero:state,key,attempts:0,gold:0,dust:0,stopped:false};
    autoRerollJobs.set(key,job);
    setTimeout(()=>{if(autoRerollJobs.get(key)===job)void runAutoReroll(job);},0);
  };

  const skillRerollResolveBase=resolveInlineAffix;
  resolveInlineAffix=function(id,accept){
    const key=autoRerollJobKey(id);if(autoRerollJobs.has(key))return toast('請先停止自動洗鍊');
    return skillRerollResolveBase(id,accept);
  };
  if(typeof resetSession==='function'){
    const skillRerollResetBase=resetSession;
    resetSession=function(...args){for(const job of autoRerollJobs.values())job.stopped=true;autoRerollJobs.clear();return skillRerollResetBase(...args);};
  }
  if(state)render();
})();
