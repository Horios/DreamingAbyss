/* Shared by the game and the balance editor. Pools reference items without deleting inventory definitions. */
(function(root){
  'use strict';
  const TYPES=['ore','dust','gem','material','item'];
  const DEFAULT_UNLISTED_TYPES=new Set(['ward','elementTonic']);
  const copy=value=>JSON.parse(JSON.stringify(value));
  const own=(value,key)=>Object.prototype.hasOwnProperty.call(value||{},key);
  const field=(value,key,fallback)=>own(value,key)?value[key]:fallback;
  const DEFAULT_RANDOM={offerCount:6,refreshBaseCost:100,refreshCostStep:50,entries:[
    {id:'ore',enabled:true,type:'ore',key:'',name:'鍛鐵',description:'',quantityMin:8,quantityMax:20,unitPrice:12,weight:1,quantityScalesWithTier:true,priceScalesWithTier:false},
    {id:'dust',enabled:true,type:'dust',key:'',name:'粉塵',description:'',quantityMin:3,quantityMax:8,unitPrice:25,weight:1,quantityScalesWithTier:false,priceScalesWithTier:false},
    {id:'gem',enabled:true,type:'gem',key:'random',name:'技能寶石',description:'',quantityMin:1,quantityMax:2,unitPrice:180,weight:.7,quantityScalesWithTier:false,priceScalesWithTier:false},
    {id:'region_material',enabled:true,type:'material',key:'region',name:'地區素材',description:'',quantityMin:3,quantityMax:6,unitPrice:60,weight:1.3,quantityScalesWithTier:false,priceScalesWithTier:true},
    ...EmberwildTimedBoosts.DEFAULT_RULES.map(copy)
  ]};
  const LEGACY_DESCRIPTIONS=new Set(['裝備強化常用素材。','裝備洗鍊與寶石相關用途的基礎素材。','隨機出現一種技能寶石。','從目前探索區域的怪物素材中隨機挑選。','從目前探索區域隨機挑選素材。','本批隨機商品。']);
  function normalizeRule(src,index,random){
    if(!src||typeof src!=='object'||Array.isArray(src))throw Error('商店商品規則格式無效：'+index);
    const type=field(src,'type','material');
    const out={
      id:field(src,'id',(random?'random_':'fixed_')+index),enabled:field(src,'enabled',true),type,
      key:field(src,'key',type==='gem'?(random?'random':'0'):type==='material'?(random?'region':'素材'):''),
      name:field(src,'name',''),description:field(src,'description',''),
      unitPrice:field(src,'unitPrice',type==='item'?null:1)
    };
    if(LEGACY_DESCRIPTIONS.has(out.description))out.description=DEFAULT_RANDOM.entries.find(x=>x.type===type)?.description||'';
    if(out.name==='隨機技能寶石')out.name='技能寶石';
    if(random)Object.assign(out,{
      quantityMin:field(src,'quantityMin',1),quantityMax:field(src,'quantityMax',1),
      weight:field(src,'weight',1),selection:field(src,'selection','weighted'),chance:field(src,'chance',1),
      quantityScalesWithTier:field(src,'quantityScalesWithTier',false),priceScalesWithTier:field(src,'priceScalesWithTier',false)
    });
    else out.quantity=field(src,'quantity',1);
    return out;
  }
  function normalize(input,{items=[],rerollItem=null}={}){
    if(input!==undefined&&(!input||typeof input!=='object'||Array.isArray(input)))throw Error('商店設定格式無效');
    const src=input||{},random=field(src,'randomOffers',{}),fixed=field(src,'fixedOffers',{});
    if(own(src,'schemaVersion')&&![1,2,3].includes(src.schemaVersion))throw Error('商店設定版本不支援');
    if(!random||typeof random!=='object'||Array.isArray(random)||!fixed||typeof fixed!=='object'||Array.isArray(fixed))throw Error('商店商品池格式無效');
    const rawRandom=own(random,'entries')?random.entries:copy(DEFAULT_RANDOM.entries);
    const rawFixed=own(fixed,'entries')?fixed.entries:items.filter(x=>x.shopEnabled!==false).map(x=>({id:x.id,type:'item',key:x.id,enabled:!DEFAULT_UNLISTED_TYPES.has(x.type),quantity:1,unitPrice:null}));
    if(!Array.isArray(rawRandom)||!Array.isArray(rawFixed))throw Error('商店商品池必須是陣列');
    const entries=rawRandom.map((x,i)=>normalizeRule(x,i,true));
    // Old reroll stones were appended outside the shop pool. Preserve their chance once during migration.
    if((src.schemaVersion??1)<2&&rerollItem&&items.some(x=>x.id===rerollItem.id)&&Number(rerollItem.shopChance)>0&&!entries.some(x=>x.type==='item'&&x.key===rerollItem.id)){
      const used=new Set(entries.map(x=>x.id));let id='power_tier_reroll',suffix=1;while(used.has(id))id='power_tier_reroll_'+suffix++;
      entries.push(normalizeRule({id,type:'item',key:rerollItem.id,quantityMin:1,quantityMax:1,unitPrice:rerollItem.shopPrice??650,selection:'extra',chance:rerollItem.shopChance},entries.length,true));
    }
    const fixedEntries=rawFixed.map((x,i)=>normalizeRule(x,i,false));
    // Delist existing resistance/amplification offers once. Later explicit editor changes stay editable.
    if((src.schemaVersion??1)<3){
      const unlistedIds=new Set(items.filter(x=>DEFAULT_UNLISTED_TYPES.has(x.type)).map(x=>x.id));
      for(const rule of [...entries,...fixedEntries])if(rule.enabled===true&&rule.type==='item'&&unlistedIds.has(rule.key))rule.enabled=false;
    }
    return {schemaVersion:3,randomOffers:{
      offerCount:field(random,'offerCount',DEFAULT_RANDOM.offerCount),
      refreshBaseCost:field(random,'refreshBaseCost',DEFAULT_RANDOM.refreshBaseCost),
      refreshCostStep:field(random,'refreshCostStep',DEFAULT_RANDOM.refreshCostStep),entries
    },fixedOffers:{entries:fixedEntries},equipmentStages:copy(src.equipmentStages??[])};
  }
  const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
  const number=(n,min,max)=>Number.isFinite(n)&&n>=min&&n<=max;
  function validate(input,options={}){
    const cfg=normalize(input,options),random=cfg.randomOffers,items=new Set((options.items||[]).map(x=>x.id));
    if(!integer(random.offerCount,1,24)||!integer(random.refreshBaseCost,0,1e9)||!integer(random.refreshCostStep,0,1e9))throw Error('商店批次數或刷新價格無效');
    const weighted=random.entries.some(x=>x.enabled&&x.selection==='weighted')?random.offerCount:0;
    if(weighted+random.entries.filter(x=>x.enabled&&x.selection==='extra'&&x.chance>0).length>100)throw Error('每批隨機商品與追加商品合計最多 100 筆');
    for(const [pool,rows] of [['random',random.entries],['fixed',cfg.fixedOffers.entries]]){
      if(rows.length>200)throw Error('每個商店商品池最多 200 筆');
      const ids=new Set();
      for(const rule of rows){
        const label=(pool==='random'?'隨機':'固定')+'商品規則：'+String(rule.id);
        if(typeof rule.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(rule.id)||ids.has(rule.id))throw Error(label+'，ID 無效或重複');
        ids.add(rule.id);
        if(typeof rule.enabled!=='boolean'||!TYPES.includes(rule.type)||typeof rule.key!=='string'||typeof rule.name!=='string'||typeof rule.description!=='string')throw Error(label+'，基本資料無效');
        if(rule.unitPrice!==null&&!integer(rule.unitPrice,0,1e9)||rule.unitPrice===null&&rule.type!=='item')throw Error(label+'，單價無效');
        if(rule.type==='item'&&!items.has(rule.key))throw Error(label+'，找不到道具 '+rule.key);
        if(rule.type==='gem'&&!(pool==='random'?['random','0','1','2','3','4']:['0','1','2','3','4']).includes(rule.key))throw Error(label+'，寶石種類無效');
        if(rule.type==='material'&&(!rule.key.trim()||rule.key.length>80||/[<>]/.test(rule.key)||['__proto__','constructor','prototype'].includes(rule.key)||pool==='fixed'&&rule.key==='region'))throw Error(label+'，素材名稱無效');
        if(['ore','dust'].includes(rule.type)&&rule.key!=='')throw Error(label+'，此商品不使用 key');
        if(pool==='random'){
          if(!integer(rule.quantityMin,1,999)||!integer(rule.quantityMax,rule.quantityMin,999)||!number(rule.weight,Number.MIN_VALUE,1e6)||!['weighted','extra'].includes(rule.selection)||!number(rule.chance,0,1)||typeof rule.quantityScalesWithTier!=='boolean'||typeof rule.priceScalesWithTier!=='boolean')throw Error(label+'，抽選或數量設定無效');
        }else if(!integer(rule.quantity,1,10000))throw Error(label+'，數量無效');
      }
    }
    validateEquipmentStages(cfg.equipmentStages,options);
    return cfg;
  }
  function equipmentForms(forms=[]){const rows=[];forms.forEach((slots,group)=>slots.forEach((list,slot)=>list.forEach((form,index)=>rows.push({form:{...form,id:form.id||'job'+group+'-slot'+slot+'-form'+index},group,slot,index}))));return rows;}
  function validateEquipmentStages(stages,{equipmentForms:forms,maps,classes}={}){
    if(!Array.isArray(stages)||stages.length>100)throw Error('裝備販售階段必須為最多 100 筆的陣列');
    const ids=new Set(),refs=forms?new Map(equipmentForms(forms).map(row=>[row.form.id,row])):null,mapIds=maps?new Set(maps.filter(m=>m.bossEnabled!==false).map(m=>m.id)):null;
    if(refs&&refs.size!==equipmentForms(forms).length)throw Error('裝備定義 ID 不可重複');
    for(const stage of stages){
      if(!stage||typeof stage.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(stage.id)||ids.has(stage.id))throw Error('裝備販售階段 ID 無效或重複');ids.add(stage.id);
      if(typeof stage.name!=='string'||!stage.name.trim()||stage.name.length>80||!integer(stage.level,1,60)||!integer(stage.powerTier,1,10)||!integer(stage.order,0,10000)||typeof stage.initiallyUnlocked!=='boolean'||!Array.isArray(stage.unlockMapIds)||new Set(stage.unlockMapIds).size!==stage.unlockMapIds.length||stage.unlockMapIds.some(id=>typeof id!=='string'||mapIds&&!mapIds.has(id))||!stage.initiallyUnlocked&&!stage.unlockMapIds.length)throw Error('裝備販售階段的等級／T 級／通關條件無效：'+stage.id);
      if(typeof stage.mapId!=='string'||maps&&!maps.some(m=>m.id===stage.mapId))throw Error('裝備階段對應地圖無效：'+stage.id);
      if(!Array.isArray(stage.entries)||stage.entries.length>1000)throw Error('裝備階段商品最多 1000 筆');
      const offers=new Set();for(const entry of stage.entries){
        const ref=refs?.get(entry?.formId);
        if(!entry||typeof entry.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(entry.id)||offers.has(entry.id)||typeof entry.formId!=='string'||refs&&!ref||!integer(entry.job,0,(classes?.length??4)-1)||ref&&!(ref.form.wearableJobs||[ref.group]).includes(entry.job)||!integer(entry.unitPrice,1,1e9)||!integer(entry.quantity,1,100)||typeof entry.canEnhance!=='boolean'||typeof entry.canReroll!=='boolean')throw Error('裝備商品引用／職業／價格／培養設定無效：'+stage.id);
        offers.add(entry.id);
      }
    }
    return stages;
  }
  function fixedItemIds(cfg){return new Set(cfg.fixedOffers.entries.filter(x=>x.enabled&&x.type==='item').map(x=>x.key));}
  root.EmberwildShopCatalog=Object.freeze({TYPES,DEFAULT_RANDOM,normalize,normalizeRule,validate,validateEquipmentStages,equipmentForms,fixedItemIds,LEGACY_DESCRIPTIONS});
})(globalThis);
