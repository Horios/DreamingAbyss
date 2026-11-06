/* Optional presentation data shares the published balance document and icon library. */
(()=>{
  const M=EmberwildInventoryIcons,baseExport=exportableBalance,baseValidate=validateBalanceConfig,baseApply=applyBalanceConfig;
  const defaultGemLabels=GEMS.map(g=>({name:g.name}));
  function applyGemLabels(){for(const [i,g]of GEMS.entries()){g.name=lookup.get('gem:'+i)?.displayName||defaultGemLabels[i].name;g.desc=lookup.get('gem:'+i)?.description??g.desc;}}
  let templates,definitions=M.migrateDescriptions(baseExport()).inventoryIcons,customIcons=baseExport().skillIcons||[],lookup=new Map(definitions.map(r=>[r.kind+':'+r.key,r]));
  const saved=balanceSourceText();if(saved){templates=EmberwildIconColors.validate(JSON.parse(saved));EmberwildIconColors.use(templates);definitions=M.validate(M.migrateDescriptions(JSON.parse(saved)),__EMBERWILD_SKILL_ICONS);lookup=new Map((definitions||[]).map(r=>[r.kind+':'+r.key,r]));}
  exportableBalance=()=>{const out=baseExport();if(templates!==undefined)out.iconColorTemplates=structuredClone(templates);if(definitions!==undefined)out.inventoryIcons=structuredClone(definitions);return M.migrateDescriptions(out);};
  validateBalanceConfig=input=>{M.validate(input,__EMBERWILD_SKILL_ICONS);return baseValidate(input);};
  applyBalanceConfig=(input,options={})=>{
    const canonical=M.migrateDescriptions(input,{hydrate:true}),next=M.validate(canonical,__EMBERWILD_SKILL_ICONS),out=baseApply(canonical,options);
    templates=EmberwildIconColors.validate(input);EmberwildIconColors.use(templates);definitions=next;customIcons=structuredClone(input.skillIcons||[]);lookup=new Map((next||[]).map(r=>[r.kind+':'+r.key,r]));applyGemLabels();
    if(options.persist!==false){const doc=exportableBalance();localStorage.setItem(BALANCE_KEY,JSON.stringify(doc));if(globalThis.__EMBERWILD_PUBLISHED_BALANCE&&IS_PREVIEW){globalThis.__EMBERWILD_BALANCE_SOURCE=doc;localStorage.setItem(BALANCE_KEY+'-published-base',JSON.stringify(globalThis.__EMBERWILD_PUBLISHED_BALANCE));}}
    if(party)render();return out;
  };
  globalThis.__EMBERWILD_INVENTORY_ICON=(kind,key,fallback,options={})=>{
    const row=lookup.get(kind+':'+String(key)),type=row?.iconType,color=EmberwildIconColors.resolve(row);
    const svg=__EMBERWILD_SKILL_ICONS.svgFor(!type||type==='auto'?fallback:type,customIcons,{...options,color});
    return color?'<span style="display:inline-flex;color:'+color+'">'+svg+'</span>':svg;
  };
  globalThis.__EMBERWILD_ICON_COLOR=(kind,key)=>EmberwildIconColors.resolve(lookup.get(kind+':'+String(key)));
  globalThis.__EMBERWILD_ITEM_DETAILS=(kind,key)=>lookup.get(kind+':'+String(key));
  globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY=g=>globalThis.EmberwildTokens?.isToken(g)?{kind:'token',key:g.tokenId}:{kind:'equipment',key:gearKey(g)};
  globalThis.__EMBERWILD_ITEM_NAME=(kind,key,fallback)=>lookup.get(kind+':'+String(key))?.displayName||fallback;
  globalThis.__EMBERWILD_CAN_SELL=(kind,key)=>lookup.get(kind+':'+String(key))?.saleEnabled??(!['gem','skill'].includes(kind)&&!String(key).startsWith('companion-ticket-'));
  globalThis.__EMBERWILD_CAN_SELL_GEAR=g=>{const id=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY(g);return globalThis.__EMBERWILD_CAN_SELL(id.kind,id.key);};
  const baseGearName=gearName,baseGearDisplay=equipmentDisplayName;
  gearName=function(g){const out=baseGearName(g),id=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY(g);return globalThis.__EMBERWILD_ITEM_NAME(id.kind,id.key,out);};
  equipmentDisplayName=function(g){const id=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY(g),name=lookup.get(id.kind+':'+id.key)?.displayName;return name?'+'+(g.plus||0)+' '+name:baseGearDisplay(g);};
  globalThis.inventoryGemSellPrice=i=>lookup.get('gem:'+String(i))?.sellPrice??0;
  globalThis.sellCatalogueGem=function(i,quantity=1){
    if(!party||!state||!Number.isInteger(i)||i<0||i>=GEMS.length||!globalThis.__EMBERWILD_CAN_SELL('gem',i))return false;
    const n=Number(quantity),gold=state.gold,held=state.gems[i],price=inventoryGemSellPrice(i);
    if(!Number.isSafeInteger(n)||n<1||n>held||gold+n*price>1e12)return false;
    state.gems[i]-=n;state.gold+=n*price;
    if(save()!==true){state.gems[i]=held;state.gold=gold;return false;}render();return true;
  };
  const baseGemsView=accountGemsView;
  accountGemsView=function(){let html=baseGemsView();for(const [i,g]of GEMS.entries()){if(state.gems[i]<1)continue;const r=lookup.get('gem:'+i),name=r?.displayName||g.name,desc=r?.description??g.desc,price=inventoryGemSellPrice(i),sell=globalThis.__EMBERWILD_CAN_SELL('gem',i);html=html.replace('<b>'+esc(g.name)+' ×'+state.gems[i]+'</b>','<b>'+esc(name)+' ×'+state.gems[i]+'</b>').replace('<span>'+esc(g.desc)+'</span>','<span>'+esc(desc)+' · 售價 '+price+' 金幣／個'+(sell?'':' · 不可販售')+'</span>'+ (sell?'<button onclick="sellCatalogueGem('+i+',1)">賣出 1 個</button><button onclick="sellCatalogueGem('+i+',state.gems['+i+'])">全部賣出</button>':''));}return html;};
  globalThis.sellCatalogueRecruitTicket=function(id,quantity=1){
    if(!party||!state||!globalThis.__EMBERWILD_CAN_SELL('item','companion-ticket-'+id))return false;
    const held=companionTicketCount(id),n=Number(quantity),gold=state.gold,price=lookup.get('item:companion-ticket-'+id)?.sellPrice??0;
    if(!Number.isSafeInteger(n)||n<1||n>held||gold+n*price>1e12)return false;
    party.achievements.tickets[id]=held-n;state.gold+=price*n;
    if(save()!==true){party.achievements.tickets[id]=held;state.gold=gold;return false;}render();return true;
  };
  applyGemLabels();
  const baseItemsView=accountItemsView;
  accountItemsView=function(){let html=baseItemsView();const scroll=lookup.get('item:level_scroll');if(scroll?.displayName)html=html.replaceAll(esc('升級卷軸'),esc(scroll.displayName));return html;};
  const description=(kind,key)=>lookup.get(kind+':'+String(key))?.description??'';
  globalThis.__EMBERWILD_ITEM_DESCRIPTION=description;
  globalThis.inventoryMaterialDescription=name=>description('material',name);
  globalThis.lifeMaterialDescription=name=>description('material',name);
  function gearKey(g){return g.boss!==undefined?'boss:'+g.region+':'+g.job:'form:'+equipmentFormGroup(g)+':'+g.slot+':'+g.form;}
  globalThis.__EMBERWILD_GEAR_SKILL_ICON=(g,glyph)=>!globalThis.EmberwildTokens?.isToken(g)&&globalThis.__EMBERWILD_SKILLS?.byId(g?.skillId)?'<span class="equipment-skill-icon" role="img" aria-label="附帶裝備技能" title="附帶裝備技能">'+glyph+'<span class="equipment-skill-star" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m14 2 2.8 6.2L23 11l-6.2 2.8L14 20l-2.8-6.2L5 11l6.2-2.8Z"/><path d="m4 15 1.3 2.7L8 19l-2.7 1.3L4 23l-1.3-2.7L0 19l2.7-1.3Z"/></svg></span></span>':glyph;
  const gearNameHTML=equipmentNameHTML;
  equipmentNameHTML=function(g){if(globalThis.EmberwildTokens?.isToken(g))return gearNameHTML(g);const key=gearKey(g),glyph=globalThis.__EMBERWILD_INVENTORY_ICON('equipment',key,'lucide:'+(['sword','shirt','shield','gem'][g.slot]),{size:22});return '<span class="inventory-item-icon" style="display:inline-flex;vertical-align:middle;margin-right:6px">'+globalThis.__EMBERWILD_GEAR_SKILL_ICON(g,glyph)+'</span>'+gearNameHTML(g);};
  const attributes=globalThis.equipmentAttributeDetailsHTML;
  globalThis.equipmentAttributeDetailsHTML=function(g,...args){const id=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY(g),text=description(id.kind,id.key);return (text?'<p class="small">'+esc(text)+'</p>':'')+attributes(g,...args);};
  globalThis.__EMBERWILD_INVENTORY_ICONS={version:2,entries:()=>M.entries(exportableBalance())};
})();
