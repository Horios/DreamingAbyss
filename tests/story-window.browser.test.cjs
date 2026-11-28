// Scene transcripts: automatic reading, in-window interaction, task boundaries and responsive controls.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),{ADD_TEST_MAP}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const regionFixture=require('./fixtures/story-region-chain.json');
async function quest(page){await page.evaluate(ADD_TEST_MAP);await page.evaluate(q=>{const d=exportableBalance();d.story.quests.push(q);applyBalanceConfig(d,{persist:false});},regionFixture);await page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('story');});}
async function fixture(page,text='第一句。'){
 await page.evaluate(text=>{const d=exportableBalance(),q=d.story.quests.find(q=>q.id==='test_region_chain'),s=q.stages[0];s.conditions.conditions=[];s.dialogue=[{speaker:'巡查員',kind:'npc',text},{speaker:'巡查員',kind:'npc',text:'第二句。'}];s.choices=[{id:'a',text:'選項甲',conditions:{mode:'all',conditions:[]},effects:[],next:s.next,nextQuests:[]},{id:'b',text:'選項乙',conditions:{mode:'all',conditions:[]},effects:[],next:s.next,nextQuests:[]}];applyBalanceConfig(d,{persist:false});readStory('test_region_chain');window.originalStoryWindow=document.querySelector('.story-window');},text);
}
test('lines automatically accumulate and stop at choices in the same mounted window; speed uses the header SVG',async()=>{
 const g=await openRuntime(root),p=g.page;try{
  await quest(p);await fixture(p);assert.equal(await p.locator('[data-story-continue]').count(),0);
  await p.selectOption('.story-window-head [data-story-speed]','instant');
  await p.waitForSelector('.story-window-choices button');
  assert.equal(await p.evaluate(()=>originalStoryWindow===document.querySelector('.story-window')),true);
  assert.match(await p.locator('[data-story-scroll]').innerText(),/第一句。[\s\S]*第二句。[\s\S]*選項甲[\s\S]*選項乙/);
  assert.equal(await p.locator('.story-window-head svg').count(),1);
  assert.equal(await p.locator('.story-window-controls [data-story-speed]').count(),0);
  await p.evaluate(()=>render());assert.equal(await p.locator('[data-story-history]').count(),2,'periodic renders do not duplicate text');
  assert.deepEqual(await p.evaluate(()=>party.story.quests.test_region_chain.completed),[],'no automatic choice');
  await p.click('.story-window-choices button:has-text("選項甲")');
  assert.equal(await p.evaluate(()=>originalStoryWindow===document.querySelector('.story-window')),true,'choice does not close the window');
  assert.equal(await p.evaluate(()=>party.story.quests.test_region_chain.choices[Object.keys(party.story.quests.test_region_chain.choices)[0]]),'a');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('scene text scrolls inside a responsive dialog and the SVG speed control stays reachable',async()=>{
 for(const [width,height] of [[1280,800],[390,780],[780,390]]){
  const g=await openRuntime(root),p=g.page;try{
   await p.setViewportSize({width,height});await quest(p);await p.evaluate(()=>storyWindowSpeed('instant'));await fixture(p,'很長的劇情文字，用來確認視窗內部捲動。'.repeat(60));await p.waitForSelector('.story-window-choices button');
   const b=await p.evaluate(()=>{const w=document.querySelector('.story-window').getBoundingClientRect(),a=document.querySelector('#app').getBoundingClientRect(),s=document.querySelector('[data-story-scroll]'),c=document.querySelector('.story-window-head [data-story-speed]').getBoundingClientRect();return {inside:w.left>=a.left&&w.right<=a.right+1&&w.top>=a.top&&w.bottom<=a.bottom+1,scroll:s.scrollHeight>s.clientHeight+50,speed:c.left>=w.left&&c.right<=w.right&&c.top>=w.top&&c.bottom<=w.bottom,page:document.documentElement.scrollWidth<=innerWidth+1&&document.documentElement.scrollHeight<=innerHeight+1};});
   assert.deepEqual(b,{inside:true,scroll:true,speed:true,page:true});
   await p.locator('[data-story-scroll]').evaluate(n=>n.scrollTop=0);assert.match(await p.locator('[data-story-history]').first().innerText(),/很長的劇情文字/);
   await p.keyboard.press('Escape');assert.equal(await p.locator('.story-window').count(),1);
   await p.click('button:has-text("結束對話")');assert.equal(await p.locator('.story-window').count(),0);assert.deepEqual(g.errors,[]);
  }finally{await g.browser.close();}
 }
});
test('graphemes reveal in order, speed changes apply, and summary skips the scene up to its choice',async()=>{
 const g=await openRuntime(root),p=g.page;try{
  await quest(p);await p.evaluate(()=>storyWindowSpeed('slow'));
  const sample='你好，世界！👨‍👩‍👧 é̃ 🇹🇼。'+'很長的句子。'.repeat(30);await fixture(p,sample);
  const expected=await p.evaluate(t=>[...new Intl.Segmenter('zh-Hant',{granularity:'grapheme'}).segment(t)].map(x=>x.segment),sample);
  assert.deepEqual(await p.locator('.story-char').allTextContents(),expected);
  await p.waitForTimeout(200);const n=await p.locator('.story-char.on').count();assert(n>0&&n<expected.length);
  await p.selectOption('.story-window-head [data-story-speed]','fast');await p.waitForTimeout(250);assert(await p.locator('.story-char.on').count()>n);
  await p.click('[data-story-summary]');await p.waitForSelector('.story-window-choices button');
  assert.match(await p.locator('[data-story-scroll]').innerText(),/劇情摘要/);assert.equal(await p.evaluate(()=>EmberwildStoryWindow.fast),false);
  assert.equal(await p.evaluate(()=>localStorage.getItem('emberwild-story-text-speed')),'fast');assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});


test('dialog position stays fixed while typing and choices appear on desktop and mobile',async()=>{
 for(const [width,height] of [[1280,800],[390,780],[780,390]]){
  const g=await openRuntime(root),p=g.page;try{
   await p.setViewportSize({width,height});await quest(p);await p.evaluate(()=>storyWindowSpeed('slow'));await fixture(p,'劇情文字。'.repeat(80));
   const rect=()=>p.locator('.story-window').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,height:r.height};});
   const before=await rect();await p.waitForTimeout(150);assert.deepEqual(await rect(),before);
   await p.selectOption('[data-story-speed]','instant');await p.waitForSelector('.story-window-choices button');assert.deepEqual(await rect(),before);
   const choice=await p.locator('.story-window-choices').boundingBox(),body=await p.locator('[data-story-scroll]').boundingBox();
   assert(choice.y>=body.y&&choice.y+choice.height<=body.y+body.height+1,'choices stay in the inner scroller');assert.deepEqual(g.errors,[]);
  }finally{await g.browser.close();}
 }
});
