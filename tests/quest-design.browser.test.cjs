const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime,openEditorSection}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editor=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
const field=async(page,key,value)=>{const el=page.locator('[data-quest-field="'+key+'"]');await el.fill(String(value));await el.dispatchEvent('change');};

test('real daily and side design forms export/import into the journal, complete chained quests, and retain daily claims after reload',async()=>{
 const e=await openRuntime(editor,'balance-editor.html'),g=await openRuntime(root,'index.html',{}, {pathname:'/DreamingAbyss/preview/',clockTime:new Date('2026-10-12T15:59:59Z')});
 try{
  await openEditorSection(e.page,'dailyQuests');await e.page.locator('#questAdd').click();
  await field(e.page,'title','每日煉金補給');await field(e.page,'description','交付紅色草及簡易治療藥水。');await field(e.page,'rewards.gold',50);
  let dailyId=await e.page.locator('[data-quest-field="id"]').inputValue();
  const quantity=e.page.locator('[data-objective="0"][data-objective-key="quantity"]');await quantity.fill('3');await quantity.dispatchEvent('change');
  await e.page.locator('#questAddObjective').click();await e.page.locator('[data-objective="1"][data-objective-key="type"]').selectOption('potion');await e.page.locator('[data-objective="1"][data-objective-key="quantity"]').fill('2');await e.page.locator('[data-objective="1"][data-objective-key="quantity"]').dispatchEvent('change');
  await e.page.locator('#questCopy').click();const copyId=await e.page.locator('[data-quest-field="id"]').inputValue();assert.notEqual(copyId,dailyId);e.page.once('dialog',async d=>d.accept());await e.page.locator('#questDelete').click();await e.page.locator('[data-select-quest="'+dailyId+'"]').click();
  await openEditorSection(e.page,'sideQuests');await e.page.locator('#questAdd').click();await field(e.page,'title','營地的回信');await field(e.page,'description','獵人完成披肩後，希望你送來草藥。');await field(e.page,'rewards.gold',33);await field(e.page,'rewards.gemCounts.0',1);
  const sideId=await e.page.locator('[data-quest-field="id"]').inputValue();await e.page.locator('details').filter({hasText:'前置支線'}).locator('summary').click();await e.page.locator('[data-quest-prerequisite="wolves"]').check();
  await e.page.locator('#questAddObjective').click();await e.page.locator('[data-objective="1"][data-objective-key="type"]').selectOption('totalKills');await e.page.locator('[data-objective="1"][data-objective-key="quantity"]').fill('2');await e.page.locator('[data-objective="1"][data-objective-key="quantity"]').dispatchEvent('change');
  await e.page.evaluate(id=>{data.balanceSettings.quests.design.daily.entries=data.balanceSettings.quests.design.daily.entries.filter(q=>q.id===id);data.balanceSettings.quests.design.daily.materialRewards=[{key:'小蟲',min:1,max:1}];markDirty();},dailyId);
  assert.deepEqual(await e.page.evaluate(()=>validateData()),[]);
  const downloadPromise=e.page.waitForEvent('download');await e.page.locator('#exportBtn').click();const download=await downloadPromise,buffer=fs.readFileSync(await download.path()),doc=JSON.parse(buffer);assert.equal(doc.balanceSettings.quests.design.daily.entries[0].objectives.length,2);
  await g.page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('options');});
  await require('./runtime.cjs').importBalanceFile(g.page,'quest-design.json',buffer);await g.page.waitForFunction(()=>GAMEPLAY_SETTINGS.quests.design.daily.entries.length===1);await g.page.clock.runFor(1);await g.page.evaluate(()=>closeModal());
  await g.page.clock.setSystemTime(new Date('2026-10-12T16:00:01Z'));await g.page.evaluate(()=>{closeModal();ensureBoard();setTab('quests');});
  const daily=g.page.locator('.quest-design-card').filter({has:g.page.getByRole('heading',{name:'每日煉金補給',exact:true})});assert.equal(await daily.locator('.quest-objectives li').count(),2);
  await g.page.evaluate(()=>{state.materials['紅色草']=3;setHealPotionCount('heal_small',2);state.totalKills=2;render();});const before=await g.page.evaluate(()=>state.gold);await daily.getByRole('button',{name:'開始任務',exact:true}).click();await g.page.clock.runFor(1);await daily.getByRole('button',{name:'交付並領獎',exact:true}).click();await g.page.clock.runFor(1);await g.page.evaluate(()=>closeModal());assert.equal(await g.page.evaluate(()=>state.gold),before+50);assert.equal(await g.page.evaluate(()=>state.materials['紅色草']),0);assert.equal(await g.page.evaluate(()=>healPotionCount('heal_small')),0);
  await g.page.evaluate(()=>openStory('','side'));await g.page.getByRole('button',{name:/^未解鎖 /}).click();await g.page.clock.runFor(1);const side=g.page.locator('.quest-design-card').filter({has:g.page.getByRole('heading',{name:'營地的回信',exact:true})});assert.match(await side.innerText(),/前置支線：縫補獵人的披肩/);assert(await side.getByRole('button',{name:'尚未解鎖'}).isDisabled());
  await g.page.evaluate(()=>{state.materials['完整狼牙']=5;render();});await g.page.getByRole('button',{name:/^可進行 /}).click();await g.page.clock.runFor(1);await g.page.locator('.quest-design-card').filter({has:g.page.getByRole('heading',{name:'縫補獵人的披肩'})}).getByRole('button',{name:'完成並領獎'}).click();await g.page.clock.runFor(1);await g.page.evaluate(()=>{state.materials['紅色草']=1;render();});await side.getByRole('button',{name:'完成並領獎'}).click();await g.page.clock.runFor(1);assert(await g.page.evaluate(id=>state.claimed.includes(id),sideId));
  await g.page.reload();await g.page.evaluate(()=>{continueFromTitle();closeModal();clearInterval(timer);setTab('quests');});assert.equal(await g.page.evaluate(()=>state.board.tasks[0].done),true);assert(await g.page.evaluate(id=>state.claimed.includes(id),sideId));assert.deepEqual(e.errors,[]);assert.deepEqual(g.errors,[]);
 }finally{await e.browser.close();await g.browser.close();}
});

test('designer layouts fit desktop and mobile, preserve draft edits, block deleting referenced side quests, and hide retired board controls',async()=>{
 const e=await openRuntime(editor,'balance-editor.html');
 try{
  await openEditorSection(e.page,'sideQuests');await e.page.locator('#questAdd').click();await field(e.page,'title','版面測試支線');const id=await e.page.locator('[data-quest-field="id"]').inputValue();await e.page.locator('details').filter({hasText:'前置支線'}).locator('summary').click();await e.page.locator('[data-quest-prerequisite="wolves"]').check();
  await e.page.locator('[data-select-quest="wolves"]').click();let message='';e.page.once('dialog',async d=>{message=d.message();await d.accept();});await e.page.locator('#questDelete').click();assert.match(message,/仍被引用/);assert(await e.page.evaluate(()=>data.balanceSettings.quests.design.side.some(q=>q.id==='wolves')));
  await e.page.locator('[data-select-quest="'+id+'"]').click();await e.page.locator('#cacheBtn').click();await e.page.reload();await openEditorSection(e.page,'sideQuests');await e.page.locator('[data-select-quest="'+id+'"]').click();assert.equal(await e.page.locator('[data-quest-field="title"]').inputValue(),'版面測試支線');
  for(const section of ['dailyQuests','sideQuests'])for(const width of [1440,390]){await e.page.setViewportSize({width,height:900});await openEditorSection(e.page,section);const fit=await e.page.locator('.quest-editor-detail').evaluate(el=>el.scrollWidth<=el.clientWidth+1);assert(fit,section+' @ '+width);const invalid=await e.page.locator('#app').innerText();assert.doesNotMatch(invalid,/undefined|NaN/);}
  await e.page.setViewportSize({width:1440,height:900});await openEditorSection(e.page,'balanceSettings:quests');assert.equal(await e.page.locator('[data-path^="balanceSettings.quests.board."]').count(),0);assert.equal(await e.page.locator('[data-path^="balanceSettings.quests.repeat."]').count(),0);assert.equal(await e.page.locator('[data-path^="balanceSettings.quests.design."]').count(),0);assert.deepEqual(e.errors,[]);
 }finally{await e.browser.close();}
});
