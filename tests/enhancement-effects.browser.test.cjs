'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..');
async function setup(){const g=await openRuntime(root);await g.page.evaluate(()=>{selectSaveSlot(1);start(1);closeModal();clearInterval(timer);/* v0.228: start() leaves the bag empty */if(!state.bag.some(g=>!EmberwildTokens.isToken(g)))addGear(gear(1,0,0,1));globalThis.fxGear=state.bag.find(g=>!EmberwildTokens.isToken(g)).id;state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=100000;Math.random=()=>0;openForge(fxGear);save();});return g;}
async function checkResult(p,success){
 const n=p.locator('.forge-enhance-layer');assert.equal(await n.innerText(),success?'強化成功！':'失敗 ...');
 const style=await n.evaluate(n=>{const s=getComputedStyle(n);return {color:s.color,weight:s.fontWeight,pointer:s.pointerEvents};});
 assert.equal(style.color,success?'rgb(101, 232, 145)':'rgb(255, 107, 107)');assert.equal(style.weight,'800');assert.equal(style.pointer,'none');
 assert.equal(await p.locator('[data-enhance-fx],.forge-enhance-flash').count(),0);
}
test('actual saved +1/+4/+8 enhancements show green bold success text and expire',async()=>{
 const g=await setup(),p=g.page;try{
 for(const before of [0,3,7]){
 await p.evaluate(n=>{findGear(fxGear).plus=n;save();openForge(fxGear);},before);
 const cost=await p.evaluate(()=>upgradeMaterials(findGear(fxGear))),held=await p.evaluate(()=>({ore:state.ore,dust:state.dust}));
 await p.getByRole('button',{name:'強化至 +'+(before+1),exact:true}).click();
 await checkResult(p,true);
 assert.equal(await p.evaluate(()=>findGear(fxGear).plus),before+1);assert.deepEqual(await p.evaluate(()=>({ore:state.ore,dust:state.dust})),{ore:held.ore-cost.ore,dust:held.dust-cost.dust});
 assert.equal(await p.locator('.forge-enhance-layer').evaluate(n=>getComputedStyle(n).pointerEvents),'none');
 await p.waitForTimeout(1650);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('+11/+12 and explicit failure/destruction presentation never alter inventory or enhancement rules',async()=>{
 const g=await setup(),p=g.page;try{
 const before=await p.evaluate(()=>JSON.stringify({bag:state.bag,ore:state.ore,dust:state.dust,materials:state.materials,gold:state.gold,max:RULES.enhanceMax,config:GAMEPLAY_SETTINGS.equipment.enhance}));
 for(const level of [11,12]){
 await p.evaluate(level=>EmberwildEnhancementEffects.present({gearId:fxGear,outcome:'success',level}),level);await checkResult(p,true);
 assert.equal(await p.locator('.forge-enhance-layer').evaluate(n=>n.style.getPropertyValue('--enhance-lifetime')),'1500ms');
 await p.waitForTimeout(1650);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 for(const outcome of ['failure','destroyed']){
 await p.evaluate(outcome=>dispatchEvent(new CustomEvent('emberwild:enhancement-result',{detail:{gearId:fxGear,outcome}})),outcome);await checkResult(p,false);
 await p.waitForTimeout(1650);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 assert.equal(await p.evaluate(()=>JSON.stringify({bag:state.bag,ore:state.ore,dust:state.dust,materials:state.materials,gold:state.gold,max:RULES.enhanceMax,config:GAMEPLAY_SETTINGS.equipment.enhance})),before);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('desktop/mobile positions stay visible; rejected/rolled-back actions do not show failure; navigation clears text',async()=>{
 const g=await setup(),p=g.page;try{
 for(const size of [{width:1440,height:900},{width:390,height:844},{width:320,height:568}]){
 await p.setViewportSize(size);await p.evaluate(()=>openForge(fxGear));await p.evaluate(()=>EmberwildEnhancementEffects.present({gearId:fxGear,outcome:'success',level:12}));
 const at=await p.locator('.forge-enhance-layer').boundingBox();assert(Math.abs(at.x+at.width/2-size.width/2)<1);assert(Math.abs(at.y+at.height/2-size.height/2)<1);assert(at.x>=0&&at.x+at.width<=size.width);await checkResult(p,true);
 await p.waitForTimeout(100);await p.screenshot({path:'/tmp/enhance-mobile-'+size.width+'.png'});
 await p.evaluate(()=>setTab('battle'));assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 }
 await p.evaluate(()=>{openForge(fxGear);state.ore=0;state.dust=0;enhance(fxGear);});assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 await p.evaluate(()=>{state.ore=100000;state.dust=100000;globalThis.realSave=save;save=()=>false;enhance(fxGear);save=realSave;});assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 await p.evaluate(()=>{for(let i=0;i<50;i++)EmberwildEnhancementEffects.present({gearId:fxGear,outcome:'success',level:12});});assert.equal(await p.locator('.forge-enhance-layer').count(),1);assert.equal(await p.locator('[data-enhance-fx]').count(),0);
 await p.evaluate(()=>EmberwildEnhancementEffects.clear());assert.equal(await p.locator('.forge-enhance-layer').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
test('real failed and destroying enhancements show red failure text',async()=>{
 const g=await setup(),p=g.page;try{
 // +4 fails at a roll of .95 and drops to +2.
 await p.evaluate(()=>{findGear(fxGear).plus=3;save();openForge(fxGear);Math.random=()=>.95;});
 await p.getByRole('button',{name:'強化至 +4',exact:true}).click();
 await checkResult(p,false);assert.equal(await p.evaluate(()=>findGear(fxGear).plus),2);
 await p.waitForTimeout(1650);assert.equal(await p.locator('.forge-enhance-layer').count(),0);
 // +11 fails with destruction after the confirmation.
 p.once('dialog',d=>d.accept());await p.evaluate(()=>{findGear(fxGear).plus=10;save();openForge(fxGear);Math.random=()=>.99;});
 await p.getByRole('button',{name:'強化至 +11',exact:true}).click();
 await checkResult(p,false);assert.equal(await p.evaluate(()=>!!findGear(fxGear)),false);
 await p.waitForTimeout(1650);assert.equal(await p.locator('.forge-enhance-layer').count(),0);assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
