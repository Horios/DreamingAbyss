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
  // Desktop sub-pages wrap instead of scrolling, so reading their widths there only forces an extra layout per redraw.
  function scrollSubtabs(){
    if(!compact.matches){lastTabKey='';return;}
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
  /* v0.121 Detail sheets: on phones a list's detail pane is hidden until an item is tapped, then slides up from the
     bottom navigation. The pane is the page's own element (shown with CSS), so its content, ids and handlers are unchanged. */
  const phone=matchMedia('(max-width:700px)');
  const SHEETS={
    gear:{panel:'#app .inventory-detail-wrap',trigger:'.gear-management-row .inventory-list-item,.bag-grid:not(.is-batch) .bag-cell[data-bag-ref]',title:'道具詳情'},
    token:{panel:'#app .token-inventory-detail',trigger:'.token-management-row .token-inventory-row',title:'信物詳情'},
    worn:{panel:'#app .worn-candidate-pane',trigger:'.worn-slot-choice',title:'裝備欄位'},
    mail:{panel:'#modal .mailbox-detail',trigger:'.mailbox-list-item',title:'信件',back:'返回信件列表'}
  };
  let sheet='';
  function setSheet(key){
    sheet=phone.matches&&SHEETS[key]?key:'';
    if(sheet)document.body.dataset.sheet=sheet;else delete document.body.dataset.sheet;
    syncSheet();
  }
  // rendered: the page was just redrawn, so a missing pane means its page or list is gone. Right after a tap the redraw
  // may still be deferred by the interaction guard; the mark then waits for it.
  function syncSheet(rendered){
    if(!sheet)return;
    const config=SHEETS[sheet],panel=document.querySelector(config.panel);
    if(!phone.matches||!panel&&rendered&&!globalThis.isEmberwildUIInteracting?.()){sheet='';delete document.body.dataset.sheet;return;}
    if(!panel)return;
    if(!panel.querySelector(':scope>.sheet-head'))panel.insertAdjacentHTML('afterbegin',`<div class="sheet-head"><b>${config.title}</b><button type="button" class="sheet-close" aria-label="${config.back||'關閉詳情'}" onclick="closeDetailSheet()">${config.back?'返回':'關閉'}</button></div>`);
    if(sheet==='worn'){
      // The chosen slot's four actions join the sheet, above the candidates.
      const slot=document.querySelector('#app .worn-slot.selected-slot'),actions=slot?.querySelector(':scope>.actions'),label=slot?.querySelector('.slot-label')?.textContent;
      if(label)panel.querySelector('.sheet-head>b').textContent=label;
      if(actions){actions.classList.add('sheet-actions');panel.querySelector('.sheet-head').after(actions);}
    }
  }
  function syncTokenFilters(){
    const controls=document.querySelector('#app .token-management-panel>.gear-management-controls');
    if(!controls||controls.querySelector(':scope>.token-filter-toggle'))return;
    const open=document.body.classList.contains('token-filters-open');
    controls.insertAdjacentHTML('afterbegin',`<button type="button" class="token-filter-toggle" aria-expanded="${open}" onclick="toggleTokenFilters()">${open?'收起篩選':'信物篩選'}</button>`);
  }
  // BOSS crafting lists every region's recipes; phones show one region, starting with the party's current map.
  let bossRegion=null;
  function syncBossRegions(){
    const list=document.querySelector('#app .boss-reading-page .boss-recipes');if(!list)return;
    const cards=[...list.querySelectorAll(':scope>.boss-recipe')],regions=[...new Set(cards.map(card=>card.querySelector(':scope>.tag')?.textContent.trim()).filter(Boolean))];
    let filter=list.previousElementSibling?.classList.contains('boss-region-filter')?list.previousElementSibling:null;
    if(!phone.matches||regions.length<2){filter?.remove();for(const card of cards)card.hidden=false;return;}
    if(bossRegion===null){const here=typeof MAPS!=='undefined'&&typeof party!=='undefined'?MAPS[party?.map]?.name:'';bossRegion=regions.includes(here)?here:regions[0];}
    if(bossRegion!==''&&!regions.includes(bossRegion))bossRegion=regions[0];
    if(!filter){filter=document.createElement('label');filter.className='boss-region-filter';filter.innerHTML='<span>地區</span><select aria-label="BOSS 製作地區" onchange="setBossCraftRegion(this.value)"></select>';list.before(filter);}
    const select=filter.querySelector('select'),options=[['','全部地區'],...regions.map(name=>[name,name])],html=options.map(([value,label])=>`<option value="${esc(value)}">${esc(label)}</option>`).join('');
    if(select.dataset.options!==html){select.innerHTML=html;select.dataset.options=html;}
    if(select.value!==bossRegion)select.value=bossRegion;
    for(const card of cards)card.hidden=!!bossRegion&&card.querySelector(':scope>.tag')?.textContent.trim()!==bossRegion;
  }
  globalThis.setBossCraftRegion=function(name){bossRegion=String(name??'');syncBossRegions();return bossRegion;};
  // Character creation: phones show one class card with tabs for the others.
  let creationClass=0;
  function syncCreationTabs(){
    const start=document.querySelector('#app>.start'),cards=start?[...start.querySelectorAll('.cards>.card')]:[];
    if(!start||cards.length<2)return;
    let tabs=start.querySelector(':scope>.creation-class-tabs');
    if(!phone.matches){tabs?.remove();for(const card of cards)card.hidden=false;return;}
    if(creationClass>=cards.length)creationClass=0;
    if(!tabs){tabs=document.createElement('div');tabs.className='creation-class-tabs';tabs.setAttribute('role','group');tabs.setAttribute('aria-label','職業');tabs.innerHTML=cards.map((card,index)=>`<button type="button" onclick="setCreationClass(${index})">${esc(card.querySelector('h2')?.textContent||'')}</button>`).join('');start.querySelector('.cards').before(tabs);}
    [...tabs.children].forEach((button,index)=>button.setAttribute('aria-pressed',String(index===creationClass)));
    cards.forEach((card,index)=>{card.hidden=index!==creationClass;});
  }
  globalThis.setCreationClass=function(index){creationClass=Math.max(0,Number(index)||0);syncCreationTabs();document.querySelector('#app>.start')?.scrollTo?.(0,0);return creationClass;};
  // Desktop: the battle report column folds to a strip; the choice is kept for this browser.
  const JOURNAL_KEY='dreamingAbyss.journalCollapsed';
  // No stored choice: the column folds by default on narrow desktop windows (901–1100px) and stays open on wider ones.
  // Once the player folds or opens it, that choice is kept for every width.
  const narrowDesk=matchMedia('(min-width:901px) and (max-width:1100px)');
  let journalChoice=null;try{const v=localStorage.getItem(JOURNAL_KEY);if(v==='1'||v==='0')journalChoice=v==='1';}catch{}
  const journalIsCollapsed=()=>journalChoice??narrowDesk.matches;
  let journalCollapsed=journalIsCollapsed();
  narrowDesk.addEventListener('change',()=>{journalCollapsed=journalIsCollapsed();syncJournalToggle();});
  function syncJournalToggle(){
    document.body.classList.toggle('journal-collapsed',journalCollapsed);
    const journal=document.getElementById('globalBattleJournal');if(!journal||typeof journal.prepend!=='function')return;
    let button=journal.querySelector(':scope>.journal-collapse-toggle');
    if(!button){button=document.createElement('button');button.type='button';button.className='journal-collapse-toggle';button.onclick=()=>toggleJournalCollapsed();journal.prepend(button);}
    const label=journalCollapsed?'展開戰報':'收合 ›';
    if(button.textContent!==label)button.textContent=label;
    button.setAttribute('aria-expanded',String(!journalCollapsed));button.setAttribute('aria-label',journalCollapsed?'展開戰報欄':'收合戰報欄');
  }
  globalThis.toggleJournalCollapsed=function(value){journalCollapsed=value===undefined?!journalCollapsed:!!value;journalChoice=journalCollapsed;try{localStorage.setItem(JOURNAL_KEY,journalCollapsed?'1':'0');}catch{}syncJournalToggle();return journalCollapsed;};
  if(typeof refreshGlobalJournal==='function'){const journalBase=refreshGlobalJournal;refreshGlobalJournal=function(...args){const out=journalBase(...args);syncJournalToggle();return out;};}
  // Phones: long explanations are clamped to two lines and remember what was opened
  // for this visit (by text, so a redraw keeps it).
  const INTROS='#app>.layout>main .companion-management-page>.roster-page>p,#app>.layout>main .partner-roster-intro,#app>.layout>main>section.panel:has(+.cards),#app>.layout>main .statistics-note';
  const openIntros=new Set();
  const keyOf=el=>(el.textContent||'').trim().slice(0,40);
  function syncIntros(){
    if(!phone.matches||!document.querySelectorAll)return;
    for(const el of document.querySelectorAll(INTROS)){
      if(el.classList.contains('intro-clamp'))continue;
      const text=(el.textContent||'').trim();if(text.length<60)continue;
      const key=keyOf(el),open=openIntros.has(key);
      el.classList.add('intro-clamp');el.classList.toggle('intro-open',open);el.dataset.introKey=key;
      const button=document.createElement('button');button.type='button';button.className='intro-clamp-toggle';button.textContent=open?'收起說明':'展開說明';button.setAttribute('aria-expanded',String(open));
      button.onclick=()=>{const now=!el.classList.contains('intro-open');el.classList.toggle('intro-open',now);if(now)openIntros.add(key);else openIntros.delete(key);button.textContent=now?'收起說明':'展開說明';button.setAttribute('aria-expanded',String(now));};
      el.after(button);
    }
  }
  // Wide screens (1600px and up): the equipment backpack gains a third column comparing the selected gear with what the
  // protagonist wears in that slot. It reuses equipmentComparison()/equipmentAffixComparison(), which work on a copy.
  const wide=matchMedia('(min-width:1600px)');
  function compareHTML(g){
    const h=party.members[0],who=esc(characterName(h)),wearer=gearWearer(g.id);
    if(wearer)return `<p class="small">${esc(characterName(wearer))}目前穿戴這件裝備。</p>`;
    if(!eligibleWearers(g).includes(h))return `<p class="small">${who}無法穿戴（職業或部位不符）。</p>`;
    const positions=gearEquipPositions(g);let target=positions.find(p=>!h.equipped[p]);if(target===undefined)target=positions[0];
    const current=h.bag.find(x=>x.id===h.equipped[target]);
    const fmt=(r,unit='')=>`<td>${r.before}${r.percent?'%':unit}</td><td>${r.after}${r.percent?'%':unit}</td><td class="${r.good?'delta-up':'delta-down'}">${r.delta>0?'+':''}${r.delta}${r.percent?' 百分點':unit}</td>`;
    const rows=equipmentComparison(h,g,target).map(r=>`<tr><td>${esc(r.label)}</td>${fmt(r)}</tr>`).join('')||'<tr><td colspan="4">數值無變化</td></tr>';
    const affix=current&&globalThis.equipmentAffixComparison?globalThis.equipmentAffixComparison(current,g).map(r=>`<tr><td>${esc(r.label)}</td>${fmt(r,r.unit||'')}</tr>`).join(''):'';
    return `<p class="inventory-compare-current"><span class="small">${who} · ${esc(EQUIP_POSITION_NAMES[target]||'')} · 目前</span><br>${current?equipmentNameHTML(current):'<span class="small">（空欄位）</span>'}</p>`+
      `<table class="equip-delta-table"><thead><tr><th>能力</th><th>目前</th><th>穿戴後</th><th>差異</th></tr></thead><tbody>${rows}</tbody></table>`+
      (affix?`<table class="equip-delta-table equip-affix-delta-table"><thead><tr><th>詞條</th><th>目前</th><th>穿戴後</th><th>差異</th></tr></thead><tbody>${affix}</tbody></table>`:'');
  }
  function syncWideCompare(){
    const grid=document.querySelector?.('#app .gear-management-panel .inventory-master-detail');
    let pane=grid?.querySelector(':scope>.inventory-compare-pane');
    const g=grid&&wide.matches&&typeof inventorySelectedGearId!=='undefined'?findGear(inventorySelectedGearId):null;
    if(!g||EmberwildTokens.isToken(g)){pane?.remove();return;}
    const h=party.members[0],key=[g.id,g.plus||0,h.equipped.join(','),(g.affix||[]).length].join('|');
    if(pane?.dataset.key===key)return;
    if(!pane){pane=document.createElement('section');pane.className='inventory-compare-pane';pane.setAttribute('aria-label','與目前穿戴比較');grid.appendChild(pane);}
    pane.dataset.key=key;
    try{pane.innerHTML='<h3>與目前穿戴比較</h3>'+compareHTML(g);}catch(error){console.warn(error);pane.remove();}
  }
  // v0.211 grid bag: the detail pane shows the same comparison in a fold on every width.
  globalThis.__EMBERWILD_GEAR_COMPARE=g=>compareHTML(g);
  wide.addEventListener('change',()=>syncWideCompare());
  function syncPages(){syncJournalToggle();syncSheet(true);syncIntros();syncWideCompare();syncTokenFilters();syncBossRegions();syncCreationTabs();}
  globalThis.toggleTokenFilters=function(){const open=document.body.classList.toggle('token-filters-open');const b=document.querySelector('.token-filter-toggle');if(b){b.setAttribute('aria-expanded',String(open));b.textContent=open?'收起篩選':'信物篩選';}return open;};
  globalThis.closeDetailSheet=function(){const was=sheet;setSheet('');return !!was;};
  globalThis.openDetailSheet=key=>{setSheet(key);return sheet===key;};
  globalThis.currentDetailSheet=()=>sheet;
  // Capture phase: the sheet is marked before the page's own handler redraws the pane.
  document.addEventListener('click',event=>{
    if(!phone.matches)return;
    const target=event.target;if(!target?.closest)return;
    for(const [key,config] of Object.entries(SHEETS))if(target.closest(config.trigger)){setSheet(key);return;}
    if(!sheet)return;
    const panel=document.querySelector(SHEETS[sheet].panel);
    // v0.194: 移到工坊 leaves the worn page; the workshop is a single column on phones and uses no sheet.
    if(sheet==='worn'&&target.closest('.sheet-actions button[onclick*="moveToWorkshop"]')){queueMicrotask(()=>setSheet(''));return;}
    if(panel?.contains(target)||target.closest('#modal,#toast,.sheet-head'))return;
    if(sheet!=='mail')setSheet('');
  },true);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&sheet&&sheet!=='mail')setSheet('');});
  // Only leaving phone width closes a sheet; the change event can arrive after a sheet was just opened at the new width.
  phone.addEventListener('change',()=>{if(!phone.matches)setSheet('');syncPages();});
  const sheetPage={gear:'equipment',token:'equipment',worn:'worn'};
  const tabBase=setTab;setTab=function(...args){if(sheet&&sheet!=='mail'&&sheetPage[sheet]!==args[0])setSheet('');return tabBase(...args);};
  const closeBase=closeModal;closeModal=function(...args){if(sheet==='mail')setSheet('');return closeBase(...args);};
  // Selecting an item (a tap, or a jump from another page that picks one) means its detail is wanted.
  if(typeof selectInventoryGear==='function'){const gearBase=selectInventoryGear;selectInventoryGear=function(...args){if(phone.matches)setSheet('gear');return gearBase(...args);};}
  // v0.211 grid bag: tokens share the bag's detail pane, so they open the same sheet.
  if(typeof selectInventoryToken==='function'){const tokenBase=selectInventoryToken;selectInventoryToken=function(...args){if(phone.matches)setSheet(document.querySelector('#app .bag-detail')?'gear':'token');return tokenBase(...args);};}
  const modal=document.getElementById('modal');
  if(modal)new MutationObserver(()=>{if(sheet==='mail')syncSheet();}).observe(modal,{childList:true});
  const renderBase=render;render=function(...args){const out=renderBase(...args);sync();syncPages();return out;};
  const after=globalThis.__EMBERWILD_AFTER_RENDER;globalThis.__EMBERWILD_AFTER_RENDER=function(...args){after?.(...args);sync();syncPages();};
  compact.addEventListener('change',sync);
  sync();syncPages();
})();
