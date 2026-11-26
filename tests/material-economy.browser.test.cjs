const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{openRuntime}=require('./runtime.cjs');
for(const [width,height]of [[1366,768],[390,844]])test(`crafting, inventory, BOSS category and reload at ${width}px`,async()=>{
 const r=await openRuntime(path.resolve(__dirname,'..')),p=r.page;
 try{await p.setViewportSize({width,height});await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();state.dust=1000;state.ore=30;setTab('crafting');});
 assert(await p.getByRole('heading',{name:'以太鍛鐵',exact:true}).isVisible());
 assert.equal(await p.locator('main').evaluate(e=>e.scrollWidth-e.clientWidth),0);
 await p.locator('button[onclick="craftEtherIron(1)"]').click();assert.deepEqual(await p.evaluate(()=>[state.dust,state.ore,state.materials['以太鍛鐵']]),[900,27,1]);
 await p.getByRole('button',{name:'最大數量',exact:true}).click();await p.waitForFunction(()=>document.querySelector('input[aria-label="製作數量"]').value==='9');assert.equal(await p.getByRole('spinbutton',{name:'製作數量',exact:true}).inputValue(),'9');
 await p.getByRole('button',{name:'製作 9 次',exact:true}).click();assert.deepEqual(await p.evaluate(()=>[state.dust,state.ore,state.materials['以太鍛鐵']]),[0,0,10]);
 await p.getByRole('button',{name:'BOSS 裝備製作',exact:true}).click();await p.locator('.boss-class-tabs').waitFor({state:'visible'});assert(await p.locator('.boss-class-tabs').isVisible());assert.equal(await p.locator('[data-page="gather"],[data-page="alchemy"],[data-page="bossCraft"]').count(),0);
 await p.reload();await p.waitForFunction(()=>window.emberwildBootComplete===true);await p.evaluate(()=>{continueFromTitle();closeModal();setTab('crafting');});assert.equal(await p.evaluate(()=>state.materials['以太鍛鐵']),10);assert.deepEqual(r.errors,[]);
 }finally{await r.browser.close();}
});
