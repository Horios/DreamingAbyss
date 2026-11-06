(function starterModule(){
  const clone=value=>JSON.parse(JSON.stringify(value));
  const SLOT_BY_POSITION=[0];
  const POSITION_NAMES=['武器'];
  const SKILL_EFFECT_KEYS=new Set(['skillEffectPct','skillCooldownReduction']);
  const VALID_AFFIX_TYPES=new Set([0,1,2,3,4,5,6,7,8,9,12,13,14,15,16,17,18]);
  const VALID_AFFIX_ELEMENTS=new Set(['fire','ice','wind','light','shadow']);
  const VALID_AFFIX_RACES=new Set(['beast','plant','undead','construct','demon','spirit']);

  function defaultGrowth(){
    const maxLevel=Math.max(1,Math.floor(Number(typeof RULES!=='undefined'?RULES.maxLevel:60)));
    return {enabled:false,startLevel:1,maxLevel,effects:[]};
  }

  function formWearableByJob(forms,group,slot,formIndex,job){
    const form=forms?.[group]?.[slot]?.[formIndex];
    if(!form)return false;
    const all=CLASSES.map((_,i)=>i);
    const fallback=group>=CLASSES.length||slot===1?all:[group];
    const raw=Array.isArray(form.wearableJobs)?form.wearableJobs:fallback;
    return raw.map(Number).includes(job);
  }

  function candidateRefs(job,slot,forms=ITEM_FORMS){
    const refs=[];
    for(let group=0;group<(forms?.length||0);group++){
      const list=forms?.[group]?.[slot];
      if(!Array.isArray(list))continue;
      for(let form=0;form<list.length;form++){
        if(formWearableByJob(forms,group,slot,form,job))refs.push({group,slot,form});
      }
    }
    refs.sort((a,b)=>{
      const priority=ref=>ref.group===job?0:ref.group===CLASSES.length?1:2;
      return priority(a)-priority(b)||a.group-b.group||a.form-b.form;
    });
    return refs;
  }

  function defaultStarterEntry(job,slot,position,forms=ITEM_FORMS){
    const refs=candidateRefs(job,slot,forms);
    if(!refs.length)throw Error(`職業 ${job} 的${POSITION_NAMES[position]}沒有可用的新手禮包裝備`);
    return {
      ...clone(position===4?(refs[1]||refs[0]):refs[0]),
      baseAttack:GS('equipment.baseStats.weaponAttackPerTier',3)+1,
      powerTier:1,
      plus:0,
      fixedEffects:null,
      prefixId:'',
      suffixId:'',
      affixes:[null,null],
      growth:defaultGrowth()
    };
  }

  function defaultStarterPacks(forms=ITEM_FORMS){
    return CLASSES.map((_,job)=>SLOT_BY_POSITION.map((slot,position)=>defaultStarterEntry(job,slot,position,forms)));
  }

  function normalizeStarterEffect(raw,job,{growth=false}={}){
    const effect=typeof normalizeFixedEquipmentEffect==='function'?normalizeFixedEquipmentEffect(raw):null;
    if(!effect)throw Error('starterPacks 的裝備屬性無效');
    if(growth&&effect.key==='basicElement')throw Error('成長屬性不能使用普通攻擊屬性');
    if(effect.key!=='basicElement'&&!Number.isFinite(Number(effect.value)))throw Error('新手禮包裝備屬性數值無效');
    if(SKILL_EFFECT_KEYS.has(effect.key)){
      const skillCount=CLASSES[job]?.skills?.length||0;
      if(!Number.isInteger(effect.skill)||effect.skill<0||effect.skill>=skillCount)throw Error('新手禮包指定技能屬性無效');
    }
    return effect;
  }

  function normalizeStarterEffects(raw,job,{growth=false,allowNull=false}={}){
    if(raw===undefined||raw===null){
      if(allowNull)return null;
      return [];
    }
    if(!Array.isArray(raw))throw Error('新手禮包裝備屬性必須是陣列');
    if(raw.length>5||(!growth&&raw.length<1))throw Error(growth?'成長屬性最多 5 條':'自訂固定屬性必須為 1～5 條');
    return raw.map(effect=>normalizeStarterEffect(effect,job,{growth}));
  }

  function normalizeGrowth(raw,job){
    const maxLevel=Math.max(1,Math.floor(Number(typeof RULES!=='undefined'?RULES.maxLevel:60)));
    const src=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    const enabled=!!src.enabled;
    const startLevel=Number.isInteger(Number(src.startLevel))?Number(src.startLevel):1;
    const stopLevel=Number.isInteger(Number(src.maxLevel))?Number(src.maxLevel):maxLevel;
    if(startLevel<1||startLevel>maxLevel||stopLevel<startLevel||stopLevel>maxLevel)throw Error('新手禮包成長等級範圍無效');
    return {enabled,startLevel,maxLevel:stopLevel,effects:normalizeStarterEffects(src.effects,job,{growth:true})};
  }

  function namedAffixRows(power,kind){
    return Array.isArray(power?.[kind==='prefix'?'prefixes':'suffixes'])?power[kind==='prefix'?'prefixes':'suffixes']:[];
  }

  function normalizeNamedAffix(id,kind,slot,power){
    if(id===undefined||id===null||id==='')return '';
    if(typeof id!=='string')throw Error(`新手禮包${kind==='prefix'?'前綴':'後綴'} ID 無效`);
    const row=namedAffixRows(power,kind).find(x=>x?.id===id);
    if(!row||!Array.isArray(row.slots)||!row.slots.includes(slot))throw Error(`新手禮包${kind==='prefix'?'前綴':'後綴'}無效：${id}`);
    return id;
  }

  function affixPoolRow(balance,slot,rank,type){
    const list=balance?.affixes?.poolBySlotRank?.[slot]?.[rank];
    return Array.isArray(list)?list.find(x=>Number(x?.type)===type)||null:null;
  }

  function normalizeStarterAffix(raw,job,slot,balance){
    if(raw===undefined||raw===null)return null;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('新手禮包詞綴資料無效');
    const type=Number(raw.type),rank=Number(raw.rank),value=Number(raw.value);
    if(!Number.isInteger(type)||!VALID_AFFIX_TYPES.has(type))throw Error('新手禮包詞綴類型無效');
    if(!Number.isInteger(rank)||rank<0||rank>3)throw Error('新手禮包詞綴品質無效');
    if(!Number.isFinite(value)||value<0||value>10000)throw Error('新手禮包詞綴數值無效');
    const poolRow=affixPoolRow(balance,slot,rank,type);
    if(!poolRow)throw Error(`新手禮包詞綴不在目前詞綴池：${slot}-${rank}-${type}`);
    const out={type,rank,value};
    if(type===4||type===5){
      const fallback=Number.isInteger(Number(poolRow.skill))&&Number(poolRow.skill)>=0?Number(poolRow.skill):0;
      const skill=raw.skill===undefined?fallback:Number(raw.skill);
      const count=CLASSES[job]?.skills?.length||0;
      if(!Number.isInteger(skill)||skill<0||skill>=count)throw Error('新手禮包詞綴指定技能無效');
      out.skill=skill;
    }
    if(type===12||type===14){
      if(!VALID_AFFIX_ELEMENTS.has(raw.element))throw Error('新手禮包詞綴指定屬性無效');
      out.element=raw.element;
    }
    if(type===13){
      if(!VALID_AFFIX_RACES.has(raw.race))throw Error('新手禮包詞綴指定種族無效');
      out.race=raw.race;
    }
    return out;
  }

  function normalizeStarterAffixes(raw,job,slot,balance){
    const list=Array.isArray(raw)?raw.slice(0,2):[];
    while(list.length<2)list.push(null);
    if(Array.isArray(raw)&&raw.length>2)throw Error('新手禮包最多只能指定兩條詞綴');
    return list.map(x=>normalizeStarterAffix(x,job,slot,balance));
  }

  function normalizeStarterEntry(raw,job,position,data){
    const forms=data?.equipmentForms||ITEM_FORMS,slot=SLOT_BY_POSITION[position];
    const ref={group:Number(raw?.group),slot:Number(raw?.slot),form:Number(raw?.form)};
    if(!Number.isInteger(ref.group)||!Number.isInteger(ref.slot)||!Number.isInteger(ref.form)||ref.slot!==slot||!formWearableByJob(forms,ref.group,ref.slot,ref.form,job)){
      throw Error(`starterPacks[${job}][${position}] 的${POSITION_NAMES[position]}設定無效`);
    }
    const enhanceMax=Math.max(0,Math.floor(Number(typeof RULES!=='undefined'?RULES.enhanceMax:10)));
    const powerTier=raw?.powerTier===undefined?1:Number(raw.powerTier);
    const plus=raw?.plus===undefined?0:Number(raw.plus);
    if(!Number.isInteger(powerTier)||powerTier<1||powerTier>10)throw Error(`starterPacks[${job}][${position}] 的初始 T 階無效`);
    if(!Number.isInteger(plus)||plus<0||plus>enhanceMax)throw Error(`starterPacks[${job}][${position}] 的初始強化值無效`);
    const baseAttack=raw?.baseAttack===undefined?GS('equipment.baseStats.weaponAttackPerTier',3)+1:Number(raw.baseAttack);
    if(!Number.isFinite(baseAttack)||baseAttack<0||baseAttack>10000)throw Error('新手武器基礎攻擊無效');
    return {
      ...ref,
      baseAttack,
      powerTier,
      plus,
      fixedEffects:normalizeStarterEffects(raw?.fixedEffects,job,{allowNull:true}),
      prefixId:normalizeNamedAffix(raw?.prefixId,'prefix',slot,data?.equipmentPowerSystem||globalThis.__EMBERWILD_EQUIPMENT_POWER),
      suffixId:normalizeNamedAffix(raw?.suffixId,'suffix',slot,data?.equipmentPowerSystem||globalThis.__EMBERWILD_EQUIPMENT_POWER),
      affixes:normalizeStarterAffixes(raw?.affixes,job,slot,data?.balance||GAME_BALANCE),
      growth:normalizeGrowth(raw?.growth,job)
    };
  }

  function normalizeStarterPacks(value,data={equipmentForms:ITEM_FORMS,equipmentPowerSystem:globalThis.__EMBERWILD_EQUIPMENT_POWER,balance:GAME_BALANCE}){
    const forms=data?.equipmentForms||ITEM_FORMS;
    if(value===undefined||value===null)return defaultStarterPacks(forms);
    if(!Array.isArray(value)||value.length!==CLASSES.length)throw Error(`starterPacks 必須包含 ${CLASSES.length} 個職業`);
    return value.map((row,job)=>{
      if(!Array.isArray(row)||![1,5].includes(row.length))throw Error(`starterPacks[${job}] 只能設定 1 件武器`);
      return row.slice(0,1).map((raw,position)=>normalizeStarterEntry(raw,job,position,data));
    });
  }

  function normalizeStarterItems(value,data){
    if(value===undefined)return CLASSES.map(()=>[]);
    if(!Array.isArray(value)||value.length!==CLASSES.length)throw Error('新手禮包贈品必須包含所有職業');
    const catalogue=new Set(EmberwildInventoryIcons.entries(data).filter(r=>r.kind!=='skill').map(r=>r.id));
    return value.map(rows=>{
      if(!Array.isArray(rows))throw Error('新手禮包贈品必須為陣列');
      return rows.map(row=>{
        if(!row||!catalogue.has(row.kind+':'+row.key))throw Error('新手禮包引用不存在的道具');
        if(!Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>1e9)throw Error('新手禮包數量必須為 1～1000000000 的整數');
        return {kind:row.kind,key:String(row.key),quantity:row.quantity};
      });
    });
  }
  let starterPacks=defaultStarterPacks(),starterPackItems=CLASSES.map(()=>[]);
  try{
    const raw=balanceSourceText();
    if(raw){
      const saved=JSON.parse(raw);
      starterPackItems=clone(saved.starterPackItems||CLASSES.map(()=>[]));
      starterPacks=normalizeStarterPacks(saved.starterPacks,{
        equipmentForms:saved.equipmentForms||ITEM_FORMS,
        equipmentPowerSystem:saved.equipmentPowerSystem||globalThis.__EMBERWILD_EQUIPMENT_POWER,
        balance:saved.balance||GAME_BALANCE
      });
    }
  }catch(error){
    console.warn('新手禮包設定載入失敗，改用目前裝備資料的預設武器',error);
    starterPacks=defaultStarterPacks();
  }

  const starterValidateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){
    const data=starterValidateBase(input);
    data.starterPacks=normalizeStarterPacks(data.starterPacks,data);
    data.starterPackItems=normalizeStarterItems(data.starterPackItems,data);
    return data;
  };

  const starterExportBase=exportableBalance;
  exportableBalance=function(){
    const data=starterExportBase();
    data.starterPacks=clone(starterPacks);
    data.starterPackItems=clone(starterPackItems);
    data.notes=[...(data.notes||[]),
      'starterPacks 只在建立第一名初始職業時寄至信箱；後續招募角色不會取得此禮包。',
      'starterPacks 每件可設定固定 T 階、初始 plus、fixedEffects、prefixId、suffixId 與兩條固定 affixes。',
      '新手武器可強化，不可洗鍊或重鑄 T 階；growth 只允許依角色等級增加固定屬性。'
    ];
    return data;
  };

  const starterApplyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,options={}){
    const copy=clone(input);
    const next=normalizeStarterPacks(copy.starterPacks,copy);
    copy.starterPacks=clone(next);
    const nextItems=normalizeStarterItems(copy.starterPackItems,copy);
    copy.starterPackItems=clone(nextItems);
    const previousItems=starterPackItems;
    const previous=starterPacks;
    starterPacks=clone(next);
    starterPackItems=clone(nextItems);
    try{
      return starterApplyBase(copy,options);
    }catch(error){
      starterPacks=previous;
      starterPackItems=previousItems;
      throw error;
    }
  };

  const starterResetBase=resetBalanceJSON;
  resetBalanceJSON=function(){
    const result=starterResetBase();
    starterPacks=defaultStarterPacks();
    starterPackItems=CLASSES.map(()=>[]);
    return result;
  };

  function starterGearOwner(g){
    if(!g?.starterPack)return null;
    const members=party?.members||[];
    const byId=members.find(h=>(h.bag||[]).some(x=>x.id===g.id));
    if(byId)return byId;
    if(state?.bag?.some(x=>x.id===g.id))return state;
    return members.find(h=>h.job===g.starterPack.job)||null;
  }

  function normalizeExistingStarterMeta(g){
    if(!g?.starterPack)return null;
    const meta=g.starterPack;
    meta.version=3;
    meta.basePowerTier=Number.isInteger(meta.basePowerTier)?meta.basePowerTier:(Number.isInteger(g.powerTier)?g.powerTier:1);
    if(!meta.growth||typeof meta.growth!=='object')meta.growth=defaultGrowth();
    meta.growth={
      enabled:!!meta.growth.enabled,
      startLevel:Number.isInteger(Number(meta.growth.startLevel))?Number(meta.growth.startLevel):1,
      maxLevel:Number.isInteger(Number(meta.growth.maxLevel))?Number(meta.growth.maxLevel):Math.max(1,Math.floor(Number(typeof RULES!=='undefined'?RULES.maxLevel:60))),
      effects:Array.isArray(meta.growth.effects)?meta.growth.effects:[]
    };
    return meta;
  }

  function growthLevels(meta,owner){
    const growth=meta?.growth;
    if(!growth?.enabled||!owner)return 0;
    const capped=Math.max(growth.startLevel,Math.min(growth.maxLevel,Number(owner.lv)||1));
    return Math.max(0,capped-growth.startLevel);
  }

  const starterItemFormBase=itemForm;
  itemForm=function(g){
    const base=starterItemFormBase(g);
    const meta=normalizeExistingStarterMeta(g);
    if(!base||!meta)return base;
    const out=clone(base);
    let effects=Array.isArray(meta.fixedEffects)?clone(meta.fixedEffects):clone(base.fixedEffects||[]);
    const owner=starterGearOwner(g),levels=growthLevels(meta,owner);
    if(levels>0&&Array.isArray(meta.growth?.effects)){
      for(const effect of meta.growth.effects){
        const extra=clone(effect);
        extra.value=(Number(extra.value)||0)*levels;
        effects.push(extra);
      }
    }
    out.fixedEffects=effects;
    return out;
  };

  // Keep growth in the same source ledger as all other equipment effects.
  // Read the original fixed-effect count so grown effects are not counted twice.
  globalThis.equipmentStarterGrowthSources=function(g){
    const meta=normalizeExistingStarterMeta(g);
    if(!meta)return null;
    const original=starterItemFormBase(g),owner=starterGearOwner(g),growth=meta.growth;
    return {
      baseCount:(Array.isArray(meta.fixedEffects)?meta.fixedEffects:original?.fixedEffects||[]).length,
      effects:growth.effects||[],
      levels:growthLevels(meta,owner),
      range:`LV${growth.startLevel+1}～LV${growth.maxLevel}`
    };
  };

  if(typeof equipmentNameHTML==='function'){
    const starterNameHTMLBase=equipmentNameHTML;
    equipmentNameHTML=function(g){
      const html=starterNameHTMLBase(g);
      return g?.starterPack?html.replace('class="enhanced-name ','class="enhanced-name starter-equipment-name '):html;
    };
  }

  if(!document.getElementById('starter-pack-runtime-style')){
    const style=document.createElement('style');
    style.id='starter-pack-runtime-style';
    style.textContent=`
      .starter-equipment-name{color:#55ff73!important;text-shadow:0 0 8px rgba(85,255,115,.22)}
      .starter-pack-choice-notice{margin:10px 0;padding:10px 12px;border:1px solid rgba(85,255,115,.45);border-radius:8px;background:rgba(85,255,115,.07);color:#baffc4}
      .starter-growth-details{margin-top:8px;border-top:1px solid rgba(85,255,115,.22)}
      .starter-gift-list{display:grid;gap:8px;max-height:min(54vh,520px);overflow:auto;margin:12px 0;padding-right:4px}
      .starter-gift-item{padding:10px;border:1px solid var(--line);border-radius:8px}
      .starter-gift-item>.row{gap:8px;align-items:baseline}
      .starter-gift-item .equipment-attribute-details{margin-top:6px}
    `;
    document.head.appendChild(style);
  }

  function starterLockedMessage(){
    return '新手專屬武器可強化，但無法洗鍊詞綴或重鑄基底。';
  }

  if(typeof reroll==='function'){
    const starterRerollBase=reroll;
    reroll=function(id){
      const g=typeof findGear==='function'?findGear(id):null;
      if(g?.starterPack)return toast(starterLockedMessage());
      return starterRerollBase(id);
    };
  }
  if(typeof autoReroll==='function'){
    const starterAutoRerollBase=autoReroll;
    autoReroll=function(id,targetRank){
      const g=typeof findGear==='function'?findGear(id):null;
      if(g?.starterPack)return toast(starterLockedMessage());
      return starterAutoRerollBase(id,targetRank);
    };
  }
  if(typeof globalThis.rerollEquipmentPowerTier==='function'){
    const starterPowerRerollBase=globalThis.rerollEquipmentPowerTier;
    globalThis.rerollEquipmentPowerTier=function(id){
      const g=typeof findGear==='function'?findGear(id):null;
      if(g?.starterPack)return toast(starterLockedMessage());
      return starterPowerRerollBase(id);
    };
  }
  if(typeof forgeView==='function'){
    const starterForgeViewBase=forgeView;
    forgeView=function(){
      let html=starterForgeViewBase();
      const g=typeof findGear==='function'?findGear(forgeSelection):null;
      if(!g?.starterPack)return html;
      const locked='<button disabled>新手武器不可洗鍊或重鑄</button>';
      html=html.replace(/<button[^>]*onclick="reroll\('[^']+'\)"[^>]*>[\s\S]*?<\/button>/g,locked);
      html=html.replace(/<button[^>]*onclick="autoReroll\('[^']+',\s*[23]\)"[^>]*>[\s\S]*?<\/button>/g,locked);
      html=html.replace(/<button[^>]*onclick="rerollEquipmentPowerTier\('[^']+'\)"[^>]*>[\s\S]*?<\/button>/g,locked);
      return html;
    };
  }

  function createStarterGear(job,position,entry){
    const g=gear(1,entry.slot,0,job);
    if(globalThis.__EMBERWILD_EQUIPMENT_SKILLS)globalThis.__EMBERWILD_EQUIPMENT_SKILLS.generate(g,{source:'starter',force:true});
    g.job=job;
    g.formJob=entry.group;
    g.form=entry.form;
    const selectedForm=typeof itemForm==='function'?itemForm(g):null;
    if(selectedForm?.weaponType)g.weaponType=selectedForm.weaponType;
    g.rar=0;
    g.plus=entry.plus;
    g.affix=(entry.affixes||[]).filter(Boolean).map(clone);
    g.difficulty=0;
    g.powerTier=entry.powerTier;
    g.prefixId=entry.prefixId||'';
    g.suffixId=entry.suffixId||'';
    g.starterPack={
      version:3,
      job,
      position,
      basePowerTier:entry.powerTier,
      baseAttack:entry.baseAttack,
      fixedEffects:entry.fixedEffects===null?null:clone(entry.fixedEffects),
      growth:clone(entry.growth)
    };
    delete g.affixLock;
    delete g.boss;
    delete g.bossQualityRank;
    g.name=gearName(g);
    return g;
  }

  function prepareStarterPack(hero,job){
    // Initial white gear is ordinary equipment, independent of the gift settings.
    const oldEquipped=new Set((hero.equipped||[]).filter(Boolean));
    hero.bag=(hero.bag||[]).filter(g=>!oldEquipped.has(g.id));
    hero.equipped=[null,null,null,null,null];
    for(const [position,slot] of [0,1,2,3,3].entries()){
      const entry=defaultStarterEntry(job,slot,position);
      const g=createStarterGear(job,position,{...entry,baseAttack:undefined});
      delete g.starterPack;g.affix=[];
      hero.bag.push(g);hero.equipped[position]=g.id;
    }
    hero.hp=stats(hero).hp;hero.shield=0;
    const g=createStarterGear(job,0,starterPacks[job][0]);
    const names=new Map(EmberwildInventoryIcons.entries(exportableBalance()).map(r=>[r.id,r.name]));
    sendStarterPackMail(job,[{type:'gear',gear:g,name:equipmentDisplayName(g),quantity:1},...starterPackItems[job].map(row=>({type:'catalogue',...clone(row),name:names.get(row.kind+':'+row.key)||row.key}))]);
  }

  if(typeof requestHeroName==='function'){
    const starterRequestHeroNameBase=requestHeroName;
    requestHeroName=function(job,first=false){
      const result=starterRequestHeroNameBase(job,first);
      if(first){
        const modal=$('modal'),input=modal?.querySelector?.('#new-hero-name');
        if(input){
          const notice=document.createElement('div');
          notice.className='starter-pack-choice-notice';
          notice.innerHTML=`<b>初始職業獎勵</b><br>角色內建最初級白板裝備；專屬新手武器與禮包道具會寄到信箱，請自行領取。`;
          input.parentNode.insertBefore(notice,input);
        }
      }
      return result;
    };
  }

  const starterStartBase=start;
  start=function(job){
    const result=starterStartBase(job);
    if(state&&party&&party.members?.length===1&&state.job===job){
      prepareStarterPack(state,job);
      save();
      render();

    }
    return result;
  };

  for(const h of party?.members||[]){
    for(const g of h?.bag||[])if(g?.starterPack)normalizeExistingStarterMeta(g);
  }
})();
