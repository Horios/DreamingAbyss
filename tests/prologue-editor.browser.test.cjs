// v0.135: text typed into the balance editor's 序章劇情 page is what a new player reads after the game imports the export.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openRuntime,openEditorSection}=require('./runtime.cjs'),root=path.resolve(__dirname,'..'),editorRoot=path.resolve(process.env.EMBERWILD_BALANCE_ROOT||path.join(root,'../Emberwild-Balance'));
test('editor controls edit, add, reorder and delete prologue lines; the game shows the exported text',{skip:fs.existsSync(path.join(editorRoot,'balance-editor.html'))?false:'Balance editor checkout is not available; set EMBERWILD_BALANCE_ROOT'},async()=>{
 const editor=await openRuntime(editorRoot,'balance-editor.html');let doc;
 try{
  const page=editor.page;await openEditorSection(page,'prologue');
  // A built-in document from before the prologue has no such quest: the page says so and offers the default.
  if(await page.locator('#prologueSeed').count()){assert.match(await page.locator('#app').innerText(),/沒有序章任務/);await page.click('#prologueSeed');}
  assert.equal(await page.locator('[data-pl-scene]').count(),8);assert.match(await page.locator('#app').innerText(),/開發者原文 14 句/);
  const first=page.locator('[data-stage="creation"] .prologue-lines').first();
  await first.locator('.prologue-line textarea').first().fill('平衡器改寫的開場。');await first.locator('.prologue-line textarea').first().dispatchEvent('change');
  const before=await first.locator('.prologue-line').count();
  await first.locator('[data-pl-add]').click();assert.equal(await page.locator('[data-stage="creation"] .prologue-lines').first().locator('.prologue-line').count(),before+1);
  const list=()=>page.locator('[data-stage="creation"] .prologue-lines').first(),last=()=>list().locator('.prologue-line').last();
  await last().locator('textarea').fill('新增的最後一句。');await last().locator('textarea').dispatchEvent('change');
  await last().locator('button:has-text("上移")').click();assert.equal(await list().locator('.prologue-line textarea').nth(before-1).inputValue(),'新增的最後一句。','the new line moved up one place');
  await list().locator('.prologue-line').nth(1).locator('button:has-text("刪除")').click();assert.equal(await list().locator('.prologue-line').count(),before);
  assert.equal(await page.locator('[data-stage="creation"] .prologue-event').innerText(),'系統事件：角色命名（固定）');
  assert.equal(await page.locator('[data-stage="creation"] [data-pl*="action"], [data-stage="creation"] [data-pl*="next"]').count(),0,'system bindings have no control');
  await page.click('[data-pl-scene="3"]');const option=page.locator('.prologue-option-edit input').first();await option.fill('劍士');await option.dispatchEvent('change');
  const hint=page.locator('[data-stage="calling"] textarea[data-pl*="hint"]');await hint.fill('挑一種力量，之後還能轉職。');await hint.dispatchEvent('change');
  assert.match(await page.locator('.prologue-preview').innerText(),/平衡器改寫的開場。[\s\S]*〔系統事件〕角色命名[\s\S]*〔系統事件〕選擇初始職業/,'the preview lists lines and system events in play order');
  const result=await page.evaluate(()=>({issues:validateData().filter(x=>x.includes('序章')),doc:__EMBERWILD_MASTERY_EDITOR.cleanExport()}));
  assert.deepEqual(result.issues,[]);doc=result.doc;assert.deepEqual(editor.errors,[]);
 }finally{await editor.browser.close();}
 const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'});
 try{
  const page=game.page;
  assert.equal(await page.evaluate(async d=>importBalanceJSON({target:{files:[new File([JSON.stringify(d)],'balance.json',{type:'application/json'})],value:''}}),doc),true,'the game accepts the editor export');
  await page.click('.save-slot-select');await page.waitForSelector('.prologue-scene');
  await page.evaluate(()=>storyWindowSpeed('instant'));assert.equal(await page.locator('#prologue-layer [data-story-text]').getAttribute('aria-label'),'平衡器改寫的開場。');
  const seen=[];for(let i=0;i<80&&await page.evaluate(()=>__EMBERWILD_PROLOGUE.phase())==='before';i++){seen.push(await page.locator('#prologue-layer [data-story-text]').getAttribute('aria-label'));await page.click('#prologue-layer [data-story-continue]');}
  assert.equal(seen[0],'平衡器改寫的開場。');assert.equal(seen.at(-2),'新增的最後一句。','the added line plays where the editor placed it');assert(!seen.includes('咚咚，咚咚……'),'the deleted line is gone');
  await page.fill('#prologue-name','艾拉');await page.click('#prologue-layer button:has-text("就用這個名字")');
  for(let i=0;i<40&&await page.evaluate(()=>__EMBERWILD_PROLOGUE.stage()+'/'+__EMBERWILD_PROLOGUE.phase())!=='calling/action';i++)await page.click('#prologue-layer [data-story-continue]');
  assert.equal(await page.locator('.prologue-option b').first().innerText(),'劍士');assert.equal(await page.locator('#prologue-layer .prologue-hint').innerText(),'挑一種力量，之後還能轉職。');
  // The choice still creates the real class: text changed, the system binding did not.
  await page.click('.prologue-option[data-job="0"]');await page.click('#prologue-layer button:has-text("選擇這種力量")');assert.deepEqual(await page.evaluate(()=>[playerHero().job,characterName(playerHero())]),[0,'艾拉']);
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
