/* Read-only presentation of the existing live timeline. No timers schedule combat.
   Nested scopes checkpoint actual HP/shield/status writes exactly once, including
   heals and procs inside damage resolvers. Offline events never open a frame. */
(()=>{
 'use strict';
 const storageKey='emberwild-battle-effects',choices=['full','simple','off'];
 let preference='full',frame=null,pending=null,owner=null,encounter=null,sequence=0,staged=null,held=null;
 const timers=new Set();
 function later(fn,ms){const timer=setTimeout(()=>{timers.delete(timer);fn();},ms);timers.add(timer);return timer;}
 const activeNodes=new Map(),markedNodes=new Set(),motion=matchMedia('(prefers-reduced-motion: reduce)');
 try{const saved=localStorage.getItem(storageKey);if(choices.includes(saved))preference=saved;}catch{}
 const id=u=>u?.job!==undefined?heroKey(u):u?.id;
 const visible=()=>!!party&&tab==='battle'&&!document.hidden&&!$('modal')?.open&&!globalThis.isEmberwildTitleOpen?.()&&!globalThis.EmberwildOffline?.busy&&!party.offlineExploration?.receipt;
 const mode=()=>preference==='full'&&(motion.matches||battleRate>2)?'simple':preference;
 const control=u=>globalThis.__EMBERWILD_CONTROL_TEST_API?.states?.[u.id]||{};
 function shields(u){return Math.max(0,Number(u.shield)||0)+Math.max(0,Number(control(u).polymorph?.shield)||0);}
 function statuses(){
  const rows=new Map(),add=(key,target,polarity,ref,kind)=>rows.set(key,{target,polarity,ref,kind});
  for(const e of effects)if(e.until>partyClock)add(e,e.target,['weaken','fracture','vulnerable','damageAmp','followup','dotAttack','dotMaxHp','skillTaunt','slow','skillSlow'].includes(e.kind)?'debuff':'buff',e);
  for(const e of globalThis.EmberwildStatusCombatState?.pack().active||[])if(e.expiresClock>partyClock&&(e.remainingUses===null||e.remainingUses>0)){
   // Pure controls are represented by their actual control state below. A
   // persisted status record alone does not mean an immune boss was frozen.
   if(e.definition.control&&!e.definition.modifiers?.length&&!e.definition.periodic?.length)continue;
   add(e.id,e.targetKey,globalThis.__EMBERWILD_STATUS_TEST_API.polarity(e.definition),e);
  }
  for(const u of foes)for(const [kind,v] of Object.entries(control(u)))if(v&&(v.turns===undefined||v.turns>0))add(u.id+':'+kind,u.id,kind==='rage'?'buff':'debuff',v,kind);
  return rows;
 }
 function units(){return [...heroes(),...foes];}
 function sample(){return new Map(units().map(u=>[u,{hp:u.hp,shield:shields(u)}]));}
 function enqueue(type,target,extra={}){
  if(!frame||!target)return;
  const key=String(target)+'|'+type;
  // Coalesce repeated multi-hit particles per unit/type, keeping the latest
  // occurrence in resolution order. Later AoE targets and shield breaks survive.
  frame.events.delete(key);
  if(frame.events.size>=256)frame.events.delete(frame.events.keys().next().value);
  frame.events.set(key,{type,target:String(target),critical:!!frame.context.critical,periodic:!!frame.context.periodic,source:frame.context.source?String(id(frame.context.source)):null,category:eventCategory(type),...extra});
 }
 function attackType(ctx){
  const element=ctx.element;
  if(element&&element!=='physical')return ['fire','ice','lightning','thunder','wind','light','shadow'].includes(element)?(element==='thunder'?'lightning':element):'magic';
  return ctx.ranged?'ranged':element==='physical'?'slash':'impact';
 }
 function checkpoint(){
  if(!frame)return;
  const ctx=frame.context;
  for(const u of units()){
   const before=frame.vitals.get(u),after={hp:u.hp,shield:shields(u)};frame.vitals.set(u,after);if(!before||ctx.mode==='settlement')continue;
   const target=id(u);if(!target)continue;
   if(after.shield>before.shield)enqueue('shield',target);
   if(after.shield<before.shield){
    const hit=ctx.mode==='damage';enqueue(hit?'absorb':'dissolve',target);
    if(hit&&after.shield<=0)enqueue('break',target);
   }
   if(after.hp<before.hp){enqueue(ctx.periodic?'dot':attackType(ctx),target);enqueue('hit',target);}
   else if(after.hp>before.hp){const kind=ctx.mode==='potion'?'potion':ctx.mode==='damage'||ctx.effect==='drain'?'drain':ctx.mode==='regen'?'regen':'heal';enqueue(kind,target,kind==='regen'?{label:'+'+Math.max(1,Math.round(after.hp-before.hp))+' HP'}:{});}
   // A shield-only attack has an impact on the shield, never a red HP hit.

  }
  const next=statuses();
  for(const [key,row] of next)if(frame.statuses.get(key)?.ref!==row.ref&&row.polarity!=='neutral'){
   const unit=units().find(u=>String(id(u))===String(row.target));
   if(unit?.hp>0)enqueue(row.polarity,row.target);
  }
  frame.statuses=next;
 }
 function scope(context,fn){
  if(!frame)return fn();
  checkpoint();const current=frame,old=current.context;if(context.mode==='settlement')current.terminalVitals=sample();current.context={...old,...context};
  try{return fn();}finally{if(frame===current){checkpoint();current.context=old;}}
 }
 // v0.094: HP written inside quiet() (per-second recovery regeneration) plays no effect. Only the HP baseline of the
 // open frame moves by the same amount; no checkpoint runs, so earlier pending changes and combat state are untouched.
 function quiet(fn){
  if(!frame)return fn();
  const before=new Map(units().map(u=>[u,u.hp]));
  try{return fn();}finally{if(frame)for(const [u,hp] of before){const row=frame.vitals.get(u);if(row&&u.hp!==hp)frame.vitals.set(u,{...row,hp:row.hp+(u.hp-hp)});}}
 }
 function begin(){
  pending=null;
  if(preference==='off'||!visible()){frame=null;return;}
  owner=party;encounter=foes;
  frame={events:new Map(),initial:sample(),vitals:sample(),statuses:statuses(),context:{mode:'regen'},at:performance.now(),owner:party,encounter:foes};
 }
 function end(){if(!frame)return;checkpoint();if(frame.events.size)pending=frame;frame=null;}
 function result(type,target,source,details={}){if(frame)enqueue(type,id(target),{...details,source:source?id(source):null});}
 function cleanNode(node){const entries=activeNodes.get(node);if(entries)for(const row of entries.values()){clearTimeout(row.timer);row.element.remove();}activeNodes.delete(node);}
 function clear(){frame=null;pending=null;staged=null;held=null;for(const t of timers)clearTimeout(t);timers.clear();for(const node of activeNodes.keys())cleanNode(node);for(const node of markedNodes){node.querySelector(':scope > .battle-fx-status')?.remove();delete node.dataset.fxShield;}markedNodes.clear();owner=null;encounter=null;}
 const palette={damage:{color:'#ff796f',rgb:'255,121,111'},buff:{color:'#f4d58b',rgb:'244,213,139'},shield:{color:'#f2f5ff',rgb:'242,245,255'},recovery:{color:'#87efad',rgb:'135,239,173'},debuff:{color:'#c495f0',rgb:'196,149,240'}};
 function eventCategory(type){
  if(['shield','absorb','break','dissolve','shield-impact','evade','resist'].includes(type))return 'shield';
  if(['heal','regen','potion','drain'].includes(type))return 'recovery';
  if(['debuff','skip','polymorph','freeze','frost','fear','tauntRage'].includes(type))return 'debuff';
  return ['buff','rage','cast'].includes(type)?'buff':'damage';
 }
 function castCategory(sk){
  const effect=sk?.[5]||sk?.effect||sk?.kind,meta=sk?.[6]||sk?.meta||sk;
  if(['damage','drain'].includes(effect))return 'damage';
  if(['heal','regen','revive'].includes(effect))return 'recovery';
  if(['shield','shieldLowest'].includes(effect))return 'shield';
  if(effect==='applyStatus'){const api=globalThis.__EMBERWILD_STATUS_TEST_API,def=api?.definitions?.find(d=>d.id===meta?.statusId);return api?.polarity(def)==='debuff'?'debuff':'buff';}
  return ['polymorph','freeze','frost','fear','tauntRage','slow','skillSlow','weaken','fracture','vulnerable','damageAmp','followup','dotAttack','dotMaxHp','dispel'].includes(effect)?'debuff':'buff';
 }
 const graphics={
  slash:'<path d="M9 49Q20 9 55 12Q30 20 9 49Z" fill="currentColor"/><path d="M10 53L53 10"/>',
  ranged:'<path d="M7 49L53 14M38 14H53V29M9 36L19 46M15 30L25 40"/>',
  fire:'<path d="M32 5C42 24 53 25 48 43C44 58 18 60 14 43C9 29 26 28 25 15L32 27Z" fill="currentColor" stroke="none"/><path d="M32 32Q46 49 30 54Q18 48 32 32" stroke="currentColor"/><path d="M9 14L5 6M52 13L58 5M56 42L62 46"/>',
  ice:'<path d="M32 4L43 24L32 58L21 24ZM5 28L20 38L10 55ZM52 26L61 42L46 55Z"/><path d="M4 14L15 20M50 8L45 18"/>',
  lightning:'<path d="M40 3L15 33L32 30L22 61L51 23L34 26Z" fill="currentColor"/><path d="M8 9L14 19M51 47L59 55"/>',
  heal:'<path d="M28 17H36V26H45V34H36V43H28V34H19V26H28Z" fill="currentColor" stroke="none"/><path d="M10 49V42M52 47V37M21 58V52M43 57V51"/><circle cx="32" cy="32" r="27" opacity=".45"/>',
  shield:'<path d="M32 5L54 13V31Q53 49 32 59Q11 49 10 31V13Z" fill="currentColor" fill-opacity=".15"/><path d="M32 12L46 18V31Q45 43 32 51"/>',
  absorb:'<ellipse cx="32" cy="32" rx="27" ry="23"/><circle cx="32" cy="32" r="15"/><path d="M23 32H41M32 23V41"/>',
  break:'<path d="M22 8L28 23L12 21ZM39 7L53 19L36 24ZM8 34L24 30L18 51ZM39 31L57 39L45 55ZM28 43L36 47L30 61Z" fill="currentColor" fill-opacity=".6"/>',
  buff:'<path d="M13 48V23M7 29L13 22L19 29M32 54V9M25 17L32 9L39 17M51 48V23M45 29L51 22L57 29"/><circle cx="23" cy="38" r="2"/><circle cx="42" cy="35" r="2"/>',
  debuff:'<path d="M6 16Q32 4 58 16M12 30Q32 18 52 30M20 44Q32 36 44 44M32 31V55M25 47L32 55L39 47"/>',
  evade:'<path d="M7 18H30M3 32H23M7 46H30M35 14L51 32L35 50"/>',
  resist:'<path d="M32 5L53 13V32Q50 48 32 58Q14 48 11 32V13Z"/><path d="M21 31L29 39L44 23"/>',
  magic:'<circle cx="32" cy="32" r="23"/><path d="M32 4L37 26L59 32L37 38L32 60L26 38L4 32L26 26Z"/>',
  polymorph:'<path d="M12 42Q4 23 23 14Q44 4 53 26Q61 48 39 53Q21 57 20 38Q19 22 35 24Q47 26 40 37Q36 43 31 37"/><path d="M8 10V20M3 15H13M50 48V60M44 54H56"/>',
  cast:'<circle cx="32" cy="32" r="25"/><path d="M13 13L20 20M51 13L44 20M13 51L20 44M51 51L44 44"/>'
 };
 function art(type){return graphics[type]||graphics[{critical:'magic',dot:'magic',skip:'debuff',hit:'magic',impact:'slash',wind:'magic',light:'magic',shadow:'magic',regen:'heal',potion:'heal',drain:'heal',dissolve:'shield','shield-impact':'absorb'}[type]]||graphics.magic;}
 function play(node,event,sourceNode){
  let entries=activeNodes.get(node);if(!entries){entries=new Map();activeNodes.set(node,entries);}
  const type=event.type,channel=type==='skip'?'control':type==='critical'?'critical':type==='dot'?'dot':type==='break'?'break':['heal','regen','potion','drain'].includes(type)?'recovery':['shield','absorb','break','dissolve','shield-impact'].includes(type)?'shield':type==='hit'?'hit':['buff','debuff'].includes(type)?type:type==='cast'?'cast':'action';
  // Two overlapping occurrences per channel survive; a third replaces only the oldest.
  const peers=[...entries].filter(([,row])=>row.channel===channel);
  if(peers.length>=2){const [key,old]=peers[0];clearTimeout(old.timer);old.element.remove();entries.delete(key);}
  const eventKey=++sequence;
  const element=document.createElement('span');element.className='battle-fx battle-fx-'+type+(node.dataset.combatId?' battle-fx-health':'');
  const category=event.category||eventCategory(type),color=palette[category];
  element.dataset.fx=type;element.dataset.fxCategory=category;element.dataset.event=event.eventId||'';element.dataset.critical=String(!!event.critical);if(event.label)element.dataset.skill=event.label;element.dataset.detail=mode();element.setAttribute('aria-hidden','true');
  const base=type==='cast'?(event.important?850:650):['buff','debuff'].includes(type)?750:['heal','regen','potion','drain','shield'].includes(type)?650:['slash','ranged','impact','hit','evade','resist','absorb','dot','critical'].includes(type)?500:600;
  const duration=Math.round(base*(battleRate===1?1.5:battleRate===2?.82:1));
  if(type==='hit'||type==='evade')node.style.setProperty('--fx-portrait-time',duration+'ms');
  element.style.setProperty('--fx-time',duration+'ms');element.style.setProperty('--fx-color',color.color);element.style.setProperty('--fx-rgb',color.rgb);
  element.style.setProperty('--fx-direction',String(++sequence%2?-1:1));
  element.innerHTML='<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'+art(type)+'</svg>';
  const label=event.label||({critical:'暴擊',evade:'閃避',resist:'抵抗',skip:'無法行動',absorb:'格擋',heal:'治療',shield:'護盾',buff:'增益',debuff:'減益',dot:'持續傷害'}[type])||(event.critical?'暴擊':'');
  if(label){const text=document.createElement('b');text.textContent=label;element.append(text);}
  if(mode()==='full'&&sourceNode&&sourceNode!==node&&['fire','ice','lightning','wind','light','shadow','magic','ranged'].includes(type)){
   const a=sourceNode.getBoundingClientRect(),b=node.getBoundingClientRect(),dx=a.x-b.x,dy=a.y-b.y,length=Math.hypot(dx,dy)||1;
   element.style.setProperty('--fx-from-x',Math.round(dx/length*24)+'px');element.style.setProperty('--fx-from-y',Math.round(dy/length*24)+'px');
   const trail=document.createElement('i');trail.className='battle-fx-projectile';element.append(trail);
  }
  node.append(element);
  const row={element,timer:null,channel},remove=()=>{if(entries.get(eventKey)!==row)return;clearTimeout(row.timer);element.remove();entries.delete(eventKey);if(!entries.size)activeNodes.delete(node);};
  row.timer=setTimeout(remove,duration+80);entries.set(eventKey,row);element.addEventListener('animationend',e=>{if(e.target===element)remove();});
 }
 function sync(s){
  if(preference==='off'||!visible()||owner&&owner!==party||staged&&staged.encounter!==foes&&!held){clear();return;}
  for(const node of activeNodes.keys())if(!node.isConnected)cleanNode(node);
  for(const node of markedNodes)if(!node.isConnected){node.querySelector(':scope > .battle-fx-status')?.remove();delete node.dataset.fxShield;markedNodes.delete(node);}
  const rows=[...s.allies,...s.units],byId=new Map(rows.map(row=>[String(row.id),row]));
  const nodes=new Map();document.querySelectorAll('#battleAllyIcons .unit [data-hero-id],#battleEnemyIcons .unit [data-enemy-id]').forEach(node=>nodes.set(node.dataset.heroId||node.dataset.enemyId,node));
  const healthNodes=new Map();document.querySelectorAll('.squad-field .unit[data-combat-id]').forEach(node=>healthNodes.set(node.dataset.combatId,node));
  const playUnit=(key,event,sourceKey)=>{for(const surfaces of [nodes,healthNodes]){const node=surfaces.get(key);if(node)play(node,event,surfaces.get(sourceKey));}};
  const currentStatuses=statuses();
  // Persistent layers reflect authoritative state, not animation timeouts. The
  // portrait and HP card share the exact same labels and disappear on expiry,
  // dispel, shield exhaustion, control removal, death or encounter cleanup.
  const statusNames={shield:'護盾',buff:'增益',debuff:'減益',polymorph:'變形',freeze:'冰凍',frost:'結霜',rage:'狂暴',fear:'恐懼',tauntRage:'嘲諷'};
  for(const [key,portrait] of nodes){
   const row=byId.get(key),active=[...currentStatuses.values()].filter(x=>String(x.target)===key),tags=new Set(active.map(x=>x.polarity));
   const labels=row?.alive?[(row.shield??shields(row.unit))>0?'shield':null,tags.has('buff')?'buff':null,tags.has('debuff')?'debuff':null,...new Set(active.map(x=>x.kind).filter(Boolean))].filter(Boolean):[];
   for(const node of [portrait,healthNodes.get(key)].filter(Boolean)){
    let badge=node.querySelector(':scope > .battle-fx-status');
    if(labels.includes('shield'))node.dataset.fxShield='true';else delete node.dataset.fxShield;
    if(!labels.length){badge?.remove();markedNodes.delete(node);continue;}
    markedNodes.add(node);
    if(!badge){badge=document.createElement('span');badge.className='battle-fx-status';badge.setAttribute('role','img');node.append(badge);}
    badge.dataset.detail=mode();badge.setAttribute('aria-label',labels.map(tag=>statusNames[tag]||tag).join('、'));
    const existing=new Map([...badge.children].map(n=>[n.dataset.fxPersistent,n]));
    for(const tag of labels){
     let layer=existing.get(tag);existing.delete(tag);
     if(!layer){layer=document.createElement('i');layer.className='fx-status-'+tag;layer.dataset.fxPersistent=tag;layer.dataset.fxLayer=tag==='shield'?'protection':tag==='buff'?'enhancement':tag==='debuff'?'affliction':'control';layer.title=statusNames[tag]||tag;layer.innerHTML='<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+art(tag)+'</svg>';badge.append(layer);}
     const category=tag==='shield'?'shield':tag==='buff'||tag==='rage'?'buff':'debuff';layer.dataset.fxCategory=category;layer.style.setProperty('--fx-color',palette[category].color);layer.style.setProperty('--fx-rgb',palette[category].rgb);
    }
    for(const layer of existing.values())layer.remove();
   }
  }
  paintVitals(s);
  if(!staged||staged.played)return;
  const batch=staged;batch.played=true;
  const playEvent=event=>playUnit(event.target,event,event.source);
  const events=[...batch.events.values()],sources=new Set(events.filter(e=>e.type==='cast').map(e=>e.target));
  for(const event of events)if(!sources.has(event.source)&&nodes.has(event.source)&&event.source!==event.target&&(event.category==='damage'&&!['critical','dot'].includes(event.type)||['evade','absorb','shield-impact'].includes(event.type))){
   sources.add(event.source);playEvent({target:event.source,type:'attack',category:'damage',eventId:batch.eventId});
  }
  for(const event of events){event.eventId=batch.eventId;if(event.type==='cast')playEvent(event);}
  const impact=()=>{if(staged!==batch||!visible())return;batch.impacted=true;
   EmberwildBattleSummary.sync({animate:false});
   for(const event of events)if(event.type!=='cast'&&byId.has(event.target))playEvent(event);
  };
  batch.commitImpact=impact;
  if(batch.delay)later(impact,batch.delay);else impact();
 }
 // Presentation timestamps never feed the shared simulation clock or saves.
 function present(s){
  if(pending&&pending.owner===party){
   const next=pending;pending=null;
   // A later independent action must not cancel an already resolved impact.
   // Flush its presentation before replacing the display batch; combat stays immediate.
   if(staged&&!staged.impacted)staged.commitImpact?.();
   staged=next;staged.delay=[...staged.events.values()].some(e=>e.type==='cast')?(battleRate===2?130:190):0;
   staged.eventId=String(++sequence);staged.started=performance.now();
   if(s.result&&staged.terminalVitals){const final=row=>{const v=staged.terminalVitals.get(row.unit);return v?{...row,hp:v.hp,shield:v.shield,alive:v.hp>0}:row;};s={...s,allies:s.allies.map(final),units:s.units.map(final)};}
   if(s.result){held={snapshot:s,until:staged.started+staged.delay+(battleRate===2?700:850),encounter:staged.encounter};
    const hold=held;later(()=>{if(held!==hold)return;held=null;if(visible())render();},held.until-staged.started);
   }
  }
  if(held&&performance.now()<held.until)s=held.snapshot;
  if(staged&&!staged.impacted&&staged.delay){
   const project=row=>{const v=staged.initial.get(row.unit);return v?{...row,hp:v.hp,shield:v.shield,alive:v.hp>0}:row;};
   const units=s.units.map(project),allies=s.allies.map(project),hp=units.reduce((n,r)=>n+r.hp,0);
   return {...s,units,allies,hp,percent:s.max?hp/s.max*100:0,alive:units.filter(r=>r.alive).length,result:null};
  }
  return s;
 }
 function paintVitals(s){
  for(const row of [...s.allies,...s.units]){
   const card=[...document.querySelectorAll('.squad-field .unit[data-combat-id]')].find(n=>n.dataset.combatId===String(row.id));if(!card)continue;
   const before=staged&&!staged.impacted&&staged.delay?staged.initial.get(row.unit):null;
   const hp=before?.hp??row.hp??row.unit.hp,max=row.max??stats(row.unit).hp,shield=before?.shield??row.shield??shields(row.unit);
   const hpText=card.querySelector('.unit-numbers > span:first-child b');if(hpText)hpText.textContent=Math.ceil(hp)+' / '+Math.ceil(max);
   const bar=card.querySelector('.battle-health-bar');if(bar){const box=document.createElement('div');box.innerHTML=battleHealthMeter(hp,max,shield);if(bar.outerHTML!==box.firstChild.outerHTML)bar.replaceWith(box.firstChild);}
   card.classList.toggle('fallen',hp<=0);
   const icon=card.querySelector('.battle-enemy-icon');icon?.classList.toggle('is-dead',hp<=0);
   const second=card.querySelector('.unit-numbers > span:nth-child(2) b');if(second)second.textContent=Math.round(shield);
   const title=card.querySelector('.unit-title > span');if(title){const kind=row.unit.job!==undefined?'出戰':row.unit.kind==='elite'?'菁英':['boss','final'].includes(row.unit.kind)?'首領':'普通';title.textContent='LV '+row.unit.lv+' · '+(hp<=0?(row.unit.job!==undefined?'倒下':'已擊敗'):kind);}
  }
 }

 function wrap(name,context){const base=globalThis[name];if(typeof base!=='function')return;globalThis[name]=function(...args){if(!frame)return base.apply(this,args);return scope(context(...args),()=>base.apply(this,args));};}
 wrap('performHeroBasic',h=>({source:h,mode:'damage',element:weaponElement(h),ranged:h.job===2}));
 wrap('performEnemyBasic',e=>({source:e,mode:'damage',element:e.element}));
 wrap('resolveHit',(e,amount,h,element,critical)=>({source:h,mode:'damage',element,critical}));
 wrap('sharedEnemySkillDamage',(e,h,amount,element)=>({source:e,mode:'damage',element}));
 wrap('castPartySkill',(h,i)=>{const effect=CLASSES[h.job]?.skills?.[i]?.[5];return {source:h,mode:['damage','drain'].includes(effect)?'damage':'skill',element:coreSkillElement(h.job,i),effect,ranged:h.job===2};});
 wrap('castEnemySharedSkill',(e,sk)=>({source:e,mode:['damage','drain'].includes(sk.effect)?'damage':'skill',element:sk.element,effect:sk.effect}));
 wrap('castSupport',h=>({source:h,mode:'skill',element:null}));
 wrap('potion',()=>({source:state,mode:'potion',element:null}));
 wrap('refillParty',()=>({mode:'settlement'}));
 wrap('applyPureShield',()=>({mode:'shield'}));
 // Cast glows are derived only from successful casts, never attempted cooldowns.
 for(const name of ['castPartySkill','castEnemySharedSkill','castSupport']){const base=globalThis[name];globalThis[name]=function(...args){const out=base.apply(this,args);if(frame&&out!==false){const source=args[0],sk=name==='castPartySkill'?CLASSES[source.job]?.skills?.[args[1]]:name==='castSupport'?SUPPORT[source.job]?.[args[1]]:args[1];enqueue('cast',id(source),{category:castCategory(sk),label:sk?.name||sk?.[0]||'技能',important:name==='castPartySkill'&&source.job===1&&(sk?.[0]==='魔爆'||sk?.name==='魔爆')});}return out;};}
 for(const name of ['resetEncounter','resetSession','loadParty','stopTeamExploration']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(...args){clear();return base.apply(this,args);};}
 // The seconds timeline spawns the next group and may cast an instant skill in the same step.
 // A frame that has not recorded anything yet belongs to the new encounter: rebind it and take
 // fresh pre-impact samples, or sync() treats its whole batch as a stale encounter and clears it.
 const spawnBase=spawnGroup;spawnGroup=function(...args){
  const out=spawnBase.apply(this,args);
  if(frame&&!frame.events.size&&frame.encounter!==foes&&frame.owner===party){frame.encounter=foes;encounter=foes;frame.initial=sample();frame.vitals=sample();frame.statuses=statuses();}
  return out;
 };
 globalThis.EmberwildBattleEffects={begin,end,scope,quiet,result,sync,clear,present,get holdingEncounter(){return !!held&&held.encounter!==foes&&performance.now()<held.until;},get capturing(){return !!frame;},get preference(){return preference;},get pendingEvents(){return pending?[...pending.events.values()].map(e=>({...e})):[];},get activeCount(){return [...activeNodes.values()].reduce((n,m)=>n+m.size,0);}};
 globalThis.setBattleEffects=function(value){if(!choices.includes(value))return false;preference=value;clear();try{localStorage.setItem(storageKey,value);}catch{toast('特效已套用，但瀏覽器無法保存設定。');}document.querySelectorAll('[data-battle-effects]').forEach(select=>select.value=value);EmberwildBattleSummary.sync({animate:false});return true;};
 globalThis.battleEffectsOptionsView=()=>'<section class="panel option-row"><div><h2>戰鬥特效</h2><p class="small">調整探索圖示與血條區塊動畫；保留目前行動者金框；減少動態效果時自動簡化。</p></div><select data-battle-effects aria-label="戰鬥特效" onchange="setBattleEffects(this.value)">'+choices.map((value,i)=>'<option value="'+value+'" '+(preference===value?'selected':'')+'>'+['完整','簡化','關閉'][i]+'</option>').join('')+'</select></section>';
 const modal=document.getElementById('modal');if(modal)new MutationObserver(()=>{if(modal.open)clear();}).observe(modal,{attributes:true,attributeFilter:['open']});
 addEventListener('visibilitychange',clear);addEventListener('pagehide',clear);
 addEventListener('storage',e=>{if(e.key===storageKey||e.key===null){preference=choices.includes(e.newValue)?e.newValue:'full';clear();}});
 // Navigation and paused exploration already render through this existing entry point.
 const renderBase=render;render=function(...args){if(!visible()||!running&&!frame&&!pending&&!held)clear();return renderBase.apply(this,args);};
})();
