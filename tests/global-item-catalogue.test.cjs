const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const M=require('../js/ui/inventory-icon-model.js'),{loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));
function game(){const r=loadRuntime(root);r.ctx.doc=published;r.run('applyBalanceConfig(doc,{persist:false});selectSaveSlot(1);start(0);closeModal();');return r;}
function apply(r,icons,edit=()=>{}){const d=JSON.parse(r.run('JSON.stringify(exportableBalance())'));d.inventoryIcons=icons;edit(d);r.ctx.next=d;r.run('applyBalanceConfig(next,{persist:false});');return d;}
const plain=v=>JSON.parse(JSON.stringify(v));
// Counts follow the reviewed data: speed tickets (v0.023) and 紅色草泥 were retired; gems are 5 types × 3 tiers.
test('reviewed detailed hierarchy contains all 339 definitions including 48 difficulty material keys without duplicate stock',()=>{
 const rows=M.entries(published).filter(x=>x.kind!=='skill');assert.equal(rows.length,339);assert.equal(new Set(rows.map(r=>r.id)).size,339);assert.equal(new Set(rows.map(r=>r.categoryPath.join('|'))).size,44);
 assert.deepEqual(rows.find(r=>r.id==='material:清水').categoryPath,['素材','製作材料','煉金與加工材料','液體']);assert.deepEqual(rows.find(r=>r.id==='item:heal_small').categoryPath,['消耗品','藥水','治療藥水']);assert.deepEqual(rows.find(r=>r.id==='token:berserk').categoryPath.slice(0,2),['裝備','夥伴信物']);
 const herb=rows.find(r=>r.id==='material:紅色草');assert(herb.sources.includes('gather'));assert(!herb.sources.includes('alchemy'));assert(herb.uses.some(r=>r.type==='alchemy'));assert(!rows.some(r=>r.id==='material:region'));
 for(const key of ['【困難】古木年輪','【地獄】古木年輪']){const r=rows.find(r=>r.key===key);assert(r.sources.includes('monster'));assert.equal(r.uses.filter(x=>x.type==='craft').length,4);}
 const clone=structuredClone(published);clone.balanceSettings.economy.materialPrices.push({key:'【困難】古木年輪',sellPrice:9});assert.equal(M.entries(clone).find(r=>r.key==='【困難】古木年輪').difficulty,1);
});
test('combined hierarchy, source, use, weapon, region, state, text and numeric sorting filter real definitions',()=>{
 assert.deepEqual(M.query(published,{hierarchy:['素材'],sources:['gather'],search:'紅色 草',use:'alchemy'}).map(r=>r.key),['紅色草']);assert(M.query(published,{sources:['alchemy']}).every(r=>!['紅色草','清水','藥水瓶'].includes(r.key)));
 assert(M.query(published,{hierarchy:['裝備'],job:'1',slot:'1',weapon:'axe'}).every(r=>r.slot===0&&r.jobs.includes(0)&&r.weaponTypes.includes('axe')));
 const sorted=M.query(published,{hierarchy:['消耗品'],sort:'price',direction:'desc'}).map(r=>M.economics(published,r).sellPrice);assert.deepEqual(sorted,[...sorted].sort((a,b)=>b-a));
 assert.equal(M.query(published,{status:'warning'}).length,2);assert.deepEqual(M.query(published,{status:'unsaleable'}).map(r=>r.kind),Array(15).fill('gem'),'only the 15 gem tiers are unsaleable');
 const d=structuredClone(published);d.inventoryIcons.push({kind:'material',key:'紅色草',iconType:'auto',categoryPath:['素材','自訂製作材料'],tags:['藥草'],displayName:'治療葉'});assert.equal(M.query(d,{hierarchy:['素材','自訂製作材料'],search:'治療葉 藥草',status:'custom'}).length,1);
});
test('material, consumable and gear sale eligibility and individual gear price affect actual transactions',()=>{
 // 清水 is not a wishing-lake offering; the lake rejects unsaleable offerings such as 紅色草 (herb).
 const r=game();apply(r,[{kind:'material',key:'清水',iconType:'auto',saleEnabled:false},{kind:'item',key:'imbue_fire',iconType:'auto',saleEnabled:false},{kind:'equipment',key:'form:0:0:0',iconType:'auto',sellPrice:123}]);
 r.run('state.materials["清水"]=3;state.consumables.imbue_fire=2;');const gold=r.run('state.gold');r.run('sellMaterial("清水",1);sellInventoryItem("imbue_fire",1);');assert.equal(r.run('state.gold'),gold);assert.equal(r.run('materialCount("清水")'),3);assert.equal(r.run('state.consumables.imbue_fire'),2);
 r.run('globalThis.fixture=gear(1,0,0,0);fixture.form=0;fixture.formJob=0;fixture.prefixId="";fixture.suffixId="";state.bag.push(fixture);');assert.equal(r.run('equipmentSellPrice(fixture)'),123);r.run('sellGear(fixture.id)');assert.equal(r.run('state.gold'),gold+123);assert(!r.run('state.bag.some(g=>g.id===fixture.id)'));assert.deepEqual(r.errors,[]);
});
test('custom salvage replaces the shared formula and grants all products into original stores with rollback',()=>{
 const r=game();apply(r,[{kind:'equipment',key:'form:0:0:0',iconType:'auto',salvageRewards:[{type:'ore',key:'',quantity:7},{type:'material',key:'合金試件',quantity:2},{type:'item',key:'heal_small',quantity:1},{type:'gem',key:'0',quantity:2}]}]);
 r.run('globalThis.fixture=gear(2,0,0,0);fixture.form=0;fixture.formJob=0;fixture.prefixId="";fixture.suffixId="";state.bag.push(fixture);');const before=plain(r.run('({ore:state.ore,dust:state.dust,gem:state.gems[0],potion:healPotionCount("heal_small")})'));
 r.run('salvage(fixture.id)');assert.equal(r.run('state.ore'),before.ore+7);assert.equal(r.run('state.dust'),before.dust);assert.equal(r.run('materialCount("合金試件")'),2);assert.equal(r.run('healPotionCount("heal_small")'),before.potion+1);assert.equal(r.run('state.gems[0]'),before.gem+2);
 assert(M.entries(plain(r.run('exportableBalance()'))).find(x=>x.key==='合金試件').sources.includes('salvage'));
 r.run('fixture=gear(2,0,0,0);fixture.form=0;fixture.formJob=0;state.bag.push(fixture);globalThis.beforeFailure=JSON.stringify(packParty());globalThis.originalSave=save;save=()=>false;salvage(fixture.id);save=originalSave;');assert.equal(r.run('JSON.stringify(packParty())'),r.run('beforeFailure'));assert.deepEqual(r.errors,[]);
});
test('gem prices distinguish disabled sales from zero-price sales and preserve stock on save failure and overflow',()=>{
 const r=game();r.run('state.gems[0]=3;');const gold=r.run('state.gold');assert.equal(r.run('sellCatalogueGem(0,1)'),false);
 apply(r,[{kind:'gem',key:'0',iconType:'auto',sellPrice:17,saleEnabled:true,displayName:'紅色技能石'}]);assert.match(r.run('accountGemsView()'),/紅色技能石/);assert.equal(r.run('sellCatalogueGem(0,2)'),true);assert.equal(r.run('state.gems[0]'),1);assert.equal(r.run('state.gold'),gold+34);
 r.run('globalThis.originalSave=save;save=()=>false;');assert.equal(r.run('sellCatalogueGem(0,1)'),false);assert.equal(r.run('state.gems[0]'),1);assert.equal(r.run('state.gold'),gold+34);r.run('save=originalSave;state.gold=1e12;');assert.equal(r.run('sellCatalogueGem(0,1)'),false);assert.equal(r.run('state.gems[0]'),1);
});
test('ore and dust can be bought and consumed in alchemy using shared resource stock and survive reload',()=>{
 const r=game();apply(r,[],d=>{d.lifeSkills.materialBuyPrices.鍛鐵=2;d.lifeSkills.materialBuyPrices.粉塵=3;d.lifeSkills.recipes.mix={name:'資源配方',inputs:[['鍛鐵',2],['粉塵',1],['黏稠凝膠',1],['紅色草泥',1]],output:'試驗合金',outputType:'material',periodMs:1000,chance:1,quantity:1};});
 const oldOre=r.run('state.ore');assert.equal(r.run('buyLifeMaterial("鍛鐵",2)'),true);assert.equal(r.run('state.ore'),oldOre+2);assert.equal(r.run('Object.hasOwn(state.materials,"鍛鐵")'),false);
 r.run('state.ore=4;state.dust=2;state.materials["黏稠凝膠"]=2;state.materials["紅色草泥"]=2;startLifeWork("mix");');r.advance(1000);r.run('tickLifeSkills();');assert.equal(r.run('state.ore'),2);assert.equal(r.run('state.dust'),1);assert.equal(r.run('materialCount("試驗合金")'),1);
 const saved=Object.fromEntries(r.values),reload=loadRuntime(root,'index.html',saved);assert.equal(reload.run('party.members[0].ore'),2);assert.equal(reload.run('party.members[0].dust'),1);assert.equal(reload.run('party.members[0].materials["試驗合金"]'),1);assert.deepEqual(r.errors,[]);
});
test('invalid metadata, dangling salvage item references and incompatible values reject before replacing data',()=>{
 const r=game(),before=r.run('JSON.stringify(exportableBalance())');for(const patch of [{sellPrice:-1},{saleEnabled:'yes'},{categoryPath:['素材']},{tags:Array(21).fill('x')},{salvageRewards:[{type:'item',key:'missing',quantity:1}]},{salvageRewards:[{type:'material',key:'__proto__',quantity:1}]}]){assert.throws(()=>apply(r,[{kind:'equipment',key:'form:0:0:0',iconType:'auto',...patch}]));assert.equal(r.run('JSON.stringify(exportableBalance())'),before);}
});
