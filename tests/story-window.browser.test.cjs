// v0.142: the story window in a real browser: floating layout over the game, text reveal, speed, fast-forward and skip.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const box=(page,sel)=>page.locator(sel).first().evaluate(n=>{const r=n.getBoundingClientRect();return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,width:r.width,height:r.height};});
const typed=page=>page.locator('[data-story-text]').evaluate(n=>({state:n.dataset.typed,on:n.querySelectorAll('.story-char.on').length,all:n.querySelectorAll('.story-char').length,label:n.getAttribute('aria-label')}));
async function quest(page){await page.evaluate(()=>{selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('story');});}
const long='這是一段很長的劇情文字，用來確認視窗內部捲動。'.repeat(60);
async function withLine(page,text){await page.evaluate(text=>{const d=exportableBalance(),q=d.story.quests.find(q=>q.id==='two_regions');q.stages[0].dialogue=[{speaker:'巡查員',kind:'npc',text},{speaker:'巡查員',kind:'npc',text:'第二句。'}];applyBalanceConfig(d,{persist:false});readStory('two_regions');},text);await page.waitForSelector('.story-window');
 // Let the short entry animation of the window settle before anything is measured.
 await page.waitForFunction(()=>document.querySelector('.story-window').getAnimations().every(a=>a.playState==='finished'));}

test('the window floats over the game area: sized, centred, masked, and long text scrolls inside it',async()=>{
 for(const [w,h,maxW,minW,maxH] of [[1280,800,.66,.5,.8],[390,780,.95,.89,.86],[780,390,.95,.5,.93]]){
  const g=await openRuntime(root),page=g.page;try{
   await page.setViewportSize({width:w,height:h});await quest(page);await page.evaluate(()=>storyWindowSpeed('instant'));await withLine(page,long);
   const app=await box(page,'#app'),win=await box(page,'.story-window'),mask=await box(page,'.story-window-mask'),label=w+'x'+h;
   assert(win.width<=760+1&&win.width/app.width<=maxW&&win.width/app.width>=Math.min(minW,760/app.width-.01),label+' width '+win.width+'/'+app.width);
   assert(win.height<=app.height*maxH+1,label+' height '+win.height+'/'+app.height);
   assert(win.top>=app.top&&win.bottom<=app.bottom+1&&win.left>=app.left&&win.right<=app.right+1,label+' stays inside the game area');
   assert(Math.abs((win.left+win.right)/2-(app.left+app.right)/2)<=2&&Math.abs((win.top+win.bottom)/2-(app.top+app.bottom)/2)<=2,label+' centred');
   assert(Math.abs(mask.top-app.top)<=1&&Math.abs(mask.height-app.height)<=1&&Math.abs(mask.width-app.width)<=1,label+' the mask covers the game area only');
   const s=await page.evaluate(()=>{const b=document.querySelector('[data-story-scroll]'),m=getComputedStyle(document.querySelector('.story-window-mask')).backgroundColor,c=document.querySelector('.story-window-controls').getBoundingClientRect(),w=document.querySelector('.story-window').getBoundingClientRect();return {scrolls:b.scrollHeight>b.clientHeight+50,page:document.documentElement.scrollHeight<=innerHeight+1&&document.documentElement.scrollWidth<=innerWidth+1,mask:m,controls:c.bottom<=w.bottom+1&&c.top>=w.top,buttons:[...document.querySelectorAll('.story-window-controls button,.story-window-controls select')].every(x=>{const r=x.getBoundingClientRect();return r.height>=36&&r.left>=0&&r.right<=innerWidth+1;}),layout:!!document.querySelector('.layout')&&getComputedStyle(document.querySelector('.layout')).visibility==='visible'};});
   assert(s.scrolls,label+' long text scrolls inside the window');assert(s.page,label+' the page itself does not scroll');assert.match(s.mask,/rgba\(\d+, \d+, \d+, 0\.\d+\)/,label+' the mask is translucent');assert(s.controls&&s.buttons,label+' controls stay at the bottom and are touchable');assert(s.layout,label+' the game stays behind the window');
   // Background controls cannot be pressed through the mask, and a click outside does not close the dialogue.
   assert.equal(await page.evaluate(()=>{const b=document.querySelector('.layout button');const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit?.closest('#prologue-layer');}),true,label);
   await page.mouse.click(app.left+3,app.top+3);assert.equal(await page.locator('.story-window').count(),1,label+' clicking outside keeps the window');
   await page.click('button:has-text("結束對話")');assert.equal(await page.locator('.story-window').count(),0);assert.equal(await page.locator('#prologue-layer').isVisible(),false);
   await page.locator('.layout button').first().click({trial:true});
   assert.deepEqual(g.errors,[]);
  }finally{await g.browser.close();}
 }
});

test('text is revealed grapheme by grapheme without resizing; show-all finishes the line only; speeds apply',async()=>{
 const g=await openRuntime(root),page=g.page;try{
  await page.setViewportSize({width:1280,height:800});await quest(page);
  const sample='你好，世界！Hello 👨‍👩‍👧 é̃ 🇹🇼。'+'很長的句子。'.repeat(12);
  await page.evaluate(()=>storyWindowSpeed('slow'));await withLine(page,sample);
  const expected=await page.evaluate(t=>[...new Intl.Segmenter('zh-Hant',{granularity:'grapheme'}).segment(t)].map(x=>x.segment),sample);
  assert.deepEqual(await page.locator('.story-char').evaluateAll(ns=>ns.map(n=>n.textContent)),expected,'family emoji, combining marks and flags are not split');
  const before=await box(page,'.story-window');await page.waitForTimeout(350);let t=await typed(page);
  assert.equal(t.state,'running');assert(t.on>0&&t.on<t.all,'partly shown: '+t.on+'/'+t.all);assert.equal(t.label,sample,'the full line is available to assistive technology at once');
  assert.deepEqual(await box(page,'.story-window'),before,'revealing characters does not change the window size');
  assert.equal(await page.locator('.story-char.on').last().evaluate(n=>getComputedStyle(n).animationName),'story-char-in');
  await page.click('[data-story-all]');t=await typed(page);assert.equal(t.state,'done');assert.equal(t.on,t.all);
  assert.equal(await page.locator('[data-story-text]').getAttribute('aria-label'),sample,'show-all does not move to the next line');assert.equal(await page.locator('[data-story-all]').isDisabled(),true);
  await page.click('[data-story-continue]');assert.equal((await typed(page)).label,'第二句。');
  // Continue while typing completes the line first; clicking the text does the same.
  await page.evaluate(()=>endStoryDialogue());await withLine(page,sample);await page.click('[data-story-continue]');t=await typed(page);assert.equal(t.label,sample);assert.equal(t.state,'done');
  await page.evaluate(()=>endStoryDialogue());await withLine(page,sample);await page.click('[data-story-text]');assert.equal((await typed(page)).state,'done');assert.equal((await typed(page)).label,sample);
  // Faster settings show more in the same time; instant shows everything.
  const shown=async speed=>{await page.evaluate(()=>endStoryDialogue());await page.selectOption('.options-none,[data-story-speed]',speed).catch(()=>{});await page.evaluate(s=>storyWindowSpeed(s),speed);await withLine(page,sample);await page.waitForTimeout(300);return (await typed(page)).on;};
  const slow=await shown('slow'),normal=await shown('normal'),fast=await shown('fast'),instant=await shown('instant');
  assert(slow<normal&&normal<fast,'slow '+slow+' < normal '+normal+' < fast '+fast);assert.equal(instant,expected.length);
  assert.equal(await page.evaluate(()=>localStorage.getItem('emberwild-story-text-speed')),'instant');
  await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>{endStoryDialogue();storyWindowSpeed('normal');});await withLine(page,sample);await page.waitForTimeout(150);
  assert.equal(await page.locator('.story-char.on').first().evaluate(n=>getComputedStyle(n).animationName),'none','no fade when reduced motion is preferred');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('long lines follow the text while it appears, unless the reader has scrolled up',async()=>{
 const g=await openRuntime(root),page=g.page;try{
  await page.setViewportSize({width:390,height:780});await quest(page);await page.evaluate(()=>storyWindowSpeed('fast'));await withLine(page,long);
  const top=()=>page.locator('[data-story-scroll]').evaluate(n=>n.scrollTop);
  await page.waitForFunction(()=>document.querySelector('[data-story-scroll]').scrollTop>40,{},{timeout:30000});const a=await top();
  await page.waitForTimeout(600);const b=await top();assert(b>a,'it keeps following: '+a+' -> '+b);
  // The reader scrolls up with the wheel: following stops and the position is left alone while text keeps appearing.
  const area=await box(page,'[data-story-scroll]');await page.mouse.move(area.left+area.width/2,area.top+area.height/2);await page.mouse.wheel(0,-5000);await page.waitForTimeout(300);
  const up=await top(),shownThen=(await typed(page)).on;await page.waitForTimeout(700);
  assert(up<b-20,'the wheel moved the text up: '+b+' -> '+up);assert((await typed(page)).on>shownThen,'text keeps appearing');assert(Math.abs(await top()-up)<=2,'a reader who scrolled up is left alone');
  // Scrolling back down to the newest text resumes following.
  await page.mouse.wheel(0,20000);await page.waitForTimeout(500);
  const newest=()=>page.evaluate(()=>{const b=document.querySelector('[data-story-scroll]').getBoundingClientRect(),on=[...document.querySelectorAll('.story-char.on')].at(-1).getBoundingClientRect();/* smooth scrolling trails the newest character by less than a line */return on.bottom<=b.bottom+32&&on.top>=b.top-2;});
  assert.equal(await newest(),true,'back at the newest text');const c=await top(),shownLater=(await typed(page)).on;await page.waitForTimeout(900);
  assert((await typed(page)).on>shownLater);assert.equal(await newest(),true,'and following it again');assert(await top()>=c,'following resumes: '+c+' -> '+await top());
  await page.click('[data-story-all]').catch(()=>{});await page.click('[data-story-continue]');assert.equal(await top(),0,'the next line starts at the top');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('fast-forward walks plain lines and stops for input; the prologue has no skip; quest dialogue skips after a confirmation',async()=>{
 const g=await openRuntime(root),page=g.page;try{
  await page.setViewportSize({width:1280,height:800});await page.click('.save-slot-select');await page.waitForSelector('.story-window');
  assert.equal(await page.locator('[data-story-skip]').count(),0,'no skip in the prologue');assert.equal(await page.evaluate(()=>storyWindowSkip(true)),false);
  assert.equal(await page.locator('.story-window').evaluate(n=>n.dataset.stage),'creation');
  await page.keyboard.press('Escape');assert.equal(await page.locator('.story-window').count(),1,'Escape does not close or skip it');
  // Shorten the scene so fast-forward reaches the naming step quickly, then check it stops there by itself.
  await page.evaluate(()=>{const d=exportableBalance(),q=d.story.quests.find(q=>q.prologue);q.stages[0].dialogue=q.stages[0].dialogue.slice(0,3);applyBalanceConfig(d,{persist:false});render();});
  await page.click('[data-story-fast]');assert.equal(await page.locator('[data-story-fast]').getAttribute('aria-pressed'),'true');
  const first=await page.locator('[data-story-text]').getAttribute('aria-label');await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-story-text]').getAttribute('aria-label'),first,'each line stays readable for a moment');
  await page.waitForFunction(()=>__EMBERWILD_PROLOGUE.phase()==='action',{},{timeout:20000});
  assert.equal(await page.evaluate(()=>EmberwildStoryWindow.fast),false,'fast-forward ends at the naming step');assert.equal(await page.locator('#prologue-name').isVisible(),true);
  assert.equal(await page.evaluate(()=>__EMBERWILD_PROLOGUE.stage()),'creation','nothing was skipped past the required step');
  // It can be stopped by hand.
  await page.fill('#prologue-name','艾拉');await page.click('button:has-text("就用這個名字")');await page.click('[data-story-fast]');await page.click('[data-story-fast]');
  assert.equal(await page.locator('[data-story-fast]').getAttribute('aria-pressed'),'false');const held=await page.locator('[data-story-text]').getAttribute('aria-label');await page.waitForTimeout(1200);
  assert.equal(await page.locator('[data-story-text]').getAttribute('aria-label'),held,'stopped fast-forward does not advance');
 }finally{await g.browser.close();}
 const q=await openRuntime(root),phone=q.page;try{
  await phone.setViewportSize({width:390,height:780});await quest(phone);await phone.evaluate(()=>readStory('skill_equipment_intro'));await phone.waitForSelector('.story-window');
  const charms=()=>phone.evaluate(()=>playerHero().bag.filter(g=>g.storyRewardKey==='initiation_charm').length),before=await charms();
  await phone.click('[data-story-skip]');assert.equal(await phone.locator('[data-story-skip-confirm]').isVisible(),true,'skip asks first');assert.equal(await charms(),before);
  await phone.click('.story-window-confirm button:has-text("取消")');assert.equal(await phone.locator('[data-story-skip]').count(),1);assert.equal(await phone.locator('.story-window').count(),1);
  await phone.click('[data-story-skip]');await phone.locator('[data-story-skip-confirm]').dblclick().catch(()=>{});
  assert.equal(await phone.locator('.story-window').count(),0,'the window is removed');assert.equal(await charms(),before+1,'the stage reward arrives once, even on a double press');
  assert.deepEqual(await phone.evaluate(()=>party.story.quests.skill_equipment_intro.completed),['equipment_gift']);
  await phone.reload();await phone.waitForSelector('.title-screen');await phone.click('.save-slot-select');await phone.waitForSelector('.layout');
  assert.deepEqual(await phone.evaluate(()=>[party.story.quests.skill_equipment_intro.completed,playerHero().bag.filter(g=>g.storyRewardKey==='initiation_charm').length]),[['equipment_gift'],before+1],'the skipped stage is saved like a finished one');
  assert.deepEqual(q.errors,[]);
 }finally{await q.browser.close();}
});
