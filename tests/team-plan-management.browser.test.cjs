const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
test('Chromium: removed copy, native plan warnings, first-plan protection, class gate and reload through actual controls',async()=>{
 const g=await openRuntime(root),p=g.page;p.setDefaultTimeout(10000);
 try{
  for(const text of ['向荒野出發','遠征者手札','純文字遠征手札'])assert(!await p.locator('body').textContent().then(s=>s.includes(text)));
  assert.equal(await p.locator('header .chapter').count(),0);
  await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();setTab('roster');});
  await p.waitForTimeout(50);await p.evaluate(()=>closeModal());
  const card=i=>p.locator('.team-plan-card').nth(i);
  assert(await card(0).getByRole('button',{name:'刪除方案',exact:true}).isDisabled());
  await p.getByRole('button',{name:'新增空白隊伍',exact:true}).click();
  // Plan blocks collapse; the plan in use starts expanded and other plans open from their summary.
  assert.equal(await card(0).evaluate(e=>e.open),true);assert.equal(await card(1).evaluate(e=>e.open),false);
  await card(1).locator('summary').click();
  await card(1).getByRole('button',{name:'切換',exact:true}).click();
  const start=p.locator('#globalBattleJournal button[onclick="toggleBattle()"]');
  assert(await start.isDisabled());
  await p.evaluate(()=>refreshGlobalJournal());
  assert(await start.isDisabled());
  await p.getByLabel('本隊主角職業',{exact:true}).selectOption('1');assert(!await start.isDisabled());
  let warning='';p.once('dialog',async d=>{warning=d.message();await d.dismiss();});
  await card(1).getByRole('button',{name:'清空配置',exact:true}).click();assert(warning.includes('隊伍 2')&&warning.includes('無法復原'));
  assert.equal(await p.evaluate(()=>__EMBERWILD_TEAMS.plan().job),1);
  p.once('dialog',d=>d.accept());await card(1).getByRole('button',{name:'清空配置',exact:true}).click();
  assert.equal(await p.evaluate(()=>__EMBERWILD_TEAMS.plan().job),null);assert(await start.isDisabled());
  await p.getByLabel('本隊主角職業',{exact:true}).selectOption('1');
  p.once('dialog',d=>d.dismiss());await card(1).getByRole('button',{name:'刪除方案',exact:true}).click();assert.equal(await card(1).count(),1);
  p.once('dialog',d=>d.accept());await card(1).getByRole('button',{name:'刪除方案',exact:true}).click();
  await p.waitForFunction(()=>document.querySelectorAll('.team-plan-card').length===1);
  assert.equal(await p.locator('.team-plan-card').count(),1);assert.equal(await p.evaluate(()=>party.buildSystem.activeId),'team-1');
  await start.click();await p.evaluate(()=>setTab('roster'));
  assert(await card(0).getByRole('button',{name:'清空配置',exact:true}).isDisabled());
  await p.evaluate(()=>{stopTeamExploration();setTab('roster');});
  p.once('dialog',d=>d.accept());await card(0).getByRole('button',{name:'清空配置',exact:true}).click();assert(await start.isDisabled());
  const expected=await p.evaluate(()=>packParty().buildSystem);
  await p.reload();assert.deepEqual(await p.evaluate(()=>party.buildSystem),expected);
  await p.evaluate(()=>{continueFromTitle();clearInterval(timer);closeModal();setTab('roster');});assert(await start.isDisabled());
  await p.setViewportSize({width:390,height:844});
  assert(await card(0).getByRole('button',{name:'清空配置',exact:true}).isVisible());
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
