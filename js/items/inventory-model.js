/* v0.204 inventory foundation: item definitions, stack storage and slot counting.
   Pure data model shared by the game runtime, tests and the balance editor. It never touches the DOM or the save.

   Item identity is the catalogue id used by inventoryIcons: "material:<name>", "gem:<index>", "item:<id>".
   Equipment and companion tokens are individual instances (they keep their own id inside the gear bag) and never stack.
   Everything that can merge is described by its item id alone: gem tiers and boss-material difficulties already have
   their own keys, so two items with the same display name but different ids never merge. */
(function(root){
  'use strict';
  const VERSION=1;
  // Category defaults. Balance data (balanceSettings.inventory.stackLimits) may change the numbers;
  // a single item can still override them with inventoryIcons[].maxStack / .occupiesSlot / .stackable.
  /* The bag has six tabs with their own capacity (default 100 each). Every category belongs to one tab. */
  const TABS={
    equipment:{label:'裝備',capacity:100},token:{label:'信物',capacity:100},gem:{label:'寶石',capacity:100},
    material:{label:'素材',capacity:100},consumable:{label:'消耗品',capacity:100},special:{label:'特殊',capacity:100}
  };
  const CATEGORIES={
    equipment:{label:'裝備',tab:'equipment',maxStack:1,stackable:false,occupiesSlot:true},
    token:{label:'信物',tab:'token',maxStack:1,stackable:false,occupiesSlot:true},
    gem:{label:'寶石',tab:'gem',maxStack:99,stackable:true,occupiesSlot:true},
    monsterMaterial:{label:'怪物專屬素材',tab:'material',maxStack:999,stackable:true,occupiesSlot:true},
    enhancementMaterial:{label:'裝備強化素材',tab:'material',maxStack:999,stackable:true,occupiesSlot:true},
    material:{label:'其他一般素材',tab:'material',maxStack:999,stackable:true,occupiesSlot:true},
    rareMaterial:{label:'稀有養成素材',tab:'material',maxStack:999,stackable:true,occupiesSlot:true},
    consumable:{label:'消耗品',tab:'consumable',maxStack:99,stackable:true,occupiesSlot:true},
    special:{label:'特殊道具',tab:'special',maxStack:999,stackable:true,occupiesSlot:true},
    questItem:{label:'任務道具',tab:'special',maxStack:999,stackable:true,occupiesSlot:false}
  };
  const INSTANCE_CATEGORIES=new Set(['equipment','token']);
  const DEFAULT_SETTINGS={capacities:Object.fromEntries(Object.entries(TABS).map(([k,v])=>[k,v.capacity])),stackLimits:Object.fromEntries(Object.entries(CATEGORIES).map(([k,v])=>[k,v.maxStack]))};
  const MAX_STACK=1e9,MAX_TOTAL=1e12,UNSAFE=new Set(['__proto__','constructor','prototype']);
  const ENHANCEMENT=new Set(['鍛鐵','粉塵']),RARE=new Set(['以太鍛鐵','光輝碎塊']),CONSUMABLE_MATERIALS=new Set(['升級卷軸']);
  const STACK_KINDS=['material','gem','item'];

  function parseId(id){
    if(typeof id!=='string')return null;
    const i=id.indexOf(':');if(i<1)return null;
    const kind=id.slice(0,i),key=id.slice(i+1);
    if(!STACK_KINDS.includes(kind)||!key||key.length>100||UNSAFE.has(key))return null;
    if(kind==='gem'&&!/^\d{1,3}$/.test(key))return null;
    return {kind,key};
  }
  function itemId(kind,key){const id=kind+':'+String(key);if(!parseId(id))throw Error('物品識別碼無效：'+id);return id;}
  function validId(id){return !!parseId(id);}

  /* ctx: {bossMaterials:Set, monsterMaterials:Set, itemTypes:Map(id→type)} built from the balance document. */
  function classify(id,ctx={}){
    const p=parseId(id);if(!p)throw Error('物品識別碼無效：'+id);
    if(p.kind==='gem')return 'gem';
    if(p.kind==='item')return p.key.startsWith('companion-ticket-')?'special':'consumable';
    const key=p.key,plain=key.replace(/^【(?:困難|地獄)】/,'');
    if(CONSUMABLE_MATERIALS.has(key))return 'consumable';
    if(ENHANCEMENT.has(key))return 'enhancementMaterial';
    if(RARE.has(key))return 'rareMaterial';
    if(ctx.bossMaterials?.has(plain)||ctx.monsterMaterials?.has(plain))return 'monsterMaterial';
    return 'material';
  }
  function normalizeSettings(raw){
    const out={capacities:{...DEFAULT_SETTINGS.capacities},stackLimits:{...DEFAULT_SETTINGS.stackLimits}};
    if(raw&&typeof raw==='object'){
      for(const k of Object.keys(TABS)){const n=raw.capacities?.[k];if(Number.isSafeInteger(n)&&n>=1&&n<=100000)out.capacities[k]=n;}
      for(const k of Object.keys(CATEGORIES)){const n=raw.stackLimits?.[k];if(!INSTANCE_CATEGORIES.has(k)&&Number.isSafeInteger(n)&&n>=1&&n<=MAX_STACK)out.stackLimits[k]=n;}
    }
    for(const k of INSTANCE_CATEGORIES)out.stackLimits[k]=1;
    return out;
  }
  function settingsIssues(raw){
    const errors=[];if(raw===undefined)return errors;
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return ['背包設定必須是物件'];
    if(raw.capacities!==undefined){
      if(!raw.capacities||typeof raw.capacities!=='object'||Array.isArray(raw.capacities))errors.push('背包分頁容量必須是物件');
      else for(const [k,n] of Object.entries(raw.capacities)){if(!TABS[k]){errors.push('未知的背包分頁：'+k);continue;}if(!Number.isSafeInteger(n)||n<1||n>100000)errors.push('背包分頁容量必須是 1～100000 的整數：'+k);}
    }
    if(raw.stackLimits!==undefined){
      if(!raw.stackLimits||typeof raw.stackLimits!=='object'||Array.isArray(raw.stackLimits))errors.push('堆疊上限必須是物件');
      else for(const [k,n] of Object.entries(raw.stackLimits)){
        if(!CATEGORIES[k]){errors.push('未知的堆疊分類：'+k);continue;}
        if(INSTANCE_CATEGORIES.has(k)){if(n!==1)errors.push('裝備與信物不可堆疊，堆疊上限固定為 1：'+k);continue;}
        if(!Number.isSafeInteger(n)||n<1||n>MAX_STACK)errors.push('堆疊上限必須是 1～'+MAX_STACK+' 的整數：'+k);
      }
    }
    return errors;
  }
  /* Per-item override fields on an inventoryIcons row. */
  function overrideIssues(row){
    const errors=[],id=row?.kind+':'+row?.key;
    if(row.maxStack!==undefined&&(!Number.isSafeInteger(row.maxStack)||row.maxStack<1||row.maxStack>MAX_STACK))errors.push('個別堆疊上限必須是 1～'+MAX_STACK+' 的整數：'+id);
    if(row.stackable!==undefined&&typeof row.stackable!=='boolean')errors.push('是否可堆疊必須是布林值：'+id);
    if(row.occupiesSlot!==undefined&&typeof row.occupiesSlot!=='boolean')errors.push('是否占用背包格必須是布林值：'+id);
    if(['equipment','token'].includes(row.kind)&&(row.stackable===true||row.maxStack!==undefined&&row.maxStack!==1))errors.push('裝備與信物是獨立物品，不可設定堆疊：'+id);
    return errors;
  }
  /* Resolve one definition. details(kind,key) returns the inventoryIcons override row (or undefined). */
  function definition(id,{settings,ctx,details,name,description,icon,rarity,canSell,canUse,canSalvage}={}){
    const p=parseId(id);if(!p)throw Error('物品識別碼無效：'+id);
    const s=normalizeSettings(settings),category=classify(id,ctx),base=CATEGORIES[category],row=details?.(p.kind,p.key)||{};
    const stackable=row.stackable===false?false:base.stackable;
    const maxStack=stackable?(Number.isSafeInteger(row.maxStack)?row.maxStack:s.stackLimits[category]):1;
    return {id,kind:p.kind,key:p.key,name:row.displayName||name||p.key,category,categoryLabel:base.label,tab:base.tab,tabLabel:TABS[base.tab].label,icon:icon??row.iconType??'auto',rarity:rarity??null,description:row.description??description??'',
      stackable,maxStack,occupiesSlot:typeof row.occupiesSlot==='boolean'?row.occupiesSlot:base.occupiesSlot,
      canSell:canSell??(row.saleEnabled??(p.kind!=='gem'&&!['questItem','special'].includes(category))),canSalvage:!!canSalvage,canUse:canUse??['consumable','questItem','special'].includes(category)};
  }
  function instanceDefinition(g,{isToken=false,details,name}={}){
    const kind=isToken?'token':'equipment',row=details?.(kind,g?.tokenId??'')||{},c=CATEGORIES[kind];
    return {id:g.id,kind,instance:true,name:name||row.displayName||g.name||'',category:kind,categoryLabel:c.label,tab:c.tab,tabLabel:TABS[c.tab].label,stackable:false,maxStack:1,occupiesSlot:true,canSell:true,canSalvage:true,canUse:false};
  }

  /* ---------- stack store ---------- */
  function hidden(obj,key,value){Object.defineProperty(obj,key,{value,writable:true,configurable:true,enumerable:false});}
  function createStore(){const s={version:VERSION,serial:0,stacks:[]};hidden(s,'byItem',new Map());return s;}
  function index(store){if(!store.byItem){hidden(store,'byItem',new Map());for(const st of store.stacks){if(!store.byItem.has(st.item))store.byItem.set(st.item,[]);store.byItem.get(st.item).push(st);}}return store.byItem;}
  function reindex(store){hidden(store,'byItem',null);return index(store);}
  function stacksOf(store,id){return index(store).get(id)||[];}
  function total(store,id){let n=0;for(const st of stacksOf(store,id))n+=st.qty;return n;}
  function items(store){return [...index(store).keys()];}
  function checkQty(n,label='數量'){if(!Number.isSafeInteger(n)||n<0)throw RangeError(label+'必須是非負整數');return n;}
  function capChecked(capOf,id){const c=capOf(id);if(!Number.isSafeInteger(c)||c<1)throw RangeError('堆疊上限無效：'+id);return c;}
  function newStack(store,id,qty){const st={uid:'s'+(++store.serial),item:id,qty};store.stacks.push(st);if(!index(store).has(id))store.byItem.set(id,[]);store.byItem.get(id).push(st);return st;}
  function dropStack(store,st){const i=store.stacks.indexOf(st);if(i>=0)store.stacks.splice(i,1);const list=index(store).get(st.item);if(list){const j=list.indexOf(st);if(j>=0)list.splice(j,1);if(!list.length)store.byItem.delete(st.item);}}
  function stackOrder(store,id){const list=stacksOf(store,id);return list.slice().sort((a,b)=>store.stacks.indexOf(a)-store.stacks.indexOf(b));}
  /* Fill existing partial stacks of the same item first (in slot order), then open new stacks. Nothing is lost. */
  function add(store,id,qty,capOf){
    if(!validId(id))throw Error('物品識別碼無效：'+id);checkQty(qty);if(!qty)return 0;
    if(total(store,id)+qty>MAX_TOTAL)throw RangeError('物品數量超出可保存範圍：'+id);
    const cap=capChecked(capOf,id);let left=qty;
    for(const st of stackOrder(store,id)){if(!left)break;const room=cap-st.qty;if(room>0){const n=Math.min(room,left);st.qty+=n;left-=n;}}
    while(left>0){const n=Math.min(cap,left);newStack(store,id,n);left-=n;}
    return qty;
  }
  /* All or nothing: when the stacks hold less than qty nothing changes and false is returned.
     Takes from the last stacks first so the leading stacks stay full. */
  function remove(store,id,qty){
    if(!validId(id))throw Error('物品識別碼無效：'+id);checkQty(qty);if(!qty)return true;
    if(total(store,id)<qty)return false;
    let left=qty;for(const st of stackOrder(store,id).reverse()){if(!left)break;const n=Math.min(st.qty,left);st.qty-=n;left-=n;if(!st.qty)dropStack(store,st);}
    return true;
  }
  function removeMany(store,cost){
    const rows=Object.entries(cost||{}).filter(([,n])=>n>0);for(const [id,n] of rows){if(!validId(id))throw Error('物品識別碼無效：'+id);checkQty(n);}
    const need=new Map();for(const [id,n] of rows)need.set(id,(need.get(id)||0)+n);
    for(const [id,n] of need)if(total(store,id)<n)return false;
    for(const [id,n] of need)remove(store,id,n);return true;
  }
  function setTotal(store,id,n,capOf){checkQty(n);const cur=total(store,id);if(n>cur)add(store,id,n-cur,capOf);else if(n<cur)remove(store,id,cur-n);return n;}
  function stackByUid(store,uid){return store.stacks.find(st=>st.uid===uid)||null;}
  /* Move as much as fits from one stack into another stack of the same item. Returns the moved quantity. */
  function merge(store,fromUid,toUid,capOf){
    const a=stackByUid(store,fromUid),b=stackByUid(store,toUid);
    if(!a||!b||a===b)throw Error('找不到要合併的堆疊');
    if(a.item!==b.item)throw Error('不同物品不能合併');
    const cap=capChecked(capOf,a.item),n=Math.max(0,Math.min(a.qty,cap-b.qty));
    a.qty-=n;b.qty+=n;if(!a.qty)dropStack(store,a);return n;
  }
  /* Take qty out of a stack into a new stack placed right after it. The item total does not change. */
  function split(store,uid,qty){
    const st=stackByUid(store,uid);if(!st)throw Error('找不到要拆分的堆疊');
    if(!Number.isSafeInteger(qty)||qty<1||qty>=st.qty)throw RangeError('拆分數量必須介於 1 與堆疊數量減 1 之間');
    st.qty-=qty;const created={uid:'s'+(++store.serial),item:st.item,qty};
    store.stacks.splice(store.stacks.indexOf(st)+1,0,created);const list=index(store).get(st.item);list.splice(list.indexOf(st)+1,0,created);return created.uid;
  }
  /* Repair after a cap change or a damaged layout: drop empty stacks and split stacks above the cap in place. */
  function normalize(store,capOf){
    let changed=false;
    for(let i=0;i<store.stacks.length;i++)if(!(store.stacks[i].qty>0)){store.stacks.splice(i--,1);changed=true;}
    reindex(store);
    for(const [id,list] of [...store.byItem]){
      const cap=capChecked(capOf,id);if(list.every(st=>st.qty<=cap))continue;
      // Re-flow this item only: keep its stacks (uids and positions), fill each to the cap, append what is left.
      const ordered=stackOrder(store,id);let left=ordered.reduce((n,st)=>n+st.qty,0);
      for(const st of ordered){if(left>0){st.qty=Math.min(cap,left);left-=st.qty;}else st.qty=0;}
      let at=store.stacks.indexOf(ordered.at(-1));
      while(left>0){const n=Math.min(cap,left);store.stacks.splice(++at,0,{uid:'s'+(++store.serial),item:id,qty:n});left-=n;}
      changed=true;
    }
    for(let i=0;i<store.stacks.length;i++)if(!(store.stacks[i].qty>0))store.stacks.splice(i--,1);
    reindex(store);return changed;
  }
  /* Slot usage per tab. tabOf(itemId) returns the tab of an occupying stack (or null); instances = {equipment:n, token:n};
     extra = {tab:n} for stores kept outside the stack store (tickets, region vouchers). */
  function slotUsage(store,{tabOf=()=>null,instances={},extra={},settings}={}){
    const s=normalizeSettings(settings),tabs={};
    for(const [k,t] of Object.entries(TABS))tabs[k]={label:t.label,used:0,capacity:s.capacities[k]};
    for(const st of store.stacks){const t=tabOf(st.item);if(t&&tabs[t])tabs[t].used++;}
    for(const [t,n] of [...Object.entries(instances),...Object.entries(extra)])if(tabs[t])tabs[t].used+=n;
    for(const t of Object.values(tabs))t.free=Math.max(0,t.capacity-t.used),t.over=Math.max(0,t.used-t.capacity);
    return {tabs,used:Object.values(tabs).reduce((n,t)=>n+t.used,0)};
  }
  /* Only items whose stacks differ from the standard fill (cap, cap, …, rest) are written, e.g. after a split. The standard
     layout is rebuilt from the item totals on load, so a rolled-back transaction or a reload writes identical bytes. */
  function isStandard(store,id,capOf){const sizes=stackOrder(store,id).map(st=>st.qty),want=stackSizes(sizes.reduce((n,q)=>n+q,0),capChecked(capOf,id));return sizes.length===want.length&&sizes.every((q,i)=>q===want[i]);}
  function serialize(store,capOf){
    const custom=capOf?new Set(items(store).filter(id=>!isStandard(store,id,capOf))):null;
    const stacks=store.stacks.filter(st=>!custom||custom.has(st.item)).map(st=>({uid:st.uid,item:st.item,qty:st.qty}));
    return {version:VERSION,serial:custom?stacks.reduce((n,st)=>Math.max(n,Number(st.uid.slice(1))),0):store.serial,stacks};
  }
  /* Saved layouts are structurally validated here; quantities are reconciled against item totals by the runtime. */
  function validateLayout(raw){
    if(raw===undefined||raw===null)return null;
    if(typeof raw!=='object'||Array.isArray(raw)||raw.version!==VERSION||!Array.isArray(raw.stacks)||raw.stacks.length>200000||!Number.isSafeInteger(raw.serial)||raw.serial<0)throw Error('背包堆疊資料無效');
    const uids=new Set(),out=createStore();out.serial=raw.serial;
    for(const st of raw.stacks){
      if(!st||typeof st!=='object'||typeof st.uid!=='string'||!/^s\d{1,15}$/.test(st.uid)||uids.has(st.uid)||!validId(st.item)||!Number.isSafeInteger(st.qty)||st.qty<1||st.qty>MAX_STACK)throw Error('背包堆疊資料無效');
      uids.add(st.uid);out.serial=Math.max(out.serial,Number(st.uid.slice(1)));out.stacks.push({uid:st.uid,item:st.item,qty:st.qty});
    }
    reindex(out);return out;
  }
  /* Rebuild one item so its stacks hold exactly `want`. Matching saved stacks keep their uid and order. */
  function reconcile(store,layout,id,want,capOf){
    for(const st of stacksOf(store,id).slice())dropStack(store,st);
    if(!want)return;
    const saved=layout?stackOrderFrom(layout,id):[];
    if(saved.length&&saved.reduce((n,st)=>n+st.qty,0)===want){for(const st of saved){const copy={uid:st.uid,item:id,qty:st.qty};store.stacks.push(copy);if(!index(store).has(id))store.byItem.set(id,[]);store.byItem.get(id).push(copy);store.serial=Math.max(store.serial,Number(st.uid.slice(1)));}return;}
    add(store,id,want,capOf);
  }
  function stackOrderFrom(layout,id){return layout.stacks.filter(st=>st.item===id);}
  function sortBySavedOrder(store,layout){
    if(!layout)return;const pos=new Map(layout.stacks.map((st,i)=>[st.uid,i]));
    const keyed=store.stacks.map((st,i)=>({st,k:pos.has(st.uid)?pos.get(st.uid):layout.stacks.length+i}));
    keyed.sort((a,b)=>a.k-b.k);store.stacks.splice(0,store.stacks.length,...keyed.map(x=>x.st));
    reindex(store);
  }
  /* Split a quantity into stack sizes, e.g. 1500 at 999 → [999,501]. */
  function stackSizes(qty,cap){checkQty(qty);const out=[];while(qty>0){out.push(Math.min(cap,qty));qty-=Math.min(cap,qty);}return out;}

  const api={VERSION,TABS,CATEGORIES,DEFAULT_SETTINGS,MAX_STACK,parseId,itemId,validId,classify,normalizeSettings,settingsIssues,overrideIssues,definition,instanceDefinition,
    createStore,total,items,stacksOf,isStandard,add,remove,removeMany,setTotal,merge,split,normalize,slotUsage,serialize,validateLayout,reconcile,sortBySavedOrder,stackByUid,stackSizes};
  root.EmberwildInventory=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
