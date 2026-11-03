/* Shop pools, compact descriptions/effects, daily refresh prices and account inventory. */
(function installShopInventoryOverhaul(){
  const clone=v=>JSON.parse(JSON.stringify(v));
  const catalog=globalThis.EmberwildShopCatalog;
  const catalogOptions=items=>({items:items||SHOP,rerollItem:globalThis.__EMBERWILD_EQUIPMENT_POWER?.rerollItem,equipmentForms:ITEM_FORMS,maps:GAMEPLAY_SETTINGS.maps.catalog,classes:CLASSES});
  let SHOP_SETTINGS=catalog.validate(undefined,catalogOptions());
  const publishSettings=()=>{globalThis.__EMBERWILD_SHOP_SETTINGS=SHOP_SETTINGS;};
  publishSettings();

  const baseValidate=validateBalanceConfig;
  validateBalanceConfig=function(input){
    // Validate the migrated shop rules: removed items (e.g. retired speed boosts) drop their rules too.
    const copy=clone(input),normalized=normalizeDescriptionBalance(copy),items=normalized.items;
    copy.shopSettings=catalog.validate(normalized.shopSettings,{...catalogOptions(items),equipmentForms:copy.equipmentForms,maps:copy.balanceSettings?.maps?.catalog,classes:copy.classes});
    if(Array.isArray(copy.items))for(const item of copy.items)if(item.shopEnabled!==undefined&&typeof item.shopEnabled!=='boolean')throw Error('商店上架設定必須為布林值：'+item.id);
    const out=baseValidate(copy);out.shopSettings=copy.shopSettings;return out;
  };
  const baseApply=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    const copy=validateBalanceConfig(input),oldRandom=JSON.stringify(SHOP_SETTINGS.randomOffers);
    const out=baseApply(copy,{persist:false});SHOP_SETTINGS=clone(copy.shopSettings);publishSettings();
    if(party&&state&&oldRandom!==JSON.stringify(SHOP_SETTINGS.randomOffers))party.market=generateMarket();
    if(persist){localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));if(party&&state)save();}
    if(state)render();return out;
  };
  const baseExport=exportableBalance;
  exportableBalance=function(){
    const out=baseExport();out.shopSettings=clone(SHOP_SETTINGS);
    const fixedIds=catalog.fixedItemIds(SHOP_SETTINGS);
    if(Array.isArray(out.items))for(const item of out.items)item.shopEnabled=fixedIds.has(item.id);
    out.notes=(out.notes||[]).filter(x=>!String(x).startsWith('shopSettings.')&&!String(x).startsWith('items[].shopEnabled'));
    out.notes.push('shopSettings.schemaVersion=3；randomOffers.entries 與 fixedOffers.entries 是隨機／固定商店的有效商品池。空陣列表示不上架任何商品，移除池中商品不刪除玩家庫存。舊版抗性與屬性增幅商品會遷移為停用。',
      'randomOffers.entries 的 selection=weighted 依 weight 抽選；selection=extra 依 chance 每批額外判定一次。重鑄石也由這個商品池控制。',
      '商品 type=item 的 key 引用 items[].id；unitPrice=null 沿用 items[].cost。名稱與說明留空時沿用道具本身；實際效果由結構化能力自動產生。',
      'items[].shopEnabled 與 equipmentPowerSystem.rerollItem.shopChance/shopPrice 僅用於舊 JSON 遷移；新版商店由 shopSettings 控制。');
    return out;
  };
  const baseReference=balanceReference;
  balanceReference=function(){const out=baseReference();out.balancePaths={...(out.balancePaths||{}),'shopSettings.randomOffers.entries':'隨機商品池：抽選規則、數量、單價與顯示說明。','shopSettings.fixedOffers.entries':'固定商品池：上架項目、數量、單價與顯示說明。'};return out;};
  try{const raw=balanceSourceText();if(raw){const parsed=JSON.parse(raw);SHOP_SETTINGS=catalog.validate(parsed.shopSettings,catalogOptions());publishSettings();}}catch(e){console.warn('商店設定載入失敗，使用內建預設值',e);}

  function localDayKey(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
  function syncMarketDay(){if(!party?.market)return false;const today=localDayKey();if(party.market.dayKey!==today){party.market.dayKey=today;party.market.refreshCount=0;return true;}if(!Number.isInteger(party.market.refreshCount)||party.market.refreshCount<0)party.market.refreshCount=0;return false;}
  function currentRefreshCost(){syncMarketDay();const s=SHOP_SETTINGS.randomOffers;return Math.min(1e9,Math.round(s.refreshBaseCost+s.refreshCostStep*(party?.market?.refreshCount||0)));}
  globalThis.currentRefreshCost=currentRefreshCost;
  function regionMaterialPool(){
    const mi=party?.map??0,cat=GAMEPLAY_SETTINGS?.monsters?.catalog||[];let pool=cat.filter(x=>x?.mapIndex===mi&&x?.enabled!==false&&typeof x?.material==='string'&&x.material.trim()).map(x=>x.material.trim());
    if(!pool.length)pool=(MAPS?.[mi]?.mobs||[]).map(x=>x?.[2]).filter(Boolean);return [...new Set(pool.length?pool:['鍛鐵'])];
  }
  function unitPrice(rule){const item=rule.type==='item'?SHOP.find(x=>x.id===rule.key):null;if(isHealPotion(item))return item.cost;return rule.unitPrice===null?Number(SHOP.find(x=>x.id===rule.key)?.cost)||0:rule.unitPrice;}
  function weightedRule(){
    const rows=SHOP_SETTINGS.randomOffers.entries.filter(x=>x.enabled&&x.selection==='weighted'),total=rows.reduce((n,x)=>n+x.weight,0);
    if(!rows.length)return null;let roll=Math.random()*total;for(const rule of rows){roll-=rule.weight;if(roll<=0)return rule;}return rows[rows.length-1];
  }
  function offerFromRule(rule,serial,index,tier){
    let key=rule.key;if(rule.type==='gem'&&key==='random')key=String(rand(GEM_KINDS));if(rule.type==='material'&&key==='region'){const pool=regionMaterialPool();key=pool[rand(pool.length)];}
    const scale=rule.quantityScalesWithTier?tier:1,min=rule.quantityMin*scale,max=rule.quantityMax*scale;
    const qty=Math.min(10000,Math.floor(min+Math.random()*(max-min+1))),price=Math.min(1e9,Math.round(qty*unitPrice(rule)*(rule.priceScalesWithTier?tier:1)));
    return {id:serial+'-'+index,kind:rule.type,key,qty,price,sold:false,ruleId:rule.id};
  }
  generateMarket=function(){
    const serial=(Number.isSafeInteger(party?.market?.serial)?party.market.serial:0)+1;
    const tier=Math.max(1,regionTier((typeof worldIsFinalMap==='function'&&worldIsFinalMap(party.map))?Math.max(0,party.map-1):party.map)),offers=[];
    for(let i=0;i<SHOP_SETTINGS.randomOffers.offerCount;i++){const rule=weightedRule();if(!rule)break;offers.push(offerFromRule(rule,serial,offers.length,tier));}
    for(const rule of SHOP_SETTINGS.randomOffers.entries)if(rule.enabled&&rule.selection==='extra'&&Math.random()<rule.chance)offers.push(offerFromRule(rule,serial,offers.length,tier));
    return {serial,offers,dayKey:localDayKey(),refreshCount:party?.market?.refreshCount||0};
  };
  ensureMarket=function(){if(!party.market){party.market=generateMarket();save();return;}if(syncMarketDay())save();};
  const hasRandomRules=()=>globalThis.hasCompanionRecruitmentOffers?.()||SHOP_SETTINGS.randomOffers.entries.some(x=>x.enabled&&(x.selection==='weighted'||x.chance>0));
  refreshMarket=function(){
    if(!hasRandomRules())return toast('目前沒有啟用的隨機商品');
    ensureMarket();syncMarketDay();const cost=currentRefreshCost();if(state.gold<cost)return toast('刷新需要 '+cost+' 金幣');
    const old=clone(party.market),gold=state.gold,count=party.market.refreshCount||0;state.gold-=cost;const next=generateMarket();next.refreshCount=count+1;next.dayKey=localDayKey();party.market=next;
    if(!save()){party.market=old;state.gold=gold;return;}render();toast(`商品已刷新；下次刷新 ${currentRefreshCost()} 金幣`);
  };
  function resolvedOffer(input){const offer=input?.ruleId==='__gear_tier_reroll__'?{...input,kind:'item',key:'power_tier_reroll'}:input,item=offer?.kind==='item'?SHOP.find(x=>x.id===offer.key):null;return isHealPotion(item)?{...offer,price:Math.round(item.cost*offer.qty)}:offer;}
  function marketRule(offer){return SHOP_SETTINGS.randomOffers.entries.find(x=>x.id===offer?.ruleId)||null;}
  function marketOfferIsListed(input){
    const offer=resolvedOffer(input),matches=rule=>rule?.enabled&&rule.type===offer.kind&&(rule.type==='item'?rule.key===offer.key:rule.type==='gem'?rule.key==='random'||rule.key===offer.key:rule.type==='material'?rule.key==='region'||rule.key===offer.key:true);
    if(offer.ruleId&&offer.ruleId!=='__gear_tier_reroll__')return !!matches(marketRule(offer));
    return SHOP_SETTINGS.randomOffers.entries.some(matches);
  }
  function offerItem(offer){return offer.kind==='item'?SHOP.find(x=>x.id===offer.key):null;}
  function rawOfferName(offer){return offer.kind==='ore'?'鍛鐵':offer.kind==='dust'?'粉塵':offer.kind==='gem'?(GEMS[Number(offer.key)]?.name||'技能寶石'):offerItem(offer)?.name||offer.key;}
  function offerName(offer,rule){
    const raw=rawOfferName(offer);if(!rule?.name)return raw;
    if(offer.kind==='gem'&&['技能寶石','隨機技能寶石'].includes(rule.name)||offer.kind==='material'&&rule.name==='地區素材')return raw;
    if(offer.kind==='gem'&&rule.key==='random'||offer.kind==='material'&&rule.key==='region')return rule.name+' · '+raw;
    return rule.name;
  }
  marketOfferName=function(input){const offer=resolvedOffer(input);return offerName(offer,marketRule(offer));};
  function offerDescription(offer,rule){
    const kind=['ore','dust'].includes(offer.kind)?'material':offer.kind,key=offer.kind==='ore'?'鍛鐵':offer.kind==='dust'?'粉塵':offer.key;
    return globalThis.__EMBERWILD_ITEM_DESCRIPTION?.(kind,key)??'';
  }
  function offerEffect(offer){
    const item=offerItem(offer);
    if(item)return String(supplyDetail(item)).replace(/ · (?:單價|賣價) [\d.,]+ 金幣/g,'');
    if(offer.kind==='ore')return '用於裝備強化與升階。';
    if(offer.kind==='dust')return '用於裝備洗鍊與寶石合成。';
    if(offer.kind==='gem')return GEMS[Number(offer.key)]?.desc||'鑲嵌於技能插槽，強化技能效果。';
    return '存入材料庫，可依製作配方或委託需求消耗。';
  }
  function stockSlot(offer){
    if(offer.kind==='ore'||offer.kind==='dust')return {object:state,key:offer.kind,limit:1e12};
    if(offer.kind==='gem')return {object:state.gems,key:Number(offer.key),limit:1e9};
    if(offer.kind==='material')return {object:state.materials,key:offer.key,limit:1e9};
    const item=offerItem(offer);if(!item)return null;
    ensureHealingPotionState();const object=isHealPotion(item)?party.members[0].healingPotions:state.consumables;return {object,key:item.id,limit:1e9};
  }
  globalThis.healingPotionShopLock=item=>EmberwildHealingPotions.lockReason(item,party?.story?.vip||0);
  function purchase(offer,name,onSold){
    const locked=healingPotionShopLock(offerItem(offer));if(locked)return toast(locked);
    const item=offerItem(offer);if(isHealPotion(item))offer={...offer,price:Math.round(item.cost*offer.qty)};
    if(offer.kind==='equipment'){
      const price=globalThis.shopPayablePrice?.(offer.price)??offer.price;
      if(state.gold<price)return toast('金幣不足');
      if(state.bag.length+offer.qty>RULES.bagCapacity)return toast('背包空間不足');
      const items=Array.from({length:offer.qty},()=>globalThis.createEquipmentShopGear(offer.stageId,offer.entryId));
      if(items.some(g=>!g))return false;
      const gold=state.gold;state.bag.push(...items);state.gold-=price;
      if(!save()){const ids=new Set(items.map(g=>g.id));state.bag.splice(0,state.bag.length,...state.bag.filter(g=>!ids.has(g.id)));state.gold=gold;return false;}
      render();toast('已購買 '+name+' ×'+offer.qty);return true;
    }
    const slot=stockSlot(offer);if(!slot)return toast('找不到此商品對應的道具');
    const price=globalThis.shopPayablePrice?.(offer.price)??offer.price;
    if(state.gold<price)return toast('金幣不足');
    const had=Object.prototype.hasOwnProperty.call(slot.object,slot.key),old=Number(slot.object[slot.key])||0,next=old+offer.qty,gold=state.gold;
    if(!Number.isSafeInteger(next)||next>slot.limit)return toast('庫存已達上限');
    slot.object[slot.key]=next;state.gold-=price;if(onSold)onSold(true);
    if(!save()){if(had)slot.object[slot.key]=old;else delete slot.object[slot.key];state.gold=gold;if(onSold)onSold(false);return;}
    render();toast('已購買 '+name+' ×'+offer.qty);
  }
  globalThis.purchaseShopOffer=purchase;
  buyMarketOffer=function(id){const raw=party?.market?.offers?.find(x=>x.id===id);if(!raw||raw.sold||!marketOfferIsListed(raw))return;const offer=resolvedOffer(raw);purchase(offer,marketOfferName(raw),value=>{raw.sold=value;});};
  function fixedOffer(rule){return {kind:rule.type,key:rule.key,qty:rule.quantity,price:Math.min(1e9,Math.round(rule.quantity*unitPrice(rule)))};}
  globalThis.buyFixedShopOffer=function(id){const rule=SHOP_SETTINGS.fixedOffers.entries.find(x=>x.id===id&&x.enabled);if(!rule)return;const offer=fixedOffer(rule);purchase(offer,offerName(offer,rule));};
  buySupply=function(id){const rule=SHOP_SETTINGS.fixedOffers.entries.find(x=>x.enabled&&x.type==='item'&&x.key===id);if(!rule)return toast('此商品目前未上架');return buyFixedShopOffer(rule.id);};
  buyPotion=function(){return buySupply('heal_standard');};
  globalThis.buyHealingPotion=function(id){if(!isHealPotion(SHOP.find(x=>x.id===id)))return;return buySupply(id);};
  function productRow(input,rule,random){
    const offer=resolvedOffer(input),name=offerName(offer,rule),description=offerDescription(offer,rule),effect=offerEffect(offer),slot=stockSlot(offer),stock=Number(slot?.object?.[slot.key])||0;
    const kind=['ore','dust'].includes(offer.kind)?'material':offer.kind,key=offer.kind==='ore'?'鍛鐵':offer.kind==='dust'?'粉塵':offer.key;
    return `<article class="shop-product-row icon-product ${random?'random-shop-row':'fixed-shop-row'}"><div class="shop-product-visual">${itemSlotHTML(kind,key,{count:offer.qty,extra:description+' '+effect,context:'shop',detailLabel:'商品數量',price:globalThis.shopPayablePrice?.(offer.price)??offer.price,shopType:random?'market':'fixed',shopId:random?input.id:rule.id,sold:!!input.sold,lockedReason:healingPotionShopLock(offerItem(offer))})}<span class="shop-product-stock">庫存<br><b>${stock.toLocaleString()}</b></span></div><small class="shop-product-label">${esc(name)}</small></article>`;
  }
  marketCards=function(){const offers=party.market?.offers?.filter(marketOfferIsListed)||[];return offers.length?offers.map(o=>productRow(o,marketRule(resolvedOffer(o)),true)).join(''):'<div class="shop-empty">本批沒有隨機商品。</div>';};
  const baseValidateParty=validateParty;
  validateParty=function(input){
    const p=baseValidateParty(input);if(p.market){const raw=input.market||{};p.market.dayKey=typeof raw.dayKey==='string'?raw.dayKey:localDayKey();p.market.refreshCount=Number.isInteger(raw.refreshCount)&&raw.refreshCount>=0?raw.refreshCount:0;
      for(const [i,offer] of p.market.offers.entries()){if(offer.kind==='item'&&!SHOP.some(x=>x.id===offer.key))throw Error('商店存檔引用不存在的道具：'+offer.key);if(typeof raw.offers?.[i]?.ruleId==='string')offer.ruleId=raw.offers[i].ruleId;}
    }return p;
  };
  const SHOP_CATEGORIES=[['equipment','裝備商店'],['life','生活技能材料'],['random','隨機商品'],['fixed','固定商品']];
  let shopCategory='random';
  globalThis.setShopCategory=function(id){
    if(!SHOP_CATEGORIES.some(([key])=>key===id))return false;
    shopCategory=id;if(state)render();return true;
  };
  shopView=function(){
    ensureHealingPotionState();ensureMarket();syncMarketDay();
    const cost=currentRefreshCost(),rc=party.market?.refreshCount||0;
    const tabs=`<nav class="shop-category-tabs" aria-label="商店分類">${SHOP_CATEGORIES.map(([id,name])=>`<button class="${shopCategory===id?'primary':''}" aria-pressed="${shopCategory===id}" onclick="setShopCategory('${id}')">${name}</button>`).join('')}</nav>`;
    let section;
    if(shopCategory==='equipment')section=globalThis.equipmentShopView?.()||'<div class="shop-empty">裝備商店尚未載入。</div>';
    else if(shopCategory==='life')section=globalThis.lifeShopMaterialsView?.()||'<div class="shop-empty">生活技能材料尚未載入。</div>';
    else if(shopCategory==='fixed'){
      const fixed=SHOP_SETTINGS.fixedOffers.entries.filter(x=>x.enabled).map(rule=>productRow(fixedOffer(rule),rule,false)).join('');
      section=`<section class="shop-section shop-fixed-section"><div class="shop-section-head"><h2>固定商品</h2><span class="small">購買後進入共用背包；使用請到「背包 → 道具」。</span></div><div class="shop-product-grid">${fixed||'<div class="shop-empty">目前沒有上架固定商品。</div>'}</div></section>`;
    }else section=`<section class="shop-section shop-random-section"><div class="shop-section-head"><h2>隨機商品</h2><div class="shop-refresh-meta"><span>第 ${party.market.serial} 批</span><span>今日已刷新 <b>${rc}</b> 次</span><span>每日 0 點重置刷新價格</span></div><div class="actions"><button onclick="refreshMarket()" ${state.gold<cost||!hasRandomRules()?'disabled':''}>刷新 · ${cost} 金幣</button></div></div><div class="shop-product-grid">${marketCards()}</div></section>`;
    return heading('SUPPLIES / 全隊共用','商店')+tabs+`<div class="shop-catalog-scroll" data-shop-category="${shopCategory}">${section}</div>`;
  };

  const LEVEL_SCROLL={id:'level_scroll',name:'升級卷軸',type:'levelScroll',get description(){return globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('item','level_scroll')??'';}};
  const inventoryItemById=id=>id===LEVEL_SCROLL.id?LEVEL_SCROLL:SHOP.find(x=>x.id===id);
  function inventoryItemCount(item){return item.type==='levelScroll'?materialCount('升級卷軸'):(typeof isHealPotion==='function'&&isHealPotion(item))?healPotionCount(item.id):(state.consumables[item.id]||0);}
  function setInventoryItemCount(item,n){n=Math.max(0,Math.floor(Number(n)||0));if(item.type==='levelScroll')setMaterialCount('升級卷軸',n);else if(typeof isHealPotion==='function'&&isHealPotion(item))setHealPotionCount(item.id,n);else state.consumables[item.id]=n;}
  globalThis.__EMBERWILD_INVENTORY_STOCK={item:inventoryItemById,count:id=>{const item=inventoryItemById(id);return item?inventoryItemCount(item):0;},set:(id,n)=>{const item=inventoryItemById(id);if(!item)return false;setInventoryItemCount(item,n);return true;}};
  const inventoryItemSellPrice=item=>item.type==='levelScroll'?materialSellPrice('升級卷軸'):itemSellPrice(item.id);
  globalThis.useInventoryItem=function(id,key){const item=inventoryItemById(id);if(!item)return;if(item.type==='levelScroll')return useLevelScroll();const h=partyMember(key);if(!h)return;if(id==='power_tier_reroll'){setTab('forge');toast('請選擇裝備後使用'+item.name);return;}if(typeof isHealPotion==='function'&&isHealPotion(item)){openHealingSettings();return;}if(inventoryItemCount(item)<1)return toast('道具數量不足');pageHeroSelection.set('equipment',key);withHero(h,()=>useSupply(id));render();};
  globalThis.sellInventoryItem=function(id,qty){if(globalThis.__EMBERWILD_CAN_SELL?.('item',id)===false)return toast('此消耗品不可販售');const item=inventoryItemById(id);if(!item)return;const have=inventoryItemCount(item),n=Math.max(0,Math.min(have,Math.floor(Number(qty)||0)));if(n<1)return toast('請輸入要販售的數量');const price=inventoryItemSellPrice(item),gold=state.gold;if(!Number.isSafeInteger(price*n)||gold+price*n>1e12)return toast('金幣已達上限，道具已保留');setInventoryItemCount(item,have-n);state.gold+=price*n;if(!save()){setInventoryItemCount(item,have);state.gold=gold;return;}render();toast(`已販售 ${item.name} ×${n}，獲得 ${price*n} 金幣`);};
  globalThis.sellInventoryItemFromButton=function(btn,id,all=false){const item=inventoryItemById(id);if(!item)return;const row=btn.closest('[data-inventory-item]'),input=row?.querySelector('input[data-sell-qty]'),qty=all?inventoryItemCount(item):input?.value;sellInventoryItem(id,qty);};
  globalThis.inventoryMaterialIcon=function(name){
    const glyphs={'鍛鐵':['anvil','#a9c98b'],'粉塵':['sparkles','#dfbe70'],'以太鍛鐵':['anvil','#9c9df2'],'光輝碎塊':['sparkles','#dfbe70'],'紅色草':['leaf','#ed7774'],'紅色草泥':['flask-conical','#ed7774'],'小蟲':['bug','#a9c98b'],'清水':['droplet','#87c5e7'],'藥水瓶':['flask-round','#c6d5df'],'升級卷軸':['scroll-text','#dfbe70']};
    const [key,tone]=glyphs[name]||[/牙|骨/.test(name)?'bone':/翼|羽/.test(name)?'feather':/晶|石/.test(name)?'gem':/齒輪/.test(name)?'cog':'package','#a9c98b'];
    return `<span class="inventory-item-icon" style="color:${tone}" aria-hidden="true">${globalThis.__EMBERWILD_INVENTORY_ICON?.('material',name,'lucide:'+key,{size:26})||__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+key,[],{size:26})}</span>`;
  };
  globalThis.inventoryMaterialDescription=name=>globalThis.__EMBERWILD_ITEM_DESCRIPTION?.('material',name)??'';
  function inventoryItemIcon(item){
    const ticket=item.type==='levelScroll'||EmberwildTimedBoosts.isItem(item),bottle=['healPotion','imbue','ward','elementTonic'].includes(item.type);
    const key=ticket?'ticket':bottle?'flask-round':item.type==='gearTierReroll'?'sparkles':'package';
    const tone=ticket?'#dfbe70':item.type==='healPotion'?'#ed7774':({fire:'#ed7774',ice:'#87c5e7',wind:'#7acfab',light:'#dfbe70',shadow:'#b29adc'})[item.element]||'#a9c98b';
    return `<span class="inventory-item-icon" style="color:${tone}" aria-hidden="true">${globalThis.__EMBERWILD_INVENTORY_ICON?.('item',item.id||'','lucide:'+key,{size:26})||__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+key,[],{size:26})}</span>`;
  }
  globalThis.inventoryItemIcon=inventoryItemIcon;
  globalThis.inventoryShopOfferIcon=function(offer){
    if(offer.kind==='item'){const item=offerItem(offer);return item?inventoryItemIcon(item):inventoryMaterialIcon(offer.key);}
    if(offer.kind==='gem')return globalThis.inventoryGemIcon?.(Number(offer.key))||inventoryMaterialIcon('寶石');
    return inventoryMaterialIcon(offer.kind==='ore'?'鍛鐵':offer.kind==='dust'?'粉塵':offer.key);
  };
  // Item tab: tickets, potions, other consumables and skill gems are separate blocks.
  accountItemsView=function(){
    ensureHealingPotionState();const target=pageHero('equipment')||party.members[0],rows=[...SHOP,LEVEL_SCROLL].filter(item=>inventoryItemCount(item)>0),needsTarget=rows.some(item=>!['levelScroll','gearTierReroll'].includes(item.type)&&!isHealPotion(item)&&!EmberwildTimedBoosts.isItem(item));
    const slot=item=>`<div class="account-item-row icon-only-row" data-inventory-item="${esc(item.id)}">${itemSlotHTML('item',item.id,{count:inventoryItemCount(item),context:'inventory'})}</div>`;
    const isPotion=item=>isHealPotion(item)||['imbue','ward','elementTonic'].includes(item.type),isTicket=item=>EmberwildTimedBoosts.isItem(item);
    const potions=rows.filter(isPotion),tickets=rows.filter(item=>!isPotion(item)&&isTicket(item)),others=rows.filter(item=>!isPotion(item)&&!isTicket(item));
    const companions=Object.entries(party.achievements?.tickets||{}).filter(([,n])=>n>0).map(([id,n])=>`<div class="account-item-row icon-only-row" data-companion-ticket="${esc(id)}">${itemSlotHTML('item','companion-ticket-'+id,{count:n,context:'inventory'})}</div>`);
    const vouchers=globalThis.EmberwildRegionVouchers?.inventorySlots?.()||{slots:[],action:''},ticketSlots=[...tickets.map(slot),...companions,...vouchers.slots];
    const group=(id,title,body,extra='')=>`<section class="panel inventory-item-group" data-inventory-group="${id}"><div class="inventory-item-group-head"><h2>${title}</h2>${extra}</div>${body}</section>`;
    const list=items=>`<div class="account-item-list">${items.join('')}</div>`;
    return heading('ITEMS / 帳號共用','道具庫存')+`<section class="panel"><div class="inventory-item-controls">${needsTarget?`<label>使用角色 <select onchange="selectPageHero('equipment',Number(this.value))">${(typeof enlistedHeroes==='function'?enlistedHeroes():party.members).map(h=>`<option value="${memberKey(h)}" ${h===target?'selected':''}>${esc(characterName(h))}</option>`).join('')}</select></label>`:''}<span class="small">點擊項目查看詳細資料及使用／販售。</span></div></section>`
      +(ticketSlots.length?group('tickets','票券',list(ticketSlots),vouchers.action):'')
      +group('potions','藥水',`<div class="inventory-supply-status">${esc(characterName(target))}目前裝備藥水：<span class="supply-countdown" data-job="${memberKey(target)}">${esc(supplyStatus(target)||'無')}</span></div>${potions.length?list(potions.map(slot)):'<p class="empty">尚未持有藥水。</p>'}`)
      +(others.length?group('others','其他道具',list(others.map(slot))):'')
      +(!rows.length&&!ticketSlots.length?'<p class="empty">尚未持有消耗道具。</p>':'')+accountGemsView();
  };
  globalThis.accountItemsView=accountItemsView;
  const shopInventoryEquipmentBase=equipmentView;
  equipmentView=function(){if(inventoryCategory==='items')return inventoryTabs()+accountItemsView();return shopInventoryEquipmentBase();};
  if(state)render();
})();
