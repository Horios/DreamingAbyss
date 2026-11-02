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
 function icon(s,x){return s?__EMBERWILD_MASTERY_UI.skillIcon(x.job??s.adapter.job??s.jobs?.[0]??0,s.adapter.kind,s.adapter.index):__EMBERWILD_SKILL_ICONS.svgFor('lucide:swords',[],{size:22});}
 function charge(x,s=null){
  const v=view(x),a=s?v?.skills.find(a=>a.id===s.id):null,remaining=s?(a?.readyInSeconds||0):(v?.basicReadyInSeconds||0),total=s?(a?.cooldownSeconds||t(s)?.cooldownSeconds||1):(v?.intervalSeconds||C.config().actionReferenceSeconds);
  return `<button type="button" ${hero(x)&&!heroes().includes(x)?'disabled':''} class="seconds-charge" data-seconds-actor="${esc(id(x))}" data-seconds-skill="${esc(s?.id||'basic')}" data-duration="${total}" onclick="EmberwildBattleSummary.showUnit('${esc(id(x))}','${hero(x)?'ally':'enemy'}')" title="${esc(s?.name||'普通攻擊')}"><span class="seconds-charge-art">${icon(s,x)}</span><span class="seconds-charge-cover" style="height:${Math.min(100,remaining/total*100)}%"></span><small class="seconds-charge-time">${hero(x)&&!heroes().includes(x)?'候補':remaining>0?fmt(remaining):'就緒'}</small><span class="seconds-charge-name">${esc(s?.name||'普攻')}</span></button>`;
 }
 function portrait(x){const art=hero(x)?EmberwildAvatars.control(x).replace(/^<button[^>]*>/,'<span>').replace(/<\/button>$/,'</span>'):EmberwildBattleSummary.artwork(x);return `<button type="button" class="battle-enemy-icon ${hero(x)?'battle-ally-icon':''}" ${hero(x)?'data-hero-id':'data-enemy-id'}="${esc(id(x))}" onclick="EmberwildBattleSummary.showUnit('${esc(id(x))}','${hero(x)?'ally':'enemy'}')" aria-label="${esc(title(x))}，查看戰鬥資訊"><span class="enemy-icon-art">${art}</span><small></small><span class="enemy-icon-event"></span><span class="enemy-icon-elite" aria-hidden="true">${__EMBERWILD_SKILL_ICONS.svgFor('lucide:gem',[],{size:12})}</span></button>`;}
 const preferenceKey=environmentStorageKey('emberwild-seconds-ui-v1');
 let showCooldowns=false;try{showCooldowns=JSON.parse(localStorage.getItem(preferenceKey)||'{}').showCooldowns===true;}catch{}
 const svg=name=>__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+name,[],{size:18});
 const baseControls=explorationControlButtons;explorationControlButtons=function(...args){return baseControls(...args).replace(/(<button[^>]*>)([^<]+)/g,(_m,tag,text)=>tag+svg(text.includes('停止')?'square':text.includes('暫停')?'pause':'play')+text);};
 const baseLog=logContent;logContent=function(){return baseLog().replace(/(<span class="tag battle-log-round">)回合 [^<]*/,(_m,tag)=>tag+'戰鬥 '+fmt(partyClock)+' 秒');};
 function duration(value){if(value===null)return '永久';const n=Math.ceil(Math.max(0,value||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');}
 function applyPreference(){document.body.classList.toggle('seconds-cooldowns-hidden',!showCooldowns);for(const n of document.querySelectorAll('[data-seconds-toggle]')){n.setAttribute('aria-pressed',String(showCooldowns));n.innerHTML=svg('timer')+(showCooldowns?'隱藏冷卻':'顯示冷卻');}}
 function toggleCooldowns(){showCooldowns=!showCooldowns;try{localStorage.setItem(preferenceKey,JSON.stringify({showCooldowns}));}catch{}applyPreference();sync();}
 function statusBadges(x){
  const rows=EmberwildBattleSummary.inspect(id(x),hero(x)?'ally':'enemy')?.statuses||[];
  return rows.map(f=>{const permanent=f.remaining===null||f.time==='常駐被動'||f.time==='永久',remaining=permanent?null:f.remaining,wall=f.clockType==='wall',until=(wall?Date.now()/1000:partyClock)+(remaining||0);return `<span class="seconds-state ${esc(f.polarity||'buff')}" title="${esc(f.detail||'')}">${esc(f.name)}（<time ${permanent?'':`data-state-until="${until}" data-state-clock="${wall?'wall':'battle'}"`}>${duration(remaining)}</time>）${f.uses==null?'':' ×'+f.uses}</span>`;}).join('');
 }
 function card(x,{main=false,column=1,row=1}={}){
  const h=hero(x),v=h?battleStats(x):enemyBattleStats(x),max=h?v.hp:x.maxhp,mp=view(x),maxMp=mp?.maxMp||C.config().mana.maxMp;
  const definitions=h?[...x.active.filter(i=>i!==null).map(i=>S.byPosition(x.job,'core',i)),...x.supportSlots.filter(i=>i!==null).map(i=>S.byPosition(x.job,'support',i))].filter(s=>s&&!s.disabled&&['active','support'].includes(s.type)&&S.learned(x,s)):(mp?.skills||[]).map(a=>S.byId(a.id)).filter(Boolean);
  return `<article class="unit seconds-unit ${main?'seconds-protagonist':''} ${x.hp<=0?'fallen':''} ${h&&!heroes().includes(x)?'seconds-reserve':''}" data-combat-id="${esc(id(x))}" style="${h?'grid-column:'+column+';grid-row:'+row+';':''}">${portrait(x)}<div class="unit-title"><b>${esc(title(x))}</b><span>LV ${x.lv} · ${h?((main?'主角':'夥伴')+(!heroes().includes(x)?' · 候補':'')):x.kind==='elite'?'菁英':x.kind==='boss'||x.kind==='final'?'BOSS':'普通'}</span></div><div class="unit-numbers"><span>HP <b>${Math.ceil(x.hp)} / ${max}</b></span><span>護盾 <b>${Math.round(x.shield||0)}</b></span></div>${battleHealthMeter(x.hp,max,battleShieldValue(x))}${h||mp?.skills.length?`<div class="seconds-mp" data-mp-actor="${esc(id(x))}"><span style="width:${Math.max(0,Math.min(100,(x.mp??maxMp)/maxMp*100))}%"></span><small>MP ${fmt(x.mp??maxMp)} / ${fmt(maxMp)}</small></div><div class="seconds-charge-list">${charge(x)}${[...new Map(definitions.map(s=>[s.id,s])).values()].map(s=>charge(x,s)).join('')}</div>`:`<div class="seconds-enemy-action" data-enemy-timer="${esc(id(x))}">準備行動</div>`}<div class="unit-effects seconds-states">${statusBadges(x)}</div><span class="seconds-cast-label" data-cast-actor="${esc(id(x))}"></span></article>`;
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
  html=html.replace(/<p class="small combat-rule">[\s\S]*?<\/p>/,'<p class="small combat-rule">各單位依秒數獨立行動；角色自動依條件與優先級施放技能。普攻與技能獨立計時；技能依裝備順序施放並消耗 MP。</p>');
  html=html.replace(/群怪 · 3～6 隻/g,current==='single'?'單怪 · 1 隻':'群怪 · 3～5 隻');
  const r=C.thresholds(),control=`<details class="seconds-recovery-settings"><summary>冒險配置 · 遭遇前恢復</summary><div><label>隊伍最低 HP <input aria-label="下一場最低 HP" type="number" min="0" max="100" step="1" value="${Math.round(r.minimumHpRatio*100)}" onchange="setRecoveryThresholds(Number(this.value)/100,EmberwildSecondsCombat.thresholds().minimumMpRatio)">%</label><label>隊伍最低 MP <input aria-label="下一場最低 MP" type="number" min="0" max="100" step="1" value="${Math.round(r.minimumMpRatio*100)}" onchange="setRecoveryThresholds(EmberwildSecondsCombat.thresholds().minimumHpRatio,Number(this.value)/100)">%</label><small>一般探索勝利後持續恢復，全部上陣成員達到門檻再出發。冷卻與狀態持續計時；特殊關卡依入場規則。</small><button type="button" onclick="openHealingSettings()">${svg('flask-conical')} 自動藥水</button></div></details><label class="seconds-mode-control">狩獵模式<select aria-label="狩獵模式" onchange="setHuntingMode(this.value)"><option value="single" ${mode==='single'?'selected':''}>單怪 · 1 隻</option><option value="group" ${mode==='group'?'selected':''}>群怪 · 3～5 隻</option></select><small>${mode===current?'下一次遭遇依此模式生成':'已變更，下一場生效'} · BOSS／任務依關卡規則</small></label>`;
  html=html.includes('<div class="exploration-categories"')?html.replace('<div class="exploration-categories"',control+'<div class="exploration-categories"'):html.replace('<div class="control-grid">','<div class="control-grid">'+control);
  const h=playerHero(),xp=h?Math.min(100,h.xp/need(h.lv)*100):0;
  const toolbar=`<section class="seconds-adventure-toolbar" aria-label="冒險狀態與快捷操作"><div><b>${esc(characterName(h))} · LV ${h.lv}</b><span>經驗 ${h.xp.toLocaleString()} / ${need(h.lv).toLocaleString()}</span><progress aria-label="等級經驗" value="${xp}" max="100"></progress></div><div class="seconds-toolbar-actions">${explorationControlButtons()}<button type="button" onclick="document.querySelector('.seconds-recovery-settings')?.setAttribute('open','');document.querySelector('.seconds-recovery-settings')?.scrollIntoView({block:'center'})">${svg('sliders-horizontal')}冒險配置</button></div><span data-seconds-phase role="status">${C.phase==='recovery'?'脫戰恢復':'戰鬥待命'}</span><button type="button" data-seconds-toggle aria-pressed="${showCooldowns}" onclick="EmberwildSecondsUI.toggleCooldowns()">${svg('timer')}${showCooldowns?'隱藏冷卻':'顯示冷卻'}</button></section>`;
  return toolbar+html.replace(/第 (\d+(?:\.\d+)?) (?:回合|秒)/g,(_m,n)=>'戰鬥 '+fmt(+n)+' 秒');
 };
 function viewTime(){
  const e=C.timeline;if(!e||!party)return partyClock;
  const next=C.nextSimulationAt,remaining=Math.max(0,next-e.now/1e6);
  const wall=running&&!$('modal').open&&!document.hidden?Date.now():(party.offlineExploration?.lastAt||Date.now());
  const base=nextActionAt-remaining*1000/battleRate;
  return e.now/1e6+Math.min(remaining,Math.max(0,(wall-base)*battleRate/1000));
 }
 function sync(){
  if(tab!=='battle'||!party||document.hidden||EmberwildOffline.busy||globalThis.__EMBERWILD_OFFLINE_SILENT)return;
  const e=C.timeline;if(!e)return;const now=viewTime(),elapsed=Math.max(0,now-e.now/1e6);
  for(const node of showCooldowns?document.querySelectorAll('[data-seconds-actor]'):[]){
   let v;try{v=e.actor(node.dataset.secondsActor);}catch{continue;}
   const s=node.dataset.secondsSkill==='basic'?null:v.skills.find(s=>s.id===node.dataset.secondsSkill),remaining=Math.max(0,(s?s.readyInSeconds:v.basicReadyInSeconds)-elapsed),total=s?s.cooldownSeconds:v.intervalSeconds,resource=s&&v.mp<s.mpCost*(e.find(v.id).mpCostMultiplier||0);
   node.querySelector('.seconds-charge-cover').style.height=Math.min(100,remaining/Math.max(.000001,total)*100)+'%';
   node.querySelector('.seconds-charge-time').textContent=remaining>0?fmt(remaining):resource?'MP不足':v.casting?'待命':'就緒';
   node.classList.toggle('is-ready',remaining<=0&&!resource);node.classList.toggle('needs-mp',!!resource);
  }
  if(C.phase==='recovery')for(const node of document.querySelectorAll('#battleAllyIcons .seconds-unit')){const x=party.members.find(h=>heroKey(h)===node.dataset.combatId);if(!x)continue;const max=battleStats(x).hp,hp=Math.min(max,x.hp+elapsed*max*C.config().recovery.hpFractionPerSecond);node.querySelector('.unit-numbers>span:first-child b').textContent=Math.ceil(hp)+' / '+max;const fill=node.querySelector('.battle-health-fill');if(fill)fill.style.width=hp/max*100+'%';}
  for(const node of document.querySelectorAll('[data-mp-actor]')){let v;try{v=e.actor(node.dataset.mpActor);}catch{continue;}const a=e.find(v.id),mp=Math.min(v.maxMp,v.mp+elapsed*a.definition.mpRegenPerSecond);node.querySelector('span').style.width=mp/v.maxMp*100+'%';node.querySelector('small').textContent='MP '+fmt(mp)+' / '+fmt(v.maxMp);}
  for(const node of document.querySelectorAll('[data-enemy-timer],[data-cast-actor]')){let v;try{v=e.actor(node.dataset.enemyTimer||node.dataset.castActor);}catch{continue;}const cast=v.casting;if(node.dataset.castActor)node.closest('.seconds-unit')?.classList.toggle('seconds-casting',!!cast);node.textContent=cast?'施放 '+(S.byId(cast.skillId)?.name||'技能')+' · '+fmt(Math.max(0,cast.remainingSeconds-elapsed))+'s':node.dataset.enemyTimer?'行動充能 '+fmt(Math.max(0,v.actionReadyInSeconds,v.basicReadyInSeconds)-elapsed)+'s':'';}
  for(const n of document.querySelectorAll('[data-state-until]'))n.textContent=duration(Number(n.dataset.stateUntil)-(n.dataset.stateClock==='wall'?Date.now()/1000:now));
  for(const n of document.querySelectorAll('[data-seconds-phase]'))n.textContent=running?(C.phase==='recovery'?'脫戰恢復 · 達標後繼續探索':'自動戰鬥中'):'探索已暫停';
  const clock=$('seconds-clock');if(clock)clock.textContent=fmt(now)+'s';
 }
 const baseGuide=guideView;guideView=function(){return baseGuide().replace(/每次遭遇結束（勝利或全隊戰敗）後，全隊含候補回滿生命。/g,'一般探索勝利後保留生命、魔力與冷卻，脫戰恢復至設定的隊伍門檻再繼續。全隊戰敗及特殊關卡依原有恢復規則。').replace(/<p>主動技能只受冷卻時間限制；[\s\S]*?<\/p>/,'<p>主動技能冷卻完成、MP 足夠且符合條件時自動施放；瞬發技能不重置普攻，技能依裝備順序判定。被動與原本免費的觸發技能不占行動。</p>').replace(/1倍速每回合至少 \d+(?:\.\d+)? 秒。普攻每回合一次；[\s\S]*?不搶佔普攻。/,'所有單位依速度獨立行動，主動技能與普攻使用獨立時間軸；個別詠唱與動作鎖定依技能設定。冷卻、增減益與持續傷害依戰鬥秒數推進。').replace(/單體或群怪|群怪 · 3～6 隻/g,'單怪 1 隻／群怪 3～5 隻')
  .replace(/<section class="panel"><h2>BUFF／DEBUFF 與消耗品計時<\/h2>[\s\S]*?<\/section>/,'<section class="panel"><h2>BUFF／DEBUFF 與消耗品計時</h2><p>增益、減益與控制依戰鬥秒數倒數。持續回復與持續傷害依各自的觸發間隔結算。附魔藥水依該角色參戰的戰鬥秒數扣時；抗性與屬性增幅藥水使用現實分鐘，暫停、停止或關閉頁面仍會扣時。同名且同效果的藥水累加剩餘時間；不同倍率、屬性或能力加成各自保留狀態並獨立計時。每個狀態最多累積 24 小時，超過時提醒且不消耗道具。</p><p>一般探索勝利後保留護盾與技能冷卻。護盾在耗盡、全隊戰敗或特殊關卡結束時消失。</p></section>')
  .replace(/<section class="panel"><h2>行動回合冷卻<\/h2>[\s\S]*?<\/section>/,'<section class="panel"><h2>技能冷卻與行動</h2><p>主動與輔助技能各自有冷卻秒數，施放後依戰鬥時間倒數，其他單位的行動不影響冷卻。MP 不足時不會施放該技能，普攻與其他可用技能照常進行。</p><p>冷卻完成且符合條件的瞬發技能依裝備順序施放，不重置普攻進度。有詠唱或動作時間的技能，只在設定的秒數內限制該角色的下一個行動。裝備的全技能冷卻詞條與指定技能冷卻詞條可同時生效。</p></section>');};
 const baseShowEffects=showBattleEffects;showBattleEffects=function(...args){const out=baseShowEffects.apply(this,args);for(const p of $('modal')?.querySelectorAll('p.small')||[])if(/依戰鬥回合計時/.test(p.textContent))p.textContent='增益、減益與附魔依戰鬥秒數計時；抗性、屬性增幅依現實時間計時，可在探索控制區獨立停用；暫停、停止與關閉頁面仍會扣時。';return out;};
 const oldBuffRows=battleBuffRows;battleBuffRows=function(){const rows=[...heroes().map(h=>[h,'ally']),...foes.map(e=>[e,'enemy'])].flatMap(([x,side])=>(EmberwildBattleSummary.inspect(id(x),side)?.statuses||[]).map(s=>'<tr><td>'+esc(title(x))+'</td><td>'+esc(s.name)+'</td><td>'+esc(s.detail)+'</td><td>'+esc(s.time||(s.remaining===null?'永久':fmt(s.remaining)+' 秒'))+'</td><td>'+esc(s.clock||'戰鬥秒數')+'</td></tr>'));return rows.join('');};
 const baseTick=tick;tick=function(...args){const out=baseTick(...args);sync();return out;};
 function detail(s,h=state){
  if(!s)return '';const d=t(s);if(!d)return s.description||'';if(!h)return `${s.description||s.name} · 冷卻 ${fmt(d.cooldownSeconds)} 秒 · MP ${fmt(d.mpCost)}`;
  const sources=(s.sources||[]).map(r=>({class:'職業',quest:'任務',equipment:'裝備',companion:'夥伴',starter:'初始'})[r.type]||r.type).filter((v,i,a)=>a.indexOf(v)===i).join('／'),live=view(h)?.skills.find(x=>x.id===s.id),multiplier=view(h)?C.timeline.find(id(h)).mpCostMultiplier:C.resourceProfile(h).cost,mp=d.mpCost*multiplier;
  if(s.type==='passive'){const e=s.eventPassive,base=e?.event==='kill'?`擊殺後以 ${fmt(e.power*100)}% 攻擊追擊生命最低的敵人；最多追加 ${e.maxAttacks} 次，每次原始行動最多一條追擊鏈。`:e?.event==='enemyDeath'?`敵人死亡時，自身主動與輔助冷卻縮減 ${fmt(e.reduction*C.config().classes.find(c=>c.job===h.job).baseIntervalSeconds)} 秒；內部冷卻 ${fmt(e.cooldown*C.config().actionReferenceSeconds)} 秒。`:s.description||s.name;return `${base} · 常駐被動，不占行動${sources?' · 來源：'+sources:''}`;}
  if(h&&!hero(h)){const shared=sharedSkillById(s.id),chance=shared?.meta?.procBaseChance??GS('skills.proc.baseChance',.22);return `${s.description||s.name} · ${s.type==='proc'?'普攻觸發率 '+fmt(chance*100)+'%，不占行動':'主動技能，獨立冷卻'} · 倍率 ${fmt((s.power||0)*100)}% · 最多 ${s.maxTargets||1} 個目標 · 冷卻 ${fmt(live?.cooldownSeconds??d.cooldownSeconds)} 秒 · MP ${fmt(mp)}${d.castSeconds?' · 施法 '+fmt(d.castSeconds)+' 秒':''} · 來源：怪物技能配置`;}
  const cd=live?.cooldownSeconds??(s.type==='support'?supportSkillCooldown(h,s.adapter.index):s.type==='proc'?d.cooldownSeconds:skillCooldown(s.adapter.index,h)),status=s.statusId?C.source.statusDefinitions.find(x=>x.id===s.statusId):null;
  let description=s.adapter.kind==='support'?baseSupportDetail(h?.job??s.adapter.job,s.adapter.index,h):s.adapter.kind==='core'?baseCoreDetail(h?.job??s.adapter.job,s.adapter.index,h):s.description||s.name;
  description=String(description).replace(/ · 冷卻 \d+(?:\.\d+)?(?: 個自身| 戰鬥)? 回合/g,'').replace(/持續 \d+(?:\.\d+)?(?: 戰鬥)? 回合/g,'持續 '+(status?.timing.durationSeconds===null?'永久':fmt(status?.timing.durationSeconds??d.durationSeconds)+' 秒')).replace(/每(?:個自身)?回合/g,'每 '+fmt(status?.timing.triggerIntervalSeconds??d.tickIntervalSeconds)+' 秒').replace(/下回合行動提前/g,'下次行動提前').replace(/回合/g,'秒');
  return `${description}${sources?' · 來源：'+sources:''} · ${s.type==='proc'?'觸發技能，不占行動':'主動技能，獨立冷卻'} · ${s.type==='proc'&&!cd?'觸發冷卻 無':'冷卻 '+fmt(cd)+' 秒'} · MP ${fmt(mp)}${d.castSeconds?' · 施法 '+fmt(d.castSeconds)+' 秒':''}${status?.timing.durationSeconds===null?' · 永久':''}`;
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
 globalThis.EmberwildSecondsUI={sync,detail,field,viewTime,duration,toggleCooldowns,get showCooldowns(){return showCooldowns;}};
 applyPreference();
})();
