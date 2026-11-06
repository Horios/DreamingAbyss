'use strict';
/* v0.119: balance JSON textOverrides replace fixed on-screen text by original wording. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

async function game(width=1280){
 const g=await openRuntime(root),p=g.page;await p.setViewportSize({width,height:900});
 await p.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();setTab('battle');});
 return g;
}
const apply=(p,entries)=>p.evaluate(entries=>{const d=exportableBalance();if(entries)d.textOverrides={version:1,entries};else delete d.textOverrides;applyBalanceConfig(d,{persist:false});},entries);
const bodyText=p=>p.evaluate(()=>document.body.innerText);

test('fixed text, numbered templates, dialogs and attributes change everywhere and survive redraws',async()=>{
 const g=await game(),p=g.page;
 try{
  const before=await bodyText(p);
  assert.match(before,/荒野探索/);assert.match(before,/金幣 \d/);
  await apply(p,[{source:'荒野探索',text:'夢境探索'},{source:'金幣 {#}',text:'夢幣 ×{#}'},{source:'關閉',text:'收起'}]);
  let text=await bodyText(p);
  assert.doesNotMatch(text,/荒野探索/);assert.match(text,/夢境探索/);
  const gold=await p.evaluate(()=>party.members[0].gold);
  assert.match(text,new RegExp('夢幣 ×'+gold),'numbers are kept through the template');
  // Live redraws, page switches and gold changes keep the override.
  await p.evaluate(()=>{party.members[0].gold+=7;setTab('character');setTab('battle');render();});
  text=await bodyText(p);
  assert.match(text,new RegExp('夢幣 ×'+(gold+7)));assert.doesNotMatch(text,/荒野探索|金幣 \d/);
  // Dialog text (utility dialog close button) uses the same table.
  await p.evaluate(()=>openUtilityPanel('options'));await p.waitForTimeout(50);
  assert.equal(await p.locator('#modal .utility-dialog-controls button').innerText(),'收起');
  await p.evaluate(()=>closeModal());
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('removing an override restores the original wording; typed values and the export are exact',async()=>{
 const g=await game(),p=g.page;
 try{
  await apply(p,[{source:'荒野探索',text:'夢境探索'},{source:'金幣 {#}',text:'夢幣 {#}'}]);
  const exported=await p.evaluate(()=>exportableBalance().textOverrides);
  assert.deepEqual(exported,{version:1,entries:[{source:'荒野探索',text:'夢境探索'},{source:'金幣 {#}',text:'夢幣 {#}'}]});
  assert.deepEqual(await p.evaluate(()=>EmberwildBalanceDocument.inspect(exportableBalance())),[],'the published document stays valid');
  // An input holding matching text is never rewritten.
  await p.evaluate(()=>{const i=document.createElement('input');i.id='typed';i.value='荒野探索';document.querySelector('main').append(i);});
  await p.waitForTimeout(30);
  assert.equal(await p.locator('#typed').inputValue(),'荒野探索');
  await apply(p,[{source:'荒野探索',text:'夢境探索'}]);
  let text=await bodyText(p);assert.match(text,/金幣 \d/,'the removed template is reverted');assert.match(text,/夢境探索/);
  await apply(p,null);
  text=await bodyText(p);assert.match(text,/荒野探索/);assert.doesNotMatch(text,/夢境探索/);
  assert.equal(await p.evaluate(()=>exportableBalance().textOverrides),undefined,'no overrides → no field');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('title and placeholder attributes are overridden; phones keep the same overrides',async()=>{
 const g=await game(390),p=g.page;
 try{
  await p.evaluate(()=>{const b=document.createElement('button');b.id='attr-probe';b.title='冒險指南';b.setAttribute('aria-label','冒險指南');b.textContent='x';document.body.append(b);});
  await apply(p,[{source:'冒險指南',text:'旅行手冊'}]);
  assert.deepEqual(await p.evaluate(()=>{const b=document.getElementById('attr-probe');return [b.title,b.getAttribute('aria-label')];}),['旅行手冊','旅行手冊']);
  await p.evaluate(()=>{document.getElementById('attr-probe').title='冒險指南';});await p.waitForTimeout(30);
  assert.equal(await p.evaluate(()=>document.getElementById('attr-probe').title),'旅行手冊','a later rewrite by the game is overridden again');
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});

test('invalid tables are rejected before anything changes',async()=>{
 const g=await game(),p=g.page;
 try{
  const cases={digits:[{source:'金幣 150',text:'x'}],duplicate:[{source:'關閉',text:'a'},{source:' 關閉 ',text:'b'}],empty:[{source:'  ',text:'x'}],tooLong:[{source:'關閉',text:'字'.repeat(2001)}],type:[{source:'關閉',text:5}]};
  for(const [name,entries] of Object.entries(cases)){
   const r=await p.evaluate(entries=>{const d=exportableBalance();d.textOverrides={version:1,entries};try{validateBalanceConfig(d);return 'accepted';}catch(e){return e.message;}},entries);
   assert.notEqual(r,'accepted',name);
  }
  const before=await bodyText(p);
  const r=await p.evaluate(()=>{const d=exportableBalance();d.textOverrides={version:2,entries:[]};try{applyBalanceConfig(d,{persist:false});return 'applied';}catch(e){return e.message;}});
  assert.notEqual(r,'applied');assert.equal(await bodyText(p),before);
  assert.equal(await p.evaluate(()=>EmberwildBalanceDocument.textOverridesVersion),1);
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
