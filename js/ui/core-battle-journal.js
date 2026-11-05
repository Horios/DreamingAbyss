'use strict';
// Battle journal presentation and scroll helpers, moved intact from core-game.js.
// Note/render/resetSession wrappers stay in core to preserve installation order.
function sharedBattleJournal(){if(!party)return '';const paused=$('modal').open;return `<section id="globalBattleJournal" class="global-battle-journal" aria-label="全隊共通戰報"><div class="global-journal-head"><div class="row"><h2>全隊戰報</h2><span class="tag">${running?(paused?'視窗暫停':'探索中'):'已暫停'} · ${battleRate}×</span></div><p>${esc(MAPS[party.map].name)} · ${MODES[party.difficulty||0].name}<br>存活隊員 ${living().length}/${heroes().length} · 敵人 ${foes.filter(e=>e.hp>0).length}/${foes.length}</p><button onclick="toggleBattle()">${running?'暫停戰鬥':'開始探索'}</button> <button onclick="setTab('battle')">查看戰場</button></div><div id="liveLog" role="log" aria-label="即時戰鬥紀錄">${logContent()}</div><section class="journal-loot"><h3>累積戰利品 · 擊敗 ${expeditionLoot.kills} 隻</h3><div class="small">本次開啟遊戲累計</div><div id="journalLootList" class="journal-loot-list">${[...expeditionLoot.items].map(([name,item])=>`<div class="journal-loot-row"><span class="loot-rarity-${item.rar??0}">${esc(name)}</span><b>+${(item.count??item).toLocaleString()}</b></div>`).join('')||'<p class="small">尚無戰利品。</p>'}</div></section></section>`;}

function isEditingControl(){return !!document.activeElement?.matches?.('input,select,textarea,[contenteditable="true"]');}
function refreshGlobalJournal(){
 const panel=$('globalBattleJournal');if(!party||!panel)return;
 const live=$('liveLog'),list=$('journalLootList'),detail=live?.querySelector?.('details'),history=live?.querySelector?.('.history-events'),current=live?.querySelector?.('.current-events');
 const saved={open:detail?.open,loot:list?.scrollTop||0,history:history?.scrollTop||0,current:current?.scrollTop||0};
 const fresh=document.createElement('template');fresh.innerHTML=sharedBattleJournal();
 // Keep the log, scroll containers, disclosures and controls mounted. Update only
 // information that actually changed; the log appends through appendBattleLogLine.
 for(const selector of ['.journal-title-row','.journal-summary','.journal-actions','.journal-filter','#journalRealtimeStatus','#journalLootList']){
  const before=panel.querySelector(selector),after=fresh.content.querySelector?.(selector);
  if(before&&after&&before.innerHTML!==after.innerHTML)before.innerHTML=after.innerHTML;
 }
 const oldSummary=panel.querySelector('.journal-loot-compact>summary,.mobile-loot-content>h3'),newSummary=fresh.content.querySelector?.('.journal-loot-compact>summary,.mobile-loot-content>h3');
 if(oldSummary&&newSummary&&oldSummary.textContent!==newSummary.textContent)oldSummary.textContent=newSummary.textContent;
 syncBattleLogHeader(live);
 const wallet=$('wallet');if(wallet)wallet.textContent='全隊金幣 '+party.members[0].gold.toLocaleString();
}

function battleLogMatches(event){return battleLogFilter==='all'||event.type===battleLogFilter;}
// Information kind of a system row (shown as the row's colored marker): encounter, skill use (「角色・技能・效果」 or 使用／施放) or kill.
function battleLogKind(event){if(event.type!=='system')return '';const t=String(event.text??'');return /擊敗/.test(t)?'log-kind-kill':/^遭遇/.test(t)?'log-kind-encounter':/使用|施放|・/.test(t)?'log-kind-skill':'';}
function battleLogEntryClass(event){return [['playerDamage','enemyDamage'].includes(event.type)?'event-damage':['exp','item'].includes(event.type)?'event-loot':'',battleLogKind(event)].filter(Boolean).join(' ');}
function lootRarityFromText(t){if(/極稀有|傳說/.test(t))return 3;if(/稀有/.test(t))return 2;if(/精良/.test(t))return 1;if(/獲得 /.test(t))return 0;return null;}
function battleLogTextHTML(event){const t=event?.text??event,rar=event?.type==='item'?lootRarityFromText(t):null;if(rar===null)return esc(t);const m=String(t).match(/^(.*?獲得(?:極稀有道具：)?\s*)(.*)$/);return m?esc(m[1])+`<span class="loot-rarity-${rar}">${esc(m[2])}</span>`:esc(t);}
function battleLogRowsHTML(){
 const ordered=logs.map(e=>typeof e==='string'?{text:e,type:'system'}:e).filter(battleLogMatches).reverse(), blanks=Math.max(0,BATTLE_LOG_VISIBLE_ROWS-ordered.length);
 return Array.from({length:blanks},()=>'<div class="battle-log-line battle-log-empty" aria-hidden="true">&nbsp;</div>').join('')+ordered.map(e=>`<div class="battle-log-line ${battleLogEntryClass(e)}" data-event-type="${e.type}">${battleLogTextHTML(e)}</div>`).join('');
}

function battleLogScrollSurface(stream){
 const outer=stream?.closest?.('#mobileJournalBody');
 return outer&&getComputedStyle(outer).display==='block'?outer:stream;
}
function isBattleLogAtBottom(stream){
 const surface=battleLogScrollSurface(stream);
 return !surface||surface.scrollHeight-surface.clientHeight-surface.scrollTop<=2;
}
function ensureBattleLogScrollState(stream){
 if(!stream||stream.dataset.scrollStateReady==='1')return;
 stream.dataset.scrollStateReady='1';
 stream.dataset.autoScroll=battleReportPaused?'0':'1';
 const mobileSurface=stream.closest?.('#mobileJournalBody');
 if(mobileSurface){
  // Direct upward gestures cancel queued animation-frame pins immediately.
  mobileSurface.addEventListener('wheel',event=>{if(event.deltaY<0)stream.dataset.autoScroll='0';},{passive:true});
  let lastY=null;
  mobileSurface.addEventListener('touchstart',event=>{lastY=event.touches?.[0]?.clientY??null;},{passive:true});
  mobileSurface.addEventListener('touchmove',event=>{const y=event.touches?.[0]?.clientY;if(lastY!==null&&Number.isFinite(y)&&y>lastY)stream.dataset.autoScroll='0';lastY=y??null;},{passive:true});
 }
 for(const surface of [stream,mobileSurface].filter(Boolean))surface.addEventListener('scroll',()=>{
  if(battleLogScrollSurface(stream)!==surface)return;
  const follow=isBattleLogAtBottom(stream)?'1':'0';
  if(battleReportPaused)stream.dataset.reportAutoScroll=follow;
  else stream.dataset.autoScroll=follow;
 },{passive:true});
}
function forceBattleLogBottom(stream){
 if(!stream)return;
 ensureBattleLogScrollState(stream);
 if(battleReportPaused)return;
 stream.dataset.autoScroll='1';
 let lastPinned=null;
 const pin=()=>{
  if(battleReportPaused||!stream.isConnected||stream.dataset.autoScroll!=='1')return;
  const surface=battleLogScrollSurface(stream);
  // A deferred pin must not override scrolling away from a prior pin.
  if(lastPinned!==null&&surface.scrollTop<lastPinned-2){stream.dataset.autoScroll='0';return;}
  surface.scrollTop=Math.max(0,surface.scrollHeight-surface.clientHeight);
  lastPinned=surface.scrollTop;
 };
 pin();
 queueMicrotask(pin);
 requestAnimationFrame(()=>{pin();requestAnimationFrame(pin);});
}
function scrollBattleLogToBottom(root=document){
 const streams=[];
 if(root?.matches?.('.battle-log-stream'))streams.push(root);
 root?.querySelectorAll?.('.battle-log-stream').forEach(stream=>streams.push(stream));
 streams.forEach(forceBattleLogBottom);
}
function appendBattleLogLine(t){
 if(battleReportPaused||!battleLogMatches(t))return;
 document.querySelectorAll('.battle-log-stream').forEach(stream=>{
  ensureBattleLogScrollState(stream);
  // Inspect the real scroll surface before new text changes its height;
  // a user reading old messages takes priority over queued auto-pin callbacks.
  const shouldPin=stream.dataset.autoScroll!=='0'&&isBattleLogAtBottom(stream);
  if(!shouldPin)stream.dataset.autoScroll='0';
  const oldScrollTop=battleLogScrollSurface(stream).scrollTop;
  const blank=stream.querySelector('.battle-log-empty');if(blank)blank.remove();
  const line=document.createElement('div');line.className='battle-log-line '+battleLogEntryClass(t);line.dataset.eventType=t.type;line.innerHTML=battleLogTextHTML(t);stream.appendChild(line);
  const real=[...stream.children].filter(el=>!el.classList.contains('battle-log-empty'));
  while(real.length>65){const first=real.shift();first?.remove();}
  if(shouldPin){
   forceBattleLogBottom(stream);
  }else{
   // While the player is reading older entries, keep the scrollbar at the exact
   // position they chose. Do not compensate for old rows pruned from the top,
   // otherwise several new combat messages can walk scrollTop all the way to 0.
   const restore=()=>{
    const surface=battleLogScrollSurface(stream),max=Math.max(0,surface.scrollHeight-surface.clientHeight);
    surface.scrollTop=Math.min(oldScrollTop,max);
    stream.dataset.autoScroll='0';
   };
   restore();
   queueMicrotask(restore);
   requestAnimationFrame(restore);
  }
 });
}

function toggleBattleReport(){battleReportPaused=!battleReportPaused;document.querySelectorAll('.battle-log-stream').forEach(s=>{ensureBattleLogScrollState(s);if(battleReportPaused){s.dataset.reportAutoScroll=s.dataset.autoScroll;s.dataset.autoScroll='0';}else{s.dataset.autoScroll=s.dataset.reportAutoScroll||'1';if(s.dataset.autoScroll==='1')forceBattleLogBottom(s);}});save();render();}
function setBattleLogFilter(type){if(!Object.hasOwn(BATTLE_LOG_FILTERS,type))return;battleLogFilter=type;battleLogGeneration++;save();render();}
function battleJournalFilter(){return `<label class="journal-filter">顯示 <select aria-label="戰報篩選" onchange="setBattleLogFilter(this.value)">${Object.entries(BATTLE_LOG_FILTERS).map(([type,label])=>`<option value="${type}" ${battleLogFilter===type?'selected':''}>${label}</option>`).join('')}</select></label>`;}

function syncBattleLogHeader(live){if(battleReportPaused)return;const tag=live?.querySelector?.('.battle-log-round');if(tag)tag.textContent=globalThis.EmberwildSecondsCombat?.active?'戰鬥 '+partyClock.toFixed(1)+' 秒':'回合 '+round;}
function markBattleLogGeneration(live){if(live)live.dataset.logGeneration=String(battleLogGeneration);}
function captureBattleLogScroll(live){
 const stream=live?.querySelector?.('.battle-log-stream');
 return stream?{stream,top:battleLogScrollSurface(stream).scrollTop,left:battleLogScrollSurface(stream).scrollLeft,autoScroll:stream.dataset.autoScroll==='0'||!isBattleLogAtBottom(stream)?'0':'1'}:null;
}
function restoreBattleLogScroll(position){
 if(!position?.stream.isConnected)return;
 const {stream,top,left,autoScroll}=position;
 ensureBattleLogScrollState(stream);
 battleLogScrollSurface(stream).scrollLeft=left;
 if(!battleReportPaused&&autoScroll!=='0')forceBattleLogBottom(stream);
 else{const surface=battleLogScrollSurface(stream);surface.scrollTop=Math.min(top,Math.max(0,surface.scrollHeight-surface.clientHeight));stream.dataset.autoScroll=autoScroll??'0';}
}
