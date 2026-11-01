/* Seconds presentation reads the shared scheduler; animation never advances it. */
(()=>{
 'use strict';
 const C=EmberwildSecondsCombat,S=__EMBERWILD_SKILLS,fmt=n=>Number(Math.max(0,n||0).toFixed(1)).toLocaleString('zh-TW');
 const id=x=>Object.hasOwn(x,'job')?heroKey(x):x.id;
 const t=s=>s?.timing||C.source.skillSystem.definitions.find(x=>x.id===s?.id)?.timing;
 const baseCoreDetail=coreSkillDetail,baseSupportDetail=supportSkillDetail;
 const hero=x=>!!x&&Object.hasOwn(x,'job');
 const title=x=>hero(x)?characterName(x):combatEnemyName(x);
 function view(x){try{return C.timeline?.actor(id(x));}catch{return null;}}
 function icon(s,x){return s?__EMBERWILD_MASTERY_UI.skillIcon(x.job,s.adapter.kind,s.adapter.index):__EMBERWILD_SKILL_ICONS.svgFor('lucide:swords',[],{size:22});}
 function charge(x,s=null){
  const v=view(x),a=s?v?.skills.find(a=>a.id===s.id):null,remaining=s?(a?.readyInSeconds||0):(v?.basicReadyInSeconds||0),total=s?(a?.cooldownSeconds||t(s)?.cooldownSeconds||1):(v?.intervalSeconds||C.config().actionReferenceSeconds);
  return `<button type="button" ${hero(x)&&!heroes().includes(x)?'disabled':''} class="seconds-charge" data-seconds-actor="${esc(id(x))}" data-seconds-skill="${esc(s?.id||'basic')}" data-duration="${total}" onclick="EmberwildBattleSummary.showUnit('${esc(id(x))}','${hero(x)?'ally':'enemy'}')" title="${esc(s?.name||'普通攻擊')}"><span class="seconds-charge-art">${icon(s,x)}</span><span class="seconds-charge-cover" style="height:${Math.min(100,remaining/total*100)}%"></span><small class="seconds-charge-time">${hero(x)&&!heroes().includes(x)?'候補':remaining>0?fmt(remaining):'就緒'}</small><span class="seconds-charge-name">${esc(s?.name||'普攻')}</span></button>`;
 }
 function portrait(x){const art=hero(x)?EmberwildAvatars.control(x).replace(/^<button[^>]*>/,'<span>').replace(/<\/button>$/,'</span>'):enemyArt(x);return `<button type="button" class="battle-enemy-icon ${hero(x)?'battle-ally-icon':''}" ${hero(x)?'data-hero-id':'data-enemy-id'}="${esc(id(x))}" onclick="EmberwildBattleSummary.showUnit('${esc(id(x))}','${hero(x)?'ally':'enemy'}')" aria-label="${esc(title(x))}，查看戰鬥資訊"><span class="enemy-icon-art">${art}</span><small></small><span class="enemy-icon-event"></span><span class="enemy-icon-elite" aria-hidden="true">◆</span></button>`;}
 function statusBadges(x){
  const labels=[];
  for(const f of effects.filter(f=>f.target===id(x)&&f.until>partyClock))labels.push(`<span class="seconds-state ${['guard','attack','critical','power','regen'].includes(f.kind)?'buff':'debuff'}">${esc(f.name)} ${fmt(f.until-partyClock)}s</span>`);
  for(const f of EmberwildStatusCombatState.pack().active.filter(f=>f.targetKey===id(x)&&f.expiresClock>partyClock))labels.push(`<span class="seconds-state ${__EMBERWILD_STATUS_TEST_API.polarity(f.definition)}">${esc(f.name)} ${f.definition.permanent?'∞':fmt(f.expiresClock-partyClock)+'s'}${f.remainingUses===null?'':' ×'+f.remainingUses}</span>`);
  for(const [name,c] of Object.entries(__EMBERWILD_CONTROL_TEST_API.states[id(x)]||{}))labels.push(`<span class="seconds-state debuff">${esc(({polymorph:'變形',freeze:'冰凍',frost:'結霜',fear:'畏懼',rage:'狂暴'})[name]||name)} ${c.secondsUntil===undefined?'':fmt(c.secondsUntil-partyClock)+'s'}</span>`);
  return labels.join('');
 }
 function card(x,{main=false,column=1,row=1}={}){
  const h=hero(x),v=h?battleStats(x):enemyBattleStats(x),max=h?v.hp:x.maxhp,mp=view(x),maxMp=mp?.maxMp||C.config().mana.maxMp;
  const definitions=h?[...x.active.filter(i=>i!==null).map(i=>S.byPosition(x.job,'core',i)),...x.supportSlots.filter(i=>i!==null).map(i=>S.byPosition(x.job,'support',i))].filter(s=>s&&!s.disabled&&['active','support'].includes(s.type)&&S.learned(x,s)):[];
  return `<article class="unit seconds-unit ${main?'seconds-protagonist':''} ${x.hp<=0?'fallen':''} ${h&&!heroes().includes(x)?'seconds-reserve':''}" data-combat-id="${esc(id(x))}" style="${h?'grid-column:'+column+';grid-row:'+row+';':''}">${portrait(x)}<div class="unit-title"><b>${esc(title(x))}</b><span>LV ${x.lv} · ${h?((main?'主角':'夥伴')+(!heroes().includes(x)?' · 候補':'')):x.kind==='elite'?'菁英':x.kind==='boss'||x.kind==='final'?'BOSS':'普通'}</span></div><div class="unit-numbers"><span>HP <b>${Math.ceil(x.hp)} / ${max}</b></span><span>護盾 <b>${Math.round(x.shield||0)}</b></span></div>${battleHealthMeter(x.hp,max,battleShieldValue(x))}${h?`<div class="seconds-mp" data-mp-actor="${esc(id(x))}"><span style="width:${Math.max(0,Math.min(100,(x.mp??maxMp)/maxMp*100))}%"></span><small>MP ${fmt(x.mp??maxMp)} / ${fmt(maxMp)}</small></div><div class="seconds-charge-list">${charge(x)}${[...new Map(definitions.map(s=>[s.id,s])).values()].map(s=>charge(x,s)).join('')}</div>`:`<div class="seconds-enemy-action" data-enemy-timer="${esc(id(x))}">準備行動</div>`}<div class="unit-effects seconds-states">${statusBadges(x)}</div><span class="seconds-cast-label" data-cast-actor="${esc(id(x))}"></span></article>`;
 }
 function fieldBody(){
  const all=heroes(),leader=playerHero(),partners=all.filter(h=>h!==leader),mainRowSpan=Math.max(1,Math.ceil(partners.length/2));
  return `<div class="squad-field seconds-battlefield"><section id="battleEnemyIcons" class="squad-enemies seconds-enemies" aria-label="敵方戰場">${foes.length?foes.map(x=>card(x)).join(''):'<p class="empty">開始探索後將出現敵人。</p>'}</section><section id="battleAllyIcons" class="squad-allies seconds-allies" aria-label="主角與夥伴戰場">${partners.filter((_,i)=>i%2===0).map((h,i)=>card(h,{column:1,row:i+1})).join('')}${leader?card(leader,{main:true,column:2,row:'1 / span '+mainRowSpan}):''}${partners.filter((_,i)=>i%2===1).map((h,i)=>card(h,{column:3,row:i+1})).join('')}</section><div class="seconds-party-hp">隊伍生命 ${Math.ceil(all.reduce((n,h)=>n+h.hp,0)).toLocaleString()} / ${all.reduce((n,h)=>n+battleStats(h).hp,0).toLocaleString()} · 戰鬥時間 <span id="seconds-clock">${fmt(partyClock)}s</span></div></div>`;
 }
 function field(){return EmberwildBattleConfiguration.combat(fieldBody);}
 function replaceField(html){
  const start=html.indexOf('<div class="squad-field">');if(start<0)return html;
  const tags=/<\/?div\b[^>]*>/g;tags.lastIndex=start;let depth=0,match;
  while((match=tags.exec(html))){depth+=match[0].startsWith('</')?-1:1;if(!depth)return html.slice(0,start)+field()+html.slice(tags.lastIndex);}
  return html;
 }
 initiativeView=()=>'';
 const base=battleView;battleView=function(){
  const mode=party.huntingMode||'single',current=party.currentHuntingMode||mode;
  let html=replaceField(base());
  html=html.replace(/<p class="small combat-rule">[\s\S]*?<\/p>/,'<p class="small combat-rule">各單位依秒數獨立行動；角色自動依條件與優先級施放技能。主動技能共用行動間隔並消耗 MP。</p>');
  html=html.replace(/群怪 · 3～6 隻/g,current==='single'?'單怪 · 1 隻':'群怪 · 3～5 隻');
  const control=`<label class="seconds-mode-control">狩獵模式<select aria-label="狩獵模式" onchange="setHuntingMode(this.value)"><option value="single" ${mode==='single'?'selected':''}>單怪 · 1 隻</option><option value="group" ${mode==='group'?'selected':''}>群怪 · 3～5 隻</option></select><small>${mode===current?'下一次遭遇依此模式生成':'已變更，下一場生效'} · BOSS／任務依關卡規則</small></label>`;
  html=html.includes('<div class="exploration-categories"')?html.replace('<div class="exploration-categories"',control+'<div class="exploration-categories"'):html.replace('<div class="control-grid">','<div class="control-grid">'+control);
  return html.replace(/第 (\d+(?:\.\d+)?) (?:回合|秒)/g,(_m,n)=>'戰鬥 '+fmt(+n)+' 秒');
 };
 function viewTime(){
  const e=C.timeline;if(!e||!party)return partyClock;
  const next=e.nextEvent(),remaining=next?Math.max(0,next.at/1e6-e.now/1e6):0;
  const wall=running&&!$('modal').open&&!document.hidden?Date.now():(party.offlineExploration?.lastAt||Date.now());
  const base=nextActionAt-remaining*1000/battleRate;
  return e.now/1e6+Math.min(remaining,Math.max(0,(wall-base)*battleRate/1000));
 }
 function sync(){
  if(tab!=='battle'||!party||document.hidden||EmberwildOffline.busy||globalThis.__EMBERWILD_OFFLINE_SILENT)return;
  const e=C.timeline;if(!e)return;const now=viewTime(),elapsed=Math.max(0,now-e.now/1e6);
  for(const node of document.querySelectorAll('[data-seconds-actor]')){
   let v;try{v=e.actor(node.dataset.secondsActor);}catch{continue;}
   const s=node.dataset.secondsSkill==='basic'?null:v.skills.find(s=>s.id===node.dataset.secondsSkill),remaining=Math.max(0,(s?s.readyInSeconds:v.basicReadyInSeconds)-elapsed),total=s?s.cooldownSeconds:v.intervalSeconds,resource=s&&v.mp<s.mpCost*(e.find(v.id).mpCostMultiplier||0);
   node.querySelector('.seconds-charge-cover').style.height=Math.min(100,remaining/Math.max(.000001,total)*100)+'%';
   node.querySelector('.seconds-charge-time').textContent=remaining>0?fmt(remaining):resource?'MP不足':v.casting?'待命':'就緒';
   node.classList.toggle('is-ready',remaining<=0&&!resource);node.classList.toggle('needs-mp',!!resource);
  }
  for(const node of document.querySelectorAll('[data-mp-actor]')){let v;try{v=e.actor(node.dataset.mpActor);}catch{continue;}const a=e.find(v.id),mp=Math.min(v.maxMp,v.mp+elapsed*a.definition.mpRegenPerSecond);node.querySelector('span').style.width=mp/v.maxMp*100+'%';node.querySelector('small').textContent='MP '+fmt(mp)+' / '+fmt(v.maxMp);}
  for(const node of document.querySelectorAll('[data-enemy-timer],[data-cast-actor]')){let v;try{v=e.actor(node.dataset.enemyTimer||node.dataset.castActor);}catch{continue;}const cast=v.casting;if(node.dataset.castActor)node.closest('.seconds-unit')?.classList.toggle('seconds-casting',!!cast);node.textContent=cast?'施放 '+(S.byId(cast.skillId)?.name||'技能')+' · '+fmt(Math.max(0,cast.remainingSeconds-elapsed))+'s':node.dataset.enemyTimer?'行動充能 '+fmt(Math.max(0,v.actionReadyInSeconds,v.basicReadyInSeconds)-elapsed)+'s':'';}
  const clock=$('seconds-clock');if(clock)clock.textContent=fmt(now)+'s';
 }
 const baseGuide=guideView;guideView=function(){return baseGuide().replace(/<p>主動技能只受冷卻時間限制；[\s\S]*?<\/p>/,'<p>主動技能冷卻完成、MP 足夠且符合條件時自動施放；同一角色每次只能執行一項主動技能或普攻。被動與原本免費的觸發技能不占行動。</p>').replace(/1倍速每回合至少 \d+(?:\.\d+)? 秒。普攻每回合一次；[\s\S]*?不搶佔普攻。/,'所有單位依速度獨立行動，主動技能與普攻共用行動限制。冷卻、增減益與持續傷害依戰鬥秒數推進。').replace(/單體或群怪|群怪 · 3～6 隻/g,'單怪 1 隻／群怪 3～5 隻');};
 const oldBuffRows=battleBuffRows;battleBuffRows=function(){const rows=[...heroes().map(h=>[h,'ally']),...foes.map(e=>[e,'enemy'])].flatMap(([x,side])=>(EmberwildBattleSummary.inspect(id(x),side)?.statuses||[]).map(s=>'<tr><td>'+esc(title(x))+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.detail)+'</td><td>'+esc(s.time||(s.remaining===null?'永久':fmt(s.remaining)+' 秒'))+'</td><td>'+esc(s.clock||'戰鬥秒數')+'</td></tr>'));return rows.join('');};
 const baseTick=tick;tick=function(...args){const out=baseTick(...args);sync();return out;};
 function detail(s,h=state){
  if(!s)return '';const d=t(s);if(!d)return s.description||'';if(!h)return `${s.description||s.name} · 冷卻 ${fmt(d.cooldownSeconds)} 秒 · MP ${fmt(d.mpCost)}`;
  const sources=(s.sources||[]).map(r=>({class:'職業',quest:'任務',equipment:'裝備',companion:'夥伴',starter:'初始'})[r.type]||r.type).filter((v,i,a)=>a.indexOf(v)===i).join('／'),live=view(h)?.skills.find(x=>x.id===s.id),multiplier=view(h)?C.timeline.find(id(h)).mpCostMultiplier:C.resourceProfile(h).cost,mp=d.mpCost*multiplier;
  if(s.type==='passive'){const e=s.eventPassive,base=e?.event==='kill'?`擊殺後以 ${fmt(e.power*100)}% 攻擊追擊生命最低的敵人；最多追加 ${e.maxAttacks} 次，每次原始行動最多一條追擊鏈。`:e?.event==='enemyDeath'?`敵人死亡時，自身主動與輔助冷卻縮減 ${fmt(e.reduction*C.config().classes.find(c=>c.job===h.job).baseIntervalSeconds)} 秒；內部冷卻 ${fmt(e.cooldown*C.config().actionReferenceSeconds)} 秒。`:s.description||s.name;return `${base} · 常駐被動，不占行動${sources?' · 來源：'+sources:''}`;}
  if(h&&!hero(h)){const shared=sharedSkillById(s.id),chance=shared?.meta?.procBaseChance??GS('skills.proc.baseChance',.22);return `${s.description||s.name} · ${s.type==='proc'?'普攻觸發率 '+fmt(chance*100)+'%，不占行動':'主動技能，占用行動'} · 倍率 ${fmt((s.power||0)*100)}% · 最多 ${s.maxTargets||1} 個目標 · 冷卻 ${fmt(live?.cooldownSeconds??d.cooldownSeconds)} 秒 · MP ${fmt(mp)}${d.castSeconds?' · 施法 '+fmt(d.castSeconds)+' 秒':''} · 來源：怪物技能配置`;}
  const cd=live?.cooldownSeconds??(s.type==='support'?supportSkillCooldown(h,s.adapter.index):s.type==='proc'?d.cooldownSeconds:skillCooldown(s.adapter.index,h)),status=s.statusId?C.source.statusDefinitions.find(x=>x.id===s.statusId):null;
  let description=s.adapter.kind==='support'?baseSupportDetail(h?.job??s.adapter.job,s.adapter.index,h):s.adapter.kind==='core'?baseCoreDetail(h?.job??s.adapter.job,s.adapter.index,h):s.description||s.name;
  description=String(description).replace(/ · 冷卻 \d+(?:\.\d+)?(?: 個自身| 戰鬥)? 回合/g,'').replace(/持續 \d+(?:\.\d+)?(?: 戰鬥)? 回合/g,'持續 '+(status?.timing.durationSeconds===null?'永久':fmt(status?.timing.durationSeconds??d.durationSeconds)+' 秒')).replace(/每(?:個自身)?回合/g,'每 '+fmt(status?.timing.triggerIntervalSeconds??d.tickIntervalSeconds)+' 秒').replace(/下回合行動提前/g,'下次行動提前').replace(/回合/g,'秒');
  return `${description}${sources?' · 來源：'+sources:''} · ${s.type==='proc'?'觸發技能，不占行動':'主動技能，占用行動'} · ${s.type==='proc'&&!cd?'觸發冷卻 無':'冷卻 '+fmt(cd)+' 秒'} · MP ${fmt(mp)}${d.castSeconds?' · 施法 '+fmt(d.castSeconds)+' 秒':''}${status?.timing.durationSeconds===null?' · 永久':''}`;
 }
 coreSkillDetail=function(job,index,h=state){return detail(S.byPosition(job,'core',index),h);};
 supportSkillDetail=function(job,index,h=state){return detail(S.byPosition(job,'support',index),h);};
 __EMBERWILD_STATUS_TEST_API.remainingTurns=inst=>inst.definition.permanent?Infinity:Math.max(0,inst.expiresClock-partyClock);
 const inspect=EmberwildBattleSummary.inspect;
 EmberwildBattleSummary.inspect=function(...args){return EmberwildBattleConfiguration.combat(()=>{const d=inspect(...args);if(!d)return d;const x=party.members.find(h=>heroKey(h)===d.id)||foes.find(e=>e.id===d.id),v=x?view(x):null;d.mp=v?.mp??x?.mp??0;d.maxMp=v?.maxMp??C.config().mana.maxMp;
  for(const s of d.skills){const def=S.byId(s.id),t=def?.timing,live=v?.skills.find(x=>x.id===s.id);s.remaining=live?.readyInSeconds??s.remaining;s.cooldown=live?.cooldownSeconds??t?.cooldownSeconds??0;s.detail=def?detail(def,x||(d.side==='enemy'?{id:d.id,lv:d.level,kind:'normal'}:state)):s.detail;}
  if(hero(x))for(const s of S.system().definitions.filter(s=>s.type==='passive'&&S.learned(x,s)))if(!d.skills.some(x=>x.id===s.id))d.skills.push({id:s.id,name:s.name,type:'passive',configured:S.passiveEnabled(x,s.id),remaining:0,cooldown:0,detail:detail(s,x)});
  return d;});
 };
 const show=EmberwildBattleSummary.showUnit;EmberwildBattleSummary.showUnit=function(...args){const out=show(...args),d=EmberwildBattleSummary.inspect(...args);if(d){const modal=$('modal');modal.innerHTML=modal.innerHTML.replace(/個自身回合|戰鬥回合|回合/g,'秒').replace('持有技能與冷卻','魔力 '+fmt(d.mp)+' / '+fmt(d.maxMp)+' MP · 持有技能與冷卻').replace(/冷卻依該單位自身秒計算/,'冷卻依戰鬥秒數計算');}return out;};
 globalThis.EmberwildSecondsUI={sync,detail,field,viewTime};
})();
