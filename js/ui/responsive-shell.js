/* Responsive shell (v0.119): the phone header is one row. 成就、設定、儲存、冒險指南 fold into a ⋯ menu;
   the buttons themselves are the same elements, only moved, so their ids, badges and handlers stay. */
(()=>{
  const compact=matchMedia('(max-width:900px)');
  const folded=['achievements','options','save','guide'];
  const container=document.getElementById('utilityNavigation');
  if(!container)return;
  const icon=name=>globalThis.__EMBERWILD_SKILL_ICONS?.svgFor('lucide:'+name,[],{size:20})||'';
  let open=false,more=null,menu=null;
  function build(){
    if(more)return;
    more=document.createElement('button');more.type='button';more.id='utilityMoreButton';more.className='utility-icon-button utility-more-button';
    more.title='更多功能';more.setAttribute('aria-label','更多功能');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-controls','utilityMoreMenu');
    more.innerHTML=icon('ellipsis');more.onclick=event=>{event.stopPropagation();setOpen(!open);};
    menu=document.createElement('div');menu.id='utilityMoreMenu';menu.className='utility-more-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','更多功能');
    menu.addEventListener('click',()=>setOpen(false));
  }
  function setOpen(value){
    open=!!value&&compact.matches;
    if(!more)return;
    more.setAttribute('aria-expanded',String(open));menu.classList.toggle('open',open);
    if(open)menu.querySelector('button')?.focus();
  }
  function sync(){
    build();
    const buttons=folded.map(id=>document.getElementById('utilityButton-'+id)).filter(Boolean);
    if(compact.matches){
      if(more.parentElement!==container)container.append(more,menu);
      for(const b of buttons)if(b.parentElement!==menu){b.setAttribute('role','menuitem');menu.appendChild(b);}
      // 戰況 (added by the phone layout) comes first, then 信箱, then ⋯.
      if(container.lastElementChild!==menu)container.append(more,menu);
    }else{
      open=false;
      if(more.parentElement){for(const b of buttons){b.removeAttribute('role');container.insertBefore(b,more);}more.remove();menu.remove();menu.classList.remove('open');}
    }
    scrollSubtabs();
  }
  // A scrollable row of sub-pages keeps the current one in view; the page itself does not move.
  let lastTabKey='';
  function scrollSubtabs(){
    const row=document.querySelector('#app>.layout>main>.game-subtabs'),active=row?.querySelector('button.active');
    if(!row||!active){lastTabKey='';return;}
    const key=active.dataset.subpage||'';
    if(row.scrollWidth<=row.clientWidth+1||key===lastTabKey&&row.dataset.placed==='1')return;
    lastTabKey=key;row.dataset.placed='1';
    const target=active.offsetLeft-(row.clientWidth-active.offsetWidth)/2;
    row.scrollLeft=Math.max(0,Math.min(target,row.scrollWidth-row.clientWidth));
  }
  globalThis.toggleUtilityMore=value=>{sync();setOpen(value===undefined?!open:value);return open;};
  globalThis.isUtilityMoreOpen=()=>open;
  document.addEventListener('click',event=>{if(open&&!event.target.closest?.('#utilityMoreMenu,#utilityMoreButton'))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){setOpen(false);more?.focus();}});
  const renderBase=render;render=function(...args){const out=renderBase(...args);sync();return out;};
  const after=globalThis.__EMBERWILD_AFTER_RENDER;globalThis.__EMBERWILD_AFTER_RENDER=function(...args){after?.(...args);sync();};
  compact.addEventListener('change',sync);
  sync();
})();
