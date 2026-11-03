const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs'),root=path.resolve(__dirname,'..'),editorRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
test('Chromium: existing icon maker, offline catalog, appearance/effects, JSON download/import and effective game UI',async t=>{
  const editor=await openRuntime(editorRoot,'balance-editor.html'),game=await openRuntime(root,'index.html',{}, {pathname:'/Emberwild/preview/'}),p=editor.page,g=game.page;
  p.setDefaultTimeout(10000);g.setDefaultTimeout(10000);p.on('dialog',d=>d.accept());
  let doc,file,originalId,baseline;
  const change=async(key,value)=>{await p.locator(`[data-icon-appearance="${key}"]`).fill(String(value));await p.locator(`[data-icon-appearance="${key}"]`).blur();};
  try{
    baseline=await p.evaluate(()=>__EMBERWILD_TEAM_EDITOR.export());
    await require('./runtime.cjs').openEditorSection(p,'iconMaker');
    await t.test('full local catalog, case-insensitive search, all categories, no-match and reset controls',async()=>{
      assert.equal(await p.evaluate(()=>__EMBERWILD_LUCIDE.names.length),1869);assert.equal(await p.locator('[data-lucide-icon]').count(),60);
      await p.locator('#iconLucideSearch').fill('FlAmE');assert.equal(await p.locator('[data-lucide-icon="flame"]').count(),1);
      await p.locator('#iconLucideCategory').selectOption('defense');assert.equal(await p.locator('[data-lucide-icon]').count(),0);
      await p.locator('#iconLucideReset').click();
      for(const id of ['combat','defense','magic','healing','characters','equipment','status','exploration','system']){await p.locator('#iconLucideCategory').selectOption(id);const names=await p.locator('[data-lucide-icon]').evaluateAll(els=>els.map(e=>e.dataset.lucideIcon));assert(names.length>0&&names.length<=60);assert(await p.evaluate(({id,names})=>names.every(n=>__EMBERWILD_LUCIDE.categories[id].includes(n)),{id,names}));}
      await p.locator('#iconLucideReset').click();
    });
    await t.test('browse every page with at most 60 thumbnails and no external resource requests',async()=>{
      let count=0,pages=0;const requests=[];const record=r=>requests.push(r.url());p.on('request',record);const start=Date.now();
      do{count+=await p.locator('[data-lucide-icon]').count();pages++;if(await p.locator('#iconLucideNext').isDisabled())break;await p.locator('#iconLucideNext').click();}while(pages<40);
      p.off('request',record);assert.equal(count,1869);assert.equal(pages,32);assert.equal(requests.length,0);assert(Date.now()-start<30000,'32 pages remain responsive');
      await p.locator('#iconLucidePrevious').click();assert.equal(await p.locator('[data-lucide-icon]').count(),60);await p.locator('#iconLucideReset').click();
    });
    await t.test('select creates one existing skillIcons definition, updates name and persists appearance immediately',async()=>{
      await p.locator('#iconLucideSearch').fill('flame');await p.locator('[data-lucide-icon="flame"]').click();assert.equal(await p.locator('#iconLucideSelected').textContent(),'flame');
      originalId=await p.evaluate(()=>data.skillIcons[0].id);await p.locator('#iconMakerName').fill('火焰印記');await p.locator('#iconColorEnabled').check();await change('color','#fa7312');
      for(const [key,value] of Object.entries({size:64,strokeWidth:3.4,rotation:45,opacity:.6,glowColor:'#0aafee',glowStrength:8}))await change(key,value);
      const stats=await p.locator('#iconAppearancePreviews svg').evaluateAll(els=>els.map(svg=>({width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height,opacity:getComputedStyle(svg).opacity,stroke:getComputedStyle(svg.querySelector('path')).stroke,strokeWidth:getComputedStyle(svg.querySelector('path')).strokeWidth,glow:getComputedStyle(svg.querySelector('.ew-icon-glow')).filter,rotation:svg.querySelector('.ew-icon-glow>g').getAttribute('transform')})));
      assert.equal(stats.length,4);for(const [i,s] of stats.entries()){assert.equal(s.width,i===3?16:64);assert.equal(s.height,s.width);assert.equal(s.opacity,'0.6');assert.equal(s.stroke,'rgb(250, 115, 18)');assert.equal(s.strokeWidth,'3.4px');assert(s.glow.includes('8px'));assert.equal(s.rotation,'rotate(45 24 24)');}
    });
    await t.test('every offered animation actually runs; glow and fixed rotation remain independent; reduced motion is static',async()=>{
      const effects=await p.evaluate(()=>__EMBERWILD_SKILL_ICONS.effects);
      for(const [id,effect] of Object.entries(effects)){await p.locator('[data-icon-appearance="effect"]').selectOption(id);const name=await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(el=>getComputedStyle(el).animationName);assert.equal(name,effect.keyframe||'none',id);}
      for(const id of ['spin','hue']){
        await p.locator('[data-icon-appearance="effect"]').selectOption(id);assert.equal(await p.locator('[data-icon-appearance="effectTiming"] option[value="steps(1,end)"]').evaluate(el=>el.disabled),true);
        const frames=await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(async(el,id)=>{const property=id==='spin'?'transform':'filter',a=getComputedStyle(el)[property];await new Promise(r=>setTimeout(r,120));return {a,b:getComputedStyle(el)[property]};},id);assert.notEqual(frames.a,frames.b,id+' changes visually');
      }
      await p.locator('[data-icon-appearance="effect"]').selectOption('float');await change('effectDuration',1.25);await p.locator('[data-icon-appearance="effectTiming"]').selectOption('linear');
      const moving=await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(async el=>{const a=getComputedStyle(el).transform;await new Promise(r=>setTimeout(r,120));return {a,b:getComputedStyle(el).transform,duration:getComputedStyle(el).animationDuration};});assert.notEqual(moving.a,moving.b);assert.equal(moving.duration,'1.25s');
      await p.emulateMedia({reducedMotion:'reduce'});assert.equal(await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(el=>getComputedStyle(el).animationName),'none');await p.emulateMedia({reducedMotion:'no-preference'});
      assert.equal(await p.locator('[data-icon-appearance="effect"] option[value="flow"]').count(),0);
    });
    await t.test('duplicate, clear, reselect and switching definitions leave no previous animation or event handlers',async()=>{
      await p.locator('#iconMakerDuplicate').click();assert.equal(await p.locator('[data-icon-id]').count(),2);await p.locator('[data-icon-appearance="effect"]').selectOption('');await p.locator('#iconLucideClear').click();assert.equal(await p.locator('#iconLucideSelected').textContent(),'未選擇');assert.equal(await p.locator('#iconAppearancePreviews path').count(),0);
      await p.locator('#iconLucideSearch').fill('heart');await p.locator('[data-lucide-icon="heart"]').click();assert.equal(await p.locator('#iconLucideSelected').textContent(),'heart');assert.equal(await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(el=>getComputedStyle(el).animationName),'none');
      for(let i=0;i<5;i++){await require('./runtime.cjs').openEditorSection(p,'classes');await require('./runtime.cjs').openEditorSection(p,'iconMaker');}
      await p.locator(`[data-icon-id="${originalId}"]`).click();assert.equal(await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(el=>getComputedStyle(el).animationName),'tr-float');
      await p.locator('[data-add-shape="line"]').click();assert.equal(await p.locator('[data-layer-row]').count(),2);await p.locator('[data-layer-delete="1"]').click();assert.equal(await p.locator('[data-layer-row]').count(),1);
      await p.locator('#iconMakerDuplicate').click();assert.equal(await p.locator('[data-icon-id]').count(),3);await p.locator('#iconMakerDelete').click();assert.equal(await p.locator('[data-icon-id]').count(),2);
    });
    await t.test('original text rarity designer still edits, animates and saves the same effect definition',async()=>{
      await require('./runtime.cjs').openEditorSection(p,'textRarity');await p.locator('#addRarity').click();await p.locator('#rarityName').fill('保留文字故障');await p.locator('[data-effect="textEffect1"]').selectOption('galleryGlitch');
      assert.equal(await p.locator('#rarityPreview .tr-special-galleryGlitch').first().evaluate(el=>getComputedStyle(el).animationName),'tr-gallery-jitter');await p.locator('#saveRarity').click();assert.equal(await p.evaluate(()=>data.textStyles[0].textEffect1),'galleryGlitch');
    });
    await t.test('existing skill picker applies the current custom icon; real download contains only identifiers/parameters',async()=>{
      await p.evaluate(()=>{currentSection='skills';selected.skillTab='active';selected.skillClass=0;selected.skill=0;render();});await p.locator('#openSkillIconMaker').click();await p.locator(`[data-icon-id="${originalId}"]`).click();await p.locator('#iconMakerApply').click();
      assert.equal(await p.locator('#skillIconType').inputValue(),'custom:'+originalId);
      const downloadPromise=p.waitForEvent('download');await p.locator('#exportBtn').click();const download=await downloadPromise;file=await download.path();doc=JSON.parse(fs.readFileSync(file,'utf8'));
      assert.equal(doc.skillIcons.length,2);assert.equal(doc.skillIcons[0].appearance.size,64);assert.equal(doc.skillIcons[0].appearance.effectDuration,1.25);assert.equal(doc.skillIcons[0].layers[0].icon,'lucide:flame');assert.equal(doc.classes[0].skills[0].iconType,'custom:'+originalId);
      assert(!JSON.stringify(doc.skillIcons).includes('<svg'));assert(!JSON.stringify(doc).includes('librarySearch'));assert.deepEqual(doc.balanceSettings,baseline.balanceSettings);assert.deepEqual(doc.balance,baseline.balance);assert.deepEqual(doc.equipmentForms,baseline.equipmentForms);assert.deepEqual(doc.items,baseline.items);
      assert.deepEqual(await p.evaluate(()=>validateData()),[]);
    });
    await t.test('actual JSON reimport and designer reload reproduce every appearance parameter and preview',async()=>{
      await p.locator('#fileInput').setInputFiles({name:'icons-roundtrip.json',mimeType:'application/json',buffer:fs.readFileSync(file)});await p.waitForFunction(()=>document.getElementById('status')?.textContent.includes('icons-roundtrip.json'));await require('./runtime.cjs').openEditorSection(p,'iconMaker');await p.locator(`[data-icon-id="${originalId}"]`).click();
      assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(data.skillIcons))),doc.skillIcons);assert.equal(await p.locator('[data-icon-appearance="color"]').inputValue(),'#fa7312');
      assert(await p.evaluate(()=>{const holder=document.createElement('div');holder.innerHTML=__EMBERWILD_SKILL_ICONS.svgFor('custom:'+data.skillIcons[0].id,data.skillIcons);return holder.innerHTML===document.querySelector('#iconAppearancePreviews .icon-live-preview>div').innerHTML;}));
      await p.locator('#cacheBtn').click();await p.reload();await require('./runtime.cjs').openEditorSection(p,'iconMaker');assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(data.skillIcons))),doc.skillIcons);
    });
    await t.test('preview game uses the real options JSON input and renders the same SVG, color, size and animation in the current team UI',async()=>{
      await g.evaluate(()=>{selectSaveSlot(1);start(0);clearInterval(timer);});await g.waitForTimeout(80);await g.evaluate(()=>{closeModal();setTab('options');});
      await (await g.evaluate(()=>setOptionsTab('other')),g).locator('#options-test-json-import').setInputFiles({name:'icons-roundtrip.json',mimeType:'application/json',buffer:fs.readFileSync(file)});await g.waitForFunction(()=>__EMBERWILD_MASTERY.iconDefinitions().length===2);
      assert.deepEqual(await g.evaluate(()=>exportableBalance().skillIcons),doc.skillIcons);await g.evaluate(()=>{closeModal();setTab('skills');});
      const svg=g.locator('[data-team-skill="0:core:0"] svg');assert.equal(await svg.count(),1);assert.equal(await svg.evaluate(el=>el.getBoundingClientRect().width),64);assert.equal(await svg.locator('.ew-icon-motion').evaluate(el=>getComputedStyle(el).animationName),'tr-float');
      assert(await g.evaluate(()=>{const holder=document.createElement('div');holder.innerHTML=__EMBERWILD_SKILL_ICONS.svgFor('custom:'+exportableBalance().skillIcons[0].id,__EMBERWILD_MASTERY.iconDefinitions());return holder.innerHTML===document.querySelector('[data-team-skill="0:core:0"] svg').outerHTML;}));
      await g.emulateMedia({reducedMotion:'reduce'});assert.equal(await svg.locator('.ew-icon-motion').evaluate(el=>getComputedStyle(el).animationName),'none');await g.emulateMedia({reducedMotion:'no-preference'});
    });
    await t.test('game battle/save/reload retains icons; unknown names fall back without a crash; old/no-icon JSON loads',async()=>{
      const rounds=await g.evaluate(()=>{const before=round;document.getElementById('dev-mastery-rounds').value='5';devMasterySimulate();clearInterval(timer);save();return round-before;});assert(rounds>0&&rounds<=5);const saved=await g.evaluate(()=>JSON.parse(localStorage.getItem(KEY)).buildSystem);await g.reload();await g.waitForFunction(()=>party?.buildSystem);await g.evaluate(()=>{continueFromTitle();clearInterval(timer);closeModal();setTab('skills');});
      assert.deepEqual(await g.evaluate(()=>party.buildSystem),saved);assert.deepEqual(await g.evaluate(()=>exportableBalance().skillIcons),doc.skillIcons);assert.equal(await g.locator('[data-team-skill="0:core:0"] svg').count(),1);
      await g.evaluate(()=>{const d=exportableBalance();d.skillIcons[0].layers[0].icon='lucide:does-not-exist';applyBalanceConfig(d);});assert.equal(await g.locator('[data-team-skill="0:core:0"] svg path').count(),1);assert.equal(await g.locator('[data-team-skill="0:core:0"] svg circle').count(),1);
      await g.evaluate(()=>{const d=exportableBalance();delete d.skillIcons;d.classes[0].skills[0].iconType='auto';applyBalanceConfig(d);});assert.deepEqual(await g.evaluate(()=>exportableBalance().skillIcons),[]);
      const legacy=structuredClone(baseline);delete legacy.skillIcons;await p.locator('#fileInput').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await p.waitForFunction(()=>document.getElementById('status')?.textContent.includes('legacy.json'));await require('./runtime.cjs').openEditorSection(p,'iconMaker');assert.deepEqual(await p.evaluate(()=>JSON.parse(JSON.stringify(data.skillIcons))),[]);assert.equal(await p.locator('[data-lucide-icon]').count(),60);
      await p.locator('#iconMakerImportBuiltin').click();assert.equal(await p.locator('#iconAppearancePreviews svg').first().evaluate(el=>el.getBoundingClientRect().width),34);assert.equal(await p.locator('#iconAppearancePreviews svg').first().evaluate(el=>getComputedStyle(el).strokeWidth),'2.7px');
    });
    assert.deepEqual(editor.errors,[]);assert.deepEqual(game.errors,[]);
  }finally{await editor.browser.close();await game.browser.close();}
});
test('Chromium: standalone HTML works with network offline, including catalog and animation',async()=>{
  const e=await openRuntime(editorRoot,'balance-editor.html'),p=e.page;
  try{
    // This managed Chromium forbids file://. The helper serves the same single HTML
    // from disk; offline mode prevents any CDN/resource dependency.
    await p.locator('#cacheBtn').click();await p.context().setOffline(true);await p.reload();
    assert.equal(await p.locator('script[src],link[rel="stylesheet"][href]').count(),0);
    await require('./runtime.cjs').openEditorSection(p,'iconMaker');await p.locator('#iconLucideSearch').fill('gem');await p.locator('[data-lucide-icon="gem"]').click();await p.locator('[data-icon-appearance="effect"]').selectOption('breathe');
    assert.equal(await p.locator('#iconLucideSelected').textContent(),'gem');assert.equal(await p.locator('#iconAppearancePreviews .ew-icon-motion').first().evaluate(el=>getComputedStyle(el).animationName),'tr-gallery-breathe');
    assert.deepEqual(e.errors,[]);
  }finally{await e.browser.close();}
});
