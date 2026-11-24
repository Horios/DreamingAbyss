/* v0.204 inventory foundation runtime.
   One stack store per party holds every stackable item: materials (鍛鐵 = state.ore, 粉塵 = state.dust), gems,
   consumables and healing potions. The fields older code reads and writes (state.ore, state.dust, state.gems[i],
   state.materials[k], state.consumables[k], party.members[0].healingPotions[k]) are facades over that store: a read
   returns the store total and a write goes through the stack rules (fill partial stacks, open new stacks, all-or-nothing
   removal). No other copy of these quantities exists at runtime, so nothing can change a count without the stack rules.
   Equipment and companion tokens remain individual instances in the shared gear bag (party.sharedGear).
   Companion recruit tickets remain in party.achievements.tickets (quest items, no bag slot) and are reached through
   the same API. The save keeps the existing per-item totals (old-save validation) plus `inventory`, the stack layout. */
(()=>{
  'use strict';
  const M=EmberwildInventory,parties=new WeakMap(),heroes=new WeakSet();
  const ORE='material:鍛鐵',DUST='material:粉塵',TICKET=/^item:companion-ticket-(\d{1,10})$/;
  let defCache=new Map(),ctxCache=null;

  /* ---------- definitions ---------- */
  const gameplaySettingsRef=()=>typeof GAMEPLAY_SETTINGS!=='undefined'?GAMEPLAY_SETTINGS:null;
  function settings(){return M.normalizeSettings(gameplaySettingsRef()?.inventory);}
  function context(){
    if(ctxCache)return ctxCache;
    const monsters=gameplaySettingsRef()?.monsters?.catalog||[];
    ctxCache={bossMaterials:new Set(monsters.filter(m=>m.kind==='boss'&&m.material).map(m=>m.material)),monsterMaterials:new Set(monsters.filter(m=>m.material).map(m=>m.material))};
    return ctxCache;
  }
  const details=(kind,key)=>globalThis.__EMBERWILD_ITEM_DETAILS?.(kind,key);
  function healIds(){try{return new Set((typeof healPotionItems==='function'?healPotionItems():[]).map(x=>x.id));}catch{return new Set();}}
  function itemName(p){
    if(p.kind==='gem')return GEMS?.[Number(p.key)]?.name||('寶石 '+p.key);
    if(p.kind==='material')return p.key==='粉塵'?'寶石粉塵':p.key;
    const shop=(typeof SHOP!=='undefined'?SHOP:[]).find(x=>x.id===p.key);if(shop)return shop.name;
    const t=p.key.match(/^companion-ticket-(\d+)$/);return t?'夥伴招募券':p.key;
  }
  function definition(id){
    if(defCache.has(id))return defCache.get(id);
    const p=M.parseId(id);if(!p)throw Error('物品識別碼無效：'+id);
    const name=globalThis.__EMBERWILD_ITEM_NAME?.(p.kind,p.key,itemName(p))||itemName(p);
    let canSell;try{canSell=globalThis.__EMBERWILD_CAN_SELL?.(p.kind,p.key);}catch{}
    const d=Object.freeze(M.definition(id,{settings:gameplaySettingsRef()?.inventory,ctx:context(),details,name,
      description:globalThis.__EMBERWILD_ITEM_DESCRIPTION?.(p.kind,p.key)||'',rarity:p.kind==='gem'?Math.floor(Number(p.key)/5):null,canSell:typeof canSell==='boolean'?canSell:undefined}));
    defCache.set(id,d);return d;
  }
  const capOf=id=>definition(id).maxStack;
  const occupies=id=>definition(id).occupiesSlot;
  function gearDefinition(g){const token=!!globalThis.EmberwildTokens?.isToken(g);return M.instanceDefinition(g,{isToken:token,details,name:typeof equipmentDisplayName==='function'?equipmentDisplayName(g):g.name});}
  function invalidate(){defCache=new Map();ctxCache=null;}

  /* ---------- store and facades ---------- */
  function rt(){
    if(!party)return null;let r=parties.get(party);
    if(!r){r={store:M.createStore(),layout:null,account:null,shared:null,owner:null,views:{}};parties.set(party,r);}
    if(Object.hasOwn(party,'inventory')){const raw=party.inventory;delete party.inventory;try{r.layout=M.validateLayout(raw);}catch(e){console.warn('背包堆疊資料無效，依物品總量重建',e);r.layout=null;}}
    return r;
  }
  function checkCount(v,id){if(!Number.isSafeInteger(v)||v<0)throw TypeError('物品數量必須是非負整數：'+id+' = '+v);return v;}
  function setCount(r,id,v){checkCount(v,id);const before=M.total(r.store,id);if(before===v)return;M.setTotal(r.store,id,v,capOf);refresh(r,id);}
  function viewOf(id){
    const p=M.parseId(id);if(!p)return null;
    if(p.kind==='gem')return 'gems';
    if(p.kind==='material')return id===ORE||id===DUST?null:'materials';
    if(TICKET.test(id))return null;
    return healIds().has(p.key)?'healingPotions':'consumables';
  }
  function refresh(r,id){
    const p=M.parseId(id),n=M.total(r.store,id);
    for(const name of ['materials','consumables','healingPotions']){const v=r.views[name];if(!v)continue;if(viewOf(id)===name&&n>0)v.target[p.key]=n;else delete v.target[p.key];}
    if(p.kind==='gem'&&r.views.gems){const i=Number(p.key);if(i<r.views.gems.target.length)r.views.gems.target[i]=n;}
  }
  function refreshAll(r){
    for(const name of ['materials','consumables','healingPotions'])if(r.views[name])for(const k of Object.keys(r.views[name].target))delete r.views[name].target[k];
    if(r.views.gems)r.views.gems.target.fill(0);
    for(const id of M.items(r.store))refresh(r,id);
  }
  function objectView(r,name,kind){
    const target={},toId=k=>{const id=kind+':'+k;if(!M.validId(id))throw TypeError('物品名稱無效：'+k);return id;};
    const proxy=new Proxy(target,{
      set(t,k,v){if(typeof k==='symbol')return Reflect.set(t,k,v);setCount(r,toId(k),v);return true;},
      deleteProperty(t,k){if(typeof k==='symbol')return Reflect.deleteProperty(t,k);const id=kind+':'+k;if(M.validId(id)&&viewOf(id)===name)setCount(r,id,0);return true;},
      defineProperty(t,k,desc){if(typeof k==='symbol'||!('value' in desc))return Reflect.defineProperty(t,k,desc);setCount(r,toId(k),desc.value);return true;}
    });
    r.views[name]={target,proxy};return proxy;
  }
  function gemsView(r){
    const target=Array(GEMS.length).fill(0);
    const proxy=new Proxy(target,{
      set(t,k,v){if(typeof k==='string'&&/^\d+$/.test(k)){const i=Number(k);if(i>=t.length)return true;setCount(r,'gem:'+i,v);return true;}return Reflect.set(t,k,v);},
      deleteProperty(t,k){if(typeof k==='string'&&/^\d+$/.test(k)&&Number(k)<t.length){setCount(r,'gem:'+k,0);return true;}return Reflect.deleteProperty(t,k);}
    });
    r.views.gems={target,proxy};return proxy;
  }
  /* Replace every count of one view at once (snapshot restores, `materials = {...}`). Validates before changing anything. */
  function replaceView(r,name,kind,value){
    if(!value||typeof value!=='object')throw TypeError('物品資料必須是物件');
    const next=new Map();
    if(name==='gems'){for(let i=0;i<GEMS.length;i++)next.set('gem:'+i,checkCount(Number(value[i]??0),'gem:'+i));}
    else{
      for(const k of Object.keys(r.views[name].target))next.set(kind+':'+k,0);
      for(const [k,v] of Object.entries(value)){const id=kind+':'+k;if(!M.validId(id))throw TypeError('物品名稱無效：'+k);if(v===undefined)continue;next.set(id,checkCount(v,id));}
    }
    for(const [id,v] of next)setCount(r,id,v);
  }
  function seed(r,id,qty){if(!qty)return;M.reconcile(r.store,r.layout,id,M.total(r.store,id)+qty,capOf);refresh(r,id);}
  function installAccount(r){
    const a=party.accountResources;if(!a||r.account===a)return;
    const plain={ore:a.ore||0,dust:a.dust||0,gems:[...(a.gems||[])],materials:{...(a.materials||{})}};
    seed(r,ORE,checkCount(plain.ore,ORE));seed(r,DUST,checkCount(plain.dust,DUST));
    plain.gems.forEach((n,i)=>{if(i<GEMS.length)seed(r,'gem:'+i,checkCount(n||0,'gem:'+i));});
    for(const [k,n] of Object.entries(plain.materials))seed(r,M.itemId('material',k),checkCount(n||0,'material:'+k));
    const gems=r.views.gems?.proxy||gemsView(r),materials=r.views.materials?.proxy||objectView(r,'materials','material');
    Object.defineProperty(a,'ore',{enumerable:true,configurable:true,get:()=>M.total(r.store,ORE),set:v=>setCount(r,ORE,v)});
    Object.defineProperty(a,'dust',{enumerable:true,configurable:true,get:()=>M.total(r.store,DUST),set:v=>setCount(r,DUST,v)});
    Object.defineProperty(a,'gems',{enumerable:true,configurable:true,get:()=>gems,set:v=>{if(v!==gems)replaceView(r,'gems','gem',v);}});
    Object.defineProperty(a,'materials',{enumerable:true,configurable:true,get:()=>materials,set:v=>{if(v!==materials)replaceView(r,'materials','material',v);}});
    r.account=a;refreshAll(r);
  }
  function installShared(r){
    const s=party.sharedItems;if(!s||r.shared===s)return;
    for(const [k,n] of Object.entries(s.consumables||{}))seed(r,M.itemId('item',k),checkCount(n||0,'item:'+k));
    const consumables=r.views.consumables?.proxy||objectView(r,'consumables','item');
    Object.defineProperty(s,'consumables',{enumerable:true,configurable:true,get:()=>consumables,set:v=>{if(v!==consumables)replaceView(r,'consumables','item',v);}});
    r.shared=s;refreshAll(r);
  }
  function installOwner(r){
    const h=party.members?.[0];if(!h||r.owner===h)return;
    const raw=h.healingPotions&&typeof h.healingPotions==='object'&&!Array.isArray(h.healingPotions)?{...h.healingPotions}:{};
    for(const [k,n] of Object.entries(raw))if(Number.isSafeInteger(n)&&n>0&&M.validId('item:'+k))seed(r,'item:'+k,n);
    const heal=r.views.healingPotions?.proxy||objectView(r,'healingPotions','item');
    Object.defineProperty(h,'healingPotions',{enumerable:true,configurable:true,get:()=>heal,set:v=>{if(v!==heal)replaceView(r,'healingPotions','item',v);}});
    r.owner=h;heroes.add(h);refreshAll(r);
  }
  function ensureInventory(){
    const r=rt();if(!r)return null;
    installAccount(r);installShared(r);installOwner(r);
    if(r.layout&&r.account&&r.shared&&r.owner){M.sortBySavedOrder(r.store,r.layout);r.layout=null;}
    return r;
  }
  if(typeof ensureAccountResources==='function'){const base=ensureAccountResources;ensureAccountResources=function(...args){const out=base.apply(this,args);ensureInventory();return out;};}
  if(typeof ensureSharedItems==='function'){const base=ensureSharedItems;ensureSharedItems=function(...args){const out=base.apply(this,args);ensureInventory();return out;};}

  /* ---------- save ---------- */
  const basePack=packParty;
  /* Saved data must be plain (structuredClone cannot copy the facades): the per-item totals are written as plain copies. */
  const plain=v=>Array.isArray(v)?[...v]:v&&typeof v==='object'?{...v}:v;
  packParty=function(...args){
    const out=basePack.apply(this,args);const r=party&&ensureInventory();
    if(out&&r){
      if(Array.isArray(out.members))out.members=out.members.map(h=>{if(!h||typeof h!=='object')return h;const row={...h};for(const k of ['materials','gems','consumables','healingPotions'])if(k in row)row[k]=plain(row[k]);return row;});
      out.inventory=M.serialize(r.store,capOf);
    }
    return out;
  };
  const baseValidate=validateParty;
  validateParty=function(data,...args){
    const out=baseValidate.call(this,data,...args);
    if(out&&data&&typeof data==='object'&&data.inventory!==undefined){
      // A damaged layout never blocks a load: item totals stay authoritative and the stacks are rebuilt from them.
      try{const layout=M.validateLayout(data.inventory);if(layout)Object.defineProperty(out,'inventory',{value:M.serialize(layout),enumerable:true,configurable:true,writable:true});}
      catch(e){console.warn('背包堆疊資料無效，依物品總量重建',e);}
    }
    return out;
  };
  const baseLoad=loadParty;
  loadParty=function(...args){const out=baseLoad.apply(this,args);ensureInventory();return out;};
  if(typeof applyBalanceConfig==='function'){
    const baseApply=applyBalanceConfig;
    applyBalanceConfig=function(...args){const out=baseApply.apply(this,args);invalidate();const r=party&&parties.get(party);if(r){M.normalize(r.store,capOf);refreshAll(r);}return out;};
  }

  /* ---------- unified API ---------- */
  function store(){const r=ensureInventory();if(!r)throw Error('尚未載入隊伍');return r;}
  function ticketId(id){const m=String(id).match(TICKET);return m?Number(m[1]):null;}
  function tickets(){if(typeof companionTicketCount==='function')companionTicketCount(0);return party?.achievements?.tickets||{};}
  function count(id){
    const t=ticketId(id);if(t!==null)return tickets()[t]||0;
    if(!M.validId(id))throw Error('物品識別碼無效：'+id);return M.total(store().store,id);
  }
  function has(id,qty=1){return count(id)>=qty;}
  function add(id,qty=1){
    checkCount(qty,id);if(!qty)return 0;const t=ticketId(id);
    if(t!==null){const map=tickets();map[t]=(map[t]||0)+qty;return qty;}
    const r=store();M.add(r.store,id,qty,capOf);refresh(r,id);return qty;
  }
  function remove(id,qty=1){
    checkCount(qty,id);const t=ticketId(id);
    if(t!==null){const map=tickets();if((map[t]||0)<qty)return false;map[t]-=qty;if(!map[t])delete map[t];return true;}
    const r=store();if(!M.remove(r.store,id,qty))return false;refresh(r,id);return true;
  }
  /* Several costs at once; nothing is deducted unless every item is available. */
  function removeMany(cost){
    const rows=Object.entries(cost||{}).filter(([,n])=>n>0);for(const [id,n] of rows)if(count(id)<checkCount(n,id))return false;
    for(const [id,n] of rows)remove(id,n);return true;
  }
  function merge(fromUid,toUid){const r=store();const st=M.stackByUid(r.store,fromUid),moved=M.merge(r.store,fromUid,toUid,capOf);if(st)refresh(r,st.item);return moved;}
  function split(uid,qty){const r=store();return M.split(r.store,uid,qty);}
  function stacks(){return store().store.stacks.map(st=>({...st,definition:definition(st.item)}));}
  function wearer(g){return typeof gearWearer==='function'?gearWearer(g.id):null;}
  function gearBag(){if(typeof ensureSharedGear==='function')ensureSharedGear();return party?.sharedGear?.items||state?.bag||[];}
  function getGear(id){return gearBag().find(g=>g.id===id)||null;}
  function createGear(...args){return gear(...args);}
  function addGearInstance(g){if(!g||typeof g.id!=='string')throw Error('裝備資料無效');if(getGear(g.id))throw Error('裝備識別碼重複：'+g.id);return addGear(g);}
  /* Region vouchers keep their own ledger: each voucher stack carries locked snapshot values, so only identical
     vouchers merge. Every ledger stack takes ceil(count / cap) slots of item:region-voucher's tab (消耗品). */
  function ledgerSlots(id,counts){const d=definition(id);if(!d.occupiesSlot)return [d.tab,0];return [d.tab,counts.reduce((n,c)=>n+(Number.isSafeInteger(c)&&c>0?Math.ceil(c/d.maxStack):0),0)];}
  /* Six tabs, each with its own capacity (balanceSettings.inventory.capacities, default 100). Not enforced yet. */
  function slots(){
    const r=store(),loose=gearBag().filter(g=>!wearer(g)),tokens=loose.filter(g=>globalThis.EmberwildTokens?.isToken(g)).length,extra={};
    const add=([tab,n])=>{if(n)extra[tab]=(extra[tab]||0)+n;};
    add(ledgerSlots('item:region-voucher',(party?.regionVouchers?.stacks||[]).map(v=>v?.count)));
    for(const [t,n] of Object.entries(tickets()))add(ledgerSlots('item:companion-ticket-'+t,[n]));
    const usage=M.slotUsage(r.store,{tabOf:id=>{const d=definition(id);return d.occupiesSlot?d.tab:null;},instances:{equipment:loose.length-tokens,token:tokens},extra,settings:gameplaySettingsRef()?.inventory});
    return {...usage,enforced:false};
  }
  function byCategory(category){
    if(!M.CATEGORIES[category])throw Error('未知的物品分類：'+category);
    if(category==='equipment'||category==='token')return gearBag().filter(g=>!wearer(g)&&!!globalThis.EmberwildTokens?.isToken(g)===(category==='token')).map(g=>({instance:g,definition:gearDefinition(g)}));
    const out=[];for(const id of M.items(store().store)){const d=definition(id);if(d.category===category)out.push({id,definition:d,quantity:M.total(store().store,id),stacks:M.stacksOf(store().store,id).map(st=>({...st}))});}
    if(category==='special')for(const [t,n] of Object.entries(tickets()))if(n>0){const id='item:companion-ticket-'+t;out.push({id,definition:definition(id),quantity:n,stacks:[]});}
    return out;
  }
  /* Consistency report used by tests and the developer console: stack sizes, caps, uids and facade totals. */
  function audit(){
    const r=store(),problems=[],uids=new Set(),h=party.members[0];
    for(const st of r.store.stacks){if(uids.has(st.uid))problems.push('重複堆疊 '+st.uid);uids.add(st.uid);if(!(st.qty>0))problems.push('空堆疊 '+st.uid);if(st.qty>capOf(st.item))problems.push('超過堆疊上限 '+st.item+' '+st.qty);}
    const expect=(id,v)=>{if(M.total(r.store,id)!==(v||0))problems.push('數量不一致 '+id+' '+M.total(r.store,id)+' ≠ '+v);};
    expect(ORE,h.ore);expect(DUST,h.dust);for(let i=0;i<GEMS.length;i++)expect('gem:'+i,h.gems[i]);
    for(const [k,v] of Object.entries(h.materials))expect('material:'+k,v);for(const [k,v] of Object.entries(h.consumables))expect('item:'+k,v);for(const [k,v] of Object.entries(h.healingPotions||{}))expect('item:'+k,v);
    for(const id of M.items(r.store)){const p=M.parseId(id),view=viewOf(id),n=M.total(r.store,id);if(view==='materials'&&h.materials[p.key]!==n||view==='consumables'&&h.consumables[p.key]!==n||view==='healingPotions'&&h.healingPotions[p.key]!==n)problems.push('介面未同步 '+id);}
    const ids=new Set();for(const g of gearBag()){if(ids.has(g.id))problems.push('裝備識別碼重複 '+g.id);ids.add(g.id);}
    return problems;
  }
  const api={VERSION:M.VERSION,audit,model:M,definition,gearDefinition,count,has,add,remove,removeMany,merge,split,stacks,getGear,createGear,addGear:addGearInstance,slots,byCategory,settings,
    ensure:ensureInventory,_debug:()=>parties.get(party)};
  globalThis.EmberwildItems=api;
  /* Existing bag page: show the computed slot usage next to the category tabs. Capacity is not enforced yet. */
  if(typeof inventoryTabs==='function'){const baseTabs=inventoryTabs;inventoryTabs=function(...args){const html=baseTabs.apply(this,args);let note='';try{const s=slots();note=`<p class="small inventory-slot-usage">背包格數（目前不限制）：${Object.entries(s.tabs).map(([k,t])=>`<span data-inventory-tab="${k}" data-inventory-slots="${t.used}">${t.label} ${t.used} / ${t.capacity}</span>`).join('、')}</p>`;}catch{}return html+note;};}
})();
