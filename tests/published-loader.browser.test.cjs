const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));
const modules=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/data-balance-src="([^"]+)"/g)].map(x=>x[1].split('?')[0]);

test('all modules download ahead of the first execution; execution order and published settings remain exact',async()=>{
  const r=await openRuntime(root);
  let releaseFirst;const firstGate=new Promise(resolve=>releaseFirst=resolve),started=new Set();
  let allStarted;const downloadsStarted=new Promise(resolve=>allStarted=resolve);
  try{
    await r.page.addInitScript(()=>{globalThis.__bootOrder=[];});
    await r.page.route('http://localhost/js/**',async route=>{
      const url=new URL(route.request().url()),file=url.pathname.slice(1);
      if(!url.searchParams.has('balance-build'))return route.fallback();
      started.add(file);if(started.size===modules.length)allStarted();
      if(file===modules[0])await firstGate;
      return route.fulfill({contentType:'text/javascript',body:'globalThis.__bootOrder.push('+JSON.stringify(file)+');\n'+fs.readFileSync(path.join(root,file),'utf8')});
    });
    const reload=r.page.reload();
    await Promise.race([downloadsStarted,new Promise((_,reject)=>setTimeout(()=>reject(Error('downloads did not overlap')),10000))]);
    assert.deepEqual(await r.page.evaluate(()=>globalThis.__bootOrder),[]);
    assert.equal(await r.page.getByRole('progressbar',{name:'遊戲載入進度'}).isVisible(),true);
    assert.match(await r.page.locator('[data-boot-count]').innerText(),new RegExp('已下載.*已初始化 0／'+modules.length));
    releaseFirst();await reload;
    assert.deepEqual(await r.page.evaluate(()=>globalThis.__bootOrder),modules);
    assert.deepEqual(await r.page.evaluate(()=>globalThis.__EMBERWILD_PUBLISHED_BALANCE),published,'canonical downloaded balance JSON remains unchanged');
    assert.equal(await r.page.evaluate(()=>exportableBalance().schema),published.schema);
    assert.equal(await r.page.evaluate(()=>globalThis.__EMBERWILD_BALANCE_MODULES?.state),'verified','modules listed by data/balance/manifest.json match the integrated file hash');
    assert.equal(await r.page.getByRole('progressbar',{name:'遊戲載入進度'}).count(),0);
    await r.page.evaluate(()=>{selectSaveSlot(1);start(1);closeModal();save();});
    await r.page.reload();
    assert.equal(await r.page.evaluate(()=>packParty().members[0].job),1);
    assert.deepEqual(r.errors,[]);
  }finally{releaseFirst();await r.browser.close();}
});

test('a failed download shows retry, never executes later modules, and preserves saved bytes',async()=>{
  const r=await openRuntime(root);
  try{
    await r.page.evaluate(()=>localStorage.setItem('emberwild-save-probe','preserve-this'));
    await r.page.route('http://localhost/js/balance/progression-model.js?*',route=>route.fulfill({status:404,body:'missing'}));
    await r.page.reload();
    assert.match(await r.page.locator('#app').innerText(),/遊戲資料載入失敗.*下載失敗/s);
    assert.equal(await r.page.getByRole('button',{name:'重新載入',exact:true}).isVisible(),true);
    assert.equal(await r.page.evaluate(()=>typeof selectSaveSlot),'undefined');
    assert.equal(await r.page.evaluate(()=>localStorage.getItem('emberwild-save-probe')),'preserve-this');
    assert.equal(await r.page.locator('link[rel="preload"][as="script"]').count(),0);
  }finally{await r.browser.close();}
});

test('a downloaded module throwing during execution stops boot instead of reporting ready',async()=>{
  const r=await openRuntime(root);
  try{
    await r.page.route('http://localhost/js/balance/progression-model.js?*',route=>route.fulfill({contentType:'text/javascript',body:'throw Error("boot execution probe");'}));
    await r.page.reload();
    assert.match(await r.page.locator('#app').innerText(),/模組執行失敗.*boot execution probe/);
    assert.equal(await r.page.evaluate(()=>globalThis.__EMBERWILD_BALANCE_READY===true),false);
    assert.equal(await r.page.evaluate(()=>typeof selectSaveSlot),'undefined');
  }finally{await r.browser.close();}
});


test('a failed battle stylesheet is retried before boot; elite gems stay hidden and event labels stay positioned',async()=>{
  const r=await openRuntime(root);let requests=0;
  try{
    // Use a cold URL: Blink may retain a parsed sheet from the initial successful boot.
    await r.page.route('http://localhost/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/css\/battle-summary\.css\?[^"]+/, 'css/battle-summary.css?v=retry-probe')}));
    await r.page.route('http://localhost/css/battle-summary.css?*',route=>{
      requests++;return requests===1?route.fulfill({status:503,body:'temporary failure'}):route.fallback();
    });
    await r.page.reload();assert.equal(requests,2);assert.equal(await r.page.evaluate(()=>emberwildBootComplete),true);
    await r.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('battle');});
    const read=()=>r.page.locator('#battleAllyIcons .battle-enemy-icon').evaluate(n=>{
      const art=n.querySelector('.enemy-icon-art'),r=n.getBoundingClientRect(),a=art.getBoundingClientRect();
      return {elite:getComputedStyle(n.querySelector('.enemy-icon-elite')).display,event:getComputedStyle(n.querySelector('.enemy-icon-event')).position,dx:Math.abs(r.x+r.width/2-a.x-a.width/2),dy:Math.abs(r.y+r.height/2-a.y-a.height/2)};
    });
    for(const size of [{width:1280,height:900},{width:797,height:600},{width:390,height:844}]){
      await r.page.setViewportSize(size);const value=await read();assert.equal(value.elite,'none');assert.equal(value.event,'absolute');assert(value.dx<1&&value.dy<1,JSON.stringify(value));
    }
  }finally{await r.browser.close();}
});
test('persistent battle CSS failure shows reload instead of unpositioned effects',async()=>{
  const r=await openRuntime(root);
  try{
    await r.page.evaluate(()=>localStorage.setItem('emberwild-save-probe','preserve-this'));
    await r.page.route('http://localhost/',route=>route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/css\/battle-effects\.css\?[^"]+/, 'css/battle-effects.css?v=failure-probe')}));
    await r.page.route('http://localhost/css/battle-effects.css?*',route=>route.fulfill({status:503,body:'unavailable'}));
    await r.page.reload();assert.match(await r.page.locator('#app').innerText(),/戰鬥樣式載入失敗：battle-effects.css/);
    assert.equal(await r.page.evaluate(()=>globalThis.__EMBERWILD_BALANCE_READY===true),false);
    assert.equal(await r.page.evaluate(()=>localStorage.getItem('emberwild-save-probe')),'preserve-this');
    assert.equal(await r.page.getByRole('button',{name:'重新載入',exact:true}).isVisible(),true);
  }finally{await r.browser.close();}
});
