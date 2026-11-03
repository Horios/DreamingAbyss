/* Shared SVG item slots. Backpack details use their existing panel/dialog;
   references stay passive and shops expose purchase actions inline. */
(()=>{
  let selection=null,hovered=null;
  const attr=value=>esc(String(value??''));
  const displayStorageKey='emberwild-item-display';
  const displayModes=[
    {id:'icon-name',name:'圖示＋名稱',description:'左側顯示圖示，右側顯示完整名稱。'},
    {id:'name',name:'僅顯示名稱',description:'隱藏道具圖示，使用純文字條列。'}
  ];
  const validDisplayMode=id=>displayModes.some(mode=>mode.id===id);
  let displayMode='icon-name';
  try{const saved=localStorage.getItem(displayStorageKey);if(validDisplayMode(saved))displayMode=saved;}catch{}
  document.documentElement.dataset.itemDisplay=displayMode;
  function refreshDisplayChoices(){
    document.querySelectorAll('[data-item-display-choice]').forEach(button=>{
      const active=button.dataset.itemDisplayChoice===displayMode;
      button.setAttribute('aria-pressed',String(active));
      const state=button.querySelector('.item-display-choice-state');if(state)state.textContent=active?'使用中':'選擇方式';
    });
  }
  globalThis.setItemDisplayMode=function(id){
    if(!validDisplayMode(id))return false;
    displayMode=id;document.documentElement.dataset.itemDisplay=id;refreshDisplayChoices();
    try{localStorage.setItem(displayStorageKey,id);}catch{globalThis.toast?.('顯示方式已套用，但瀏覽器無法保存，下次開啟需重新選擇。');}
    return true;
  };
  globalThis.itemDisplayOptionsView=function(){
    return `<section class="panel item-display-options"><h2>道具顯示</h2><p class="small">統一套用於背包、商店、信箱、強化、製作與生活技能等道具清單。</p><div class="item-display-choices" role="group" aria-label="道具顯示方式">${displayModes.map(mode=>`<button type="button" class="item-display-choice" data-item-display-choice="${mode.id}" aria-pressed="${displayMode===mode.id}" onclick="setItemDisplayMode('${mode.id}')"><strong>${mode.name}</strong><span>${mode.description}</span><span class="item-display-choice-state">${displayMode===mode.id?'使用中':'選擇方式'}</span></button>`).join('')}</div></section>`;
  };
  addEventListener('storage',event=>{
    if(event.key!==displayStorageKey&&event.key!==null)return;
    displayMode=validDisplayMode(event.newValue)?event.newValue:'icon-name';
    document.documentElement.dataset.itemDisplay=displayMode;refreshDisplayChoices();
  });
  const fallback='<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4Zm0 0 9 4 9-4M12 11v10"/></svg>';
  function gearIdentity(g){return globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY?.(g)||(globalThis.EmberwildTokens?.isToken(g)?{kind:'token',key:g.tokenId}:{kind:'equipment',key:g.boss!==undefined?'boss:'+g.region+':'+g.job:'form:'+(g.formJob??g.job)+':'+g.slot+':'+(g.form||0)});}
  function definition(kind,key){
    if(kind==='item')return globalThis.__EMBERWILD_INVENTORY_STOCK?.item(key);
    if(kind==='token')return exportableBalance().companionTokens?.catalog?.find(t=>t.id===key);
    return null;
  }
  // Items kept outside the shared stock (for example region vouchers) register name, icon, text and actions here.
  const virtualItem=(kind,key)=>kind==='item'&&typeof key==='string'&&globalThis.__EMBERWILD_VIRTUAL_ITEM?.(key)||null;
  const mailIdentity=a=>a.gear?gearIdentity(a.gear):a.type==='companionTicket'?{kind:'item',key:'companion-ticket-'+a.companionId}:globalThis.__EMBERWILD_VIRTUAL_MAIL_KEY?.(a)?{kind:'item',key:globalThis.__EMBERWILD_VIRTUAL_MAIL_KEY(a)}:{kind:a.kind,key:a.key};
  function rawName(kind,key){
    const virtual=virtualItem(kind,key);if(virtual)return virtual.name;
    if(kind==='gem')return GEMS[Number(key)]?.name||key;
    if(kind==='item'&&key.startsWith('companion-ticket-'))return (exportableBalance().companions?.find(p=>p.id===Number(key.slice(17)))?.name||'夥伴')+'招募券';
    if(kind==='equipment'){
      const ref=globalThis.EmberwildMonsterDesign?.equipmentRef(key,exportableBalance());
      if(ref?.form)return ref.form.name;
    }
    return definition(kind,key)?.name||key;
  }
  function name(kind,key,g){return g?equipmentDisplayName(g):globalThis.__EMBERWILD_ITEM_NAME?.(kind,key,rawName(kind,key))||rawName(kind,key);}
  function icon(kind,key,g){
    let glyph=kind==='material'?(/牙|骨/.test(key)?'bone':/翼|羽/.test(key)?'feather':'package'):kind==='gem'?'gem':kind==='token'?'medal':kind==='equipment'?['sword','shirt','shield','gem'][g?.slot??Number(key.split(':')[2])??0]:'package';
    const item=kind==='item'?definition(kind,key):null;
    if(kind==='equipment'&&g?.slot===0)glyph=({staff:'wand-sparkles',holyStaff:'wand-sparkles',bow:'bow-arrow',crossbow:'crosshair',axe:'axe',hammer:'hammer',grimoire:'book-open'}[g.weaponType]||glyph);
    if(kind==='item')glyph=key==='level_scroll'||key.startsWith('companion-ticket-')||item?.type==='timedBoost'?'ticket':['healPotion','imbue','ward','elementTonic'].includes(item?.type)?'flask-round':item?.type==='gearTierReroll'?'sparkles':glyph;
    const virtual=virtualItem(kind,key);if(virtual)glyph=virtual.glyph||glyph;
    if(kind==='material')glyph=({'鍛鐵':'anvil','粉塵':'sparkles','以太鍛鐵':'anvil','光輝碎塊':'sparkles','紅色草':'leaf','紅色草泥':'flask-conical','清水':'droplet','藥水瓶':'flask-round','小蟲':'bug'})[key]||glyph;
    const svg=globalThis.__EMBERWILD_INVENTORY_ICON?.(kind,key,'lucide:'+glyph,{size:32})||globalThis.__EMBERWILD_SKILL_ICONS?.svgFor('lucide:'+glyph,[],{size:32})||fallback;
    return globalThis.__EMBERWILD_GEAR_SKILL_ICON?.(g,svg)||svg;
  }
  function refFromNode(node){
    const d=node.dataset,mail=d.itemMail?party?.mailbox?.messages.find(m=>m.id===Number(d.itemMail))?.attachments[Number(d.itemIndex)]:null;
    if(mail){const g=mail.gear,id=mailIdentity(mail);return {...id,g,context:'mail',quantity:mail.quantity,quantityLabel:'附件數量'};}
    const number=value=>value===undefined?undefined:Number(value);
    return {kind:d.itemKind,key:d.itemKey,g:d.itemPreview?JSON.parse(d.itemPreview):d.itemGear?findGear(d.itemGear):null,extra:d.itemExtra,context:d.itemContext||'reference',quantity:number(d.itemQuantity),quantityLabel:d.itemQuantityLabel,price:number(d.itemPrice),priceLabel:d.itemPriceLabel,shopType:d.itemShopType,shopId:d.itemShopId,sold:d.itemSold==='true',soldLabel:d.itemSoldLabel};
  }
  globalThis.itemSlotHTML=function(kind,key,options={}){
    key=String(key);const g=options.gear;
    if(g)({kind,key}=gearIdentity(g));
    const n=name(kind,key,g),label=n+(options.count!==undefined?' ×'+options.count:'');
    const context=options.context||(options.mailId?'mail':'reference'),quantity=options.detailQuantity??options.count;
    const data=`data-item-kind="${attr(kind)}" data-item-key="${attr(key)}" data-item-context="${attr(context)}"${g?.id?` data-item-gear="${attr(g.id)}"`:''}${options.preview?` data-item-preview="${attr(JSON.stringify(options.preview))}"`:''}${options.mailId?` data-item-mail="${options.mailId}" data-item-index="${options.mailIndex}"`:''}${options.extra?` data-item-extra="${attr(options.extra)}"`:''}${quantity!==undefined?` data-item-quantity="${attr(quantity)}"`:''}${options.detailLabel?` data-item-quantity-label="${attr(options.detailLabel)}"`:''}${options.price!==undefined?` data-item-price="${attr(options.price)}"`:''}${options.priceLabel?` data-item-price-label="${attr(options.priceLabel)}"`:''}${options.shopType?` data-item-shop-type="${attr(options.shopType)}"`:''}${options.shopId!==undefined?` data-item-shop-id="${attr(options.shopId)}"`:''}${options.sold?` data-item-sold="true"`:''}${options.soldLabel?` data-item-sold-label="${attr(options.soldLabel)}"`:''}`;
    const token=globalThis.EmberwildTokens?.isToken(g),wearer=g&&typeof gearWearer==='function'?gearWearer(g.id):null;
    const content=`<span class="item-slot-art" aria-hidden="true">${icon(kind,key,g)}</span><span class="item-slot-name">${attr(n)}${g&&!token?` <span class="gear-tier-chip gear-tier-${Number.isInteger(g.powerTier)?g.powerTier:0}">${Number.isInteger(g.powerTier)?'T'+g.powerTier:'T—'}</span>`:''}${token?` <span class="tag token-job-tag">${attr(companionTokenJobLabel(g))}</span>${wearer?` <span class="token-wearer">${attr(characterName(wearer))} · 已裝備</span>`:''}`:''}</span>${options.count!==undefined?`<span class="item-slot-count" aria-label="數量 ${attr(options.count)}">×${attr(options.count)}</span>`:''}${g?.plus?`<span class="item-slot-plus" aria-hidden="true">+${g.plus}</span>`:''}${g&&typeof gearWearer==='function'&&gearWearer(g.id)?'<span class="item-slot-worn" aria-label="已穿戴"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 8 3 3 7-7"/></svg></span>':''}`;
    const tag=!options.contentOnly&&(options.onclick||context==='inventory')?'button':'span';
    const slot=`<${tag} ${tag==='button'?'type="button" ':''}class="item-slot ${options.className||''}${options.selected?' selected':''}${g?' item-quality-'+gearQualityRank(g):''}" ${data} aria-label="${attr(label)}"${tag==='button'?` onclick="${options.onclick||'openItemSlotDetails(this)'}"`:''}${options.selected?' aria-pressed="true"':''}>${content}</${tag}>`;
    return slot+(context==='shop'&&!options.contentOnly?shopInlineControls(options):'');
  };
  function shopInlineControls(o){
    const id=attr(JSON.stringify(o.shopId)),price=Number(o.price)||0,disabled=o.sold||state.gold<price,off=disabled?'disabled':'';
    if(o.lockedReason)return `<span class="shop-inline-controls"><span class="small">${price.toLocaleString()} 金幣 · ${attr(o.lockedReason)}</span></span>`;
    let action='';
    if(o.shopType==='equipment')action=`<input type="number" min="1" max="100" step="1" value="1" aria-label="購買份數"><button onclick="buyEquipmentShopOffer(${id},Number(this.previousElementSibling.value))" ${off}>購買</button>`;
    else if(o.shopType==='life')action=`<button onclick="buyLifeMaterial(${id},1)" ${off}>購買 1 份</button><button onclick="buyLifeMaterial(${id},10)" ${o.sold||state.gold<(globalThis.lifeMaterialPurchasePrice?.(o.shopId,10)??price*10)?'disabled':''}>購買 10 份</button>`;
    else if(['market','fixed'].includes(o.shopType))action=`<button onclick="${o.shopType==='market'?'buyMarketOffer':'buyFixedShopOffer'}(${id})" ${off}>${o.sold?attr(o.soldLabel||'已售完'):'購買'}</button>`;
    return `<span class="shop-inline-controls"><span class="small">${attr(o.detailLabel||'商品數量')} ${attr(o.detailQuantity??o.count??1)} · ${price.toLocaleString()} 金幣</span><span class="shop-inline-actions">${action}</span></span>`;
  }
  globalThis.gearSlotHTML=(g,options={})=>itemSlotHTML('equipment','',{...options,gear:g});
  globalThis.itemCostHTML=function(g){const c=upgradeMaterials(g);return '<span class="item-cost-line">'+[['鍛鐵',c.ore],['粉塵',c.dust],['以太鍛鐵',c.ether]].filter(([,n])=>n>0).map(([key,count])=>itemSlotHTML('material',key,{count,detailLabel:'所需數量'})).join(' ＋ ')+'</span>';};
  globalThis.mailAttachmentSlot=function(mailId,index){
    const a=party.mailbox.messages.find(m=>m.id===mailId)?.attachments[index];if(!a)return '';
    const id=mailIdentity(a);
    return itemSlotHTML(id.kind,id.key,{gear:a.gear,count:a.quantity,mailId,mailIndex:index,className:'mailbox-attachment',detailLabel:'附件數量'});
  };
  function info(ref){
    const virtual=virtualItem(ref.kind,ref.key);if(virtual)return `<h3>${esc(virtual.name)}</h3><p>${esc(virtual.description||'')}</p>${virtual.detail?.(ref)||''}`;
    const {kind,key,g}=ref,item=definition(kind,key),description=globalThis.EmberwildTokens?.isToken(g)?companionTokenDescription(g):globalThis.__EMBERWILD_ITEM_DESCRIPTION?.(kind,key)||'';
    let detail='';
    if(g)detail=`<p>T${g.powerTier||1} · ${g.affix?.length?'已附詞綴':'尚未洗鍊／無隨機詞綴'}${g.equipmentSource==='shop'?' · 固定商店基底':''}</p><p>${globalThis.EmberwildTokens?.isToken(g)?esc(gearDesc(g)):esc(gearWearableJobsText(g)+' · LV '+gearRequiredLevel(g))}</p><p class="equipment-total-summary">${globalThis.equipmentTotalSummaryHTML?.(g)||esc(gearDesc(g))}</p>${globalThis.equipmentAttributeDetailsHTML?.(g)||''}${g.starterPack?'<p>可強化；不可洗鍊詞綴或重鑄基底。</p>':''}`;
    else if(kind==='item'&&key.startsWith('companion-ticket-'))detail='<p>領取後存入背包，使用可解鎖指定夥伴；重複取得依原規則轉換。</p>';
    else if(item&&key!=='level_scroll')detail='<p>'+esc(supplyDetail(item))+'</p>';
    else if(kind==='gem'&&!description)detail='<p>'+esc(GEMS[Number(key)]?.desc||'技能鑲嵌寶石')+'</p>';
    if(ref.context==='inventory'){
      if(item)detail+='<p>持有 '+(state?__EMBERWILD_INVENTORY_STOCK.count(key):0)+' · 售價 '+(key==='level_scroll'?materialSellPrice('升級卷軸'):typeof itemSellPrice==='function'?itemSellPrice(key):0)+' 金幣／個</p>';
      else if(kind==='item'&&key.startsWith('companion-ticket-'))detail+='<p>持有 '+(Number.isFinite(ref.quantity)?ref.quantity.toLocaleString():'0')+'</p>';
      else if(kind==='gem')detail+='<p>持有 '+(state?state.gems[Number(key)]||0:0)+' · 售價 '+(typeof inventoryGemSellPrice==='function'?inventoryGemSellPrice(Number(key)):0)+' 金幣／個</p>';
      else if(kind==='material')detail+='<p>材料庫存：'+(state?materialCount(key).toLocaleString():'0')+' · 售價 '+(typeof materialSellPrice==='function'?materialSellPrice(key):0)+' 金幣／個</p>';
    }
    if(ref.context==='shop')detail+=`<p>${esc(ref.quantityLabel||'商品數量')}：${Number.isFinite(ref.quantity)?ref.quantity.toLocaleString():'1'} · ${esc(ref.priceLabel||'價格')}：${Number.isFinite(ref.price)?ref.price.toLocaleString():'0'} 金幣</p>`;
    else if(ref.context!=='inventory'&&ref.quantity!==undefined&&Number.isFinite(ref.quantity))detail+=`<p>${esc(ref.quantityLabel||'數量')}：${ref.quantity.toLocaleString()}</p>`;
    if(g&&globalThis.EmberwildTokens?.isToken(g)){const wearer=gearWearer(g.id);detail+='<p><span class="tag token-job-tag">'+esc(companionTokenJobLabel(g))+'</span>'+ (wearer?' '+esc(characterName(wearer))+' · 已裝備':'')+'</p>';}
    if(g&&globalThis.EmberwildTokens?.isToken(g))detail+='<p>'+esc(globalThis.companionTokenAbilityText?.(g)||'')+'</p>';
    return `<h3>${esc(name(kind,key,g))}</h3>${description?'<p>'+esc(description)+'</p>':''}${detail}${ref.extra?'<p>'+esc(ref.extra)+'</p>':''}`;
  }
  function controls(ref){
    const {kind,key,g}=ref;
    if(!g&&ref.context!=='inventory')return '';
    if(g){
      if(!findGear(g.id))return '';
      if(globalThis.EmberwildTokens?.isToken(g)){
        const h=gearWearer(g.id),list=party.members.filter(x=>EmberwildTokens.canEquip(g,x));
        return `<div class="actions"><select id="item-detail-token-target" aria-label="信物穿戴對象">${list.map(x=>`<option value="${memberKey(x)}" ${h===x?'selected':''}>${esc(characterName(x))}</option>`).join('')}</select><button onclick="itemDetailsAction(()=>equipCompanionToken('${g.id}',Number(document.getElementById('item-detail-token-target').value)))" ${list.length?'':'disabled'}>穿戴</button>${h?`<button onclick="itemDetailsAction(()=>unequipCompanionToken(${memberKey(h)}))">卸下</button>`:''}<button onclick="closeItemDetails();openForge('${g.id}')">強化</button><button onclick="itemDetailsAction(()=>toggleGearLock('${g.id}'))">${g.locked?'解除鎖定':'鎖定'}</button><button class="danger" onclick="closeItemDetails();salvage('${g.id}')" ${h||g.locked?'disabled':''}>分解</button></div>`;
      }
      return `<button onclick="closeItemDetails();openForge('${g.id}')">前往強化／洗鍊</button>`;
    }
    const virtual=virtualItem(kind,key);if(virtual)return virtual.actions?.(ref)||'';
    const k=attr(JSON.stringify(key)),hero=memberKey(pageHero('equipment')||playerHero());
    if(kind==='material')return `<div class="actions"><input id="item-detail-quantity" type="number" min="1" value="1" max="${materialCount(key)}" aria-label="賣出數量"><button onclick="itemDetailsAction(()=>sellMaterial(${k},document.getElementById('item-detail-quantity').value))">賣出</button><button onclick="itemDetailsAction(()=>sellMaterial(${k},materialCount(${k})))">全部賣出</button></div>`;
    if(kind==='gem')return `<div class="actions"><button onclick="closeItemDetails();setTab('skills')">前往技能鑲嵌</button>${globalThis.__EMBERWILD_CAN_SELL?.('gem',key)?`<button onclick="itemDetailsAction(()=>sellCatalogueGem(${Number(key)},1))">賣出 1 個</button><button onclick="itemDetailsAction(()=>sellCatalogueGem(${Number(key)},state.gems[${Number(key)}]))">全部賣出</button>`:''}</div>`;
    if(kind==='item'&&key.startsWith('companion-ticket-'))return `<div class="actions"><button onclick="closeItemDetails();useCompanionRecruitmentTicket(${Number(key.slice(17))})">使用招募券</button>${globalThis.__EMBERWILD_CAN_SELL?.('item',key)?`<button onclick="itemDetailsAction(()=>sellCatalogueRecruitTicket(${Number(key.slice(17))},1))">賣出 1 張</button>`:''}</div>`;
    if(kind==='item'&&definition(kind,key))return `<div class="actions"><button onclick="closeItemDetails();useInventoryItem(${k},${hero})">${isHealPotion(definition(kind,key))?'自動喝水設定':key==='power_tier_reroll'?'前往強化':'使用'}</button><input id="item-detail-quantity" type="number" min="1" value="1" max="${__EMBERWILD_INVENTORY_STOCK.count(key)}" aria-label="賣出數量"><button onclick="itemDetailsAction(()=>sellInventoryItem(${k},document.getElementById('item-detail-quantity').value))">賣出</button><button onclick="itemDetailsAction(()=>sellInventoryItem(${k},__EMBERWILD_INVENTORY_STOCK.count(${k})))">全部賣出</button></div>`;
    return '';
  }
  function dialog(){let d=document.getElementById('item-detail-dialog');if(!d){d=document.createElement('dialog');d.id='item-detail-dialog';document.body.appendChild(d);}return d;}
  function renderDetail(){const d=dialog();if(selection)d.innerHTML=`<div class="item-detail-top"><span class="item-detail-art">${icon(selection.kind,selection.key,selection.g)}</span><button onclick="closeItemDetails()" aria-label="關閉道具詳細資料">關閉</button></div>${info(selection)}${controls(selection)}`;}
  globalThis.openItemSlotDetails=function(node){const ref=refFromNode(node);if(ref.context!=='inventory'||!ref.kind)return false;selection=ref;hideTooltip();renderDetail();const d=dialog();if(!d.open)d.showModal();};
  globalThis.closeItemDetails=function(){dialog().close();selection=null;};
  globalThis.itemDetailsAction=function(action){action();if(selection)renderDetail();};
  let tooltip, pointerHover=false, lastPointer=null, hoverCheckQueued=false;
  function hideTooltip(){
    if(tooltip){if(typeof tooltip.hidePopover==='function'&&tooltip.matches(':popover-open'))tooltip.hidePopover();tooltip.hidden=true;}
    hovered=null;pointerHover=false;
  }
  function showTooltip(node,fromPointer=false){
    if(!node)return;
    hovered=node;pointerHover=fromPointer;
    if(!tooltip){tooltip=document.createElement('div');tooltip.id='item-hover-tooltip';tooltip.className='item-hover-tooltip';tooltip.setAttribute('role','tooltip');document.body.appendChild(tooltip);}
    tooltip.innerHTML=info(refFromNode(node));tooltip.hidden=false;
    if(typeof tooltip.showPopover==='function'&&!tooltip.matches(':popover-open')){tooltip.setAttribute('popover','manual');tooltip.showPopover();}
    const rect=node.getBoundingClientRect(),tip=tooltip.getBoundingClientRect();
    const left=rect.right+10+tip.width<=innerWidth-8?rect.right+10:rect.left-tip.width-10;
    tooltip.style.left=Math.max(8,Math.min(left,innerWidth-tip.width-8))+'px';
    tooltip.style.top=Math.max(8,Math.min(rect.top,innerHeight-tip.height-8))+'px';
  }
  function itemAtPointer(){
    return lastPointer?document.elementFromPoint(lastPointer.x,lastPointer.y)?.closest?.('[data-item-kind]'):null;
  }
  function syncPointerHover(){
    if(!pointerHover)return;
    const node=itemAtPointer();
    // A live render can replace the hovered element without moving the mouse.
    if(node&&node!==hovered)showTooltip(node,true);
    else if(!node)hideTooltip();
  }
  function queuePointerCheck(){
    if(hoverCheckQueued||!pointerHover)return;
    hoverCheckQueued=true;
    requestAnimationFrame(()=>{hoverCheckQueued=false;syncPointerHover();});
  }
  function trackPointer(e){lastPointer={x:e.clientX,y:e.clientY};}
  document.addEventListener('pointerover',e=>{
    if(e.pointerType==='touch')return;
    trackPointer(e);
    const node=e.target.closest?.('[data-item-kind]');
    if(node&&node!==hovered)showTooltip(node,true);
    else if(node)pointerHover=true;
    else queuePointerCheck();
  });
  document.addEventListener('pointermove',e=>{
    if(e.pointerType==='touch')return;
    trackPointer(e);
    const node=e.target.closest?.('[data-item-kind]');
    if(node&&node!==hovered)showTooltip(node,true);
    else if(node)pointerHover=true;
    else if(pointerHover)hideTooltip();
  });
  document.addEventListener('pointerout',e=>{
    if(pointerHover&&hovered?.contains?.(e.target)&&!hovered.contains(e.relatedTarget))queuePointerCheck();
  });
  document.addEventListener('focusin',e=>{
    const node=e.target.closest?.('[data-item-kind]');
    if(node&&node!==hovered)showTooltip(node,false);
  });
  document.addEventListener('focusout',()=>{if(!pointerHover)hideTooltip();});
  // Battle journal auto-scroll and unrelated panel scrolls must not close an item tooltip.
  document.addEventListener('scroll',queuePointerCheck,true);
  document.addEventListener('keydown',e=>{if(e.key==='Escape')hideTooltip();});
})();
