const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
const balanceRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');

async function gameRuntime(preview=false){
  const runtime=await openRuntime(root);
  if(preview){
    // https: the game needs Web Locks for its save lock, which exist only in secure contexts.
    await runtime.page.route('https://emberwild.test/preview/**',async route=>{
      const pathname=new URL(route.request().url()).pathname.replace(/^\/preview\//,'');
      const file=path.resolve(root,pathname||'index.html');
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
      return route.fulfill({body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
    });
    await runtime.page.goto('https://emberwild.test/preview/',{waitUntil:'load'});
  }
  await runtime.page.evaluate(()=>{selectSaveSlot(1);start(1);closeModal();running=false;state.gold=100000;save();});
  await runtime.page.waitForFunction(()=>document.querySelector('aside nav'));
  await runtime.page.evaluate(()=>{closeModal();});
  return runtime;
}

test('Options, shop pools, transactions and editor JSON use the real loaded modules',async t=>{
  const game=await gameRuntime(),preview=await gameRuntime(true),editor=await openRuntime(balanceRoot,'balance-editor.html');
  try{
    await t.test('Game and editor share the same catalog module and migrated defaults',async()=>{
      const embedded=fs.readFileSync(path.join(balanceRoot,'balance-editor.html'),'utf8').split('<script id="shop-catalog-v2">\n')[1].split('\n</script>')[0];
      // The script tag's closing newline belongs to the HTML; the module file ends with its own newline.
      assert.equal(embedded.trimEnd(),fs.readFileSync(path.join(root,'js/items/shop-catalog.js'),'utf8').trimEnd());
      const actual=await game.page.evaluate(()=>exportableBalance().shopSettings),expected=await editor.page.evaluate(()=>({shop:__EMBERWILD_MASTERY_EDITOR.cleanExport().shopSettings,issues:validateData()}));
      assert.deepEqual(expected.issues,[]);assert.deepEqual(actual,expected.shop);
      assert.equal(actual.randomOffers.entries.find(x=>x.key==='power_tier_reroll').chance,.06);
      assert.equal(actual.fixedOffers.entries.length,19);
      assert.equal(actual.schemaVersion,3);
      assert.equal(actual.fixedOffers.entries.filter(x=>x.enabled&&/^(ward|elementTonic)_/.test(x.key)).length,0);
    });
    await t.test('Options contains account actions; the JSON import is visible only in Preview',async()=>{
      for(const [runtime,hasJSON] of [[game,false],[preview,true]]){
        // Settings (設定) sit at the top right and split into 一般／存檔／其他 tabs: 返回標題 under 存檔, 兌換碼 under 其他.
        await runtime.page.locator('#utilityButton-options').click();
        await runtime.page.waitForSelector('.options-list');
        await runtime.page.locator('.options-tabs button',{hasText:'存檔'}).click();
        assert.equal(await runtime.page.locator('.options-list button').filter({hasText:'返回標題'}).count(),1);
        await runtime.page.locator('.options-tabs button',{hasText:'其他'}).click();
        assert.equal(await runtime.page.locator('.options-list button').filter({hasText:'兌換碼'}).count(),1);
        assert.equal(await runtime.page.locator('#options-test-json-import').count(),0,'balance JSON import lives in the developer mode, not in Settings');
        assert.equal(await runtime.page.locator('aside nav button[onclick="returnToTitle()"] ').count(),0);
        await runtime.page.getByRole('button',{name:'關閉彈窗',exact:true}).click();
        await runtime.page.getByRole('button',{name:'冒險指南',exact:true}).click();
        assert.equal(await runtime.page.locator('main [onclick="showBalanceToolsAccess()"] ').count(),0);
      }
    });
    await t.test('Every product has useful description/effect text and compact rows, including reroll stones',async()=>{
      await game.page.evaluate(()=>{
        const stone=EmberwildShopCatalog.normalizeRule({id:'stone',type:'item',key:'power_tier_reroll',selection:'extra',chance:1,unitPrice:650,description:'重新抽選 T1～T10 強度階級。'},0,true);
        const cfg=exportableBalance();cfg.shopSettings.randomOffers.entries.push(stone);applyBalanceConfig(cfg,{persist:false});closeModal();setTab('shop');
      });
      // Shop rows are item slots: the name sits under the slot and the description and effect show in the hover tooltip.
      const rows=[];
      for(const category of ['life','random','fixed']){
        await game.page.evaluate(category=>setShopCategory(category),category);
        const count=await game.page.locator('.shop-product-row').count();
        for(let i=0;i<count;i++){
          const row=game.page.locator('.shop-product-row').nth(i);await row.locator('.item-slot').first().hover();
          await game.page.waitForFunction(()=>document.getElementById('item-hover-tooltip')?.innerText.trim().length>0);
          rows.push({...await row.evaluate(r=>({height:r.getBoundingClientRect().height,width:r.clientWidth,scrollWidth:r.scrollWidth,name:r.querySelector('.shop-product-label').textContent})),tooltip:await game.page.evaluate(()=>document.getElementById('item-hover-tooltip').innerText)});
          await game.page.mouse.move(0,0);
        }
      }
      assert(rows.length>=16);
      for(const row of rows){const lines=row.tooltip.split('\n').map(x=>x.trim()).filter(Boolean);assert(lines[0].includes(row.name.trim()),JSON.stringify(row));assert(lines.length>=3&&lines[1].length>4,'every product has a description: '+JSON.stringify(row));assert(!/隨機出現|隨機挑選|本批隨機商品/.test(row.tooltip));assert(!/回合/.test(row.tooltip),'durations use seconds: '+row.tooltip);assert(row.height<140,JSON.stringify(row));assert(row.scrollWidth<=row.width+1,JSON.stringify(row));}
      const stone=rows.find(x=>x.name.includes('重鑄'));assert(stone);assert(stone.tooltip.includes('基底'));assert(stone.tooltip.includes('基底評級'));
      assert.equal(await game.page.locator('main button[onclick="showTestCodes()"] ').count(),0);
      await game.page.setViewportSize({width:680,height:850});
      for(const category of ['life','random','fixed']){
        await game.page.evaluate(category=>setShopCategory(category),category);
        const overflow=await game.page.locator('.shop-product-row').evaluateAll(rows=>rows.some(row=>row.scrollWidth>row.clientWidth+1));assert.equal(overflow,false,category);
      }
      await game.page.evaluate(()=>setShopCategory('random'));
      await game.page.setViewportSize({width:1280,height:720});
    });
    await t.test('Fixed and random products credit every resource type and retain item offers after save validation',async()=>{
      const result=await game.page.evaluate(()=>{
        const cfg=exportableBalance();cfg.shopSettings.randomOffers.entries=[];
        cfg.shopSettings.fixedOffers.entries=[['ore','',2],['dust','',3],['gem','0',2],['material','試驗素材',4],['item','ward_fire',2],['item','heal_small',3],['item','power_tier_reroll',1]].map(([type,key,quantity],i)=>({id:'fixed_'+i,enabled:true,type,key,quantity,unitPrice:7,name:'',description:''}));
        applyBalanceConfig(cfg,{persist:false});
        const read=()=>({gold:state.gold,ore:state.ore,dust:state.dust,gem:state.gems[0],material:state.materials['試驗素材']||0,ward:state.consumables.ward_fire||0,heal:healPotionCount('heal_small'),stone:state.consumables.power_tier_reroll||0});
        const before=read(),charges=[];for(let i=0;i<7;i++){const g0=state.gold;buyFixedShopOffer('fixed_'+i);charges.push(g0-state.gold);}const after=read(),healCost=SHOP.find(x=>x.id==='heal_small').cost;
        cfg.shopSettings.randomOffers.offerCount=1;cfg.shopSettings.randomOffers.entries=[{id:'healing',enabled:true,type:'item',key:'heal_small',quantityMin:2,quantityMax:2,unitPrice:5,weight:1}];applyBalanceConfig(cfg,{persist:false});
        const marketHealCost=SHOP.find(x=>x.id==='heal_small').cost,offer=party.market.offers[0],healBefore=healPotionCount('heal_small'),goldBefore=state.gold;buyMarketOffer(offer.id);buyMarketOffer(offer.id);
        const saved=JSON.parse(localStorage.getItem(KEY)),validated=validateParty(saved);
        return {charges,healCost,marketHealCost,before,after,offer,healGain:healPotionCount('heal_small')-healBefore,goldSpent:goldBefore-state.gold,savedOffer:validated.market.offers[0]};
      });
      for(const [key,amount] of Object.entries({ore:2,dust:3,gem:2,material:4,ward:2,heal:3,stone:1}))assert.equal(result.after[key]-result.before[key],amount,key);
      // heal_standard needs VIP 1; healing potions use the rule's unit price like every other offer.
      assert.deepEqual(result.charges,[2*7,3*7,2*7,4*7,2*7,3*7,1*7]);assert.equal(result.before.gold-result.after.gold,result.charges.reduce((a,b)=>a+b,0));assert.equal(result.healGain,2);assert.equal(result.goldSpent,2*5);assert.equal(result.offer.sold,true);assert.equal(result.savedOffer.kind,'item');assert.equal(result.savedOffer.key,'heal_small');assert.equal(result.savedOffer.ruleId,'healing');assert.equal(result.savedOffer.sold,true);
    });
    await t.test('Failed saves roll back gold, inventory and sold flags; stock limits also prevent charges',async()=>{
      const result=await game.page.evaluate(()=>{
        const offer=party.market.offers[0];offer.sold=false;const gold=state.gold,heals=healPotionCount('heal_small'),priorSave=save;save=()=>false;
        try{buyMarketOffer(offer.id);buyFixedShopOffer('fixed_5');}finally{save=priorSave;}
        const rollback={gold:state.gold===gold,heals:healPotionCount('heal_small')===heals,sold:offer.sold===false};
        setHealPotionCount('heal_small',1e9);buyMarketOffer(offer.id);const limits={gold:state.gold===gold,heals:healPotionCount('heal_small')===1e9,sold:offer.sold===false};setHealPotionCount('heal_small',heals);
        return {rollback,limits};
      });assert.deepEqual(result,{rollback:{gold:true,heals:true,sold:true},limits:{gold:true,heals:true,sold:true}});
    });
    await t.test('Preview empty pools remain empty across persistence/reload and preserve existing inventory',async()=>{
      // Preview keeps a design across reloads only through the JSON import.
      const before=await preview.page.evaluate(async()=>{const cfg=exportableBalance();cfg.shopSettings.randomOffers.entries=[];cfg.shopSettings.fixedOffers.entries=[];const stock=state.consumables.ward_fire;if(!await importBalanceJSON({target:{files:[new File([JSON.stringify(cfg)],'balance.json',{type:'application/json'})],value:''}}))throw Error('balance import failed');closeModal();setTab('shop');return {stock,offers:party.market.offers.length,rows:document.querySelectorAll('.shop-product-row').length};});
      assert.equal(before.offers,0);assert.equal(before.rows,0);
      await preview.page.reload();await preview.page.evaluate(()=>{continueFromTitle();setTab('shop');});
      const after=await preview.page.evaluate(()=>({stock:state.consumables.ward_fire,shop:exportableBalance().shopSettings,offers:party.market.offers.length,rows:document.querySelectorAll('.shop-product-row').length}));
      assert.equal(after.stock,before.stock);assert.deepEqual(after.shop.randomOffers.entries,[]);assert.deepEqual(after.shop.fixedOffers.entries,[]);assert.equal(after.offers,0);assert.equal(after.rows,0);
    });
    await t.test('Refresh costs increase per purchase, reset at a new local day, and ignore legacy reroll sources',async()=>{
      const result=await game.page.evaluate(()=>{
        const cfg=exportableBalance();cfg.shopSettings.randomOffers.entries=[{id:'ore_test',type:'ore',key:'',quantityMin:1,quantityMax:1,unitPrice:5}];cfg.shopSettings.randomOffers.refreshBaseCost=20;cfg.shopSettings.randomOffers.refreshCostStep=10;cfg.equipmentPowerSystem.rerollItem.shopChance=1;cfg.equipmentPowerSystem.rerollItem.shopPrice=1;
        applyBalanceConfig(cfg,{persist:false});party.market.refreshCount=0;const gold=state.gold,costs=[currentRefreshCost()];refreshMarket();costs.push(currentRefreshCost());refreshMarket();costs.push(currentRefreshCost());const spent=gold-state.gold;party.market.dayKey='2000-01-01';const reset=currentRefreshCost();
        return {costs,spent,reset,refreshCount:party.market.refreshCount,keys:party.market.offers.map(x=>x.ruleId)};
      });assert.deepEqual(result.costs,[20,30,40]);assert.equal(result.spent,50);assert.equal(result.reset,20);assert.equal(result.refreshCount,0);assert(result.keys.every(x=>x==='ore_test'));
    });
    await t.test('Invalid pool edits are rejected before changing live settings',async()=>{
      const outcomes=await game.page.evaluate(()=>{
        const changes=[cfg=>{cfg.shopSettings.fixedOffers.entries=[{id:'x',type:'item',key:'missing',quantity:1,unitPrice:1}];},cfg=>{cfg.shopSettings.randomOffers.entries[0].quantityMin=0;},cfg=>{cfg.shopSettings.randomOffers.entries[0].type='unsupported';},cfg=>{cfg.shopSettings.randomOffers.entries[0].unitPrice=-1;},cfg=>{cfg.shopSettings.randomOffers.entries.push({...cfg.shopSettings.randomOffers.entries[0]});},cfg=>{cfg.shopSettings.randomOffers.entries[0].chance=2;},cfg=>{cfg.shopSettings.fixedOffers.entries=[{id:'x',type:'material',key:'__proto__',quantity:1,unitPrice:1}];}];
        const before=JSON.stringify(exportableBalance().shopSettings);return changes.map(change=>{const cfg=exportableBalance();change(cfg);let rejected=false;try{applyBalanceConfig(cfg,{persist:false});}catch{rejected=true;}return {rejected,unchanged:JSON.stringify(exportableBalance().shopSettings)===before};});
      });for(const result of outcomes)assert.deepEqual(result,{rejected:true,unchanged:true});
    });
    await t.test('Editor adds, edits and removes both pools, and its exported JSON imports through Options',async()=>{
      await require('./runtime.cjs').openEditorSection(editor.page,'shopSettings');
      const itemCount=await editor.page.evaluate(()=>data.items.length);
      await editor.page.evaluate(()=>{data.shopSettings.randomOffers.entries=[];data.shopSettings.fixedOffers.entries=[];render();});
      await editor.page.getByRole('button',{name:'新增固定商品',exact:true}).click();
      // Shop rules no longer carry descriptions (the item manager owns item text); the rule's 商店顯示名稱 names the offer.
      await editor.page.locator('[data-shop-field="key"]').selectOption('power_tier_reroll');
      await editor.page.locator('[data-shop-field="quantity"]').fill('3');await editor.page.locator('[data-shop-field="quantity"]').blur();
      await editor.page.locator('[data-shop-field="unitPrice"]').fill('9');await editor.page.locator('[data-shop-field="unitPrice"]').blur();
      await editor.page.locator('[data-shop-field="name"]').fill('測試重鑄石');await editor.page.locator('[data-shop-field="name"]').blur();
      await editor.page.getByRole('button',{name:'新增隨機商品',exact:true}).click();
      await editor.page.locator('[data-shop-field="type"]').selectOption('dust');
      await editor.page.locator('[data-shop-field="unitPrice"]').fill('4');await editor.page.locator('[data-shop-field="unitPrice"]').blur();
      const doc=await editor.page.evaluate(()=>__EMBERWILD_MASTERY_EDITOR.cleanExport());
      assert.equal(doc.shopSettings.fixedOffers.entries[0].key,'power_tier_reroll');assert.equal(doc.shopSettings.fixedOffers.entries[0].quantity,3);assert.equal(doc.shopSettings.fixedOffers.entries[0].unitPrice,9);assert.equal(doc.shopSettings.fixedOffers.entries[0].name,'測試重鑄石');assert.equal(doc.shopSettings.randomOffers.entries[0].type,'dust');assert.equal(doc.shopSettings.randomOffers.entries[0].unitPrice,4);
      assert.deepEqual(await editor.page.evaluate(()=>validateData()),[]);
      const downloadPromise=editor.page.waitForEvent('download');await editor.page.getByRole('button',{name:'匯出測試 JSON',exact:true}).click();const download=await downloadPromise;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
      assert.deepEqual(exported.shopSettings,doc.shopSettings);
      await preview.page.evaluate(()=>setTab('options'));
      assert.equal(await require('./runtime.cjs').importBalanceFile(preview.page,'shop-test.json',Buffer.from(JSON.stringify(exported))),true);
      await preview.page.waitForFunction(()=>exportableBalance().shopSettings.fixedOffers.entries[0]?.quantity===3);
      assert.deepEqual(await preview.page.evaluate(()=>exportableBalance().shopSettings),exported.shopSettings);
      await preview.page.evaluate(()=>{setShopCategory('fixed');setTab('shop');});assert.equal(await preview.page.locator('.fixed-shop-row').count(),1);// The rule's 商店顯示名稱 replaces the item name on the slot.
      assert.equal(await preview.page.locator('.fixed-shop-row .item-slot-name').first().innerText(),'測試重鑄石');assert((await preview.page.locator('.fixed-shop-row').innerText()).includes('27 金幣'));
      await editor.page.evaluate(()=>{globalThis.confirmDelete=()=>true;deleteShopRule('random',0);deleteShopRule('fixed',0);});
      const removed=await editor.page.evaluate(()=>({random:data.shopSettings.randomOffers.entries.length,fixed:data.shopSettings.fixedOffers.entries.length,items:data.items.length,issues:validateData()}));assert.deepEqual(removed,{random:0,fixed:0,items:itemCount,issues:[]});
    });
    await t.test('Return to title pauses exploration and preserves the current save',async()=>{
      // 返回標題 sits under the 存檔 tab of the settings dialog.
      await preview.page.evaluate(()=>{running=true;openUtilityPanel('options');setOptionsTab('save');});
      await preview.page.locator('.options-list').getByRole('button',{name:'返回標題',exact:true}).click();await preview.page.waitForSelector('.title-screen');
      assert.equal(await preview.page.evaluate(()=>running),false);assert(await preview.page.evaluate(()=>!!localStorage.getItem(KEY)));assert.equal(await preview.page.locator('#title-test-json-import').count(),0);
    });
    assert.deepEqual(game.errors,[]);assert.deepEqual(preview.errors,[]);assert.deepEqual(editor.errors,[]);
  }finally{await game.browser.close();await preview.browser.close();await editor.browser.close();}
});
