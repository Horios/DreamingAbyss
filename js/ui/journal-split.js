
(function(){
  globalThis.journalLootOpen = globalThis.journalLootOpen ?? false;
  globalThis.journalLootHeight = globalThis.journalLootHeight ?? 180;
  globalThis.toggleJournalLoot=function(event){
    const details=event.currentTarget,summary=event.target.closest?.('summary');
    if(!summary||summary.parentElement!==details)return;
    event.preventDefault();
    // Commit before a refresh can replace this details node. Its queued toggle
    // event may arrive after replacement, so it must not own the shared state.
    globalThis.journalLootOpen=!details.open;
    details.open=globalThis.journalLootOpen;
  };
  const style=document.createElement('style');
  style.textContent=`
    .global-battle-journal{
      --journal-loot-height:180px;
      grid-template-rows:auto minmax(0,1fr) 7px var(--journal-loot-height) auto!important;
    }
    .global-battle-journal:has(.journal-loot-compact:not([open])){
      grid-template-rows:auto minmax(0,1fr) 7px auto auto!important;
    }
    .global-battle-journal #liveLog{min-height:0!important;}
    .global-battle-journal .battle-log-stream{
      height:100%!important;min-height:0!important;max-height:none!important;
      --battle-log-visible-rows:99!important;
    }
    .global-battle-journal .journal-resizer{
      height:7px;min-height:7px;margin:0 -2px;cursor:row-resize;position:relative;
      border-top:1px solid var(--line);border-bottom:1px solid var(--line);
      background:color-mix(in srgb,var(--panel) 78%,var(--line));touch-action:none;
    }
    .global-battle-journal .journal-resizer:hover,
    .global-battle-journal .journal-resizer.dragging{background:var(--line)}
    .global-battle-journal .journal-loot-compact[open]{height:100%;min-height:0;overflow:hidden;display:flex;flex-direction:column}
    .global-battle-journal .journal-loot-compact[open] .journal-loot-list{flex:1;min-height:0;max-height:none!important}
  `;
  document.head.appendChild(style);
  function applyHeight(){
    const journal=document.querySelector('.global-battle-journal');
    const height=globalThis.journalLootHeight+'px';
    if(journal&&journal.style.getPropertyValue('--journal-loot-height')!==height)journal.style.setProperty('--journal-loot-height',height);
  }
  globalThis.startJournalResize=function(ev){
    ev.preventDefault();
    const bar=ev.currentTarget, journal=bar.closest('.global-battle-journal'), loot=journal?.querySelector('.journal-loot-compact');
    if(!journal||!loot)return;
    if(!loot.open){ loot.open=true; globalThis.journalLootOpen=true; }
    const startY=ev.clientY, startH=loot.getBoundingClientRect().height;
    bar.classList.add('dragging'); bar.setPointerCapture?.(ev.pointerId);
    const move=e=>{
      const total=journal.getBoundingClientRect().height;
      const head=journal.querySelector('.global-journal-head')?.getBoundingClientRect().height||0;
      const max=Math.max(90,total-head-(journal.querySelector('.journal-quick-dispose')?.getBoundingClientRect().height||0)-260);
      globalThis.journalLootHeight=Math.max(70,Math.min(max,startH-(e.clientY-startY)));
      applyHeight();
    };
    const up=e=>{bar.classList.remove('dragging');bar.releasePointerCapture?.(ev.pointerId);bar.removeEventListener('pointermove',move);bar.removeEventListener('pointerup',up);bar.removeEventListener('pointercancel',up)};
    bar.addEventListener('pointermove',move);bar.addEventListener('pointerup',up);bar.addEventListener('pointercancel',up);
  };
  const observer=new MutationObserver(applyHeight); observer.observe(document.getElementById('app'),{childList:true,subtree:true});
  applyHeight();
})();
