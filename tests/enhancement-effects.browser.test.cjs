'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
async function setup(){const g=await openRuntime(root);await g.page.evaluate(()=>{selectSaveSlot(1);start(1);closeModal();clearInterval(timer);globalThis.fxGear=state.bag.find(g=>!EmberwildTokens.isToken(g)).id;state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=100000;Math.random=()=>0;openForge(fxGear);save();});return g;}
const stages=p=>p.locator('[data-enhance-fx]').evaluateAll(ns=>ns.map(n=>({type:n.dataset.enhanceFx,delay:n.style.getPropertyValue('--enhance-delay'),duration:getComputedStyle(n).animationDuration})));
test('actual saved +1/+4/+8 enhancements show the correct yellow stages, with an exact 300ms empty gap',async()=>{
 const g=await setup(),p=g.page;try{
 for(const [before,expected] of [[0,['small']],[3,['small','medium']],[7,['small','medium','large']]]){
 await p.evaluate(n=>{findGear(fxGear).plus=n;save();openForge(fxGear);},before);
 const cost=await p.evaluate(()=>upgradeMaterials(findGear(fxGear))),held=await p.evaluate(()=>({ore:state.ore,dust:state.dust}));
 await p.getByRole('button',{name:'強化至 +'+(before+1),exact:true}).click();
 const rows=await stages(p);assert.deepEqual(rows.map(x=>x.type),expected);rows.forEach((r,i)=>{assert.equal(r.delay,i*500+'ms');assert.equal(r.duration,'0.2s');if(i)assert.equal(parseFloat(r.delay)-parseFloat(rows[i-1].delay)-200,300);});
 assert.equal(await p.evaluate(()=>findGear(fxGear).plus),before+1);assert.deepEqual(await p.evaluate(()=>({ore:state.ore,dust:state.dust})),{ore:held.ore-cost.ore,dust:held.dust-cost.dust});
 assert.equal(await p.locator('.forge-enhance-layer').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
 await p.waitForTimeout(expected.length*500+150);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('+11/+12 and explicit failure/destruction presentation never alter inventory or enhancement rules',async()=>{
 const g=await setup(),p=g.page;try{
 const before=await p.evaluate(()=>JSON.stringify({bag:state.bag,ore:state.ore,dust:state.dust,materials:state.materials,gold:state.gold,max:RULES.enhanceMax,config:GAMEPLAY_SETTINGS.equipment.enhance}));
 for(const level of [11,12]){
 await p.evaluate(level=>EmberwildEnhancementEffects.present({gearId:fxGear,outcome:'success',level}),level);assert.deepEqual((await stages(p)).map(x=>x.type),['small','medium','large','rainbow']);
 assert.equal(await p.locator('.forge-enhance-layer').evaluate(n=>n.style.getPropertyValue('--enhance-lifetime')),'1700ms');
 await p.waitForTimeout(1600);await p.screenshot({path:'/tmp/enhance-rainbow-'+level+'.png'});await p.waitForTimeout(250);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 for(const [outcome,type,ms] of [['failure','mist',650],['destroyed','explosion',450]]){
 await p.evaluate(outcome=>dispatchEvent(new CustomEvent('emberwild:enhancement-result',{detail:{gearId:fxGear,outcome}})),outcome);assert.deepEqual((await stages(p)).map(x=>x.type),[type]);
 await p.waitForTimeout(100);await p.screenshot({path:'/tmp/enhance-'+type+'.png'});await p.waitForTimeout(ms+100);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 assert.equal(await p.evaluate(()=>JSON.stringify({bag:state.bag,ore:state.ore,dust:state.dust,materials:state.materials,gold:state.gold,max:RULES.enhanceMax,config:GAMEPLAY_SETTINGS.equipment.enhance})),before);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('desktop/mobile positions stay visible; rejected/rolled-back actions do not show failure; navigation cleans all stages',async()=>{
 const g=await setup(),p=g.page;try{
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
 await p.setViewportSize(size);await p.evaluate(()=>openForge(fxGear));await p.evaluate(()=>EmberwildEnhancementEffects.present({gearId:fxGear,outcome:'success',level:12}));
 const at=await p.locator('.forge-enhance-layer').evaluate(n=>({x:parseFloat(n.style.left),y:parseFloat(n.style.top)}));assert(at.x>=45&&at.x<=size.width-45);assert(at.y>=45&&at.y<=size.height-45);
 await p.waitForTimeout(100);await p.screenshot({path:'/tmp/enhance-mobile-'+size.width+'.png'});
 await p.evaluate(()=>setTab('battle'));assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 await p.evaluate(()=>{openForge(fxGear);state.ore=0;state.dust=0;enhance(fxGear);});assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 await p.evaluate(()=>{state.ore=100000;state.dust=100000;globalThis.realSave=save;save=()=>false;enhance(fxGear);save=realSave;});assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 await p.evaluate(()=>{for(let i=0;i<50;i++)EmberwildEnhancementEffects.present({gearId:fxGear,outcome:'success',level:12});});assert.equal(await p.locator('.forge-enhance-layer').count(),1);assert.equal(await p.locator('[data-enhance-fx]').count(),4);
 await p.evaluate(()=>EmberwildEnhancementEffects.clear());assert.equal(await p.locator('.forge-enhance-layer').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('a real failed and a real destroying enhancement show mist and explosion',async()=>{
 const g=await setup(),p=g.page;try{
 // +4 fails at a roll of .95 and drops to +2.
 await p.evaluate(()=>{findGear(fxGear).plus=3;save();openForge(fxGear);Math.random=()=>.95;});
 await p.getByRole('button',{name:'強化至 +4',exact:true}).click();
 assert.deepEqual((await stages(p)).map(x=>x.type),['mist']);assert.equal(await p.evaluate(()=>findGear(fxGear).plus),2);
 await p.waitForTimeout(800);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 // +11 fails with destruction after the confirmation.
 p.once('dialog',d=>d.accept());await p.evaluate(()=>{findGear(fxGear).plus=10;save();openForge(fxGear);Math.random=()=>.99;});
 await p.getByRole('button',{name:'強化至 +11',exact:true}).click();
 assert.deepEqual((await stages(p)).map(x=>x.type),['explosion']);assert.equal(await p.evaluate(()=>!!findGear(fxGear)),false);
 await p.waitForTimeout(600);assert.equal(await p.locator('.forge-enhance-layer').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
