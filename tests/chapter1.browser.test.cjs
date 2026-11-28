const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
test('optional caravan starts by clicking the mission and summaries stop at choices',async()=>{
 const g=await openRuntime(root),p=g.page;try{
  await p.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);__EMBERWILD_PROLOGUE.migrate();render();});
  assert.equal(await p.locator('#prologue-layer').isVisible(),false);
  await p.evaluate(()=>openStory('','main'));await p.locator('.story-card').filter({hasText:'商隊事件'}).getByRole('button',{name:'閱讀劇情',exact:true}).click();
  await p.waitForSelector('[data-story-summary]');await p.click('[data-story-summary]');await p.waitForSelector('.story-window-choices');
  assert.equal(await p.locator('.story-window-choices button').count(),3);assert.match(await p.locator('[data-story-scroll]').innerText(),/劇情摘要/);
  await p.locator('.story-window-choices button').first().click();await p.evaluate(()=>{storyWindowSpeed('instant');});
  await p.waitForFunction(()=>party.story.quests.chapter1.current==='ambush_fight');
  assert.equal(await p.evaluate(()=>__EMBERWILD_CHAPTER.gated()),false);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
