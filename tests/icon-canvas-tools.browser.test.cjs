const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {openRuntime,openEditorSection}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
test('icon canvas: fill, transparent erase, rotation, curves, undo, touch, cancellation and JSON roundtrip',async()=>{
  const e=await openRuntime(editorRoot,'balance-editor.html'),p=e.page;
  try{
    // The online editor polls service endpoints; isolate the standalone editing surface.
    await p.route('**/api/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    // The published document ships its own icons; the icon created here is the last definition.
    await openEditorSection(p,'iconMaker');await p.locator('#iconMakerNew').click();
    await p.locator('[data-layer-field="kind"]').selectOption('rect');
    const layers=()=>p.evaluate(()=>structuredClone(data.skillIcons.at(-1).layers));
    const point=async(x,y)=>{await p.locator('#iconMakerPreview').scrollIntoViewIfNeeded();const b=await p.locator('#iconMakerPreview').boundingBox();return {x:b.x+1+x*(b.width-2)/48,y:b.y+1+y*(b.height-2)/48};};
    const click=async(x,y)=>{const a=await point(x,y);await p.mouse.click(a.x,a.y);};
    const drag=async(x,y,u,v)=>{const a=await point(x,y),b=await point(u,v);await p.mouse.move(a.x,a.y);await p.mouse.down();await p.mouse.move(b.x,b.y,{steps:8});await p.mouse.up();};
    const tool=id=>p.locator(`[data-canvas-tool="${id}"]`).click();
    const alpha=()=>p.evaluate(async()=>{
      const svg=__EMBERWILD_SKILL_ICONS.svgFor('custom:'+data.skillIcons.at(-1).id,data.skillIcons).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" ');
      const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const c=document.createElement('canvas');c.width=c.height=48;const ctx=c.getContext('2d');ctx.drawImage(image,0,0,48,48);return {center:ctx.getImageData(24,24,1,1).data[3],side:ctx.getImageData(20,20,1,1).data[3]};
    });
    await tool('fill');await p.locator('#iconBrushTone').selectOption('ember');await click(24,24);
    assert.equal((await layers())[0].filled,true);assert.equal((await layers())[0].fillTone,'ember');assert.equal((await alpha()).center,255);
    await tool('erase');await drag(20,24,28,24);assert.equal((await layers())[0].eraseStrokes.length,1);assert.equal((await alpha()).center,0);assert.equal((await alpha()).side,255);
    await p.locator('#iconLayerUndo').click();assert.equal((await layers())[0].eraseStrokes,undefined);assert.equal((await alpha()).center,255);
    await p.locator('#iconLayerRedo').click();assert.equal((await alpha()).center,0);
    await p.locator('#iconRotateRight').click();assert.equal((await layers())[0].rotation,90);assert.equal((await alpha()).center,0);
    await p.locator('#iconRestoreErased').click();assert.equal((await alpha()).center,255);
    await tool('line');await drag(8,10,40,34);let l=(await layers())[1];assert.equal(l.kind,'line');assert(Math.abs(l.length-40)<.3);assert(Math.abs(l.rotation-36.87)<.5);
    await tool('curve');await drag(8,32,40,32);l=(await layers())[2];assert.equal(l.kind,'curve');assert(l.cy<l.y1);
    await drag(l.cx+24,l.cy+24,24,6);assert((await layers())[2].cy< -15);
    await tool('rotate');await drag(36,24,24,36);assert(Math.abs((await layers())[2].rotation-90)<1);
    await tool('move');await drag(24,24,28,28);assert(Math.abs((await layers())[2].x-4)<.1);
    const before=await layers();await tool('line');await click(5,5);assert.deepEqual(await layers(),before);
    // Pointer cancellation must discard the incomplete gesture, including eraser strokes.
    await tool('erase');
    // Real touch gestures use the same captured pointer handlers.
    await p.evaluate(()=>{const el=document.getElementById('iconMakerPreview'),r=el.getBoundingClientRect();el.setPointerCapture=()=>{};el.hasPointerCapture=()=>false;el.dispatchEvent(new PointerEvent('pointerdown',{button:0,pointerId:71,clientX:r.x+r.width/2,clientY:r.y+r.height/2,pointerType:'touch',bubbles:true}));el.onpointermove(new PointerEvent('pointermove',{pointerId:71,clientX:r.x+r.width/2+10,clientY:r.y+r.height/2,pointerType:'touch'}));el.onpointercancel(new PointerEvent('pointercancel',{pointerId:71,pointerType:'touch'}));});
    assert.deepEqual(await layers(),before);
    await tool('erase');await click(28,28);assert.equal((await layers())[2].eraseStrokes.length,1);
    const expected=await layers(),file=p.waitForEvent('download');await p.locator('#exportBtn').click();const download=await file,doc=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    assert.deepEqual(doc.skillIcons.at(-1).layers,expected);assert(!JSON.stringify(doc.skillIcons).includes('<svg'));
    await p.locator('#fileInput').setInputFiles({name:'canvas-roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await p.waitForFunction(()=>document.getElementById('status').textContent.includes('canvas-roundtrip.json'));await openEditorSection(p,'iconMaker');assert.deepEqual(await layers(),expected);
    await p.locator('#cacheBtn').click();await p.reload();await openEditorSection(p,'iconMaker');assert.deepEqual(await layers(),expected);
    const validation=await p.evaluate(()=>validateData());assert.deepEqual(validation,[]);
    await p.setViewportSize({width:390,height:844});await p.locator('#iconMakerPreview').scrollIntoViewIfNeeded();assert(await p.locator('[data-canvas-tool="curve"]').isVisible());
    await p.screenshot({path:'/tmp/icon-canvas-mobile.png'});
    assert.deepEqual(e.errors.filter(x=>!x.includes('404')),[]);
    // Game import uses the same schema and renders both extensions.
    const g=await openRuntime(root,'index.html',{}, {pathname:'/DreamingAbyss/preview/'});
    try{await g.page.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);closeModal();});
      // Preview keeps an imported design across reloads only when it comes through the JSON file import.
      await g.page.evaluate(()=>setTab('options'));await require('./runtime.cjs').importBalanceFile(g.page,'icon-canvas.json',Buffer.from(JSON.stringify(doc)));await g.page.waitForFunction(id=>exportableBalance().skillIcons.some(x=>x.id===id),doc.skillIcons.at(-1).id);await g.page.evaluate(()=>closeModal());
      const out=await g.page.evaluate(doc=>{return {layers:exportableBalance().skillIcons.at(-1).layers,svg:__EMBERWILD_SKILL_ICONS.svgFor('custom:'+doc.skillIcons.at(-1).id,doc.skillIcons)};},doc);
      assert.deepEqual(out.layers,expected);assert(out.svg.includes('<mask'));assert(out.svg.includes(' Q '));
      await g.page.evaluate(()=>{save();});await g.page.reload();assert.deepEqual(await g.page.evaluate(()=>exportableBalance().skillIcons.at(-1).layers),expected);
    }finally{await g.browser.close();}
  }finally{await e.browser.close();}
});
