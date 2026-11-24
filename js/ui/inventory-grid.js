/* v0.211 Grid bag.
   Replaces the bag page's lists and cards with one square slot per gear instance or stack. Six tabs follow the inventory
   model (EmberwildInventory.TABS); capacity and stack limits come from EmberwildItems.slots()/definitions, never from here.
   Every item action is the existing one: gear detail is inventoryGearDetail(), tokens use the token inventory's detail,
   stacks use the item dialog's info/controls (item-presentation.js), batch sell/salvage use the existing review flows.
   Selection is keyed by gear id, stack uid or ledger key, never by the position on screen. */
(()=>{
  'use strict';
  const TABS=[
    {id:'equipment',tab:'equipment',label:'裝備',glyph:'sword'},
    {id:'materials',tab:'material',label:'素材',glyph:'package'},
    {id:'gems',tab:'gem',label:'寶石',glyph:'gem'},
    {id:'items',tab:'consumable',label:'消耗品',glyph:'flask-round'},
    {id:'tokens',tab:'token',label:'信物',glyph:'medal'},
    {id:'special',tab:'special',label:'特殊',glyph:'ticket'}
  ];
  const byId=Object.fromEntries(TABS.map(t=>[t.id,t]));
  const SLOT_NAMES=['武器','護甲','副手','飾品'];
  const selection=new Map(),lastIndex=new Map(),scrolls=new Map();
  const stackSort={materials:'kind',gems:'kind',items:'kind'};
  let identifyFilter='all',filtersOpen=false,tokenQuality='all',restoreScroll=null,gearKindSort=false,tokenKindSort=false,pickSlot='all',pickQuality='all',gemMulti=false,gemTier='all';
  const gemPicked=new Set();
  const svg=(glyph,size=18)=>globalThis.__EMBERWILD_SKILL_ICONS?.svgFor('lucide:'+glyph,[],{size})||'';
  const P=()=>globalThis.__EMBERWILD_ITEM_PRESENTATION;
  const items=()=>globalThis.EmberwildItems;
  const G=()=>globalThis.__EMBERWILD_GEAR_INVENTORY;
  const T=()=>globalThis.__EMBERWILD_TOKEN_INVENTORY;
  const attr=v=>esc(String(v??''));
  const num=n=>Number(n||0).toLocaleString();
  const current=()=>byId[inventoryCategory]||byId.equipment;

  /* ---------- tab and category routing ---------- */
  setInventoryCategory=function(value){
    if(value==='gem')value='gems';
    if(!byId[value])return;
    if(value===inventoryCategory)return;
    const pane=document.querySelector('#app .bag-grid-pane');if(pane)scrolls.set(inventoryCategory,pane.scrollTop);
    inventoryCategory=value;filtersOpen=false;restoreScroll=value;render();
  };
  globalThis.setInventoryCategory=setInventoryCategory;
  function tabsHTML(usage){
    return `<div class="bag-tabs inventory-category-tabs" role="tablist" aria-label="背包分類">${TABS.map(t=>{const u=usage?.tabs?.[t.tab],on=t.id===inventoryCategory;
      return `<button type="button" role="tab" class="bag-tab${on?' is-active primary':''}" aria-selected="${on}" data-bag-tab="${t.id}" onclick="setInventoryCategory('${t.id}')">${svg(t.glyph,16)}<span>${t.label}</span>${u?`<small>${u.used}</small>`:''}</button>`;}).join('')}</div>`;
  }

  /* ---------- cells ---------- */
  function gearKey(g){return globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY?.(g)||(globalThis.EmberwildTokens?.isToken(g)?{kind:'token',key:g.tokenId}:{kind:'equipment',key:''});}
  const lockSvg='<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>';
  function gearCell(g,{picked=false,disabled=false}={}){
    const ref='g:'+g.id,sel=selected()===ref;
    if(g.unidentified){
      // Slot only: no real name, quality, enhancement, sockets or form icon before identification.
      const slot=g.unidentified.slot??g.slot,name='未鑑定'+(SLOT_NAMES[slot]||'裝備');
      return cell(ref,`<span class="bag-cell-art bag-cell-unknown">${P().icon('equipment','',{slot})}<span class="bag-cell-q">?</span></span>`,'is-unidentified',`${name}，裝等 ${g.unidentified.level??'—'}`,sel,picked,disabled);
    }
    const id=gearKey(g),token=globalThis.EmberwildTokens?.isToken(g),q=token?Math.max(0,Math.min(3,Number(g.rar)||0)):gearQualityRank(g);
    // Same socket rule as the existing badge (skill-system-ui.js): one circle per socket, filled with the gem's colour.
    const gems=g.skillSockets?.count>0?g.skillSockets.gems.slice(0,g.skillSockets.count):[];
    const socketLabel=gems.map((x,i)=>'第 '+(i+1)+' 孔：'+(GEMS[x]?.name||'空孔')).join('、');
    const sockets=gems.length?`<span class="bag-cell-br bag-sockets equipment-socket-badge" role="img" aria-label="${attr(socketLabel)}">${gems.map(x=>`<svg viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4.5" fill="${attr(GEMS[x]?.color||'none')}" stroke="currentColor"/></svg>`).join('')}</span>`:'';
    const plus=g.plus>0?`<span class="bag-cell-tl">+${g.plus}</span>`:'';
    const lock=g.locked?`<span class="bag-cell-tr bag-lock">${lockSvg}</span>`:'';
    const label=equipmentDisplayName(g)+(g.plus>0?' +'+g.plus:'')+(gems.length?'，'+socketLabel:'')+(g.locked?'，已鎖定':'');
    return cell(ref,`<span class="bag-cell-art">${P().icon(id.kind,id.key,g)}</span>${plus}${lock}${sockets}`,'item-quality-'+q,label,sel,picked,disabled,` data-item-kind="${attr(id.kind)}" data-item-key="${attr(id.key)}" data-item-gear="${attr(g.id)}" data-item-context="reference"`);
  }
  function stackCell(ref,kind,key,qty,label,{tier,picked=false}={}){
    const sel=!picked&&selected()===ref&&!(kind==='gem'&&gemMulti);
    return cell(ref,`<span class="bag-cell-art">${P().icon(kind,key)}</span>${tier?`<span class="bag-cell-tl bag-tier">${attr(tier)}</span>`:''}<span class="bag-cell-br bag-count">${qty>=10000?Math.floor(qty/1000)+'k':qty}</span>`,'is-stack',label+' ×'+num(qty),sel,picked,false,` data-item-kind="${attr(kind)}" data-item-key="${attr(key)}" data-item-context="reference" data-item-quantity="${attr(qty)}"`);
  }
  // data-item-* gives desktop pointers the shared hover description (item-presentation.js); unidentified gear has none.
  function cell(ref,inner,cls,label,sel,picked,disabled,item=''){
    return `<button type="button" class="bag-cell ${cls}${sel?' is-selected':''}${picked?' is-picked':''}${disabled?' is-disabled':''}" data-bag-ref="${attr(ref)}"${item} aria-label="${attr(label)}" ${sel||picked?'aria-pressed="true"':'aria-pressed="false"'} ${disabled?'aria-disabled="true"':''} onclick="bagCellClick(this.dataset.bagRef)">${inner}</button>`;
  }
  const empty=n=>n>0?Array.from({length:n},()=>'<span class="bag-cell is-empty" aria-hidden="true"></span>').join(''):'';

  /* ---------- entries per tab ---------- */
  const worn=g=>!!gearWearer(g.id);
  function gearEntries(){
    let rows=G().rows().map(r=>r.g);
    if(identifyFilter==='identified')rows=rows.filter(g=>!g.unidentified);
    else if(identifyFilter==='unidentified')rows=rows.filter(g=>g.unidentified);
    // 種類: part, then weapon type and equipment form; the chosen order stays the tie-breaker.
    if(gearKindSort){const kind=g=>{const slot=g.unidentified?.slot??g.slot,id=g.unidentified?{key:''}:gearKey(g);return [slot,g.unidentified?'':String(g.weaponType||''),g.unidentified?'~':String(id.key||'')];};
      rows=rows.map((g,i)=>({g,i,k:kind(g)})).sort((a,b)=>a.k[0]-b.k[0]||a.k[1].localeCompare(b.k[1])||a.k[2].localeCompare(b.k[2])||a.i-b.i).map(x=>x.g);}
    return rows.map(g=>({ref:'g:'+g.id,g}));
  }
  function tokenEntries(){
    // The grid shows bag slots, so worn tokens stay on the 裝備與信物 page like worn equipment.
    let rows=T().rows().map(r=>r.g).filter(g=>!worn(g)&&(tokenQuality==='all'||String(g.rar)===tokenQuality));
    if(tokenKindSort)rows=rows.map((g,i)=>({g,i})).sort((a,b)=>String(a.g.tokenId).localeCompare(String(b.g.tokenId))||a.i-b.i).map(x=>x.g);
    return rows.map(g=>({ref:'g:'+g.id,g}));
  }
  function chunks(total,cap){const out=[];let left=total;while(left>0){out.push(Math.min(cap,left));left-=Math.min(cap,left);}return out;}
  function stackEntries(t){
    const I=items(),list=I.stacks().filter(st=>st.definition.tab===t.tab).map((st,order)=>({ref:'s:'+st.uid,id:st.item,kind:st.definition.kind,key:st.definition.key,qty:st.qty,def:st.definition,order}));
    if(t.id==='items'){
      const v=globalThis.EmberwildRegionVouchers?.ledger?.()?.stacks||[],cap=I.definition('item:region-voucher').maxStack;
      for(const s of v)chunks(s.count,cap).forEach((n,i)=>list.push({ref:'v:'+s.id+':'+i,id:'item:region-voucher',kind:'item',key:'region-voucher:'+s.id,qty:n,total:s.count,def:{name:s.mapName+' '+s.minutes+' 分鐘收益券',category:'consumable'},order:1e6+list.length}));
    }
    if(t.id==='special'){
      for(const [c,n] of Object.entries(party?.achievements?.tickets||{})){if(!(n>0))continue;const id='item:companion-ticket-'+c,d=I.definition(id);chunks(n,d.occupiesSlot?d.maxStack:n).forEach((q,i)=>list.push({ref:'t:'+c+':'+i,id,kind:'item',key:'companion-ticket-'+c,qty:q,total:n,def:d,order:1e6+list.length,ticket:c}));}
    }
    const mode=stackSort[t.id]||'kind',nm=e=>P().name(e.kind,e.key);
    const cats=Object.keys(globalThis.EmberwildInventory.CATEGORIES);
    list.sort((a,b)=>{
      if(mode==='qty')return b.qty-a.qty||a.order-b.order;
      if(mode==='name')return nm(a).localeCompare(nm(b),'zh-Hant')||a.order-b.order;
      if(mode==='tier'&&a.kind==='gem'&&b.kind==='gem')return Number(b.key)-Number(a.key)||a.order-b.order;
      if(t.id==='gems')return (Number(a.key)%GEM_KINDS)-(Number(b.key)%GEM_KINDS)||Number(a.key)-Number(b.key)||a.order-b.order;
      return cats.indexOf(a.def.category)-cats.indexOf(b.def.category)||a.order-b.order;
    });
    return list;
  }
  function entries(t){return t.id==='equipment'?gearEntries():t.id==='tokens'?tokenEntries():stackEntries(t);}

  /* ---------- selection ---------- */
  function selected(){
    const t=current();
    if(t.id==='equipment')return inventorySelectedGearId?'g:'+inventorySelectedGearId:null;
    return selection.get(t.id)||null;
  }
  function setSelected(t,ref){
    if(t.id==='equipment')inventorySelectedGearId=ref?ref.slice(2):null;
    else if(ref)selection.set(t.id,ref);else selection.delete(t.id);
  }
  /* The previous pick survives redraws (drops, settlement). A stack that merged away falls back to another stack of the
     same item; an item that left the bag falls back to the slot that took its place. */
  function resolve(t,list){
    let ref=selected();
    const at=ref?list.findIndex(e=>e.ref===ref):-1;
    if(at>=0){lastIndex.set(t.id,at);return list[at];}
    if(ref&&ref.startsWith('s:')){const was=selection.get(t.id+':item'),same=was&&list.find(e=>e.id===was);if(same){setSelected(t,same.ref);return same;}}
    if(ref&&(ref.startsWith('t:')||ref.startsWith('v:'))){const base=ref.split(':').slice(0,2).join(':'),same=list.find(e=>e.ref.startsWith(base+':'));if(same){setSelected(t,same.ref);return same;}}
    const fallback=list.length?list[Math.min(lastIndex.get(t.id)??0,list.length-1)]:null;
    setSelected(t,fallback?.ref||null);return fallback;
  }
  globalThis.bagCellClick=function(ref){
    const t=current();ref=String(ref||'');
    if(ref.startsWith('g:')){
      const id=ref.slice(2),g=findGear(id);if(!g)return false;
      if(t.id==='equipment'&&G().multi()){const on=G().selection().includes(id);return toggleGearInventorySelected(id,!on);}
      if(t.id==='tokens'&&T().multi()){const on=T().selection().includes(id);return toggleTokenSelected(id,!on);}
    }
    if(t.id==='equipment'&&ref.startsWith('g:')){selectInventoryGear(ref.slice(2));return true;}
    if(t.id==='gems'&&gemMulti){if(!entries(t).some(x=>x.ref===ref))return false;if(gemPicked.has(ref))gemPicked.delete(ref);else gemPicked.add(ref);render();return true;}
    setSelected(t,ref);
    const e=entries(t).find(x=>x.ref===ref);if(e?.id)selection.set(t.id+':item',e.id);
    render();return true;
  };

  /* ---------- detail ---------- */
  function emptyDetail(t){return `<div class="inventory-detail-empty bag-detail-empty">${t.id==='equipment'||t.id==='tokens'?'點擊格子查看裝備詳細資訊與操作。':'點擊格子查看道具詳細資訊與操作。'}</div>`;}
  /* The existing comparison (responsive-shell.js): a third column on wide screens, a fold in the detail pane otherwise. */
  const wide=matchMedia('(min-width:1600px)');
  wide.addEventListener('change',()=>{if(typeof tab!=='undefined'&&tab==='equipment')render();});
  function compareOf(g){
    if(!g||g.unidentified||worn(g)||globalThis.EmberwildTokens?.isToken(g)||typeof globalThis.__EMBERWILD_GEAR_COMPARE!=='function')return '';
    try{return globalThis.__EMBERWILD_GEAR_COMPARE(g);}catch(e){console.warn(e);return '';}
  }
  function gearDetail(g){
    let html=inventoryGearDetail(g);
    const cmp=wide.matches?'':compareOf(g);
    if(cmp)html+=`<details class="bag-compare"><summary>與目前穿戴比較</summary>${cmp}</details>`;
    return html;
  }
  function stackDetail(t,e){
    const p=P(),ref={kind:e.kind,key:e.key,context:'inventory',quantity:e.total??e.qty};
    if(e.kind==='material'){const maps=[...(globalThis.inventoryMaterialRegions?.().get(e.key)||[])].sort((a,b)=>a-b);ref.extra='取得地區：'+(maps.length?maps.map(i=>MAPS[i].name).join('、'):e.key==='小蟲'?'採集取得':'非地區來源／未指定');}
    let body=p.info(ref),actions=p.controls(ref);
    if(e.kind==='gem'){
      const i=Number(e.key),q=globalThis.gemUpgradeQuote?.(i),have=state.gems[i]||0,one=globalThis.gemSalvageQuote?.({[i]:1});
      actions+=`<div class="actions">${q&&!q.max?`<button type="button" onclick="openGemUpgrade(${i})" ${q.count>0?'':'disabled'}>粉塵升級 · ${q.cost} 粉塵</button>`:''}${one?.rows.length?`<button type="button" onclick="openGemSalvage({${i}:1})" ${have>0?'':'disabled'}>分解 1 顆 · ${one.dust} 粉塵</button><button type="button" onclick="openGemSalvage({${i}:${have}})" ${have>1?'':'disabled'}>全部分解</button>`:''}</div>`;
    }
    const def=e.def,stack=e.ref.startsWith('s:')?`<p class="small">此格數量 ${num(e.qty)}${def?.maxStack&&def.maxStack<1e9?' / 堆疊上限 '+num(def.maxStack):''}${def?.categoryLabel?' · '+attr(def.categoryLabel):''}</p>`:'';
    return `<div class="inventory-detail-pane bag-item-detail"><div class="bag-detail-head"><span class="bag-detail-art">${p.icon(e.kind,e.key)}</span></div>${body}${stack}<div class="bag-detail-actions">${actions}</div></div>`;
  }
  function detailHTML(t,e){
    if(!e)return emptyDetail(t);
    if(e.g)return t.id==='tokens'?T().detail(e.g):gearDetail(e.g);
    return stackDetail(t,e);
  }

  /* ---------- toolbar ---------- */
  const choose=(label,value,options,handler)=>`<label class="bag-field"><span>${label}</span><select aria-label="${label}" onchange="${handler}">${options.map(([v,text])=>`<option value="${attr(v)}" ${String(v)===String(value)?'selected':''}>${attr(text)}</option>`).join('')}</select></label>`;
  globalThis.setBagIdentifyFilter=v=>{if(!['all','identified','unidentified'].includes(v))return false;identifyFilter=v;render();return true;};
  globalThis.setBagStackSort=v=>{const t=current();if(!['kind','name','qty','tier'].includes(v)||!(t.id in stackSort))return false;stackSort[t.id]=v;render();return true;};
  globalThis.setBagTokenQuality=v=>{tokenQuality=String(v);render();return true;};
  globalThis.toggleBagFilters=()=>{filtersOpen=!filtersOpen;render();return filtersOpen;};
  globalThis.setBagGearSort=v=>{if(v==='kind'){gearKindSort=true;render();return true;}gearKindSort=false;return setGearInventorySort(v);};
  globalThis.setBagTokenSort=v=>{if(v==='kind'){tokenKindSort=true;render();return true;}tokenKindSort=false;return setTokenSort(v);};
  globalThis.toggleGemBatch=()=>{gemMulti=!gemMulti;gemPicked.clear();render();return gemMulti;};
  globalThis.setGemBatchTier=v=>{gemTier=String(v);render();return true;};
  globalThis.pickGemBatch=function(all){gemPicked.clear();for(const e of stackEntries(byId.gems))if(all||gemTier==='all'||String(GEMS[Number(e.key)]?.tier)===gemTier)gemPicked.add(e.ref);render();return gemPicked.size;};
  globalThis.clearGemBatch=()=>{gemPicked.clear();render();};
  function gemCounts(){const out={};for(const e of stackEntries(byId.gems))if(gemPicked.has(e.ref))out[e.key]=(out[e.key]||0)+e.qty;return out;}
  // drop-rework.js (loaded later) defines the salvage; the batch mode ends after a confirmed salvage, as on cancel.
  let gemConfirmWrapped=false;
  globalThis.requestGemBatchSalvage=function(){
    if(!gemConfirmWrapped&&typeof globalThis.confirmGemSalvage==='function'){gemConfirmWrapped=true;const base=globalThis.confirmGemSalvage;globalThis.confirmGemSalvage=function(...a){const out=base.apply(this,a);if(out&&out.gems){gemMulti=false;gemPicked.clear();render();}return out;};}
    return Object.keys(gemCounts()).length?openGemSalvage(gemCounts()):false;
  };
  globalThis.setBagPick=(key,v)=>{if(key==='slot')pickSlot=String(v);else if(key==='quality')pickQuality=String(v);else return false;render();return true;};
  /* Batch pick: every listed, actionable item of the chosen part and rarity (protected items never join). */
  globalThis.pickBagBatch=function(){
    const t=current(),match=g=>(pickQuality==='all'||String(t.id==='tokens'?g.rar:gearQualityRank(g))===pickQuality)&&(t.id==='tokens'||pickSlot==='all'||String(g.slot)===pickSlot);
    const ids=entries(t).map(e=>e.g).filter(g=>g&&!g.unidentified&&match(g)).map(g=>g.id);
    const n=t.id==='equipment'?setGearInventorySelection(ids):t.id==='tokens'?setTokenSelection(ids):0;
    toast(n?'已選取 '+n+' 件':'沒有符合條件且可操作的道具');return n;
  };
  globalThis.clearBagFilters=()=>{identifyFilter='all';tokenQuality='all';for(const [k,v] of [['slot','all'],['quality','all'],['levelMin',''],['levelMax','']])setGearInventoryFilter(k,v);render();};
  function gearFiltersActive(){const f=G().filters();return identifyFilter!=='all'||f.slot!=='all'||f.quality!=='all'||f.levelMin!==''||f.levelMax!==''||f.job!=='all'||f.locked!=='all'||!!f.stat||!!f.affixType||f.tMin!==''||f.tMax!=='';}
  function equipmentTools(){
    const f=G().filters(),s=G().sort(),multi=G().multi(),sel=G().selection();
    const hidden=(state?.bag||[]).filter(g=>g.unidentified&&!worn(g)).length;
    if(multi)return `<div class="bag-batch" role="group" aria-label="批次選取"><b>批次選取 · 已選 ${sel.length} 件</b>${choose('依部位',pickSlot,[['all','全部部位'],...SLOT_NAMES.map((n,i)=>[i,n])],"setBagPick('slot',this.value)")}${choose('依稀有度',pickQuality,[['all','全部稀有度'],...AFFIX_RANK.map((n,i)=>[i,n])],"setBagPick('quality',this.value)")}<button type="button" onclick="pickBagBatch()">選取符合條件</button><button type="button" onclick="selectVisibleGear()">全選目前結果</button><button type="button" onclick="clearSelectedGear()" ${sel.length?'':'disabled'}>清除</button><button type="button" onclick="requestGearInventoryBatch('sell')" ${sel.length?'':'disabled'}>批次出售</button><button type="button" class="danger" onclick="requestGearInventoryBatch('salvage')" ${sel.length?'':'disabled'}>批次分解</button><button type="button" onclick="toggleGearInventoryMulti()">取消</button><span class="small">鎖定、已裝備、隊伍配置使用中、未鑑定與待確認洗鍊的裝備不可選取。</span></div>`;
    const active=gearFiltersActive();
    const sortSel=choose('排序',gearKindSort?'kind':s.key,[['kind','種類'],['quality','稀有度'],['level','裝備等級'],['acquired','取得時間'],['price','出售價格']],'setBagGearSort(this.value)');
    const filters=filtersOpen?`<div class="bag-filters">${choose('部位',f.slot,[['all','全部'],...SLOT_NAMES.map((n,i)=>[i,n])],"setGearInventoryFilter('slot',this.value)")}${choose('稀有度',f.quality,[['all','全部'],...AFFIX_RANK.map((n,i)=>[i,n])],"setGearInventoryFilter('quality',this.value)")}${choose('鑑定狀態',identifyFilter,[['all','全部'],['identified','已鑑定'],['unidentified','未鑑定']],'setBagIdentifyFilter(this.value)')}<label class="bag-field"><span>裝等下限</span><input type="number" min="1" aria-label="裝等下限" value="${attr(f.levelMin)}" onchange="setGearInventoryFilter('levelMin',this.value)"></label><label class="bag-field"><span>裝等上限</span><input type="number" min="1" aria-label="裝等上限" value="${attr(f.levelMax)}" onchange="setGearInventoryFilter('levelMax',this.value)"></label><button type="button" onclick="clearBagFilters()">清除篩選</button></div>`:'';
    return `<div class="bag-actions"><button type="button" class="${hidden?'primary':''}" onclick="identifyAllGear()" ${hidden?'':'disabled'}>全部鑑定${hidden?' · '+hidden:''}</button><button type="button" onclick="toggleGearInventoryMulti()">批次選取</button>${sortSel}<button type="button" class="bag-dir" onclick="toggleGearInventoryDirection()" aria-label="切換排序方向">${s.direction==='desc'?'高→低':'低→高'}</button><button type="button" class="bag-filter-toggle${active?' is-active':''}" aria-expanded="${filtersOpen}" onclick="toggleBagFilters()">篩選${active?' · 已套用':''}</button></div>${filters}`;
  }
  function tokenTools(){
    const multi=T().multi(),sel=T().selection();
    if(multi)return `<div class="bag-batch" role="group" aria-label="批次選取"><b>批次選取 · 已選 ${sel.length} 件</b>${choose('依稀有度',pickQuality,[['all','全部稀有度'],...AFFIX_RANK.map((n,i)=>[i,n])],"setBagPick('quality',this.value)")}<button type="button" onclick="pickBagBatch()">選取符合條件</button><button type="button" onclick="selectVisibleTokens()">全選目前結果</button><button type="button" onclick="clearSelectedTokens()" ${sel.length?'':'disabled'}>清除</button><button type="button" onclick="requestTokenBatch('sell')" ${sel.length?'':'disabled'}>批次出售</button><button type="button" class="danger" onclick="requestTokenBatch('salvage')" ${sel.length?'':'disabled'}>批次分解</button><button type="button" onclick="toggleTokenMulti()">取消</button><span class="small">鎖定、已裝備與隊伍配置使用中的信物不可選取。</span></div>`;
    return `<div class="bag-actions"><button type="button" onclick="toggleTokenMulti()">批次選取</button>${choose('排序',tokenKindSort?'kind':tokenSortValue(),[['kind','種類'],['quality','品質'],['enhance','強化'],['acquired','取得時間'],['name','名稱']],'setBagTokenSort(this.value)')}<button type="button" class="bag-dir" onclick="toggleTokenDirection()" aria-label="切換排序方向">切換方向</button>${choose('品質',tokenQuality,[['all','全部'],...AFFIX_RANK.map((n,i)=>[i,n])],'setBagTokenQuality(this.value)')}</div>`;
  }
  let tokenSortKey='quality';
  const tokenSortValue=()=>tokenSortKey;
  if(typeof setTokenSort==='function'){const base=setTokenSort;globalThis.setTokenSort=setTokenSort=function(v){const ok=base(v);if(ok)tokenSortKey=v;return ok;};}
  function stackTools(t){
    const opts={materials:[['kind','種類'],['name','名稱'],['qty','數量']],gems:[['kind','種類'],['tier','等級'],['qty','數量']],items:[['kind','種類'],['name','名稱'],['qty','數量']]}[t.id];
    if(t.id==='gems'&&gemMulti){const c=gemCounts(),n=Object.values(c).reduce((a,b)=>a+b,0),q=n?globalThis.gemSalvageQuote?.(c):null;
      return `<div class="bag-batch" role="group" aria-label="批次分解寶石"><b>批次分解 · 已選 ${n} 顆${q?' · '+q.dust+' 粉塵':''}</b>${choose('依等級',gemTier,[['all','全部等級'],['1','1 階'],['2','2 階'],['3','3 階']],'setGemBatchTier(this.value)')}<button type="button" onclick="pickGemBatch(false)">選取符合條件</button><button type="button" onclick="pickGemBatch(true)">全選</button><button type="button" onclick="clearGemBatch()" ${n?'':'disabled'}>清除</button><button type="button" class="danger" onclick="requestGemBatchSalvage()" ${n?'':'disabled'}>批次分解</button><button type="button" onclick="toggleGemBatch()">取消</button><span class="small">選取的格子整格分解；分解前會顯示明細並確認。</span></div>`;}
    let html=opts?`<div class="bag-actions">${t.id==='gems'?'<button type="button" onclick="toggleGemBatch()">批次分解</button>':''}${choose('排序',stackSort[t.id],opts,'setBagStackSort(this.value)')}`:'<div class="bag-actions">';
    if(t.id==='items'){
      const target=pageHero('equipment')||party.members[0],heroes=typeof enlistedHeroes==='function'?enlistedHeroes():party.members;
      if(heroes.length>1)html+=`<label class="bag-field"><span>使用角色</span><select aria-label="使用角色" onchange="selectPageHero('equipment',Number(this.value))">${heroes.map(h=>`<option value="${memberKey(h)}" ${h===target?'selected':''}>${attr(characterName(h))}</option>`).join('')}</select></label>`;
      html+=`<span class="small bag-supply">${attr(characterName(target))}目前藥水效果：<span class="supply-countdown" data-job="${memberKey(target)}">${attr(supplyStatus(target)||'無')}</span></span>`;
      const v=globalThis.EmberwildRegionVouchers?.ledger?.()?.stacks||[];if(v.length>1)html+=`<button type="button" onclick="useRegionVouchers('all')">一鍵使用全部收益券</button>`;
    }
    return html+'</div>';
  }
  function usageHTML(t,usage){
    const u=usage?.tabs?.[t.tab];if(!u)return '';
    const over=u.used>u.capacity;
    return `<span class="bag-usage${over?' is-over':''}" data-inventory-tab="${t.tab}" data-inventory-slots="${u.used}" title="${t.label}格數"><b>${u.used}</b>／${u.capacity}</span>${usage.enforced===false?'<span class="small bag-usage-note">容量尚未限制</span>':''}`;
  }

  /* ---------- page ---------- */
  function bagView(){
    const t=current();let usage=null;try{usage=items().slots();}catch(e){console.warn(e);}
    const list=entries(t),picked=new Set(t.id==='equipment'&&G().multi()?G().selection():t.id==='tokens'&&T().multi()?T().selection():[]);
    const batch=t.id==='equipment'&&G().multi()||t.id==='tokens'&&T().multi()||t.id==='gems'&&gemMulti;
    const e=resolve(t,list);
    const filtered=t.id==='equipment'&&gearFiltersActive()||t.id==='tokens'&&tokenQuality!=='all';
    const cap=usage?.tabs?.[t.tab]?.capacity||0,used=usage?.tabs?.[t.tab]?.used||0;
    const cells=list.map(x=>x.g?gearCell(x.g,{picked:picked.has(x.g.id),disabled:batch&&!(t.id==='tokens'?T().actionable(x.g):G().actionable(x.g))}):stackCell(x.ref,x.kind,x.key,x.qty,P().name(x.kind,x.key),{tier:x.kind==='gem'?(GEMS[Number(x.key)]?.tier?GEMS[Number(x.key)].tier+'階':''):'',picked:gemMulti&&gemPicked.has(x.ref)})).join('');
    // Empty slots only describe the real bag: never while a filter hides items.
    const pad=filtered?0:Math.max(0,cap-Math.max(used,list.length));
    const tools=t.id==='equipment'?equipmentTools():t.id==='tokens'?tokenTools():stackTools(t);
    const full=t.id==='equipment'&&state.bag.length>=RULES.bagCapacity?'<p class="gear-overflow-note" role="status">裝備已達保存上限，後續掉落的裝備會自動分解。</p>':'';
    const cmp=wide.matches&&t.id==='equipment'&&e?.g?compareOf(e.g):'';
    const side=cmp?`<section class="inventory-compare-pane bag-compare-pane" aria-label="與目前穿戴比較" data-key="${attr([e.g.id,e.g.plus||0,party.members[0].equipped.join(',')].join('|'))}"><h3>與目前穿戴比較</h3>${cmp}</section>`:'';
    const note=filtered?`<p class="small bag-filter-note">篩選中：顯示 ${list.length} 格</p>`:'';
    return `<section class="panel bag-panel gear-management-panel" data-bag-category="${t.id}">${tabsHTML(usage)}<div class="bag-toolbar"><div class="bag-meta">${usageHTML(t,usage)}<span class="bag-gold">◈ ${num(state.gold)} 金幣</span></div>${tools}</div>${full}${note}<div class="bag-layout${side?' has-compare':''}"><div class="bag-grid-pane"><div class="bag-grid${batch?' is-batch':''}" role="group" aria-label="${t.label}格子">${cells}${empty(pad)}</div>${!list.length&&filtered?'<p class="empty">沒有符合條件的道具。</p>':''}</div><section class="inventory-detail-wrap bag-detail" aria-label="道具詳細資訊">${detailHTML(t,e)}</section>${side}</div></section>`;
  }
  equipmentView=function(){return bagView();};
  globalThis.equipmentView=equipmentView;
  globalThis.__EMBERWILD_BAG_GRID={tabs:TABS,entries:()=>entries(current()),selected,view:bagView};

  /* Jumps from other pages that pick a token keep working: the grid selection follows selectInventoryToken. */
  if(typeof selectInventoryToken==='function'){const base=selectInventoryToken;globalThis.selectInventoryToken=selectInventoryToken=function(id){const ok=base(id);if(ok!==false)selection.set('tokens','g:'+id);return ok;};}
  /* Batch selection mode ends after a confirmed batch, as it does on cancel. */
  if(typeof confirmGearInventoryBatch==='function'){const base=confirmGearInventoryBatch;globalThis.confirmGearInventoryBatch=function(...args){const ok=base.apply(this,args);if(ok&&G().multi())toggleGearInventoryMulti();return ok;};}
  if(typeof confirmTokenBatch==='function'){const base=confirmTokenBatch;globalThis.confirmTokenBatch=function(...args){const ok=base.apply(this,args);if(ok&&T().multi())toggleTokenMulti();return ok;};}
  /* Leaving the bag page or switching tabs ends a batch selection. */
  const tabBase=setTab;setTab=function(...args){if(args[0]!=='equipment'){if(G()?.multi())toggleGearInventoryMulti();if(T()?.multi())toggleTokenMulti();gemMulti=false;gemPicked.clear();}return tabBase(...args);};
  globalThis.setTab=setTab;
  const categoryBase=setInventoryCategory;setInventoryCategory=function(v){if(v!==inventoryCategory){if(G()?.multi())toggleGearInventoryMulti();if(T()?.multi())toggleTokenMulti();gemMulti=false;gemPicked.clear();}return categoryBase(v);};
  globalThis.setInventoryCategory=setInventoryCategory;
  /* Tab switches restore each tab's own grid scroll; ordinary redraws keep the current one (SCROLL_REGIONS). */
  const after=globalThis.__EMBERWILD_AFTER_RENDER;
  globalThis.__EMBERWILD_AFTER_RENDER=function(...args){const out=after?.apply(this,args);if(restoreScroll){const pane=document.querySelector('#app .bag-grid-pane');if(pane){pane.scrollTop=scrolls.get(restoreScroll)||0;restoreScroll=null;}}return out;};
  const reset=resetSession;resetSession=function(...args){const out=reset.apply(this,args);selection.clear();lastIndex.clear();scrolls.clear();identifyFilter='all';tokenQuality='all';filtersOpen=false;gemMulti=false;gemPicked.clear();gearKindSort=false;tokenKindSort=false;pickSlot='all';pickQuality='all';return out;};
  globalThis.resetSession=resetSession;
})();
