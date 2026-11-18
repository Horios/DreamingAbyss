const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(level=14){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();setClassMasteryLevel(${level}-1,playerHero());for(const id of [10,11,12,13,14]){recruitCompanion(id);closeModal();}setPartnerEnlisted(14,false);save();state.materials['升級卷軸']=1;`);return r;}
function snapshot(r){return json(r,'({members:packParty().members,build:party.buildSystem,scrolls:materialCount("升級卷軸")})');}
// v0.161: level scrolls no longer level anyone; stock left in a save is refunded at its sell price once (level-removal.test.cjs).
test('Level scrolls cannot be used and are not listed as items',()=>{
 const r=game();assert.equal(r.run("useInventoryItem('level_scroll')"),false);assert.doesNotMatch(r.run('accountItemsView()'),/data-inventory-item="level_scroll"/);assert.equal(r.run('typeof useLevelScroll'),'undefined');assert.deepEqual(r.errors,[]);
});
test('Material regions track active drop rules, cross-region sources, boss difficulties and unknown inventory',()=>{
 const r=game();r.run(`{
 const cfg=exportableBalance(),a=cfg.balanceSettings.monsters.catalog.find(m=>m.mapIndex===0&&m.kind==='normal'),b=cfg.balanceSettings.monsters.catalog.find(m=>m.mapIndex===1&&m.kind==='normal');
 cfg.balanceSettings.drops.entries.push({id:'regional_ui_test',name:'測試材料',enabled:true,type:'material',key:'跨區測試材料',kinds:['normal'],chanceByDifficulty:[1,0,0],quantityMin:1,quantityMax:1,sources:[a.id,b.id]});applyBalanceConfig(cfg,{persist:false});Object.assign(state.materials,{'跨區測試材料':3,'舊存材料':1,'紅色草':2,'光輝碎塊':1});
 }`);
 assert.deepEqual(json(r,'[...inventoryMaterialRegions().get("跨區測試材料")]'),[0,1]);const html=r.run('accountMaterialsView()');assert.match(html,/data-material-group="common"/);assert.match(html,/data-material-group="alchemy"/);assert.match(html,/data-material-group="enhance"/);
 r.run('setCommonMaterialRegion("1")');assert.match(r.run('accountMaterialsView()'),/data-item-kind="material" data-item-key="跨區測試材料"/);assert.doesNotMatch(r.run('accountMaterialsView()'),/data-item-kind="material" data-item-key="舊存材料"/);r.run('setCommonMaterialRegion("other")');assert.match(r.run('accountMaterialsView()'),/data-item-kind="material" data-item-key="舊存材料"/);assert.doesNotMatch(r.run('accountMaterialsView()'),/data-item-kind="material" data-item-key="跨區測試材料"/);
 const before=json(r,'({materials:state.materials,ore:state.ore,dust:state.dust})');r.run('setCommonMaterialSort("quantity");setLifeStockFilter("alchemy");setLifeStockSort("price");setLifeStockOpen(false);');assert.deepEqual(json(r,'({materials:state.materials,ore:state.ore,dust:state.dust})'),before);assert.deepEqual(r.errors,[]);
});
