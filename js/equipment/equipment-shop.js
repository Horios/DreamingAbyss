/* Standard equipment reuses global forms, the shop transaction and boss progress. */
(()=>{
  const C=EmberwildShopCatalog,copy=x=>JSON.parse(JSON.stringify(x));
  const stages=()=>globalThis.__EMBERWILD_SHOP_SETTINGS.equipmentStages;
  const mapId=i=>GAMEPLAY_SETTINGS.maps.catalog[i]?.id;
  let folded=new Map(),latest=null,viewOwner=null;
  function migrateClears(p,inferLegacy=false){
    const out={};
    for(const [i,m] of GAMEPLAY_SETTINGS.maps.catalog.entries()){
      if(p.mapClears?.[m.id]===true||inferLegacy&&(Number(p.achievements?.bossKills?.[i])>0||(p.etherBossClaims||[]).some(key=>String(key).startsWith(i+':'))||(m.mapType==='final'&&p.cleared)))out[m.id]=true;
    }
    // Retain clears if the designer temporarily removes a map from the catalog.
    for(const [id,clear] of Object.entries(p.mapClears||{}))if(clear===true)out[id]=true;
    p.mapClears=out;p.equipmentShopUnlocked=[...new Set((p.equipmentShopUnlocked||[]).filter(id=>typeof id==='string'))];
    for(const s of stages())if((s.initiallyUnlocked||s.unlockMapIds.some(id=>out[id]))&&!p.equipmentShopUnlocked.includes(s.id))p.equipmentShopUnlocked.push(s.id);
    return p;
  }
  function unlocked(s){if(!party)return false;migrateClears(party);return party.equipmentShopUnlocked.includes(s.id);}
  globalThis.recordMapClear=function(index){
    if(!party||!mapId(index))return false;
    // Do not infer new clears from per-enemy kill/ether counters: a stage may have
    // several bosses. Legacy counters are consumed only during save migration.
    party.mapClears??={};if(party.mapClears[mapId(index)])return false;
    const old=new Set(party.equipmentShopUnlocked||[]);party.mapClears[mapId(index)]=true;migrateClears(party);
    for(const s of stages())if(!old.has(s.id)&&party.equipmentShopUnlocked.includes(s.id))note('裝備商店永久解鎖 · '+s.name,'item');
    return true;
  };
  function currentOffers(){return stages().filter(unlocked).sort((a,b)=>b.order-a.order||b.level-a.level);}
  function offer(key){
    if(typeof key!=='string')return null;const [stageId,entryId]=key.split('/'),stage=stages().find(s=>s.id===stageId);
    if(!stage||!unlocked(stage))return null;const entry=stage.entries.find(e=>e.id===entryId);return entry?{stage,entry}:null;
  }
  globalThis.createEquipmentShopGear=function(stageId,entryId,{preview=false}={}){
    const found=offer(stageId+'/'+entryId);if(!found)return null;
    const {stage:s,entry:e}=found,ref=C.equipmentForms(ITEM_FORMS).find(r=>r.form.id===e.formId);if(!ref)return null;
    const g=gear(Math.max(1,Math.min(12,Math.ceil(s.level/5))),ref.slot,0,e.job);
    Object.assign(g,{formJob:ref.group,form:ref.index,powerTier:s.powerTier,equipmentLevel:s.level,equipmentSource:'shop',acquiredAt:Date.now(),baseRuleVersion:1,prefixId:'',suffixId:'',affix:[],plus:0,canEnhance:e.canEnhance,canReroll:e.canReroll});
    delete g.baseSnapshot;
    // A fixed shop base is exactly 100%, regardless of the stage's displayed T.
    const baseline=gearStatBreakdown(g);g.baseSnapshot.base={...baseline.body};g.baseSnapshot.mult=1;
    g.weaponType=ref.form.weaponType||g.weaponType;g.name=gearName(g);if(preview)g.id='shop-preview-'+s.id+'-'+e.id;
    return g;
  };
  globalThis.buyEquipmentShopOffer=function(key,quantity=1){
    const found=offer(key);if(!found||!Number.isSafeInteger(quantity)||quantity<1||quantity>100)return false;
    const {stage:s,entry:e}=found,qty=e.quantity*quantity,price=e.unitPrice*qty;
    if(!Number.isSafeInteger(price)||price>1e12||qty>RULES.bagCapacity)return false;
    return globalThis.purchaseShopOffer({kind:'equipment',stageId:s.id,entryId:e.id,qty,price},s.name);
  };
  globalThis.setEquipmentShopFold=function(id,open){if(!stages().some(s=>s.id===id))return;folded.set(id,!open);if(state)render();};
  globalThis.equipmentShopView=function(){
    const rows=currentOffers(),newest=rows[0]?.id;
    if(viewOwner!==party){viewOwner=party;folded=new Map();latest=null;}
    if(newest!==latest){for(const s of rows)folded.set(s.id,s.id!==newest);latest=newest;}
    return '<section class="shop-section equipment-shop"><h2>裝備商店</h2><p class="small">固定 T 級、100% 標準基底，初始無隨機詞綴。購買後可在背包查看、強化及洗鍊；首次通關地區 BOSS 可永久解鎖新階段。</p>'+rows.map(s=>{
      const open=!folded.get(s.id),content=open?s.entries.map(e=>{
        const g=createEquipmentShopGear(s.id,e.id,{preview:true});if(!g)return '';
        const key=s.id+'/'+e.id,price=globalThis.shopPayablePrice?.(e.unitPrice*e.quantity)??e.unitPrice*e.quantity;
        return '<article class="shop-product-row icon-product fixed-shop-row">'+gearSlotHTML(g,{preview:g,count:e.quantity,context:'shop',shopType:'equipment',shopId:key,price,detailLabel:'每份件數'})+'<small class="shop-product-label">'+esc(CLASSES[e.job].name)+' · '+esc(SLOTS[g.slot])+' · '+price.toLocaleString()+' 金幣</small></article>';
      }).join(''):'';
      return '<section class="equipment-shop-stage" data-equipment-stage="'+esc(s.id)+'"><button type="button" class="equipment-stage-toggle" aria-expanded="'+open+'" onclick="setEquipmentShopFold(\''+s.id+'\','+!open+')">'+(open?'▼ ':'▶ ')+esc(s.name)+' · LV '+s.level+'</button>'+(open?'<div class="shop-product-grid">'+content+'</div>':'')+'</section>';
    }).join('')+'</section>';
  };
  const validateBase=validateParty;
  validateParty=function(raw){
    if(raw.mapClears!==undefined&&(!raw.mapClears||typeof raw.mapClears!=='object'||Array.isArray(raw.mapClears)||Object.entries(raw.mapClears).some(([id,v])=>!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id)||typeof v!=='boolean')))throw Error('地區通關紀錄無效');
    if(raw.equipmentShopUnlocked!==undefined&&(!Array.isArray(raw.equipmentShopUnlocked)||raw.equipmentShopUnlocked.length>1000||raw.equipmentShopUnlocked.some(id=>typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id))))throw Error('裝備商店解鎖紀錄無效');
    const p=validateBase(raw);p.mapClears=copy(raw.mapClears||{});p.equipmentShopUnlocked=copy(raw.equipmentShopUnlocked||[]);return migrateClears(p,raw.mapClears===undefined);
  };
  const packBase=packParty;packParty=function(){const out=packBase();if(party){for(const g of party.members[0].bag)if(!EmberwildTokens.isToken(g))gearStatBreakdown(g);migrateClears(party);out.mapClears=copy(party.mapClears);out.equipmentShopUnlocked=copy(party.equipmentShopUnlocked);}return out;};
  const canEnhanceBase=canEnhance;canEnhance=function(g){return g?.canEnhance!==false&&canEnhanceBase(g);};
  const enhanceBase=enhance;enhance=function(id){const g=findGear(id);if(g?.canEnhance===false)return toast('此裝備不可強化');return enhanceBase(id);};
  const rerollBase=reroll;reroll=function(id){const g=findGear(id);if(g?.canReroll===false)return toast('此裝備不可洗鍊');return rerollBase(id);};
  globalThis.__EMBERWILD_EQUIPMENT_SHOP={version:1,stages,currentOffers,migrateClears};
})();
