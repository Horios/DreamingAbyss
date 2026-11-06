// Keep live combat updates from replacing controls or scrollable panels mid-interaction.
(function(){
  const gameRender=render,gameRefreshJournal=refreshGlobalJournal;
  const pointers=new Set();
  const scope='#app, #modal, #utilityNavigation';
  let interacting=false,pendingRender=false,pendingJournal=false,releaseTimer=null,activeSelect=null,scrollHoldUntil=0,flushing=false;

  function isTextEditor(node){
    if(!node?.matches?.('input, textarea, [contenteditable="true"], [contenteditable=""], [role="textbox"]'))return false;
    if(!node.closest?.('#app, #modal'))return false;
    if(!node.matches('input'))return true;
    return !['checkbox','radio','range','button','submit','reset','file','hidden','color','image'].includes(String(node.type||'text').toLowerCase());
  }
  function editing(){
    if(document.visibilityState==='hidden'||typeof document.hasFocus==='function'&&!document.hasFocus())return false;
    return isTextEditor(document.activeElement);
  }
  function busy(){
    return interacting||pointers.size>0||!!activeSelect||editing()||scrollHoldUntil>Date.now()||!!globalThis.__EMBERWILD_NAVIGATION_DRAGGING;
  }
  globalThis.isEmberwildUIInteracting=busy;

  function finishInteraction(){
    if(globalThis.__EMBERWILD_NAVIGATION_DRAGGING){scheduleRelease(100);return;}
    if(pointers.size||activeSelect||editing())return;
    const remaining=scrollHoldUntil-Date.now();
    if(remaining>0){scheduleRelease(remaining+10);return;}
    clearTimeout(releaseTimer);releaseTimer=null;
    interacting=false;
    // Resume through the latest render wrapper, not the startup snapshot:
    // later modules add inventory, navigation, dialogue, mobile and log hooks.
    flushing=true;
    try{
      if(pendingRender){
        pendingRender=false;pendingJournal=false;
        render();
        globalThis.__EMBERWILD_AFTER_RENDER?.();
      }else if(pendingJournal){
        pendingJournal=false;
        refreshGlobalJournal();
      }
    }finally{flushing=false;}
  }
  function scheduleRelease(delay){
    clearTimeout(releaseTimer);
    releaseTimer=setTimeout(finishInteraction,delay);
  }
  function holdScroll(delay=350){
    scrollHoldUntil=Date.now()+delay;
    interacting=true;
    scheduleRelease(delay+10);
  }
  function holdSelect(select){
    activeSelect=select;interacting=true;
    clearTimeout(releaseTimer);releaseTimer=null;
  }
  function releaseSelect(event){
    if(event.target!==activeSelect)return;
    activeSelect=null;
    if(!pointers.size)scheduleRelease(0);
  }

  render=function(...args){
    if(!flushing&&busy()){pendingRender=true;return;}
    return gameRender(...args);
  };
  refreshGlobalJournal=function(...args){
    if(!flushing&&busy()){pendingJournal=true;return;}
    return gameRefreshJournal(...args);
  };

  document.addEventListener('pointerdown',event=>{
    if(activeSelect&&!activeSelect.contains(event.target)){
      activeSelect=null;
      scheduleRelease(0);
    }
    const select=event.target.closest?.('#app select, #modal select');
    if(select)holdSelect(select);
    if(event.target.closest?.(scope)){
      // An intentional button/action after scrolling must not wait for the wheel timeout.
      if(event.target.closest?.('button, a, input, select, textarea, label, summary, [role="button"]'))scrollHoldUntil=0;
      clearTimeout(releaseTimer);releaseTimer=null;
      pointers.add(event.pointerId);interacting=true;
    }
  },true);
  document.addEventListener('pointerup',event=>{
    if(!pointers.delete(event.pointerId))return;
    // A touch click can arrive after pointerup.
    if(!pointers.size)scheduleRelease(500);
  },true);
  document.addEventListener('pointercancel',event=>{
    if(pointers.delete(event.pointerId)&&!pointers.size)scheduleRelease(0);
  },true);
  document.addEventListener('click',()=>{
    if(interacting&&!pointers.size&&!activeSelect)scheduleRelease(0);
  },true);
  document.addEventListener('focusin',event=>{
    if(isTextEditor(event.target)){interacting=true;clearTimeout(releaseTimer);releaseTimer=null;}
  },true);
  document.addEventListener('focusout',event=>{
    releaseSelect(event);
    // Defer until after focus actually changes, so a pending render cannot swallow the click.
    scheduleRelease(0);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.target.matches?.('#app select, #modal select')){
      if(event.key==='Escape')releaseSelect(event);
      else if([' ','Enter','ArrowDown','ArrowUp','Home','End','PageUp','PageDown'].includes(event.key))holdSelect(event.target);
      return;
    }
    if(!event.target.closest?.(scope))return;
    if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','PageDown','PageUp','Home','End',' '].includes(event.key)){
      if(!isTextEditor(event.target))holdScroll(300);
    }else if(event.key==='Enter'&&event.target.matches?.('button,[role="button"]')){
      scrollHoldUntil=0;scheduleRelease(0);
    }
  },true);
  document.addEventListener('change',releaseSelect,true);
  document.addEventListener('wheel',event=>{
    if(event.target.closest?.(scope))holdScroll(360);
  },{capture:true,passive:true});
  document.addEventListener('touchmove',event=>{
    if(event.target.closest?.(scope))holdScroll(430);
  },{capture:true,passive:true});
  window.addEventListener('blur',()=>{
    pointers.clear();activeSelect=null;scrollHoldUntil=0;scheduleRelease(0);
  });
  window.addEventListener('focus',()=>scheduleRelease(0));
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='hidden'){
      activeSelect=null;pointers.clear();scrollHoldUntil=0;scheduleRelease(0);
    }
  });
})();
