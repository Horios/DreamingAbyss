/* Read-only combat presentation. HP and membership always come from combat units.
   Only previous visual samples, DOM nodes and a finished encounter's references
   are retained here; none of these values are saved or used by combat. */
(()=>{
 'use strict';
 let owner=null,terminal=null,previous=new Map(),flashes=new Map(),detailCollapsed=false;
 let retainedSummary=null,retainedField=null,openingAction=null,serial=0;
 const fallbackIds=new WeakMap();
 const monsterArtwork=new Map(),usedArtwork=new Set();let artworkOwner=null;
 const iconPool=[...new Set(['ghost','paw-print','sprout','skull','bot','flame','bug','bird','cat','dog','fish','rabbit','rat','snail','turtle','worm','squirrel',...(globalThis.__EMBERWILD_LUCIDE?.names||[])])];
 const key=e=>{if(e.id!=null)return String(e.id);if(!fallbackIds.has(e))fallbackIds.set(e,'visual-'+(++serial));return fallbackIds.get(e);};
 const finite=n=>Number.isFinite(Number(n))?Number(n):0;
 const fmt=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:1});
 function clear(){terminal=null;retainedField=null;previous.clear();flashes.clear();owner=party;openingAction=lastActionOrder.at(-1)||null;}
 function finish(result){
  // Keep the actual array, including its final HP, even if result cleanup clears
  // the global foes binding. This is O(1), including during offline simulation.
  terminal={owner:party,units:foes,name:currentExplorationName(),result};
 }
 function snapshot(){return globalThis.EmberwildBattleConfiguration?EmberwildBattleConfiguration.combat(snapshotCore):snapshotCore();}
 function snapshotCore(){
  if(owner!==party)clear();
  const ended=terminal?.owner===party&&(!foes.length||terminal.units===foes)?terminal:null;
  const source=party?(ended?.units||foes):[];
  const action=lastActionOrder.at(-1),actingId=(!ended||ended.result==='victory')&&running&&!$('modal')?.open&&action!==openingAction?action?.id:null;
  const allies=party?heroes().map(h=>({id:heroKey(h),unit:h,hp:h.hp,max:stats(h).hp,alive:h.hp>0,acting:h.hp>0&&heroKey(h)===actingId})):[];
  const units=source.map(e=>{
   // maxhp is also the cap used by enemy healing, lifesteal and individual bars.
   const max=Math.max(0,finite(e.maxhp)),hp=Math.min(max,Math.max(0,finite(e.hp)));
   return {id:key(e),unit:e,hp,max,alive:hp>0,acting:hp>0&&key(e)===actingId};
  });
  const hp=units.reduce((n,e)=>n+e.hp,0),max=units.reduce((n,e)=>n+e.max,0);
  let name=ended?.name||currentExplorationName();
  const boss=source.find(e=>e.kind==='boss'||e.kind==='final');if(boss&&!name.includes(boss.name))name+=' · '+boss.name;
  return {units,allies,hp,max,percent:max?hp/max*100:0,alive:units.filter(e=>e.alive).length,total:units.length,
   result:ended?.result||null,name};
 }
 function summaryHTML(){return `<section id="battleSummary" class="battle-summary" aria-label="即時戰鬥摘要"><div class="battle-summary-heading"><b data-summary-name></b><span data-summary-state></span></div><div id="journalEnemyIcons" class="battle-enemy-icons journal-enemy-icons" aria-label="戰報怪物圖示"></div><div class="battle-summary-hp"><b>敵方總血量</b><span data-summary-hp></span></div><div class="battle-summary-meter" role="progressbar" aria-label="敵方剩餘生命值" aria-valuemin="0" aria-valuemax="100"><span></span></div><div class="battle-summary-foot"><span data-summary-count></span><span data-summary-percent></span><button type="button" class="battle-details-toggle" onclick="EmberwildBattleSummary.toggleDetails()"></button></div></section>`;}
 const baseMonsterName=e=>{const name=String(e.name||e.monsterId||'怪物');return e.kind==='elite'?name.replace(/^菁英[・·．\s]*/,''):name;};
 function artwork(e){
  if(artworkOwner!==party){monsterArtwork.clear();usedArtwork.clear();artworkOwner=party;}
  const name=baseMonsterName(e);if(monsterArtwork.has(name))return monsterArtwork.get(name);
  let html=enemyArt(e);
  // Cache visual assignments only. Different names never share the same SVG;
  // elite variants share their base monster's artwork and receive a badge.
  if(!html||usedArtwork.has(html)){
   const preferred={beast:'paw-print',plant:'sprout',undead:'skull',construct:'bot',demon:'flame',spirit:'ghost'}[e.race]||'ghost';
   for(const glyph of [preferred,...iconPool]){
    const icons=globalThis.__EMBERWILD_SKILL_ICONS;if(!icons?.hasIcon('lucide:'+glyph))continue;
    html=icons.svgFor('lucide:'+glyph,[],{size:32});if(!usedArtwork.has(html))break;html='';
   }
  }
  html=html||__EMBERWILD_SKILL_ICONS.svgFor('lucide:ghost',[],{size:32});monsterArtwork.set(name,html);usedArtwork.add(html);return html;
 }
 const put=(root,selector,value)=>{const n=root.querySelector(selector);if(n&&n.textContent!==value)n.textContent=value;};
 function sample(s,animate){
  let event='';const next=new Map(),now=Date.now();
  for(const row of s.units){
   const before=previous.get(row.id);let effect='',label='';
   if(animate&&!s.result){
    if(!before&&previous.size){effect='joined';label='援軍加入';}
    else if(before){
     if(!before.alive&&row.alive){effect='revived';label='復活';}
     else if(before.alive&&!row.alive){effect='dead';label='已擊敗';}
     else if(row.hp>before.hp){effect='healed';label='+'+fmt(row.hp-before.hp)+' HP';}
     else if(row.hp<before.hp){effect='hit';}
    }
   }
   if(effect){flashes.set(row.id,{effect,label,until:now+800});if(effect!=='hit')event=effect==='joined'?'援軍加入':effect==='revived'?'敵方復活':effect==='healed'?'敵方治療':event;}
   if(flashes.get(row.id)?.until<=now)flashes.delete(row.id);
   next.set(row.id,{hp:row.hp,alive:row.alive});
  }
  for(const id of flashes.keys())if(!next.has(id))flashes.delete(id);
  previous=next;
  return event||([...flashes.values()].some(x=>x.effect==='joined')?'援軍加入':[...flashes.values()].some(x=>x.effect==='revived')?'敵方復活':[...flashes.values()].some(x=>x.effect==='healed')?'敵方治療':'');
 }
 function updateRoster(root,s,ally=false){
  const rows=ally?s.allies:s.units,attribute=ally?'heroId':'enemyId';
  const integrated=root.classList.contains('squad-allies')||root.classList.contains('squad-enemies');
  const nodes=new Map([...root.querySelectorAll(integrated?'.unit > .battle-enemy-icon':':scope > .battle-enemy-icon')].map(n=>[n.dataset[attribute],n]));
  const names=new Map();for(const row of rows)names.set(row.unit.name,(names.get(row.unit.name)||0)+1);
  const indices=new Map();
  rows.forEach((row,index)=>{
   const e=row.unit,num=(indices.get(e.name)||0)+1;indices.set(e.name,num);
   const name=ally?characterName(e):e.name+(names.get(e.name)>1?num:'');
   let node=nodes.get(row.id);
   if(!node){node=document.createElement('button');node.type='button';node.onclick=()=>globalThis.EmberwildBattleSummary.showUnit(row.id,ally?'ally':'enemy');node.dataset[attribute]=row.id;node.className='battle-enemy-icon'+(ally?' battle-ally-icon':'');node.innerHTML='<span class="enemy-icon-art"></span><small></small><span class="enemy-icon-event"></span><span class="enemy-icon-elite" aria-hidden="true">'+__EMBERWILD_SKILL_ICONS.svgFor('lucide:gem',[],{size:12})+'</span>';}
   const artKey=ally?EmberwildAvatars.resolvedId(e):[baseMonsterName(e),e.monsterId,e.mat,e.element,e.icon,e.race].join('|');
   if(node.dataset.artKey!==artKey){node.querySelector('.enemy-icon-art').innerHTML=ally?EmberwildAvatars.control(e).replace(/^<button[^>]*>/,'<span class="battle-avatar-art" data-avatar-id="'+EmberwildAvatars.resolvedId(e)+'">').replace(/<\/button>$/,'</span>'):artwork(e);node.dataset.artKey=artKey;}
   const flash=ally?null:flashes.get(row.id),state=row.alive?(row.acting?'目前行動':'存活'):ally?'倒下':'已擊敗';
   node.classList.toggle('is-dead',!row.alive);node.classList.toggle('is-acting',row.acting);node.classList.toggle('is-boss',!ally&&(e.kind==='boss'||e.kind==='final'));
   node.classList.toggle('is-elite',!ally&&e.kind==='elite');
   node.dataset.effect=flash?.effect||'';
   node.title=name+' · '+state+(ally?'':' · '+fmt(row.hp)+' / '+fmt(row.max)+' HP');node.setAttribute('aria-label',name+' · 查看戰鬥詳細資訊');
   put(node,'small',!ally&&names.get(e.name)>1?String(num):'');put(node,'.enemy-icon-event',flash?.label||(!row.alive?state:''));
   if(integrated){
    const card=[...root.querySelectorAll(':scope > .unit')].find(n=>n.dataset.combatId===row.id);
    if(card){if(node.parentNode!==card)card.prepend(node);card.classList.toggle('fallen',!row.alive);card.classList.toggle('is-current',row.acting);}
   }else if(root.children[index]!==node)root.insertBefore(node,root.children[index]||null);
   nodes.delete(row.id);
  });
  for(const node of nodes.values())node.remove();
 }
 function sync({animate=true}={}){
  if(globalThis.__EMBERWILD_OFFLINE_SILENT||document.hidden)return;
  const summary=document.getElementById('battleSummary'),roster=document.getElementById('battleEnemyIcons'),allies=document.getElementById('battleAllyIcons'),journalIcons=document.getElementById('journalEnemyIcons');
  if(!party||!summary?.isConnected&&!roster?.isConnected&&!allies?.isConnected)return;
  const s=globalThis.EmberwildBattleEffects?.present(snapshot())||snapshot(),event=sample(s,animate);
  if(tab==='battle'&&!globalThis.EmberwildBattleEffects?.holdingEncounter&&foes.length){
   const expected=[...s.allies,...s.units].map(r=>r.id).sort().join('|'),actual=[...document.querySelectorAll('.squad-field :is(.squad-allies,.squad-enemies) > .unit[data-combat-id]')].map(n=>n.dataset.combatId).sort().join('|');
   // The input guard may defer a page redraw until the current click/scroll
   // finishes. It already queues that redraw; recursively requesting it here
   // would keep observing the previous page and overflow the stack.
   if(actual!==expected){if(!globalThis.isEmberwildUIInteracting?.())render();return;}
  }
  const status=s.result==='victory'?'戰鬥勝利':s.result==='wipe'?'戰鬥失敗':!s.total?(running?'搜尋敵人':'尚未探索'):!running?'戰鬥暫停':$('modal')?.open?'視窗暫停':round>0&&!roundIterator&&!combatRoundProgress&&foes.some(e=>e.hp>0)?(globalThis.EmberwildSecondsCombat?.phase==='recovery'?'脫戰恢復':'行動充能'):event||'戰鬥中';
  if(summary){
   put(summary,'[data-summary-name]',s.name);summary.querySelector('[data-summary-name]').title=s.name;put(summary,'[data-summary-state]',status);
   put(summary,'[data-summary-hp]',fmt(s.hp)+' / '+fmt(s.max));
   put(summary,'[data-summary-count]','存活怪物：'+s.alive+' / '+s.total);
   put(summary,'[data-summary-percent]',s.percent.toFixed(1).replace(/\.0$/,'')+'%');
   const meter=summary.querySelector('[role="progressbar"]'),fill=meter.querySelector('span');
   const width=s.percent+'%';if(fill.style.width!==width)fill.style.width=width;
   meter.setAttribute('aria-valuenow',String(s.percent));meter.setAttribute('aria-valuetext',fmt(s.hp)+' / '+fmt(s.max)+' HP');
   summary.dataset.result=s.result||'';
   const button=summary.querySelector('.battle-details-toggle');button.textContent=detailCollapsed?'展開戰報':'收合戰報';button.setAttribute('aria-expanded',String(!detailCollapsed));
   summary.closest('.global-battle-journal')?.classList.toggle('journal-details-collapsed',detailCollapsed);
  }
  if(roster)updateRoster(roster,s);
  if(allies)updateRoster(allies,s,true);
  if(journalIcons)updateRoster(journalIcons,s);
  globalThis.EmberwildBattleEffects?.sync(s);
 }
 // The inspector reads the exact combat unit, never a catalogue-only replacement.
 const pct=n=>fmt(finite(n)*100)+'%';
 const controlLabels={polymorph:'變形',freeze:'冰凍',frost:'結霜',rage:'狂暴',fear:'恐懼',tauntRage:'嘲諷狂暴'};
 const effectLabels={attack:'攻擊提升',power:'技能威力提升',guard:'傷害減免',fracture:'防禦降低',weaken:'攻擊降低',vulnerable:'承受傷害增加',damageAmp:'承受傷害增加',critical:'暴擊率提升',regen:'持續恢復最大生命',slow:'速度降低',followup:'追打',dotAttack:'持續傷害（攻擊倍率）',dotMaxHp:'持續傷害（最大生命比例）'};
 function inspect(id,side){
  const s=snapshot(),ally=side==='ally',rows=ally?s.allies:s.units,row=rows.find(x=>x.id===String(id));if(!row)return null;
  const u=row.unit,v=ally?battleStats(u):enemyBattleStats({...u}),skills=[],statuses=[];
  if(ally){
   const S=globalThis.__EMBERWILD_SKILLS;
   for(const sk of S.system().definitions){
    if(sk.type==='passive'||!S.learned(u,sk))continue;
    const a=EmberwildSkillSystem.adapterFor(sk,u.job),configured=(sk.type==='support'?u.supportSlots:sk.type==='proc'?u.procSlots:u.active)?.includes(a.index),box=sk.type==='support'?supportCooldowns:actorCooldowns;
    skills.push({id:sk.id,name:sk.name,type:sk.type,configured,remaining:sk.type==='proc'?0:cooldownLeft(box,memberKey(u)+'-'+a.index),detail:withHero(u,()=>sk.description||(a.kind==='support'?supportSkillDetail(u.job,a.index,u):coreSkillDetail(u.job,a.index,u))),cooldown:sk.type==='proc'?0:sk.type==='support'?supportSkillCooldown(u,a.index):skillCooldown(a.index,u)});
   }
   for(const sk of globalThis.__EMBERWILD_COMPANION_TEST_API?.passivesFor(u)||[])skills.push({id:sk.id,name:sk.name,type:'passive',configured:true,remaining:0,cooldown:0,detail:[sk.description,...(sk.effects||[]).map(EmberwildPassives.effectText)].filter(Boolean).join(' · ')});
  }else{
   const assignment=GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id===u.monsterId)?.skillAssignments||[],box=globalThis.EmberwildEnemyCombatState?.pack()?.[u.id]||{};
   for(const a of assignment){
    const sk=sharedSkillById(a.skillId);if(!sk)continue;
    const configured=sk.meta?.partnerId==null&&u.lv>=sk.requiredLevel&&sharedSkillScopeAllowsEnemy(sk.usageScope,u.kind);
    skills.push({id:sk.id,name:sk.name,type:sk.activation,configured,remaining:cooldownLeft(box,sk.id),cooldown:sk.cooldown,detail:sk.meta.description||`${ELEMENTS[sk.element]||sk.element}屬性 · 倍率 ${pct(sk.power)} · 最多 ${sk.maxTargets} 目標`});
   }
  }
  for(const h of heroes())for(const sk of globalThis.__EMBERWILD_COMPANION_TEST_API?.passivesFor(h)||[])if(ally?(sk.target==='self'&&h===u||sk.target==='allies'&&h.hp>0):sk.target==='enemies'&&h.hp>0&&u.hp>0){
   statuses.push({name:sk.name,polarity:sk.kind==='debuff'?'debuff':'buff',detail:(sk.effects||[]).map(EmberwildPassives.effectText).join(' · '),time:'常駐被動',source:characterName(h)});
  }
  for(const e of effects)if(e.target===row.id&&e.until>partyClock){
   const taunt=e.kind==='skillTaunt',source=party.members.find(h=>memberKey(h)===(e.sourceKey??e.source)),target=taunt?party.members.find(h=>String(memberKey(h))===String(e.value)):null;
   statuses.push({name:e.name||effectLabels[e.kind]||e.kind,polarity:['weaken','fracture','vulnerable','damageAmp','dotAttack','dotMaxHp','skillTaunt','slow'].includes(e.kind)?'debuff':'buff',detail:taunt?'優先攻擊 '+(target?characterName(target):String(e.value)):(effectLabels[e.kind]||e.kind)+' '+pct(e.value),remaining:Math.max(0,Math.ceil(e.until-partyClock)),source:source?characterName(source):''});
  }
  for(const e of globalThis.EmberwildStatusCombatState?.pack().active||[])if(e.targetKey===row.id&&e.expiresClock>partyClock&&(e.remainingUses==null||e.remainingUses>0)){
   // Immune controls have no effect unless their real control state exists.
   if(e.definition.control&&!e.definition.modifiers?.length&&!e.definition.periodic?.length&&!globalThis.__EMBERWILD_CONTROL_TEST_API?.states?.[u.id]?.[e.definition.control.kind])continue;
   const api=globalThis.__EMBERWILD_STATUS_TEST_API;
   statuses.push({name:e.name,polarity:api.polarity(e.definition),detail:api.tooltip(e.definition),remaining:e.definition.permanent?null:api.remainingTurns(e),time:e.definition.permanent?'永久':null,uses:e.remainingUses,source:e.sourceName});
  }
  if(!ally)for(const [kind,c] of Object.entries(globalThis.__EMBERWILD_CONTROL_TEST_API?.states?.[u.id]||{}))if(c&&(c.turns===undefined||c.turns>0)){
   const bits=[];if(c.shield!==undefined)bits.push('變形護盾 '+fmt(c.shield));if(c.slowPct!==undefined)bits.push('速度降低 '+pct(c.slowPct));if(c.damageReduction!==undefined)bits.push('傷害降低 '+pct(c.damageReduction));if(c.skipChance!==undefined)bits.push('無法行動機率 '+pct(c.skipChance));if(c.basicAttackBonus!==undefined)bits.push('普攻加成 '+pct(c.basicAttackBonus));
   statuses.push({name:controlLabels[kind]||kind,polarity:kind==='rage'?'buff':'debuff',detail:bits.join(' · '),remaining:c.turns??null});
  }
  if(ally)for(const kind of ['imbue','ward','elementTonic'])for(const b of (EmberwildTimedBoosts.ELEMENTAL_TYPES.includes(kind)?EmberwildTimedBoosts.buffRows(u[kind]):u[kind]?[u[kind]]:[])){
   if(EmberwildTimedBoosts.ELEMENTAL_TYPES.includes(kind)?!(b.enabled&&EmberwildTimedBoosts.remainingMs(b)>0):!(b.remainingTurns>0))continue;
   const d=supplyBuffDetails(b,kind);statuses.push({name:d.name,polarity:'buff',detail:d.detail,time:d.time,clock:d.clock,clockType:kind==='imbue'?'battle':'wall',remaining:kind==='imbue'?b.remainingTurns:EmberwildTimedBoosts.remainingMs(b)/1000});
  }
  // Party-wide timed boosts apply to every active member; show their real remaining time.
  if(ally&&heroes().includes(u))for(const b of globalThis.EmberwildTimedBoosts?.active(party)||[])statuses.push({name:b.name,polarity:'buff',detail:(EmberwildTimedBoosts.LABELS[b.boostType]||b.boostType)+'＋'+b.bonusPercent+'% · 全隊',clock:'現實時間',clockType:'wall',remaining:EmberwildTimedBoosts.remainingMs(b)/1000,source:'全隊'});
  const controls=globalThis.__EMBERWILD_CONTROL_TEST_API?.states?.[u.id]||{},max=ally?v.hp:row.max,hp=Math.max(0,Math.min(max,finite(u.hp)));
  const same=rows.filter(x=>x.unit.name===u.name),name=ally?characterName(u):u.name+(same.length>1?same.indexOf(row)+1:'');
  return {id:row.id,side:ally?'ally':'enemy',name,level:u.lv,kind:ally?(u.companionId===undefined?'主角':'夥伴'):({normal:'普通怪物',elite:'菁英怪物',boss:'BOSS',final:'最終 BOSS'}[u.kind]||'怪物'),alive:hp>0,hp,max,shield:Math.max(0,finite(u.shield)),controlShield:Math.max(0,finite(controls.polymorph?.shield)),element:ally?weaponElement(u):u.element,race:ally?null:u.race,stats:{...v},skills,statuses,nextActiveDamageBonus:Math.max(0,finite(u.nextActiveDamageBonus)),advanceSteps:Math.max(0,finite(ally?u.procAdvanceSteps:u.sharedAdvanceSteps))};
 }
 function showUnit(id,side){
  const d=globalThis.EmberwildSecondsCombat?.active?globalThis.EmberwildBattleSummary.inspect(id,side):inspect(id,side);if(!d)return false;
  const statNames={atk:'攻擊力',def:'防禦力',speed:'速度',crit:'暴擊率',critDamage:'暴擊傷害',pierce:'防禦穿透',defenseIgnore:'防禦無視',lifesteal:'生命竊取',evasion:'閃避率',elementBonus:'全屬性增傷',bossDamage:'BOSS 增傷'},ratios=new Set(['crit','critDamage','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage']);
  const statRows=Object.entries(statNames).map(([k,n])=>[n,ratios.has(k)?pct(d.stats[k]):fmt(finite(d.stats[k]))]);
  for(const [k,label,names] of [['elementDamage','屬性增傷',ELEMENTS],['resist','屬性抗性',ELEMENTS],['raceDamage','種族增傷',RACES]])for(const [target,value] of Object.entries(d.stats[k]||{}))statRows.push([(names[target]||target)+' · '+label,pct(value)]);
  const labels={active:'主動',proc:'普攻觸發',support:'輔助',passive:'被動'},polarity={buff:'增益',debuff:'減益',neutral:'狀態'};
  const modal=$('modal');modal.classList.add('battle-unit-dialog');
  modal.innerHTML=`<div class="battle-unit-inspector"><h2>${esc(d.name)} · 戰鬥詳細資訊</h2><p>LV ${esc(String(d.level??'—'))} · ${esc(d.kind)} · ${d.alive?'存活':'已倒下／擊敗'} · ${esc(ELEMENTS[d.element]||d.element||'無')}屬性${d.race?' · '+esc(RACES[d.race]||d.race):''}</p><p class="battle-unit-vitals"><b>生命 ${fmt(d.hp)} / ${fmt(d.max)}</b><span>護盾 ${fmt(d.shield)}</span>${d.controlShield?'<span>變形護盾 '+fmt(d.controlShield)+'</span>':''}</p><h3>目前戰鬥能力</h3><dl class="battle-unit-stat-grid">${statRows.map(([label,value])=>`<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>${d.nextActiveDamageBonus?'<p>下一次主動技能增傷 '+pct(d.nextActiveDamageBonus)+'</p>':''}${d.advanceSteps?'<p>下回合行動提前 '+d.advanceSteps+' 格</p>':''}<h3>持有技能與冷卻</h3><div class="battle-unit-skill-list">${d.skills.map(sk=>`<article><b>${esc(sk.name)}</b><span>${labels[sk.type]||esc(sk.type)} · ${!sk.configured?'未配置／不符合使用條件 · ':''}${sk.type==='proc'?'普攻時判定觸發':sk.type==='passive'?'持續生效':sk.remaining>0?'剩餘冷卻 '+sk.remaining+' 個自身回合':'就緒'}${sk.cooldown?' · 冷卻 '+sk.cooldown+' 回合':''}</span><p>${esc(sk.detail)}</p></article>`).join('')||'<p>未持有技能，使用普通攻擊。</p>'}</div><h3>目前增益與減益</h3><div class="battle-unit-status-list">${d.statuses.map(e=>`<article data-polarity="${esc(e.polarity)}"><b>${esc(e.name)} · ${polarity[e.polarity]||'狀態'}</b><p>${esc(e.detail)}</p><small>${esc(e.time|| (e.remaining===null?'持續至解除／戰鬥結束':'剩餘 '+e.remaining+' 戰鬥回合'))}${e.clock?' · '+esc(e.clock):''}${e.uses!=null?' · 剩餘 '+e.uses+' 次':''}${e.source?' · 來源：'+esc(e.source):''}</small></article>`).join('')||'<p>目前無增益或減益。</p>'}</div><p class="small">開啟視窗時戰鬥暫停。冷卻依該單位自身回合計算，增減益依各自標示的時間計算。</p><button type="button" class="primary" onclick="closeModal()">關閉</button></div>`;
  if(!modal.open)modal.showModal();return true;
 }
 $('modal').addEventListener('close',()=>$('modal').classList.remove('battle-unit-dialog'));
 function toggleDetails(){detailCollapsed=!detailCollapsed;sync({animate:false});}
 globalThis.EmberwildBattleSummary={snapshot,sync,finish,toggleDetails,inspect,showUnit,artwork};
 const journalBase=sharedBattleJournal;
 sharedBattleJournal=function(){const html=journalBase();return html.replace('<div class="journal-resizer"',summaryHTML()+'<div class="journal-resizer"');};
 const battleBase=battleView;
 battleView=function(){
  const s=snapshot();
  let html=battleBase().replace('<section class="squad-enemies">','<section id="battleEnemyIcons" class="squad-enemies" aria-label="參戰怪物圖示">')
   .replace('<section class="squad-allies">','<section id="battleAllyIcons" class="squad-allies" aria-label="出戰隊員圖示">')
   .replace(/<button\b[^>]*class="character-avatar-control[^\"]*"[\s\S]*?<\/button>/g,'');
  if(s.result&&!foes.length)html=html.replace(/<p class="empty">尚無遭遇[\s\S]*?<\/p>/,
   `<p class="empty">${s.result==='victory'?'戰鬥勝利':'戰鬥失敗'}<br>本場怪物狀態保留至下一場遭遇。</p>`);
  return html;
 };
 const beginBase=beginBattleStatistics;
 beginBattleStatistics=function(...args){clear();return beginBase(...args);};
 for(const name of ['resetEncounter','resetSession','loadParty']){
  const base=globalThis[name];globalThis[name]=function(...args){clear();const out=base.apply(this,args);clear();return out;};
 }
 const renderBase=render;
 render=function(...args){
  if(globalThis.__EMBERWILD_OFFLINE_SILENT)return renderBase(...args);
  retainedSummary=document.getElementById('battleSummary')||retainedSummary;
  const oldField=document.querySelector('.squad-field')||retainedField;
  const cards=new Map([...(oldField?.querySelectorAll('.unit[data-combat-id]')||[])].map(n=>[n.dataset.combatId,n]));
  const out=renderBase(...args);
  for(const [id,old] of [['battleSummary',retainedSummary]]){
   const fresh=document.getElementById(id);if(fresh&&old&&fresh!==old)fresh.replaceWith(old);
  }
  const freshField=document.querySelector('.squad-field');
  if(freshField&&oldField&&(globalThis.EmberwildBattleEffects?.holdingEncounter||terminal?.owner===party&&!foes.length&&terminal.units.length)){freshField.replaceWith(oldField);}
  else for(const fresh of freshField?.querySelectorAll('.unit[data-combat-id]')||[]){
   const old=cards.get(fresh.dataset.combatId);if(!old||old===fresh)continue;
   // Keep the exact portrait and running effect nodes through full screen redraws.
   const portrait=[...old.children].find(n=>n.matches('.battle-enemy-icon'));
   for(const child of [...old.children])if(!child.matches('.battle-enemy-icon,.battle-fx,.battle-fx-status')||child.matches('.battle-enemy-icon')&&child!==portrait)child.remove();
   if(portrait)for(const child of [...fresh.children])if(child.matches('.battle-enemy-icon'))child.remove();
   old.append(...fresh.children);old.className=fresh.className;old.style.cssText=fresh.style.cssText;fresh.replaceWith(old);
  }
  retainedField=document.querySelector('.squad-field')||retainedField;
  sync();return out;
 };
 const refreshBase=refreshGlobalJournal;
 refreshGlobalJournal=function(...args){const out=refreshBase(...args);sync();return out;};
 const tickBase=tick;
 // The shared timeline publishes each visible event through render/journal.
 // Do not rescan all portraits on its idle 50ms scheduling checks.
 tick=function(...args){const out=tickBase(...args);if(!globalThis.EmberwildOffline)sync();return out;};
 if(party)render();
})();
