/* Mobile presentation reuses the game's navigation, journal and page data. */
(()=>{
  const mobile=matchMedia('(max-width:900px)');
  const primary=['battle','roster','equipment','character'];
  let menuOpen=false,journalOpen=false,lootOpen=false,lootScroll=0,menuScroll=0,pendingSkill=null,journalSeen=false;
  function sync(){
    const main=document.querySelector('#app>.layout>main');
    if(main&&tab==='roster'){
      const content=main.querySelector('.companion-management-page'),plan=main.querySelector('.team-plan-panel');
      const heading=main.querySelector('.mobile-roster-heading')||content?.querySelector('.heading');
      if(heading&&plan&&content){
        if(mobile.matches){heading.classList.add('mobile-roster-heading');if(heading.parentElement!==main)main.insertBefore(heading,plan);}
        else if(heading.parentElement===main){heading.classList.remove('mobile-roster-heading');content.prepend(heading);}
      }
    }
    const nav=document.querySelector('#app>.layout>aside nav');
    if(nav&&mobile.matches&&!nav.querySelector('.mobile-more-toggle')){
      nav.setAttribute('aria-label','遊戲分頁');
      const pages=document.createElement('div');pages.id='mobileMorePages';pages.className='mobile-more-pages';pages.setAttribute('aria-label','其他功能');
      for(const [index,button] of [...nav.querySelectorAll('button[data-page]')].entries()){
        button.style.setProperty('--page-order',index);
        const id=button.dataset.page||(button.dataset.statisticsTab?'statistics':button.getAttribute('onclick')?.match(/setTab\('([^']+)'\)/)?.[1]);
        if(!id)continue;
        button.dataset.page=id;
        if(!primary.includes(id))pages.appendChild(button);
      }
      // Keep familiar, short labels in the four thumb-accessible shortcuts.
      for(const id of primary){const b=nav.querySelector(`[data-page="${id}"]`);if(b)nav.appendChild(b);}
      const more=document.createElement('button');more.type='button';more.className='mobile-more-toggle';more.setAttribute('aria-controls',pages.id);more.onclick=()=>{menuOpen=!menuOpen;sync();};nav.append(more,pages);
    }
    if(nav){
      nav.classList.toggle('mobile-menu-open',menuOpen);
      const more=nav.querySelector('.mobile-more-toggle');
      if(more){more.setAttribute('aria-expanded',String(menuOpen));more.textContent=menuOpen?'收起':primary.includes(tab)?'更多':'更多 · '+(nav.querySelector('.mobile-more-pages .active span')?.textContent||nav.querySelector('.mobile-more-pages .active')?.textContent||'');more.classList.toggle('active',!primary.includes(tab));}
      for(const b of nav.querySelectorAll('[data-page]')){
        if(b.dataset.page===tab)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
      }
      const pages=nav.querySelector('.mobile-more-pages');
      pages?.setAttribute('aria-hidden',String(mobile.matches&&!menuOpen));
      if(pages&&menuOpen&&pages.scrollTop!==menuScroll)pages.scrollTop=menuScroll;
    }
    const journal=document.getElementById('globalBattleJournal');
    if(journal){
      const inline=mobile.matches&&tab==='battle'&&!!main?.querySelector('.seconds-battlefield');
      journal.classList.toggle('mobile-inline-battle-journal',inline);
      if(inline&&journal.parentElement!==main)main.appendChild(journal);
      journal.classList.toggle('mobile-journal-open',journalOpen);
      journal.classList.toggle('mobile-loot-open',lootOpen);
      const button=journal.querySelector('.mobile-journal-toggle');
      if(button){button.setAttribute('aria-expanded',String(journalOpen));button.textContent=`戰鬥紀錄 · ${journal.querySelector('.journal-title-row .tag')?.textContent||''}　${journalOpen?'收合 ▾':'展開 ▴'}`;}
      const body=journal.querySelector('.mobile-journal-body');
      body?.setAttribute('aria-hidden',String(mobile.matches&&!journalOpen));
      const lootButton=journal.querySelector('.mobile-loot-toggle'),lootBody=journal.querySelector('.mobile-loot-body');
      if(lootButton){lootButton.setAttribute('aria-expanded',String(lootOpen));lootButton.textContent=`戰利品／整理　${lootOpen?'收合 ▾':'展開 ▴'}`;}
      lootBody?.setAttribute('aria-hidden',String(mobile.matches&&!lootOpen));
      if(lootBody&&lootOpen&&lootBody.scrollTop!==lootScroll)lootBody.scrollTop=lootScroll;
    }
    if(tab!=='skills')pendingSkill=null;
    if(mobile.matches&&pendingSkill){
      const detail=document.querySelector('[data-team-skill-detail="'+pendingSkill+'"]');
      if(detail){pendingSkill=null;detail.scrollIntoView({block:'start'});}
    }
  }
  globalThis.toggleMobileJournal=()=>{journalOpen=!journalOpen;if(journalOpen)lootOpen=false;sync();if(journalOpen&&!journalSeen){journalSeen=true;scrollBattleLogToBottom(document.getElementById('liveLog'));}};
  globalThis.toggleMobileLoot=()=>{lootOpen=!lootOpen;if(lootOpen)journalOpen=false;sync();};
  const journalBase=sharedBattleJournal;
  sharedBattleJournal=function(){
    const html=journalBase();if(!html)return html;
    const at=html.indexOf('>')+1,live=html.indexOf('<div id="liveLog"'),resizer=html.indexOf('<div class="journal-resizer"'),loot=html.indexOf('<details class="journal-loot-compact"');
    if(resizer<0||loot<0)return html;
    let lootHTML=html.slice(loot,html.lastIndexOf('</section>'));
    if(mobile.matches)lootHTML=lootHTML.replace(/<details class="journal-loot-compact"[^>]*>/,'<section class="mobile-loot-content">').replace('<summary>','<h3>').replace('</summary>','</h3>').replace('</details>','</section>');
    return html.slice(0,at)+`<section class="mobile-journal-report"><button type="button" class="mobile-journal-toggle" aria-controls="mobileJournalBody" aria-expanded="${journalOpen}" onclick="toggleMobileJournal()">戰鬥紀錄</button>`+html.slice(at,live)+`<div id="mobileJournalBody" class="mobile-journal-body">`+html.slice(live,resizer)+'</div></section>'+html.slice(resizer,loot)+`<section class="mobile-journal-loot"><button type="button" class="mobile-loot-toggle" aria-controls="mobileLootBody" aria-expanded="${lootOpen}" onclick="toggleMobileLoot()">戰利品／整理</button><div id="mobileLootBody" class="mobile-loot-body">`+lootHTML+'</div></section></section>';
  };
  const renderBase=render;
  render=function(...args){const out=renderBase(...args);sync();return out;};
  const after=globalThis.__EMBERWILD_AFTER_RENDER;
  globalThis.__EMBERWILD_AFTER_RENDER=function(...args){after?.(...args);sync();};
  const refreshBase=refreshGlobalJournal;
  refreshGlobalJournal=function(...args){const out=refreshBase(...args);sync();return out;};
  const tabBase=setTab;
  setTab=function(id){
    const previous=tab;menuOpen=false;const out=tabBase(id);sync();
    if(mobile.matches&&tab!==previous)document.querySelector('.layout>main')?.scrollTo(0,0);
    return out;
  };
  document.getElementById('app').addEventListener('scroll',event=>{
    if(event.target.matches?.('.mobile-loot-body'))lootScroll=event.target.scrollTop;
    if(event.target.matches?.('.mobile-more-pages'))menuScroll=event.target.scrollTop;
  },true);
  document.addEventListener('click',event=>{
    const skill=event.target.closest?.('[data-team-skill]');
    if(mobile.matches&&skill)pendingSkill=skill.dataset.teamSkill;
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&menuOpen){menuOpen=false;sync();document.querySelector('.mobile-more-toggle')?.focus();}});
  document.addEventListener('click',event=>{if(menuOpen&&!event.target.closest('#app>.layout>aside')){menuOpen=false;sync();}});
  mobile.addEventListener('change',()=>{menuOpen=false;if(state)render();else sync();});
  if(state)render();else sync();
})();
