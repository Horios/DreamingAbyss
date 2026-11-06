
/* Sale economy and configurable salvage output. */
(function installEconomyAndSalvageSystem(){
  const QUALITY_NAMES=(typeof AFFIX_RANK!=='undefined'?AFFIX_RANK:['普通','精良','稀有','傳說']);
  const DEFAULT_GEAR_SELL=[2,6,18,45];
  const defaultMaterialKeys=()=>{
    const set=new Set(['鍛鐵','粉塵','以太鍛鐵','光輝碎塊','升級卷軸','紅色草','紅色草泥','小蟲','藥水瓶','清水']);
    for(const m of (GAMEPLAY_SETTINGS_DEFAULTS?.monsters?.catalog||[]))if(m?.material)set.add(m.material);
    for(const d of (GAMEPLAY_SETTINGS_DEFAULTS?.drops?.entries||[]))if(d?.type==='material'&&d.key)set.add(d.key);
    return [...set];
  };
  const defaultMaterialPrice=k=>['紅色草','紅色草泥','小蟲','藥水瓶','清水'].includes(k)?0:k==='鍛鐵'?1:k==='粉塵'?2:k==='以太鍛鐵'?15:k==='光輝碎塊'?20:k==='升級卷軸'?25:1;
  GAMEPLAY_SETTINGS_DEFAULTS.economy ??={};
  GAMEPLAY_SETTINGS_DEFAULTS.economy.equipmentSellPriceByQuality ??=DEFAULT_GEAR_SELL.slice();
  GAMEPLAY_SETTINGS_DEFAULTS.economy.materialDefaultSellPrice ??=1;
  GAMEPLAY_SETTINGS_DEFAULTS.economy.potionSellPrice ??=10;
  GAMEPLAY_SETTINGS_DEFAULTS.economy.materialPrices ??=defaultMaterialKeys().map(key=>({key,sellPrice:defaultMaterialPrice(key)}));
  GAMEPLAY_SETTINGS_DEFAULTS.equipment.salvage.extraRewards ??=[];

  const economyDynamicArrays=new Set(['monsters.skills','monsters.catalog','drops.entries','economy.materialPrices','equipment.salvage.extraRewards']);
  mergeGameplayShape=function mergeGameplayShapeEconomy(def,src,path=''){
    if(Array.isArray(def)){
      const isSourcesKinds=/^(drops\.entries\.\d+\.(sources|kinds))$/.test(path);
      const dynamic=economyDynamicArrays.has(path)||isSourcesKinds;
      if(dynamic){
        if(!Array.isArray(src))return cloneGameplaySettings(def);
        if(isSourcesKinds||!def.length)return cloneGameplaySettings(src);
        const template=def[0];
        return src.map((v,i)=>mergeGameplayShapeEconomy(def[i]===undefined?template:def[i],v,path+'.'+i));
      }
      return def.map((v,i)=>mergeGameplayShapeEconomy(v,Array.isArray(src)?src[i]:undefined,path?path+'.'+i:String(i)));
    }
    if(def&&typeof def==='object'){
      const out={};
      for(const k of Object.keys(def)){const next=path?path+'.'+k:k;out[k]=mergeGameplayShapeEconomy(def[k],src&&typeof src==='object'?src[k]:undefined,next);}
      return out;
    }
    if(typeof def==='number')return typeof src==='number'&&Number.isFinite(src)?src:def;
    return typeof src===typeof def?src:def;
  };

  const economyValidateGameplayBase=validateGameplaySettings;
  validateGameplaySettings=function(cfg){
    cfg=economyValidateGameplayBase(cfg);
    const e=cfg.economy||{},prices=e.equipmentSellPriceByQuality;
    if(!Array.isArray(prices)||prices.length!==4||prices.some(v=>!Number.isFinite(v)||v<0))throw Error('裝備販售價格必須有普通／精良／稀有／傳說 4 個非負數值');
    if(!Number.isFinite(e.materialDefaultSellPrice)||e.materialDefaultSellPrice<0||!Number.isFinite(e.potionSellPrice)||e.potionSellPrice<0)throw Error('材料／治療藥水販售價格無效');
    if(!Array.isArray(e.materialPrices))throw Error('材料販售價格表無效');
    const materialKeys=new Set();
    for(const [i,row] of e.materialPrices.entries()){
      if(!row||typeof row.key!=='string'||!row.key.trim()||materialKeys.has(row.key)||!Number.isFinite(row.sellPrice)||row.sellPrice<0)throw Error('材料販售價格資料無效：'+i);
      materialKeys.add(row.key);
    }
    const extras=cfg.equipment?.salvage?.extraRewards,types=new Set(['ore','dust','material','potion','item','gem']);
    if(!Array.isArray(extras))throw Error('分解額外產物必須是陣列');
    for(const [i,r] of extras.entries()){
      if(!r||!Number.isInteger(r.quality)||r.quality<0||r.quality>3||!types.has(r.type)||!Number.isInteger(r.quantity)||r.quantity<1||r.quantity>999)throw Error('分解額外產物資料無效：'+i);
      if(r.type==='material'&&(typeof r.key!=='string'||!r.key.trim()))throw Error('分解材料產物需要材料名稱：'+i);
      if(r.type==='item'&&!SHOP.some(x=>x.id===r.key))throw Error('分解產物指定的商店道具不存在：'+i);
      if(r.type==='gem'&&r.key!=='random'&&![0,1,2,'0','1','2'].includes(r.key))throw Error('分解寶石 key 需為 random/0/1/2：'+i);
    }
    return cfg;
  };
  normalizeGameplaySettings=function(input){if(typeof validateMonsterDropDynamicInput==='function')validateMonsterDropDynamicInput({balanceSettings:input});return validateGameplaySettings(mergeGameplayShape(GAMEPLAY_SETTINGS_DEFAULTS,input||{}));};

  const normalizeItemSellPrices=data=>{
    if(Array.isArray(data?.items))for(const item of data.items){if(!Number.isFinite(item.sellPrice)||item.sellPrice<0)item.sellPrice=Math.max(0,Math.round((Number(item.cost)||0)*.25));}
    return data;
  };
  const economyValidateBalanceBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    const copy=normalizeItemSellPrices(JSON.parse(JSON.stringify(input)));
    const out=economyValidateBalanceBase(copy);
    normalizeItemSellPrices(out);
    for(const item of out.items||[])if(!Number.isFinite(item.sellPrice)||item.sellPrice<0)throw Error('道具賣出價格無效：'+(item.id||'未知'));
    return out;
  };
  const economyApplyBalanceBase=applyBalanceConfig;
  applyBalanceConfig=function(input,{persist=true}={}){
    const copy=normalizeItemSellPrices(JSON.parse(JSON.stringify(input)));
    const out=economyApplyBalanceBase(copy,{persist:false});
    for(const item of SHOP)if(!Number.isFinite(item.sellPrice)||item.sellPrice<0)item.sellPrice=Math.max(0,Math.round((Number(item.cost)||0)*.25));
    if(persist)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    if(state)render();
    return out;
  };
  for(const item of SHOP)if(!Number.isFinite(item.sellPrice)||item.sellPrice<0)item.sellPrice=Math.max(0,Math.round((Number(item.cost)||0)*.25));

  // Re-normalize the in-memory settings now that the new economy fields exist.
  try{
    const saved=balanceSourceText();
    if(saved){const parsed=JSON.parse(saved);if(parsed?.balanceSettings)GAMEPLAY_SETTINGS=normalizeGameplaySettings(parsed.balanceSettings);if(Array.isArray(parsed?.items)){const byId=new Map(parsed.items.map(x=>[x.id,x]));for(const item of SHOP){const src=byId.get(item.id);if(src&&Number.isFinite(src.sellPrice)&&src.sellPrice>=0)item.sellPrice=src.sellPrice;}}}
    else GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);
  }catch(e){console.warn('販售／分解設定載入失敗，使用預設值',e);GAMEPLAY_SETTINGS=normalizeGameplaySettings(GAMEPLAY_SETTINGS);}

  const economyClone=v=>JSON.parse(JSON.stringify(v));
  function economySettings(){return GAMEPLAY_SETTINGS.economy;}
  function equipmentSellPrice(g){const identity=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY?.(g),custom=identity&&globalThis.__EMBERWILD_ITEM_DETAILS?.(identity.kind,identity.key)?.sellPrice;if(custom!==undefined)return custom;const q=Math.max(0,Math.min(3,gearQualityRank(g)));return Math.max(0,Math.round(Number(economySettings().equipmentSellPriceByQuality[q])||0));}
  function materialSellPrice(key){const custom=globalThis.__EMBERWILD_ITEM_DETAILS?.(key==='升級卷軸'?'item':'material',key==='升級卷軸'?'level_scroll':key)?.sellPrice;if(custom!==undefined)return custom;const e=economySettings(),row=(e.materialPrices||[]).find(x=>x.key===key);return Math.max(0,Math.round(Number(row?.sellPrice??(['紅色草','紅色草泥','小蟲','藥水瓶','清水'].includes(key)?defaultMaterialPrice(key):e.materialDefaultSellPrice))||0));}
  function itemSellPrice(id){const custom=globalThis.__EMBERWILD_ITEM_DETAILS?.('item',id)?.sellPrice;if(custom!==undefined)return custom;if(id==='__potion__')return Math.max(0,Math.round(Number(economySettings().potionSellPrice)||0));const item=SHOP.find(x=>x.id===id);return Math.max(0,Math.round(Number(item?.sellPrice)||0));}
  globalThis.equipmentSellPrice=equipmentSellPrice;globalThis.materialSellPrice=materialSellPrice;globalThis.itemSellPrice=itemSellPrice;

  function materialCount(key){if(key==='鍛鐵')return state.ore;if(key==='粉塵')return state.dust;return state.materials[key]||0;}
  function setMaterialCount(key,value){value=Math.max(0,Math.floor(value));if(key==='鍛鐵')state.ore=value;else if(key==='粉塵')state.dust=value;else state.materials[key]=value;}
  globalThis.materialCount=materialCount;globalThis.setMaterialCount=setMaterialCount;
  function economyResourceSnapshot(){return {gold:state.gold,ore:state.ore,dust:state.dust,potions:state.potions,healingPotions:economyClone(healingInventory()),materials:economyClone(state.materials),consumables:economyClone(state.consumables),gems:[...state.gems]};}
  function restoreEconomyResources(s){state.gold=s.gold;state.ore=s.ore;state.dust=s.dust;state.potions=s.potions;const inv=healingInventory();for(const k of Object.keys(inv))delete inv[k];Object.assign(inv,s.healingPotions);for(const k of Object.keys(state.materials))delete state.materials[k];Object.assign(state.materials,s.materials);for(const k of Object.keys(state.consumables))delete state.consumables[k];Object.assign(state.consumables,s.consumables);state.gems.splice(0,state.gems.length,...s.gems);}

  function salvageExtraRules(g){const q=gearQualityRank(g);return (GAMEPLAY_SETTINGS.equipment.salvage.extraRewards||[]).filter(r=>r.quality===q);}
  function grantEconomyReward(type,key,quantity){
    const n=Math.max(0,Math.floor(Number(quantity)||0));if(!n)return;
    if(type==='ore')state.ore+=n;
    else if(type==='dust')state.dust+=n;
    else if(type==='potion'){const item=healPotionItems().find(x=>x.id==='heal_standard')||healPotionItems()[0];if(item)setHealPotionCount(item.id,healPotionCount(item.id)+n);else state.potions+=n;}
    else if(type==='material')state.materials[key]=(state.materials[key]||0)+n;
    else if(type==='item'){const item=SHOP.find(x=>x.id===key);if(isHealPotion(item))setHealPotionCount(key,healPotionCount(key)+n);else if(item)state.consumables[key]=(state.consumables[key]||0)+n;}
    else if(type==='gem'){for(let i=0;i<n;i++){const gi=key==='random'?rand(3):Number(key);if(Number.isInteger(gi)&&gi>=0&&gi<3)state.gems[gi]=(state.gems[gi]||0)+1;}}
  }
  function salvageRewardPlan(g,includeEnhance=true){
    const identity=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY?.(g),custom=identity&&globalThis.__EMBERWILD_ITEM_DETAILS?.(identity.kind,identity.key)?.salvageRewards;
    if(custom!==undefined)return custom.map(x=>({...x}));
    const r=update12SalvageRewards(g,includeEnhance);
    return [{type:'ore',key:'',quantity:r.ore},{type:'dust',key:'',quantity:r.dust},...salvageExtraRules(g).map(x=>({...x}))];
  }
  function grantSalvageRewards(g,includeEnhance=true){
    const plan=salvageRewardPlan(g,includeEnhance);for(const x of plan)grantEconomyReward(x.type,x.key,x.quantity);
    return {ore:plan.filter(x=>x.type==='ore').reduce((n,x)=>n+x.quantity,0),dust:plan.filter(x=>x.type==='dust').reduce((n,x)=>n+x.quantity,0)};
  }
  globalThis.salvageRewardPlan=salvageRewardPlan;
  globalThis.grantSalvageRewards=grantSalvageRewards;

  salvage=function(id){
    const g=findGear(id);if(!g||g.locked||gearWearer(g.id)||inlineAffixDrafts.has(affixDraftKey(g)))return;
    const bag=state.bag,snap=economyResourceSnapshot();grantSalvageRewards(g,true);state.bag=state.bag.filter(x=>x.id!==id);pruneGearSelections();
    if(!save()){state.bag=bag;restoreEconomyResources(snap);return;}render();toast('已分解 '+equipmentDisplayName(g));
  };
  confirmMassSalvage=function(){
    if(!massSalvageIds)return;const items=massSalvageTargets(massSalvageIds),ids=new Set(items.map(g=>g.id)),bag=state.bag,snap=economyResourceSnapshot();
    for(const g of items)grantSalvageRewards(g,true);state.bag=state.bag.filter(g=>!ids.has(g.id));
    if(!save()){state.bag=bag;restoreEconomyResources(snap);return;}massSalvageIds=null;pruneGearSelections();closeModal();render();toast('已分解 '+items.length+' 件裝備');
  };
  salvageAll=function(){
    const targets=state.bag.filter(g=>!EmberwildTokens.isToken(g)&&gearQualityRank(g)===0&&(g.plus||0)===0&&!g.affix.length&&g.boss===undefined&&!state.equipped.includes(g.id)&&!g.locked),ids=new Set(targets.map(g=>g.id));for(const g of targets)grantSalvageRewards(g,false);state.bag=state.bag.filter(g=>!ids.has(g.id));pruneGearSelections();save();render();toast(`已分解 ${ids.size} 件未養成普通裝備`);
  };
  function canDisposeBagGear(g){return !!g&&globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)!==false&&!g.locked&&!gearWearer(g.id)&&!inlineAffixDrafts.has(affixDraftKey(g));}
  function sellGear(id){
    const g=findGear(id);if(g&&globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)===false)return toast('此裝備不可販售');if(!canDisposeBagGear(g))return toast('已穿戴、鎖定或待確認洗鍊的裝備不能販售');
    const price=equipmentSellPrice(g),bag=state.bag,gold=state.gold;if(gold+price>1e12)return toast('金幣已達上限，裝備已保留');state.gold+=price;state.bag=state.bag.filter(x=>x.id!==id);pruneGearSelections();
    if(!save()){state.bag=bag;state.gold=gold;return;}render();toast(`已販售 ${equipmentDisplayName(g)}，獲得 ${price} 金幣`);
  }
  function sellAllGearByQuality(q){
    const items=state.bag.filter(g=>gearQualityRank(g)===q&&canDisposeBagGear(g));if(!items.length)return toast('沒有可販售的'+QUALITY_NAMES[q]+'裝備');
    const ids=new Set(items.map(g=>g.id)),total=items.reduce((n,g)=>n+equipmentSellPrice(g),0);if(state.gold+total>1e12)return toast('金幣已達上限，裝備已保留');if(!confirm(`確定販售 ${items.length} 件${QUALITY_NAMES[q]}裝備，獲得 ${total} 金幣？\n已穿戴、鎖定與待確認洗鍊裝備不會販售。`))return;
    const bag=state.bag,gold=state.gold;state.bag=state.bag.filter(g=>!ids.has(g.id));state.gold+=total;pruneGearSelections();if(!save()){state.bag=bag;state.gold=gold;return;}render();toast(`已販售 ${items.length} 件裝備，獲得 ${total} 金幣`);
  }
  globalThis.sellGear=sellGear;globalThis.sellAllGearByQuality=sellAllGearByQuality;

  const economyInventoryGearDetailBase=inventoryGearDetail;
  inventoryGearDetail=function(g){
    let html=economyInventoryGearDetailBase(g);if(!g)return html;const disabled=!canDisposeBagGear(g)?' disabled':'';
    return html.replace('</div></section>\n    '+(inlineAffixComparison(g)||''),`<button class="sell-gear-button" onclick="sellGear('${g.id}')"${disabled}>販售 ${equipmentSellPrice(g)} 金幣</button></div></section>\n    ${inlineAffixComparison(g)}`);
  };
  const economyBulkSalvageBase=bulkSalvageControls;
  bulkSalvageControls=function(){return economyBulkSalvageBase()+`<div class="actions bulk-sell-actions">${QUALITY_NAMES.map((name,q)=>`<button onclick="sellAllGearByQuality(${q})">販售所有${name}</button>`).join('')}</div>`;};

  function sellMaterial(key,qty){if(globalThis.__EMBERWILD_CAN_SELL?.(key==='升級卷軸'?'item':'material',key==='升級卷軸'?'level_scroll':key)===false)return toast('此素材不可販售');const have=materialCount(key),n=Math.max(0,Math.min(have,Math.floor(Number(qty)||0)));if(n<1)return toast('請輸入要販售的數量');const unit=materialSellPrice(key),gold=state.gold;if(!Number.isSafeInteger(unit*n)||gold+unit*n>1e12)return toast('金幣已達上限，素材已保留');setMaterialCount(key,have-n);state.gold+=unit*n;if(!save()){setMaterialCount(key,have);state.gold=gold;return;}render();toast(`已販售 ${key} ×${n}，獲得 ${unit*n} 金幣`);}
  function sellMaterialFromControl(btn){const box=btn.closest('[data-material]'),input=box.querySelector('input');sellMaterial(box.dataset.material,input.value);}
  function sellAllMaterialFromControl(btn){const box=btn.closest('[data-material]');sellMaterial(box.dataset.material,materialCount(box.dataset.material));}
  globalThis.sellMaterial=sellMaterial;globalThis.sellMaterialFromControl=sellMaterialFromControl;globalThis.sellAllMaterialFromControl=sellAllMaterialFromControl;
  const ALCHEMY_MATERIALS=new Set(['紅色草','紅色草泥','藥水瓶','清水']);
  const ENHANCE_MATERIALS=new Set(['鍛鐵','粉塵','以太鍛鐵','光輝碎塊']);
  let commonMaterialRegion='all',commonMaterialSort='region';
  function materialRegions(){
    const out=new Map(),catalog=new Map(monsterCatalog().map(m=>[m.id,m]));
    const add=(name,map)=>{if(!out.has(name))out.set(name,new Set());out.get(name).add(map);};
    for(const rule of GAMEPLAY_SETTINGS.drops?.entries||[]){
      if(!rule.enabled||!['material','sourceMaterial'].includes(rule.type))continue;
      for(const id of rule.sources){
        const m=catalog.get(id);if(!m||m.maxDrops===0||!rule.kinds.some(k=>k===m.kind||m.kind==='normal'&&k==='elite'))continue;
        rule.chanceByDifficulty.forEach((chance,mode)=>{
          if(chance<=0)return;
          add(rule.type==='material'?rule.key:m.kind==='boss'?bossMaterial(m.mapIndex,mode):m.material,m.mapIndex);
        });
      }
    }
    return out;
  }
  globalThis.setCommonMaterialRegion=value=>{if(!['all','other','multiple'].includes(value)&&!MAPS[Number(value)])return;commonMaterialRegion=String(value);render();};
  globalThis.setCommonMaterialSort=value=>{if(!['region','name','quantity'].includes(value))return;commonMaterialSort=value;render();};
  globalThis.inventoryMaterialRegions=materialRegions;
  accountMaterialsView=function(){
    const names=[...ENHANCE_MATERIALS,...Object.keys(state.materials)],seen=new Set(),entries=[];
    for(const name of names){if(name==='升級卷軸'||seen.has(name))continue;seen.add(name);const n=materialCount(name);if(n>0||['鍛鐵','粉塵','以太鍛鐵'].includes(name))entries.push({name,n});}
    const sources=materialRegions(),regions=name=>[...(sources.get(name)||[])].sort((a,b)=>a-b);
    const sourceText=name=>{const maps=regions(name);return maps.length?maps.map(i=>MAPS[i].name).join('、'):name==='小蟲'?'採集取得':'非地區來源／未指定';};
    function row({name,n},group){return `<div class="account-sell-row account-material-row icon-only-row">${itemSlotHTML('material',name,{count:n,extra:sourceText(name),context:'inventory'})}</div>`;}

    const controls=`<div class="material-region-controls"><label>取得地區 <select aria-label="共用材料取得地區" onchange="setCommonMaterialRegion(this.value)"><option value="all" ${commonMaterialRegion==='all'?'selected':''}>全部地區</option><option value="multiple" ${commonMaterialRegion==='multiple'?'selected':''}>跨地區掉落</option><option value="other" ${commonMaterialRegion==='other'?'selected':''}>非地區來源／未指定</option>${MAPS.map((m,i)=>`<option value="${i}" ${commonMaterialRegion===String(i)?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label><label>排序 <select aria-label="共用材料排序" onchange="setCommonMaterialSort(this.value)">${[['region','取得地區'],['name','名稱'],['quantity','數量']].map(([key,label])=>`<option value="${key}" ${commonMaterialSort===key?'selected':''}>${label}</option>`).join('')}</select></label></div>`;
    const groups=[['common','共用材料'],['alchemy','煉金材料'],['enhance','強化材料']];
    return heading('MATERIALS / 帳號共用','材料庫存')+`<div class="account-material-groups">${groups.map(([group,title])=>{
      let list=entries.filter(({name})=>group==='alchemy'?ALCHEMY_MATERIALS.has(name):group==='enhance'?ENHANCE_MATERIALS.has(name):!ALCHEMY_MATERIALS.has(name)&&!ENHANCE_MATERIALS.has(name));
      if(group==='common'){
        list=list.filter(({name})=>commonMaterialRegion==='all'||commonMaterialRegion==='other'&&!regions(name).length||commonMaterialRegion==='multiple'&&regions(name).length>1||regions(name).includes(Number(commonMaterialRegion)));
        list.sort((a,b)=>(commonMaterialSort==='region'?(regions(a.name)[0]??Infinity)-(regions(b.name)[0]??Infinity):commonMaterialSort==='quantity'?b.n-a.n:0)||a.name.localeCompare(b.name,'zh-Hant'));
      }
      return `<section class="panel material-group" data-material-group="${group}"><div class="row"><h2>${title}</h2><span class="small">${list.length} 種</span></div>${group==='common'?controls:''}<div class="account-sell-list">${list.map(item=>row(item,group)).join('')||'<p class="empty">沒有符合條件的材料。</p>'}</div></section>`;
    }).join('')}</div>`;
  };

  function itemCount(id){return id==='__potion__'?state.potions:(state.consumables[id]||0);}
  function setItemCount(id,n){n=Math.max(0,Math.floor(n));if(id==='__potion__')state.potions=n;else state.consumables[id]=n;}
  function sellItem(id,qty){const have=itemCount(id),n=Math.max(0,Math.min(have,Math.floor(Number(qty)||0)));if(n<1)return toast('請輸入要販售的數量');const unit=itemSellPrice(id),gold=state.gold;setItemCount(id,have-n);state.gold+=unit*n;if(!save()){setItemCount(id,have);state.gold=gold;return;}render();toast(`已販售 ${id==='__potion__'?'治療藥水':SHOP.find(x=>x.id===id)?.name||id} ×${n}，獲得 ${unit*n} 金幣`);}
  function sellItemFromControl(btn){const box=btn.closest('[data-item-sell]'),input=box.querySelector('input');sellItem(box.dataset.itemSell,input.value);}
  function sellAllItemFromControl(btn){const box=btn.closest('[data-item-sell]');sellItem(box.dataset.itemSell,itemCount(box.dataset.itemSell));}
  globalThis.sellItem=sellItem;globalThis.sellItemFromControl=sellItemFromControl;globalThis.sellAllItemFromControl=sellAllItemFromControl;
  function accountItemsView(){const rows=[{id:'__potion__',name:'治療藥水'},...SHOP.map(x=>({id:x.id,name:x.name}))];return heading('ITEMS / 帳號共用','道具庫存')+`<section class="panel"><div class="account-sell-list">${rows.map(x=>{const n=itemCount(x.id);return `<div class="account-sell-row"><b>${esc(x.name)}</b><span>× ${n.toLocaleString()}</span><span class="small">${itemSellPrice(x.id)} 金幣／件</span><div class="sell-controls" data-item-sell="${esc(x.id)}"><input type="number" min="1" max="${n}" value="1" ${n<1?'disabled':''}><button onclick="sellItemFromControl(this)" ${n<1?'disabled':''}>賣出</button><button onclick="sellAllItemFromControl(this)" ${n<1?'disabled':''}>全部</button></div></div>`;}).join('')}</div></section>`;}
  globalThis.accountItemsView=accountItemsView;

  inventoryTabs=function(){return `<div class="actions inventory-category-tabs">${[['equipment','裝備'],['materials','材料'],['items','道具']].map(([id,name])=>`<button class="${inventoryCategory===id?'primary':''}" onclick="setInventoryCategory('${id}')">${name}</button>`).join('')}<button onclick="showTestCodes()">兌換碼</button></div>`;};
  const economyEquipmentViewBase=equipmentView;
  equipmentView=function(){if(inventoryCategory==='items')return inventoryTabs()+accountItemsView();return economyEquipmentViewBase();};

  // Ensure exported JSON always contains the new fields, including per-item sell prices.
  const economyExportBase=exportableBalance;
  exportableBalance=function(){const out=economyExportBase();out.balanceSettings=cloneGameplaySettings(GAMEPLAY_SETTINGS);out.items=SHOP.map(item=>{const {desc,...rest}=item;return {...rest,sellPrice:itemSellPrice(item.id),description:item.description||desc||''};});out.notes=[...(out.notes||[]),'economy 控制裝備／材料／治療藥水販售價格；items.sellPrice 控制各商店道具賣價。','equipment.salvage.extraRewards 可依最高詞條品質追加分解產物。'];return out;};

  render();
})();
