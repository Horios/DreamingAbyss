const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
test('Chromium: effect controls, status classification, reference protection, companion pages and real JSON download/import',async()=>{
 const e=await openRuntime(editorRoot,'balance-editor.html'),g=await openRuntime(root);const p=e.page;p.setDefaultTimeout(10000);let dialogs=[];p.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
 const navigate=async sec=>{const button=p.locator('[data-sec="'+sec+'"]');if(!await button.isVisible())await p.locator('.nav-group').filter({has:button}).locator('summary').click();await button.click();};
 // Skill system v1 replaced the protagonist skill page with the workbench; the common-effect panel lives on companion skill pages.
 const openSkill=()=>p.evaluate(()=>openCompanionSkillPage(data.companions[0].id,'active'));
 const change=async(k,v)=>{const el=p.locator('[data-common-effect="'+k+'"]');if(await el.evaluate(el=>el.tagName==='SELECT'))await el.selectOption(String(v));else{await el.fill(String(v));await el.blur();}};
 try{
  await navigate('statuses');await p.locator('#addStatus').click();await p.locator('#statusName').fill('火焰持續傷害');await p.locator('#statusName').blur();
  await p.locator('[data-status-tag="periodic"]').check();await p.locator('#statusPolarity').selectOption('debuff');await p.locator('#statusDispellable').uncheck();
  const id=await p.evaluate(()=>data.statusDefinitions.find(d=>d.name==='火焰持續傷害').id);
  await p.evaluate(()=>{currentSection='skills';selected.skillTab='active';render();});assert.equal(await p.locator('#app [data-common-effect]').count(),0);
  await openSkill();const {job,idx}=await p.evaluate(()=>({job:selected.skillClass,idx:selected.skill}));
  await change('target','enemies');await change('hitCount',3);await change('powerBasis','targetMaxHp');await change('damageResolution','true');await change('onHitStatusId',id);await change('onHitStatusChance',0);
  await navigate('statuses');const statusCount=await p.evaluate(()=>data.statusDefinitions.length);await p.locator('#delStatus').click();assert(dialogs.at(-1).includes('仍有技能引用'));assert.equal(await p.evaluate(()=>data.statusDefinitions.length),statusCount);
  await openSkill();
  const downloadPromise=p.waitForEvent('download');await p.locator('#exportBtn').click();const download=await downloadPromise,doc=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(doc.classes[job].skills[idx].hitCount,3);assert.equal(doc.classes[job].skills[idx].onHitStatusChance,0);assert.equal(doc.statusDefinitions.find(d=>d.id===id).dispellable,false);
  const out=await g.page.evaluate(doc=>{applyBalanceConfig(doc,{persist:true});return exportableBalance();},doc);assert.equal(out.classes[job].skills[idx].damageResolution,'true');
  await p.locator('[data-key="effect"]').selectOption('revive');assert.equal(await p.locator('[data-common-effect="target"]').inputValue(),'fallen');assert.equal(await p.locator('[data-common-effect="onHitStatusId"]').count(),0);
  await change('target','fallenAllies');await change('reviveHpRatio',.6);assert.equal(await p.evaluate(({job,idx})=>data.classes[job].skills[idx].reviveHpRatio,{job,idx}),.6);
  for(const effect of ['cleanse','dispel','heal','shield','drain']){await p.locator('[data-key="effect"]').selectOption(effect);assert(await p.locator('[data-common-effect="target"]').count());}
  await p.locator('#resetCommonEffects').click();assert.equal(await p.evaluate(({job,idx})=>EmberwildSkillEffects.KEYS.some(k=>data.classes[job].skills[idx][k]!==undefined),{job,idx}),false);
  await p.evaluate(()=>{selected.skillTab='proc';render();});await change('hitCount',2);assert.equal(await p.locator('[data-common-effect="hitCount"]').inputValue(),'2');
  await p.evaluate(()=>openCompanionSkillPage(data.companions[0].id,'active'));assert.equal(await p.locator('#companionSkillContent [data-common-effect="target"]').count(),1);await change('hitCount',4);
  assert.equal(await p.evaluate(()=>data.classes[selected.skillClass].skills[selected.skill].hitCount),4);
  assert.deepEqual(await p.evaluate(()=>validateData()),[]);assert.deepEqual(e.errors,[]);assert.deepEqual(g.errors,[]);
 }finally{await e.browser.close();await g.browser.close();}
});
