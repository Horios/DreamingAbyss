const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();globalThis.fixture=(id,quality,t)=>{const g=createEquipmentShopGear('equipment_lv1','job0-slot1-form0');g.id=id;g.powerTier=t;g.affix=[{type:0,rank:quality,value:1}];return g;};`);return r;}
const ids=html=>[...html.matchAll(/onclick="chooseForge\('([^']+)'\)"/g)].map(m=>m[1]);
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
test('bag and forge default to quality then displayed T, and explicit T sort uses powerTier',()=>{
 const r=game();r.run(`state.bag.push(fixture('fine-t10',1,10),fixture('rare-t2',2,2),fixture('legend-t1',3,1),fixture('rare-t9',2,9));findGear('rare-t2').tier=6;setGearInventoryFilter('worn','no');setWorkshopCategory('armor');setForgeWearFilter('unequipped');`);
 const expected=['legend-t1','rare-t9','rare-t2','fine-t10'];
 assert.deepEqual(json(r,'sortedFilteredGear().map(g=>g.id)'),expected);assert.deepEqual(ids(r.run('forgeView()')),expected);
 r.run("setForgeSort('tier')");assert.deepEqual(ids(r.run('forgeView()')),['fine-t10','rare-t9','rare-t2','legend-t1']);
 r.run("setGearInventorySort('acquired');loadParty(packParty());setGearInventoryFilter('worn','no');setWorkshopCategory('armor');setForgeWearFilter('all');setForgeWearFilter('unequipped');");
 assert.deepEqual(json(r,'__EMBERWILD_GEAR_INVENTORY.sort()'),{key:'quality',direction:'desc'});
 assert.deepEqual(ids(r.run('forgeView()')),expected);assert.deepEqual(r.errors,[]);
});
test('large mixed workshop inventories render at most 60 slots per category without exporting balance and every item remains reachable',()=>{
 const r=game();r.run(`globalThis.seedGear=fixture('seed',2,5);globalThis.seedToken=__EMBERWILD_TOKEN_TEST.makeToken(__EMBERWILD_TOKEN_TEST.config.catalog[0].id,2);for(let i=0;i<1000;i++)state.bag.push({...structuredClone(seedGear),id:'gear-'+i});for(let i=0;i<100;i++)state.bag.push({...structuredClone(seedToken),id:'token-'+i});globalThis.exports=0;globalThis.baseExportForTest=exportableBalance;exportableBalance=function(){exports++;return baseExportForTest();};setWorkshopCategory('armor');setForgeWearFilter('unequipped');`);
 const reached=new Set();let html;
 const walk=(pages)=>{for(let page=0;page<pages;page++){html=r.run('forgeView()');const list=ids(html);assert(list.length>0&&list.length<=60);for(const id of list){assert(!reached.has(id));reached.add(id);}if(page<pages-1)r.run('changeForgePage(1)');}assert.match(html,/onclick="changeForgePage\(1\)" disabled/);};
 walk(17);assert.equal(reached.size,1000,'armor category lists every gear');
 r.run("setWorkshopCategory('token');toggleWorkshopPicker(true);setForgeWearFilter('all');setForgeWearFilter('unequipped');");walk(2);
 assert.equal(reached.size,1100);assert.equal(r.run('exports'),0);
 // Directly opening a target puts it on the bench; reopening the picker follows its page.
 r.run("openForge('gear-999');state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=100000;toggleWorkshopPicker(true);");
 html=r.run('forgeView()');assert(ids(html).includes('gear-999'));assert.match(html,/selected item-quality-2[^>]*data-item-gear="gear-999"/);
 r.run("enhance('token-99')");assert.equal(r.run("findGear('token-99').plus"),1);
 r.run(`state.bag=state.bag.filter(g=>gearWearer(g.id)||g.id==='token-99');openForge('token-99');toggleWorkshopPicker(true);`);html=r.run('forgeView()');assert.deepEqual(ids(html),['token-99']);assert.doesNotMatch(html,/forge-pagination/);assert.deepEqual(r.errors,[]);
});
