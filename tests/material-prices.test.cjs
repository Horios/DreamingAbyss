const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=path.resolve(root,'../Emberwild-Balance');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
// 紅色草泥 was retired (6bd46f3); 藥水瓶 is the zero-price crafting ingredient used below.
const prices={'紅色草':0,'小蟲':0,'清水':0,'藥水瓶':0};
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}

test('material sale defaults agree between designer and game; low-tier crafting ingredients sell for 0 gold',()=>{
 const e=loadRuntime(editorRoot,'balance-editor.html'),g=game();
 for(const [key,price] of Object.entries(prices)){
  g.ctx.key=key;e.ctx.key=key;
  assert.equal(g.run('materialSellPrice(key)'),price);
  assert.equal(e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key===key).sellPrice'),price);
 }
 const gold=g.run('state.gold');g.run('state.materials["藥水瓶"]=2;sellMaterial("藥水瓶",2);');
 assert.equal(g.run('state.gold'),gold);assert.equal(g.run('materialCount("藥水瓶")'),0);
});

test('dedicated materials page is navigable; form edits, addition and reset keep other economy prices',()=>{
 const e=loadRuntime(editorRoot,'balance-editor.html');
 assert(e.run('NAV_GROUPS.find(x=>x[0]==="itemsEconomy")[2].includes("materialPrices")'));
 e.run('currentSection="materialPrices";render();');
 assert.match(e.elements.get('nav').innerHTML,/data-sec="materialPrices"/);
 assert.match(e.elements.get('app').innerHTML,/<h1>材料售價<\/h1>/);
 assert.match(e.elements.get('app').innerHTML,/value="藥水瓶"/);
 e.run('currentSection="balanceSettings:economy";render();');
 assert.doesNotMatch(e.elements.get('app').innerHTML,/class="economy-material-price"/);
 e.run('currentSection="materialPrices";render();');
 const i=e.run('data.balanceSettings.economy.materialPrices.findIndex(x=>x.key==="藥水瓶")');
 const keyInput={},priceInput={},deleteButton={},row={dataset:{economyMaterial:String(i)},querySelector:s=>({'.economy-material-key':keyInput,'.economy-material-price':priceInput,'.economy-material-delete':deleteButton}[s])};
 e.elements.get('app').querySelectorAll=s=>s==='[data-economy-material]'?[row]:[];
 e.elements.get('app').querySelector=s=>s.startsWith('#')?e.ctx.document.getElementById(s.slice(1)):null;
 e.run('renderMaterialPrices();');priceInput.onchange({target:{value:'7'}});
 assert.equal(e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="藥水瓶").sellPrice'),7);
 e.elements.get('addMaterialPrice').onclick();
 assert(e.run('data.balanceSettings.economy.materialPrices.some(x=>x.key==="新材料")'));
 const gear=json(e,'data.balanceSettings.economy.equipmentSellPriceByQuality');
 e.elements.get('resetMaterialPrices').onclick();
 assert.equal(e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="藥水瓶").sellPrice'),0);
 assert.deepEqual(json(e,'data.balanceSettings.economy.equipmentSellPriceByQuality'),gear);
 assert.deepEqual(e.errors,[]);
});

test('designer export imports custom material prices into real sale transactions and persists on reload',()=>{
 const e=loadRuntime(editorRoot,'balance-editor.html');
 e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="藥水瓶").sellPrice=7;markDirty();');
 assert.deepEqual(json(e,'validateData()'),[]);
 const doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()'),g=game();
 g.ctx.doc=doc;g.run('applyBalanceConfig(doc,{persist:true});state.materials["藥水瓶"]=3;');
 const gold=g.run('state.gold');g.run('sellMaterial("藥水瓶",3);');assert.equal(g.run('state.gold'),gold+21);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(g.values));
 assert.equal(reload.run('materialSellPrice("藥水瓶")'),7);
 assert.deepEqual(g.errors,[]);assert.deepEqual(reload.errors,[]);
});

test('legacy balance without paste row uses zero-value fallback and does not replace other custom prices',()=>{
 const g=game();g.run('{const d=exportableBalance();d.balanceSettings.economy.materialPrices=d.balanceSettings.economy.materialPrices.filter(x=>x.key!=="藥水瓶");d.balanceSettings.economy.materialPrices.find(x=>x.key==="小蟲").sellPrice=9;applyBalanceConfig(d);}');
 assert.equal(g.run('materialSellPrice("藥水瓶")'),0);assert.equal(g.run('materialSellPrice("小蟲")'),9);
 const e=loadRuntime(editorRoot,'balance-editor.html');e.ctx.doc=json(g,'exportableBalance()');
 e.run('data=doc;markDirty();ensureArrays();');
 assert.equal(e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="藥水瓶").sellPrice'),0);
 assert.equal(e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="小蟲").sellPrice'),9);
});

test('materials page rejects negative prices and duplicate names through existing export validation',()=>{
 const e=loadRuntime(editorRoot,'balance-editor.html');
 e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="藥水瓶").sellPrice=-1;markDirty();');
 assert(json(e,'validateData()').some(x=>x.includes('材料賣價')));
 e.run('data.balanceSettings.economy.materialPrices.find(x=>x.key==="藥水瓶").sellPrice=3;data.balanceSettings.economy.materialPrices.push({key:"藥水瓶",sellPrice:3});markDirty();');
 assert(json(e,'validateData()').some(x=>x.includes('材料賣價')));
});
