const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/items/inventory-model.js');
const caps={'material:鍛鐵':999,'material:粉塵':999,'item:heal_standard':99,'gem:0':99,'gem:5':99};
const capOf=id=>caps[id]??999;
const sizes=(s,id)=>M.stacksOf(s,id).map(st=>st.qty);

test('same item stacks; a full stack opens a new one; a large grant is split without loss',()=>{
 const s=M.createStore();M.add(s,'material:鍛鐵',10,capOf);M.add(s,'material:鍛鐵',5,capOf);assert.deepEqual(sizes(s,'material:鍛鐵'),[15]);
 M.add(s,'material:鍛鐵',984,capOf);assert.deepEqual(sizes(s,'material:鍛鐵'),[999]);M.add(s,'material:鍛鐵',1,capOf);assert.deepEqual(sizes(s,'material:鍛鐵'),[999,1]);
 const t=M.createStore();M.add(t,'material:鍛鐵',1500,capOf);assert.deepEqual(sizes(t,'material:鍛鐵'),[999,501]);
 M.add(t,'material:粉塵',2000,capOf);assert.deepEqual(sizes(t,'material:粉塵'),[999,999,2]);
 M.add(t,'item:heal_standard',120,capOf);assert.deepEqual(sizes(t,'item:heal_standard'),[99,21]);
 assert.equal(M.total(t,'material:鍛鐵'),1500);assert.deepEqual(M.stackSizes(1500,999),[999,501]);
});
test('different items never merge, even with equal names in different kinds or tiers',()=>{
 const s=M.createStore();M.add(s,'gem:0',3,capOf);M.add(s,'gem:5',3,capOf);M.add(s,'material:蛇鱗',2,capOf);M.add(s,'material:【困難】蛇鱗',2,capOf);
 assert.equal(s.stacks.length,4);assert.equal(M.total(s,'gem:0'),3);assert.equal(M.total(s,'material:【困難】蛇鱗'),2);
 const [a,b]=s.stacks;assert.throws(()=>M.merge(s,a.uid,b.uid,capOf),/不同物品/);assert.equal(s.stacks.length,4);
});
test('consumption spans stacks, removes empty stacks and never deducts partially',()=>{
 const s=M.createStore();M.add(s,'material:鍛鐵',1500,capOf);assert.equal(M.remove(s,'material:鍛鐵',600),true);assert.deepEqual(sizes(s,'material:鍛鐵'),[900]);
 assert.equal(M.remove(s,'material:鍛鐵',901),false);assert.deepEqual(sizes(s,'material:鍛鐵'),[900]);
 M.add(s,'material:粉塵',5,capOf);assert.equal(M.removeMany(s,{'material:鍛鐵':10,'material:粉塵':6}),false);assert.equal(M.total(s,'material:鍛鐵'),900);assert.equal(M.total(s,'material:粉塵'),5);
 assert.equal(M.removeMany(s,{'material:鍛鐵':900,'material:粉塵':5}),true);assert.equal(s.stacks.length,0);
 assert.throws(()=>M.add(s,'material:鍛鐵',-1,capOf),RangeError);assert.throws(()=>M.add(s,'material:鍛鐵',1.5,capOf),RangeError);assert.throws(()=>M.add(s,'material:__proto__',1,capOf),/無效/);
});
test('merge respects the cap, split keeps totals, both keep layout positions',()=>{
 const s=M.createStore();M.add(s,'item:heal_standard',150,capOf);const [a,b]=s.stacks;assert.deepEqual([a.qty,b.qty],[99,51]);
 const uid=M.split(s,a.uid,40);assert.deepEqual(s.stacks.map(x=>x.qty),[59,40,51]);assert.equal(s.stacks[1].uid,uid);assert.equal(M.total(s,'item:heal_standard'),150);
 assert.equal(M.merge(s,b.uid,a.uid,capOf),40);assert.deepEqual(s.stacks.map(x=>x.qty),[99,40,11]);assert.equal(M.total(s,'item:heal_standard'),150);
 assert.throws(()=>M.split(s,a.uid,99),RangeError);assert.throws(()=>M.split(s,a.uid,0),RangeError);
 M.merge(s,s.stacks[2].uid,s.stacks[1].uid,capOf);assert.deepEqual(s.stacks.map(x=>x.qty),[99,51]);
 // Adding fills partial stacks in slot order before opening new ones.
 M.add(s,'item:heal_standard',50,capOf);assert.deepEqual(s.stacks.map(x=>x.qty),[99,99,2]);
});
test('slot usage is counted per tab, each tab with its own capacity (default 100)',()=>{
 const s=M.createStore();M.add(s,'material:鍛鐵',1500,capOf);M.add(s,'material:粉塵',2000,capOf);M.add(s,'item:heal_standard',120,capOf);M.add(s,'gem:0',3,capOf);
 const tabOf=id=>M.CATEGORIES[M.classify(id)].tab,u=M.slotUsage(s,{tabOf,instances:{equipment:15,token:2},extra:{special:1}});
 assert.deepEqual(Object.fromEntries(Object.entries(u.tabs).map(([k,t])=>[k,[t.used,t.capacity]])),{equipment:[15,100],token:[2,100],gem:[1,100],material:[5,100],consumable:[2,100],special:[1,100]});
 assert.equal(u.used,26);assert.equal(M.slotUsage(s,{tabOf,settings:{capacities:{material:3}}}).tabs.material.over,2);
});
test('classification and definitions follow category defaults with per-item overrides',()=>{
 const ctx={bossMaterials:new Set(['蛇王鱗']),monsterMaterials:new Set(['狼牙'])};
 assert.equal(M.classify('material:鍛鐵',ctx),'enhancementMaterial');assert.equal(M.classify('material:以太鍛鐵',ctx),'rareMaterial');assert.equal(M.classify('material:【地獄】蛇王鱗',ctx),'monsterMaterial');
 assert.equal(M.classify('material:狼牙',ctx),'monsterMaterial');assert.equal(M.classify('material:紅色草',ctx),'material');assert.equal(M.classify('gem:3',ctx),'gem');assert.equal(M.classify('item:imbue_fire',ctx),'consumable');assert.equal(M.classify('item:companion-ticket-10',ctx),'special');assert.equal(M.classify('material:升級卷軸',ctx),'consumable');
 const d=M.definition('gem:2',{ctx});assert.equal(d.maxStack,99);assert.equal(d.stackable,true);assert.equal(d.occupiesSlot,true);
 assert.equal(M.definition('item:companion-ticket-10',{ctx}).tab,'special');assert.equal(M.definition('material:鍛鐵',{ctx}).tab,'material');assert.equal(M.definition('gem:1',{ctx}).tab,'gem');
 assert.equal(M.definition('material:紅色草',{ctx,settings:{stackLimits:{material:500}}}).maxStack,500);
 const details=(kind,key)=>key==='紅色草'?{maxStack:20,occupiesSlot:false}:undefined;const o=M.definition('material:紅色草',{ctx,details});assert.equal(o.maxStack,20);assert.equal(o.occupiesSlot,false);
 assert.equal(M.definition('material:紅色草',{ctx,details:()=>({stackable:false})}).maxStack,1);
 assert.equal(M.normalizeSettings({stackLimits:{equipment:5}}).stackLimits.equipment,1);assert.equal(M.normalizeSettings({capacities:{gem:150}}).capacities.gem,150);assert.equal(M.normalizeSettings({}).capacities.special,100);assert.equal(M.settingsIssues({capacities:{bag:1}}).length,1);
 assert.equal(M.settingsIssues({stackLimits:{equipment:2}}).length,1);assert.equal(M.settingsIssues({stackLimits:{gem:0}}).length,1);assert.equal(M.settingsIssues({stackLimits:{nope:1}}).length,1);
 assert.equal(M.overrideIssues({kind:'equipment',key:'x',maxStack:5}).length,1);assert.equal(M.overrideIssues({kind:'material',key:'x',maxStack:5,occupiesSlot:false}).length,0);
});
test('layout round trip keeps uids and order; reconcile rebuilds only mismatched items; normalize splits over-cap stacks',()=>{
 const s=M.createStore();M.add(s,'material:鍛鐵',1500,capOf);M.add(s,'gem:0',10,capOf);M.split(s,s.stacks[0].uid,100);
 const raw=JSON.parse(JSON.stringify(M.serialize(s))),layout=M.validateLayout(raw);assert.deepEqual(M.serialize(layout),raw);
 const compact=M.serialize(s,capOf);assert.deepEqual(compact.stacks.map(x=>x.item),['material:鍛鐵','material:鍛鐵','material:鍛鐵'],'only non-standard items are written');
 const r=M.createStore();M.reconcile(r,layout,'material:鍛鐵',1500,capOf);M.reconcile(r,layout,'gem:0',12,capOf);M.sortBySavedOrder(r,layout);
 assert.deepEqual(r.stacks.filter(x=>x.item==='material:鍛鐵').map(x=>x.uid),raw.stacks.filter(x=>x.item==='material:鍛鐵').map(x=>x.uid));assert.equal(M.total(r,'gem:0'),12);
 assert.throws(()=>M.validateLayout({...raw,stacks:[...raw.stacks,raw.stacks[0]]}),/無效/);assert.throws(()=>M.validateLayout({...raw,stacks:[{uid:'s1',item:'equipment:x',qty:1}]}),/無效/);
 const n=M.createStore();M.add(n,'material:鍛鐵',1500,capOf);assert.equal(M.normalize(n,()=>500),true);assert.deepEqual(n.stacks.map(x=>x.qty),[500,500,500]);assert.equal(M.total(n,'material:鍛鐵'),1500);assert(n.stacks.every(x=>x.qty<=500));
 assert.equal(new Set(n.stacks.map(x=>x.uid)).size,n.stacks.length);
});
