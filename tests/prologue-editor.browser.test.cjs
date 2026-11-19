// v0.135: text typed into the balance editor's 序章劇情 page is what a new player reads after the game imports the export.
// v0.173: the onboarding (prologue version 2) shows the goddess's opening on the name screen, the class option texts and
// each stage's task-bar text; those are what the editor edits.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openRuntime,openEditorSection}=require('./runtime.cjs'),root=path.resolve(__dirname,'..'),editorRoot=path.resolve(process.env.EMBERWILD_BALANCE_ROOT||path.join(root,'../Emberwild-Balance'));
test('editor controls edit, add, reorder and delete prologue lines; the game shows the exported text',{skip:fs.existsSync(path.join(editorRoot,'balance-editor.html'))?false:'Balance editor checkout is not available; set EMBERWILD_BALANCE_ROOT'},async()=>{
 const editor=await openRuntime(editorRoot,'balance-editor.html');let doc;
 try{
  const page=editor.page;await openEditorSection(page,'prologue');
  // A built-in document from before the prologue has no such quest: the page says so and offers the default.
  if(await page.locator('#prologueSeed').count()){assert.match(await page.locator('#app').innerText(),/沒有序章任務/);await page.click('#prologueSeed');}
  assert.equal(await page.locator('[data-pl-scene]').count(),0);assert.equal(await page.locator('.prologue-stage').count(),6);
  const list=()=>page.locator('[data-stage="creation"] .prologue-lines').first(),last=()=>list().locator('.prologue-line').last();
  await list().locator('.prologue-line textarea').first().fill('平衡器改寫的開場。');await list().locator('.prologue-line textarea').first().dispatchEvent('change');
  const before=await list().locator('.prologue-line').count();
  await list().locator('[data-pl-add]').click();assert.equal(await list().locator('.prologue-line').count(),before+1);
  await last().locator('textarea').fill('新增的最後一句。');await last().locator('textarea').dispatchEvent('change');
  await last().locator('button:has-text("上移")').click();assert.equal(await list().locator('.prologue-line textarea').nth(before-1).inputValue(),'新增的最後一句。','the new line moved up one place');
  const removed=await list().locator('.prologue-line textarea').nth(1).inputValue();
  await list().locator('.prologue-line').nth(1).locator('button:has-text("刪除")').click();assert.equal(await list().locator('.prologue-line').count(),before);
  assert.equal(await page.locator('[data-stage="creation"] .prologue-event').innerText(),'系統事件：角色命名（固定）');
  assert.equal(await page.locator('[data-stage="practice"] .prologue-event').innerText(),'系統事件：首次探索戰鬥（贏得一場戰鬥）（固定）');
  assert.equal(await page.locator('[data-pl*="action"], [data-pl*="next"], [data-pl*="hint"]').count(),0,'system bindings have no control');
  const option=page.locator('[data-stage="calling"] .prologue-option-edit input').first();await option.fill('劍士');await option.dispatchEvent('change');
  const task=page.locator('[data-stage="gift"] textarea[data-pl*="description"]');await task.fill('打開背包，把武器穿上。');await task.dispatchEvent('change');
  assert.match(await page.locator('.prologue-preview').innerText(),/平衡器改寫的開場。[\s\S]*新增的最後一句。[\s\S]*〔系統事件〕角色命名[\s\S]*〔系統事件〕選擇初始職業/,'the preview lists lines and system events in play order');
  const result=await page.evaluate(()=>({issues:validateData().filter(x=>x.includes('序章')),doc:__EMBERWILD_MASTERY_EDITOR.cleanExport()}));
  assert.deepEqual(result.issues,[]);doc=result.doc;doc.__removed=removed;assert.deepEqual(editor.errors,[]);
 }finally{await editor.browser.close();}
 const removed=doc.__removed;delete doc.__removed;
 const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'});
 try{
  const page=game.page;
  assert.equal(await page.evaluate(async d=>importBalanceJSON({target:{files:[new File([JSON.stringify(d)],'balance.json',{type:'application/json'})],value:''}}),doc),true,'the game accepts the editor export');
  await page.click('.save-slot-select');await page.waitForSelector('#prologue-name');
  const lines=await page.locator('#prologue-layer .prologue-goddess p').allInnerTexts();
  assert.equal(lines[0],'女神：平衡器改寫的開場。');assert.equal(lines.at(-2),'女神：新增的最後一句。','the added line shows where the editor placed it');assert(!lines.some(l=>l.endsWith(removed)),'the deleted line is gone');
  await page.fill('#prologue-name','艾拉');await page.click('#prologue-layer button:has-text("選擇職業")');
  assert.equal(await page.locator('.prologue-option b').first().innerText(),'劍士');
  // The choice still creates the real class: text changed, the system binding did not.
  await page.click('.prologue-option >> nth=0');await page.click('#prologue-layer button:has-text("開始冒險")');assert.deepEqual(await page.evaluate(()=>[playerHero().job,characterName(playerHero())]),[0,'艾拉']);
  await page.waitForSelector('.prologue-task');assert.match(await page.locator('.prologue-task').innerText(),/打開背包，把武器穿上。/);
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
