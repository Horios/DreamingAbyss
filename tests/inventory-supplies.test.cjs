const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(level=14){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();playerHero().lv=${level};playerHero().xp=0;syncParty();for(const id of [10,11,12,13,14]){recruitCompanion(id);closeModal();}setPartnerEnlisted(14,false);save();state.materials['升級卷軸']=1;`);return r;}
function snapshot(r){return json(r,'({members:packParty().members,build:party.buildSystem,scrolls:materialCount("升級卷軸")})');}
test('A scroll grants one shared level even with EXP bonuses and no target; normal EXP still receives the bonus',()=>{
 const r=game();r.run(`party.timedBoosts=[{itemId:'exp_test',name:'測試經驗券',boostType:'exp',bonusPercent:200,durationMinutes:30,expiresAt:Date.now()+1800000}];selectHero(10);`);
 assert.equal(r.run("useInventoryItem('level_scroll')"),true);assert.deepEqual(json(r,'party.members.map(h=>[h.lv,h.xp])'),Array(6).fill([15,0]));assert.equal(r.run('materialCount("升級卷軸")'),0);assert.equal(r.run('isPartnerEnlisted(partyMember(14))'),false);
 assert.doesNotMatch(r.run('accountMaterialsView()'),/升級卷軸|useLevelScroll/);assert.doesNotMatch(r.run('accountItemsView()'),/data-inventory-item="level_scroll"/);
 r.run('awardXP(10)');assert.equal(r.run('playerHero().xp'),30);assert.deepEqual(r.errors,[]);
});
test('Paused live foes and level caps prevent scroll consumption; real write failure restores progression and permanent unlocks',()=>{
 const r=game();const before=snapshot(r);r.run("foes=[{hp:1}];running=false;roundIterator=null;");assert.equal(r.run('useLevelScroll()'),false);assert.deepEqual(snapshot(r),before);r.run('foes=[]');
 r.run('globalThis.__failedStorageWrite=localStorage.setItem;localStorage.setItem=()=>{throw Error("test storage full")};');assert.equal(r.run('useLevelScroll()'),false);r.run('localStorage.setItem=__failedStorageWrite');assert.deepEqual(snapshot(r),before);assert.equal(r.run('save()'),true);
 r.run('playerHero().lv=levelCap(playerHero());syncParty();');assert.equal(r.run('useLevelScroll()'),false);assert.equal(r.run('materialCount("升級卷軸")'),1);
});
test('Scroll sales use existing stock and configured price, refund failed writes, and survive save/import without migrating stock',()=>{
 const r=game();r.run('state.materials["升級卷軸"]=3;globalThis.__beforeGold=state.gold;globalThis.__scrollPrice=materialSellPrice("升級卷軸");');r.run('sellInventoryItem("level_scroll",2)');assert.equal(r.run('materialCount("升級卷軸")'),1);assert.equal(r.run('state.gold'),r.run('__beforeGold+2*__scrollPrice'));
 const before=snapshot(r),gold=r.run('state.gold');r.run('globalThis.__beforeSave=save;save=()=>false;sellInventoryItem("level_scroll",1);save=__beforeSave;');assert.deepEqual(snapshot(r),before);assert.equal(r.run('state.gold'),gold);
 r.run('save();loadParty(JSON.parse(localStorage.getItem(KEY)));');assert.equal(r.run('materialCount("升級卷軸")'),1);assert.equal(r.run('state.consumables.level_scroll||0'),0);// The item list is compact (name × count); the sale price lives in the detail popup and in materialSellPrice.
 assert.match(r.run('accountItemsView()'),/data-inventory-item="level_scroll"[\s\S]*?×1/);assert.equal(r.run('materialSellPrice("升級卷軸")'),r.run('__scrollPrice'));assert.deepEqual(r.errors,[]);
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
