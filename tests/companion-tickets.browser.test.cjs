// v0.178: there is no recruiting page. Companions join by their ticket (夥伴招募券) used from the bag; the caravan story
// hands out 洛恩's and a spotlight guide walks through using it. Skill extraction moved to the forge page.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
const active=page=>page.evaluate(()=>{const a=__EMBERWILD_TUTORIAL.status().active;return a&&{id:a.id,step:a.stepId,target:a.target.state};});
const wait=async(page,step)=>{try{await page.waitForFunction(step=>{const a=__EMBERWILD_TUTORIAL.status().active;return a?.id==='recruit_lorne'&&a.stepId===step&&a.target.state==='found';},step,{timeout:20000});}catch(e){throw Error(`waiting for recruit_lorne:${step}, active ${JSON.stringify(await active(page))}`);}};
async function begin(page){
 await page.setViewportSize({width:1280,height:860});
 await page.click('.save-slot-select');await page.waitForFunction(()=>typeof start==='function');
 await page.evaluate(()=>{start(0);party.tutorials.auto=true;for(const m of __EMBERWILD_TUTORIAL.design.modules)if(m.id!=='recruit_lorne')party.tutorials.records[m.id]={triggered:true,completed:true,skipped:false,step:-1};closeModal();setTab('battle');});
}

test('the caravan ticket brings 洛恩 through a spotlight guide in the bag; there is no recruiting page',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await begin(page);
  assert.equal(await page.evaluate(()=>typeof showCompanionRecruitment),'undefined');
  for(const t of ['roster','partnerRoster']){await page.evaluate(t=>setTab(t),t);assert.equal(await page.locator('main button:has-text("招募夥伴")').count(),0,t+' has no recruit button');}
  // Finishing the caravan story hands out the ticket; 洛恩 is not in the party yet.
  await page.evaluate(()=>{const q=party.story.quests;q.chapter1={current:'together',started:true,done:false,completed:['ambush','ambush_help','ambush_fight','village'],baseline:{},choices:{}};setTab('battle');completeStoryStage('chapter1','','together');});
  assert.equal(await page.evaluate(()=>[!!partyMember(10),companionTicketCount(10)].join()),'false,1');
  await page.waitForSelector('[data-tutorial-notice="recruit_lorne"]');
  await page.evaluate(()=>setTab('equipment'));
  await wait(page,'items');await page.click(`main [onclick="setInventoryCategory('items')"]`);
  await wait(page,'ticket');assert.match(await page.locator('main [data-companion-ticket="10"]').innerText(),/夥伴招募券 - 洛恩/);
  await page.click('main [data-companion-ticket="10"] .item-slot');
  await wait(page,'use');assert.match(await page.locator('#item-detail-dialog').innerText(),/劍術/,'the ticket describes 洛恩');
  await page.click('#item-detail-dialog button:has-text("使用招募券")');
  await page.waitForFunction(()=>!__EMBERWILD_TUTORIAL.status().active);
  assert.equal(await page.evaluate(()=>[!!partyMember(10),companionTicketCount(10),party.tutorials.records.recruit_lorne?.completed].join()),'true,0,true');
  // A second ticket for a companion already in the party turns into gold.
  const gold=await page.evaluate(()=>{grantCompanionTicket(10);const g=playerHero().gold;useCompanionRecruitmentTicket(10);closeModal();return playerHero().gold-g;});
  assert(gold>0);assert.equal(await page.evaluate(()=>party.members.filter(h=>h.companionId===10).length),1);
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});

test('skill extraction is the workshop 信物萃取 action and no longer in the bag',async()=>{
 const game=await openRuntime(root),page=game.page;
 try{
  await begin(page);page.on('dialog',d=>d.accept());
  const ids=await page.evaluate(()=>{const doc=exportableBalance();let pos=null;doc.equipmentForms.forEach((jl,j)=>jl.forEach((sl,s)=>sl.forEach((f,i)=>{if(f.id==='vine-staff')pos={j,s,i};})));
   const g=gear(1,pos.s,0,pos.j);Object.assign(g,{formJob:pos.j,slot:pos.s,form:pos.i,job:0,skillId:doc.skillSystem.equipment.formRules.find(x=>x.formId==='vine-staff').skillId});addGear(g);
   const t=createCompanionToken(doc.companionTokens.catalog[0].id);addGear(t);save();return {g:g.id,t:t.id};});
  // v0.194: extraction is the workshop's 信物萃取 action for a token on the bench.
  await page.evaluate(id=>{closeModal();moveToWorkshop(id);},ids.t);
  await page.click('main [data-workshop-action="extract"]');
  const panel=page.locator('main [data-workshop-panel="extract"] .forge-extraction');await panel.waitFor();
  assert.match(await panel.innerText(),/信物萃取[\s\S]*尚未萃取技能/);
  await panel.locator(`[data-extract-gear="${ids.g}"] button:has-text("萃取")`).click();
  assert.equal(await page.evaluate(id=>findGear(id)?.extractedSkillId,ids.t),'living-core-renewal');assert.equal(await page.evaluate(id=>!!findGear(id),ids.g),false);
  assert.match(await page.locator('main [data-workshop-panel="extract"] .forge-extraction').innerText(),/目前信物技能：/);
  // The bag's token details have no extraction button any more.
  await page.evaluate(()=>{setTab('equipment');setInventoryCategory('tokens');});
  assert.equal(await page.locator('main button:has-text("萃取技能")').count(),0);
  assert.deepEqual(game.errors,[]);
 }finally{await game.browser.close();}
});
