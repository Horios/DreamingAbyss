'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),published=require('../data/balance.json');
const snapshot=(r,expression)=>JSON.parse(r.run('JSON.stringify('+expression+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal()');return r;}
test('T and level inputs clamp at real equipment caps',()=>{
 const r=game();
 r.run("setGearInventoryFold('filters',true);setGearInventoryFilter('tMin','999');setGearInventoryFilter('tMax','-4');setGearInventoryFilter('levelMin','9999');setGearInventoryFilter('levelMax','-100')");
 const f=snapshot(r,'__EMBERWILD_GEAR_INVENTORY.filters()');
 assert.equal(Number(f.tMin),r.run('__EMBERWILD_EQUIPMENT_POWER.strength.multipliers.length'));
 assert.equal(f.tMax,'1');
 assert.equal(Number(f.levelMin),r.run('RULES.maxLevel'));
 assert.equal(f.levelMax,'1');
 assert.deepEqual(r.errors,[]);
});
test('numeric filters clamp to bag values and reset when the chosen property changes',()=>{
 const r=game();
 r.run('setGearInventoryFilter("stat","atk")');
 const max=r.run('__EMBERWILD_GEAR_INVENTORY.limits("value").max');
 assert(max>0);
 r.run('setGearInventoryFilter("value","999999999");setGearInventoryFilter("op","range");setGearInventoryFilter("upper","999999999")');
 assert.equal(r.run('Number(__EMBERWILD_GEAR_INVENTORY.filters().value)'),max);
 assert.equal(r.run('Number(__EMBERWILD_GEAR_INVENTORY.filters().upper)'),max);
 r.run('setGearInventoryFilter("stat","hp")');
 assert.equal(r.run('__EMBERWILD_GEAR_INVENTORY.filters().value'),'');
 assert.equal(r.run('__EMBERWILD_GEAR_INVENTORY.filters().upper'),'');
 assert.deepEqual(r.errors,[]);
});
test('filter dialog preserves state and sort sits alongside the inventory list',()=>{
 const r=game();
 r.run('setGearInventoryFold("filters",true);setGearInventoryFold("sort",true);setGearInventorySort("atk");setGearInventoryFilter("job","0")');
 const html=r.run('inlineInventoryView()');
 assert.match(html,/onclick="openGearInventoryFilters\(\)"/);
 assert(!html.includes('<summary>裝備篩選</summary>'));
 assert.match(html,/<b>裝備列表<\/b><div class="gear-sort-controls">/);
 const sortOptions=html.match(/<select aria-label="裝備排序"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
 assert(sortOptions.includes('<option value="atk"'));
 assert(!sortOptions.includes('<option value="elementResistPct:'));
 r.run('openGearInventoryFilters()');const dialog=r.run('$("modal").innerHTML');
 assert(dialog.includes('<option value="elementResistPct:'));
 const statOptions=dialog.match(/<select aria-label="屬性"[^>]*>([\s\S]*?)<\/select>/)?.[1]||'';
 assert(!statOptions.includes('skillEffectPct:'));
 assert(!statOptions.includes('核心技能'));
 assert(dialog.includes('詞綴篩選'));
 assert.equal(r.run('setGearInventorySort("elementResistPct:fire::")'),false);
 assert.equal(r.run('__EMBERWILD_GEAR_INVENTORY.sort().key'),'atk');
 assert.deepEqual(r.errors,[]);
});
test('potion descriptions describe their fixed HP role without obsolete low-price copy',()=>{
 const rows=published.inventoryIcons.filter(x=>x.kind==='item'&&x.key.startsWith('heal_'));
 assert.equal(rows.length,4);
 assert(rows.every(x=>x.description.includes('固定生命值')&&!/價格低廉|日常探索/.test(x.description)));
 for(const row of rows)assert.equal(require('../js/ui/inventory-icon-model.js').descriptionDefaults['item:'+row.key],row.description);
 const r=game();
 assert.match(r.run('supplyDetail(SHOP.find(s=>s.id==="heal_small"))'),/HP/);
 assert.deepEqual(r.errors,[]);
});
test('skill and level-scroll tooltips avoid a second copy of the flavor description',()=>{
 const ui=fs.readFileSync(path.join(root,'js/ui/skill-system-ui.js'),'utf8');
 assert(!/if\(sk\.systemEffect\)return [^\n]*sk\.description/.test(ui));
 const item=fs.readFileSync(path.join(root,'js/ui/item-presentation.js'),'utf8');
 assert(item.includes("else if(item&&key!=='level_scroll')"));
});

test('empty inventory detail remains safe when no gear passes the current filter',()=>{
 const r=game();r.run('state.bag=[];');
 const html=r.run('inlineInventoryView()');
 assert.match(html,/顯示 0 件/);
 assert.match(html,/沒有符合條件的裝備/);
 assert.doesNotMatch(html,/data-socket-equipment=/);
 assert.equal(typeof r.run('inventoryGearDetail(undefined)'),'string');
 assert.deepEqual(r.errors,[]);
});
