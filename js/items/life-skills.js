/* Online gathering and a shared processing/alchemy lane. Outputs use existing
   account material and healing-potion stores, including their save/export path. */
(()=>{
  const M=EmberwildBalanceDocument,LIMIT=1e9;
  let design=M.normalizeLife(JSON.parse(balanceSourceText()||'null')?.lifeSkills||M.lifeDefaults(),SHOP);
  const MATERIALS={herb:'紅色草',bug:'小蟲',water:'清水',bottle:'藥水瓶'};
  globalThis.lifeMaterialDescription=name=>globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('material',name)??'';
  let GATHER_TARGETS=design.gathering;
  let gatherTarget=GATHER_TARGETS[0]?.id||'',stockFilter='all',stockSort='default',stockOpen=true;
  globalThis.setLifeStockFilter=value=>{if(!['all','gather','alchemy','owned'].includes(value))return;stockFilter=value;render();};
  globalThis.setLifeStockSort=value=>{if(!['default','name','quantity','price'].includes(value))return;stockSort=value;render();};
  globalThis.setLifeStockOpen=open=>{stockOpen=!!open;};
  const products=()=>Object.keys(design.materialBuyPrices||{}).map(name=>({name,description:globalThis.lifeMaterialDescription(name)}));
  // Alchemy tier synthesis shares the existing processing lane, stock and save rules.
  // No variant rolls: 5 × tier I → tier II; 10 × tier II → tier III.
  const gemRecipes=()=>Object.fromEntries(GEMS.filter(g=>g.tier<3).map(g=>{
    const id=GEMS.indexOf(g),amount=g.tier===1?5:10,output=id+GEM_KINDS;
    return ['gem_'+id,{name:g.name+' ×'+amount+' → '+GEMS[output].name,
      inputs:[[String(id),amount,'gem']],output:String(output),outputType:'gem',
      periodMs:5000,chance:1,quantity:1}];
  }));
  let RECIPES={...design.recipes,...gemRecipes()};
  let owner=null,gather=null,work=null,lastTick=Date.now();
  const copy=v=>JSON.parse(JSON.stringify(v));
  const count=name=>ready()?materialCount(name):0;
  function resetJobs(){owner=party;gather=null;work=null;gatherTarget=GATHER_TARGETS[0]?.id||'';lastTick=Date.now();}
  function ready(){
    if(owner!==party)resetJobs();
    return !!party&&!!state;
  }
  const stock=globalThis.__EMBERWILD_INVENTORY_STOCK;
  const itemFor=(key,type)=>type==='item'?stock.item(key):null;
  const stockCount=(key,type='material')=>type==='gem'?(playerHero()?.gems[Number(key)]||0):type==='item'?stock.count(key):count(key);
  function setStock(key,type,n){if(type==='gem'){const id=Number(key);if(!Number.isInteger(id)||id<0||id>=GEMS.length||!Number.isSafeInteger(n)||n<0||n>LIMIT)return false;(globalThis.__DEBUG_GEM_ALCHEMY??=[]).push({key,type,n,before:playerHero().gems[id],at:Date.now()});playerHero().gems[id]=n;return true;}if(type==='item')return stock.set(key,n);setMaterialCount(key,n);return true;}
  const productName=r=>r.outputType==='gem'?GEMS[Number(r.output)]?.name:globalThis.__EMBERWILD_ITEM_NAME?.(r.outputType,r.output,itemFor(r.output,r.outputType)?.name||r.output)||itemFor(r.output,r.outputType)?.name||r.output;
  const inputName=([key,n,type='material'])=>type==='gem'?GEMS[Number(key)]?.name:globalThis.__EMBERWILD_ITEM_NAME?.(type,key,itemFor(key,type)?.name||key)||itemFor(key,type)?.name||key;
  const outputCount=r=>stockCount(r.output,r.outputType);
  const succeeds=chance=>chance===1||chance>0&&Math.random()<chance;
  const outputReady=r=>(r.outputType!=='item'||!!itemFor(r.output,r.outputType))&&outputCount(r)+r.quantity<=LIMIT;
  const materialPrice=(name,n=1)=>globalThis.shopPayablePrice?.(n*(design.materialBuyPrices[name]??0))??n*(design.materialBuyPrices[name]??0);
  globalThis.lifeMaterialPurchasePrice=materialPrice;
  function refillQuote(mode){
    const recipe=RECIPES[mode];if(!recipe||!outputReady(recipe))return {ok:false,items:[],cost:0};
    const missing=recipe.inputs.map(([key,n,type='material'])=>({key,type,n:Math.max(0,n-stockCount(key,type))})).filter(x=>x.n);
    if(!missing.length)return {ok:true,items:[],cost:0};
    if(!globalThis.hasShopVIP?.()||!party.story.autoBuy||missing.some(x=>x.type!=='material'||!['清水','藥水瓶'].includes(x.key)||!Object.hasOwn(design.materialBuyPrices,x.key)))return {ok:false,items:[],cost:0};
    const cost=missing.reduce((n,x)=>n+materialPrice(x.key,x.n),0);
    return {ok:playerHero().gold>=cost,items:missing,cost};
  }
  const canMake=mode=>refillQuote(mode).ok;
  function stoppedReason(mode){
    const r=RECIPES[mode];
    if(r.outputType==='item'&&!itemFor(r.output,r.outputType))return '目前設定沒有此成品';
    if(!outputReady(r))return '成品庫存已達上限';
    const quote=refillQuote(mode);if(quote.items.length&&!quote.ok)return '金幣不足：自動補充需要 '+quote.cost+' 金幣';
    return '材料不足：'+r.inputs.filter(([key,n,type])=>stockCount(key,type)<n).map(row=>inputName(row)+' ×'+row[1]).join('、');
  }
  function periodFor(kind,job){return (kind==='gather'?GATHER_TARGETS.find(x=>x.id===(job?.target||gatherTarget)):RECIPES[job?.mode])?.periodMs||5000;}
  function materialNames(){return [...new Set([...Object.values(MATERIALS),...Object.keys(design.materialBuyPrices||{}),...GATHER_TARGETS.flatMap(r=>[r,...(r.bonusDrops||[])]).filter(r=>r.outputType==='material').map(r=>r.output),...Object.values(RECIPES).flatMap(r=>[...(r.outputType==='material'?[r.output]:[]),...r.inputs.filter(x=>!x[2]||x[2]==='material').map(x=>x[0])])])];}

  globalThis.buyLifeMaterial=function(name,quantity=1){
    if(!ready()||!products().some(p=>p.name===name))return false;
    const n=Number(quantity),h=playerHero();
    if(!Number.isSafeInteger(n)||n<1||n>10000)return false;
    const cost=materialPrice(name,n);
    if(h.gold<cost){toast('金幣不足');return false;}
    if(count(name)+n>LIMIT){toast('材料庫存已達上限');return false;}
    const old=count(name),had=Object.hasOwn(h.materials,name),gold=h.gold;
    setMaterialCount(name,old+n);h.gold-=cost;
    if(save()!==true){setMaterialCount(name,old);if(!had&&!['鍛鐵','粉塵'].includes(name))delete h.materials[name];h.gold=gold;return false;}
    render();toast('已購買 '+name+' ×'+n);return true;
  };
  globalThis.selectLifeGatheringTarget=function(id){
    if(!ready()||gather||!GATHER_TARGETS.some(target=>target.id===id))return false;
    gatherTarget=id;render();return true;
  };
  globalThis.startLifeGathering=function(id=gatherTarget){
    if(!ready()||gather)return false;
    const target=GATHER_TARGETS.find(target=>target.id===id);if(!target)return false;
    gatherTarget=id;
    if(!outputReady(target)){toast(productName(target)+'庫存已達上限');return false;}
    tickLifeSkills();gather={target:id,elapsed:0};render();return true;
  };
  globalThis.stopLifeGathering=function(){if(!ready())return;tickLifeSkills();gather=null;render();};
  globalThis.startLifeWork=function(mode){
    if(!ready()||!Object.hasOwn(RECIPES,mode))return false;
    tickLifeSkills();
    if(work){toast('請先停止目前的加工或煉金');return false;}
    if(!canMake(mode)){toast(stoppedReason(mode));return false;}
    work={mode,elapsed:0};render();return true;
  };
  globalThis.stopLifeWork=function(){if(!ready())return;tickLifeSkills();work=null;render();};

  function tickLifeSkills(){
    if(!ready())return;
    const now=Date.now(),elapsed=Math.max(0,now-lastTick);lastTick=now;
    if(!gather&&!work)return;
    const h=playerHero(),before={gold:h.gold,progressStats:party.progressStats?copy(party.progressStats):null,ore:h.ore,dust:h.dust,materials:{...h.materials},potions:{...healingInventory()},consumables:{...h.consumables},gems:[...h.gems]};
    let changed=false,message='';
    if(gather){
      const target=GATHER_TARGETS.find(target=>target.id===gather.target);
      gather.elapsed+=elapsed;
      // A delayed background timer may cover multiple complete job cycles.
      for(let i=0;gather&&gather.elapsed>=target.periodMs&&i<1000;i++){
        if(!outputReady(target)){gather=null;message=productName(target)+'庫存已達上限，採集已停止';break;}
        gather.elapsed-=target.periodMs;globalThis.recordLifeProgress?.('gather',target.id,'',0);changed=true;
        if(succeeds(target.chance)){setStock(target.output,target.outputType,outputCount(target)+target.quantity);globalThis.recordStoryAcquisition?.(target.outputType,target.output,target.quantity);globalThis.recordGatheredItem?.(target.outputType,target.output,target.quantity);changed=true;}
        for(const drop of target.bonusDrops||[])if(outputReady(drop)&&succeeds(drop.chance)){setStock(drop.output,drop.outputType,outputCount(drop)+drop.quantity);globalThis.recordStoryAcquisition?.(drop.outputType,drop.output,drop.quantity);globalThis.recordGatheredItem?.(drop.outputType,drop.output,drop.quantity);changed=true;}
      }
    }
    if(work){
      work.elapsed+=elapsed;
      for(let i=0;work&&work.elapsed>=RECIPES[work.mode].periodMs&&i<1000;i++){
        const mode=work.mode,recipe=RECIPES[mode];
        if(!canMake(mode)){message=stoppedReason(mode)+'，'+recipe.name+'已停止';work=null;break;}
        const refill=refillQuote(mode);for(const x of refill.items){setStock(x.key,x.type,stockCount(x.key,x.type)+x.n);globalThis.recordStoryAcquisition?.(x.type,x.key,x.n);}h.gold-=refill.cost;
        for(const [key,n,type='material'] of recipe.inputs)setStock(key,type,stockCount(key,type)-n);
        globalThis.recordLifeProgress?.('alchemy',mode,'',0);
        if(succeeds(recipe.chance)){globalThis.recordLifeProgress?.('recipe',mode,'',0);setStock(recipe.output,recipe.outputType,outputCount(recipe)+recipe.quantity);globalThis.recordStoryAcquisition?.(recipe.outputType,recipe.output,recipe.quantity);}
        work.elapsed-=recipe.periodMs;changed=true;
        if(!canMake(mode)){message=stoppedReason(mode)+'，'+recipe.name+'已停止';work=null;}
      }
    }
    if(changed&&save()!==true){
      h.gold=before.gold;if(before.progressStats)party.progressStats=before.progressStats;h.ore=before.ore;h.dust=before.dust;h.materials=before.materials;h.healingPotions=before.potions;h.consumables=before.consumables;h.gems=before.gems;
      gather=null;work=null;message='生活技能產物未能儲存，已回復庫存並停止動作';
    }
    if(message)toast(message);
    if(changed||message){if(['lifeSkills','gather','alchemy','equipment','shop','quests','story'].includes(tab))render();}
    updateLifeProgress();
  }
  globalThis.tickLifeSkills=tickLifeSkills;

  function progress(kind,job){
    const PERIOD=periodFor(kind,job),ms=job?Math.min(PERIOD,job.elapsed):0;
    return `<div class="life-progress"><progress id="life-${kind}-progress" max="${PERIOD}" value="${ms}" aria-label="${kind==='gather'?'採集':'加工或煉金'}進度"></progress><span id="life-${kind}-time">${job?(ms/1000).toFixed(1)+' / '+(PERIOD/1000)+' 秒':'尚未開始'}</span></div>`;
  }
  function updateLifeProgress(){
    if(!['lifeSkills','gather','alchemy'].includes(tab))return;
    for(const [kind,job] of [['gather',gather],['work',work]]){
      const bar=document.getElementById('life-'+kind+'-progress'),label=document.getElementById('life-'+kind+'-time');
      const PERIOD=periodFor(kind,job),ms=job?Math.min(PERIOD,job.elapsed):0;
      if(bar){bar.max=PERIOD;bar.value=ms;}
      if(label)label.textContent=job?(ms/1000).toFixed(1)+' / '+(PERIOD/1000)+' 秒':'尚未開始';
    }
  }
  function stockPanel(){
    const gatherNames=GATHER_TARGETS.flatMap(r=>[r,...(r.bonusDrops||[])]).filter(r=>r.outputType==='material').map(r=>r.output),alchemyNames=Object.values(RECIPES).flatMap(r=>r.inputs.filter(x=>!x[2]||x[2]==='material').map(x=>x[0]));
    let stockNames=materialNames().filter(name=>stockFilter==='all'||stockFilter==='owned'&&count(name)>0||stockFilter==='gather'&&gatherNames.includes(name)||stockFilter==='alchemy'&&alchemyNames.includes(name));
    if(stockSort!=='default')stockNames.sort((a,b)=>(stockSort==='quantity'?count(b)-count(a):stockSort==='price'?materialSellPrice(b)-materialSellPrice(a):0)||a.localeCompare(b,'zh-Hant'));
    const stock=stockNames.map(name=>{
      const n=count(name);
      return `<article class="life-stock-row icon-only-row">${itemSlotHTML('material',name,{count:n,detailLabel:'目前持有'})}</article>`;
    }).join('')||'<p class="empty">沒有符合條件的材料。</p>';
    return `<details class="panel life-stock" ${stockOpen?'open':''} ontoggle="setLifeStockOpen(this.open)"><summary>目前材料庫存 <span class="small">${stockNames.length} 種</span></summary><div class="life-stock-content"><div class="life-stock-controls"><label>篩選 <select aria-label="生活材料篩選" onchange="setLifeStockFilter(this.value)">${[['all','全部材料'],['gather','採集產物'],['alchemy','煉金材料'],['owned','只顯示持有']].map(([key,label])=>`<option value="${key}" ${stockFilter===key?'selected':''}>${label}</option>`).join('')}</select></label><label>排序 <select aria-label="生活材料排序" onchange="setLifeStockSort(this.value)">${[['default','材料類別'],['name','名稱'],['quantity','數量（多到少）'],['price','賣價（高到低）']].map(([key,label])=>`<option value="${key}" ${stockSort===key?'selected':''}>${label}</option>`).join('')}</select></label></div><div class="life-materials">${stock}</div><p class="small">${healPotionCount('heal_small')>0?'簡易治療藥水 ×'+healPotionCount('heal_small').toLocaleString()+' · ':''}材料全隊共用，藥水可在背包的道具頁查看。</p><button onclick="setShopCategory('life');setTab('shop')">購買商店材料</button></div></details>`;
  }
  globalThis.gatheringView=function(){
    ready();const target=GATHER_TARGETS.find(x=>x.id===gatherTarget);
    return heading('LIFE SKILLS / 生活技能','採集')+`<div class="life-skills-page"><section class="panel life-rules"><p>採集與探索、煉金可同時進行。</p><p class="small">採集依設定秒數連續執行。切換頁面仍會繼續；停止動作會清除該次進度，返回標題或關閉遊戲後停止，不計算離線產物。</p></section><div class="life-skill-grid life-skill-single"><section class="panel" id="life-gather"><div class="row"><h2 class="life-action-title">${inventoryMaterialIcon(MATERIALS.herb)}採集</h2><span class="tag">${gather?'採集中':'待命'}</span></div><label class="life-gather-selector">採集對象 <select aria-label="採集對象" onchange="selectLifeGatheringTarget(this.value)" ${gather?'disabled':''}>${GATHER_TARGETS.map(target=>`<option value="${target.id}" ${target.id===gatherTarget?'selected':''}>${esc(target.name)}</option>`).join('')}</select></label><p>${target?`每 ${target.periodMs/1000} 秒有 ${Number((target.chance*100).toFixed(6))}% 機率獲得 ${itemSlotHTML(target.outputType,target.output,{count:target.quantity,detailLabel:'產出數量'})}。${(target.bonusDrops||[]).map(r=>`另有 ${Number((r.chance*100).toFixed(6))}% 機率獲得 ${itemSlotHTML(r.outputType,r.output,{count:r.quantity,detailLabel:'產出數量'})}。`).join('')}`:'尚未設定採集產物。'}</p>${progress('gather',gather)}<div class="actions"><button class="primary" onclick="startLifeGathering()" ${gather||!target?'disabled':''}>開始採集</button><button onclick="stopLifeGathering()" ${!gather?'disabled':''}>停止採集</button></div></section></div>${stockPanel()}</div>`;
  };
  globalThis.alchemyView=function(){
    ready();const workName=work?RECIPES[work.mode].name:'製作中：無';
    return heading('LIFE SKILLS / 生活技能','煉金')+`<div class="life-skills-page"><section class="panel life-rules"><p>煉金與探索、採集可同時進行；各種煉金配方共用製作動作，一次只能進行一項。</p><p class="small">每次完成才消耗材料，成功後取得產物；材料不足時停止。切換頁面仍會繼續；停止動作會清除該次進度，返回標題或關閉遊戲後停止，不計算離線產物。</p></section><div class="life-skill-grid life-skill-single"><section class="panel" id="life-alchemy"><div class="row"><h2 class="life-action-title">${inventoryMaterialIcon(MATERIALS.herb)}煉金</h2><span class="tag">${work?esc(workName):'待命'}</span></div>${progress('work',work)}${globalThis.alchemyVIPView?.()||''}${Object.entries(RECIPES).map(([id,r])=>`<article class="life-recipe"><h3 class="life-action-title">${esc(r.name)}</h3><p class="recipe-item-line">${r.inputs.map(row=>'<span class="recipe-input">'+itemSlotHTML(row[2]||'material',row[0],{count:row[1],detailLabel:'所需數量'})+'<small class="life-recipe-stock">持有 '+stockCount(row[0],row[2]).toLocaleString()+'</small></span>').join(' ＋ ')} → ${itemSlotHTML(r.outputType,r.output,{count:r.quantity,detailLabel:'產出數量'})} <span class="small life-recipe-stock">（庫存 ${outputCount(r).toLocaleString()}）</span></p><p class="small">${r.periodMs/1000} 秒／次 · 成功率 ${Number((r.chance*100).toFixed(6))}%${itemFor(r.output,r.outputType)&&isHealPotion(itemFor(r.output,r.outputType))?' · 恢復 '+itemFor(r.output,r.outputType).healAmount+' HP，冷卻 '+itemFor(r.output,r.outputType).cooldown+' 回合。':''}</p><button onclick="startLifeWork('${id}')" ${work||!canMake(id)?'disabled':''}>${id==='process'?'開始加工':'開始煉金'}</button></article>`).join('')||'<p class="empty">尚未設定煉金配方。</p>'}<div class="actions"><button onclick="stopLifeWork()" ${!work?'disabled':''}>停止${work?esc(RECIPES[work.mode].name):'製作'}</button></div></section></div>${stockPanel()}</div>`;
  };
  globalThis.lifeSkillsView=()=>tab==='alchemy'?globalThis.alchemyView():globalThis.gatheringView();
  globalThis.lifeShopMaterialsView=function(){
    const productRows=products().map(p=>{const price=materialPrice(p.name);return `<article class="shop-product-row icon-product fixed-shop-row life-shop-row" data-life-material="${esc(p.name)}"><div class="shop-product-visual">${itemSlotHTML('material',p.name,{count:1,context:'shop',detailLabel:'商品數量',price,priceLabel:'單價',shopType:'life',shopId:p.name})}<span class="shop-product-stock">庫存<br><b>${count(p.name).toLocaleString()}</b></span></div><small class="shop-product-label">${esc(p.name)}</small></article>`;}).join('');
    const section=`<section class="shop-section life-shop-section"><div class="shop-section-head"><h2>生活技能材料</h2><span class="small">存入全隊共用材料庫。</span></div><div class="shop-product-grid">${productRows}</div></section>`;
    return section;
  };
  globalThis.emberwildLifeHeartbeat=tickLifeSkills;
  const baseTick=tick;tick=function(...args){tickLifeSkills();return baseTick(...args);};
  const baseLoad=loadParty;loadParty=function(...args){const result=baseLoad(...args);resetJobs();return result;};
  const baseStart=start;start=function(...args){const result=baseStart(...args);resetJobs();return result;};
  const baseReturn=returnToTitle;globalThis.returnToTitle=function(...args){tickLifeSkills();resetJobs();return baseReturn(...args);};
  const balanceBase=applyBalanceConfig;applyBalanceConfig=function(input,options={}){const result=balanceBase(input,options);if(input.lifeSkills){design=M.normalizeLife(input.lifeSkills,SHOP);GATHER_TARGETS=design.gathering;RECIPES={...design.recipes,...gemRecipes()};resetJobs();}return result;};
  globalThis.__EMBERWILD_LIFE_SKILLS={get jobs(){return copy({gather,work});},get period(){return GATHER_TARGETS[0]?.periodMs||5000;},get bugChance(){return GATHER_TARGETS[0]?.bonusDrops?.[0]?.chance||0;},get design(){return copy(design);}};
  resetJobs();
  if(state)render();
})();
