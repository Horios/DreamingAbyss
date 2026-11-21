/* v0.185: 怪物圖鑑 page (探索 → 怪物圖鑑). One region at a time: each monster with the artwork it has in battle and a
   short, plain drop list grouped as 常見 / 少見 / 稀有 at the current difficulty. Replaces the 地區圖鑑 dialog that sat
   on the exploration page. */
(()=>{
  'use strict';
  let region=null;
  const KIND={normal:'普通',elite:'菁英',boss:'BOSS',final:'終局'};
  const unique=list=>[...new Set(list.filter(Boolean))];
  function regions(){return (globalThis.explorationMapChoices?.('boss')||MAPS.map((m,i)=>({index:i,name:m.name,unlocked:true}))).filter(x=>x.unlocked);}
  function selected(){const rows=regions();if(!rows.some(x=>x.index===region))region=rows.some(x=>x.index===party.map)?party.map:rows[0]?.index??0;return region;}
  function monsters(mi){return monsterCatalog().filter(m=>m.mapIndex===mi&&m.enabled!==false).sort((a,b)=>(a.kind==='boss')-(b.kind==='boss'));}
  // A rule's chance at the current difficulty, without temporary boosts.
  const chance=(rule,kind)=>effectiveDropChance(rule,{difficulty:party.difficulty||0,kind},0);
  const tier=c=>c>=.1?'常見':c>=.01?'少見':'稀有';
  function ruleName(r){
    if(r.type==='gem')return r.key==='random'?'技能寶石':(GEMS[Number(r.key)]?.name||'技能寶石');
    if(r.type==='ore')return '鍛鐵';if(r.type==='dust')return '粉塵';
    if(r.type==='equipment'){const k=String(r.key||'').split(':');const f=ITEM_FORMS?.[Number(k[1])]?.[Number(k[2])]?.[Number(k[3])];return f?.name||r.name;}
    return String(r.name||r.key||'').replace(/（[^）]*）$/,'');
  }
  function drops(m,kind){
    const foe={monsterId:m.id,kind,lv:Number(MAPS[m.mapIndex]?.max)||1,region:m.mapIndex,difficulty:party.difficulty||0,mat:m.material||m.mat};
    const groups={常見:[],少見:[],稀有:[]};
    const material=foe.mat;if(material&&kind!=='boss')groups['常見'].push(material);
    const ore=GAMEPLAY_SETTINGS.rewards?.ore||{},factor=Math.max(0,Math.min(1,Number(ore.chanceFactor??1)));
    const dustChance=(kind==='normal'?(ore.normalChanceByDifficulty?.[foe.difficulty]??1):1)*factor;
    if(dustChance>0)groups[tier(dustChance)].push('粉塵');
    for(const r of configuredDropRules(foe)){const c=chance(r,kind);if(c>0)groups[tier(c)].push(ruleName(r));}
    // Each item is listed once, in its most likely group.
    const seen=new Set();return Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,unique(v).filter(x=>!seen.has(x)&&seen.add(x))]));
  }
  const dropHTML=g=>Object.entries(g).filter(([,v])=>v.length).map(([k,v])=>`<p class="bestiary-drop"><b>${k}</b>${v.map(x=>esc(x)).join('、')}</p>`).join('')||'<p class="bestiary-drop">沒有額外掉落。</p>';
  function card(m){
    const e={name:m.name,monsterId:m.id,mat:m.material||m.mat,element:m.element,race:m.race,kind:m.kind};
    const art=globalThis.EmberwildBattleSummary?.artwork?.(e)||'';
    if(m.kind==='boss')return `<article class="bestiary-card bestiary-boss"><div class="bestiary-art">${art}</div><div class="bestiary-body"><h3>${esc(m.name)}<span class="tag">BOSS</span></h3>${dropHTML(drops(m,'boss'))}</div></article>`;
    const normal=drops(m,'normal'),elite=drops(m,'elite'),known=new Set(Object.values(normal).flat()),extra={};
    for(const [k,v] of Object.entries(elite)){const more=v.filter(x=>!known.has(x));if(more.length)extra[k]=more;}
    return `<article class="bestiary-card"><div class="bestiary-art">${art}</div><div class="bestiary-body"><h3>${esc(m.name)}</h3>${dropHTML(normal)}<p class="bestiary-elite-note">${Object.keys(extra).length?'菁英另外可能掉落':'菁英：掉落相同，機率較高。'}</p>${Object.keys(extra).length?dropHTML(extra):''}</div></article>`;
  }
  function view(){
    const mi=selected(),rows=regions(),mode=MODES[party.difficulty||0]?.name||'普通';
    const tabs=rows.map(x=>`<button type="button" class="${x.index===mi?'primary':''}" aria-pressed="${x.index===mi}" onclick="setBestiaryRegion(${x.index})">${esc(x.name)}</button>`).join('');
    return heading('BESTIARY / 怪物圖鑑','怪物圖鑑')+`<section class="panel bestiary-page"><div class="bestiary-regions" role="group" aria-label="地區">${tabs}</div>`+
      `<p class="small bestiary-hint">掉落依目前難度（${esc(mode)}）分為常見、少見、稀有。</p><div class="bestiary-list">${monsters(mi).map(card).join('')||'<p>這個地區沒有怪物資料。</p>'}</div></section>`;
  }
  globalThis.setBestiaryRegion=function(i){i=Number(i);if(!regions().some(x=>x.index===i))return false;region=i;render();return true;};
  globalThis.bestiaryView=view;
  // The old 地區圖鑑 dialog opens this page on the current region.
  globalThis.showRegionBestiary=function(){if(!party)return false;region=party.map;closeModal?.();setTab('bestiary');return true;};
  const renderBase=render;
  render=function(...args){
    if(!(state&&party&&tab==='bestiary'))return renderBase.apply(this,args);
    tab='battle';renderBase.apply(this,args);tab='bestiary';
    const main=document.querySelector('#app .layout>main');if(main)main.innerHTML=(globalThis.gameSubtabsHTML?.('bestiary')||'')+view();
  };
})();
