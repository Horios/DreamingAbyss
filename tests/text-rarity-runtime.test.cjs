const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const style={id:'designer-only',name:'平衡設計器樣式',textColor:'#aaffcc',textEffect1:'galleryGlitch',textEffect2:'glow',blockColor:'#14213d',blockEffect:'aurora',borderColor:'#8ecaff',borderEffect:'pulse'};

test('game keeps configured equipment/item appearances through JSON and reload without designer actions',()=>{
  const game=loadRuntime(root);game.run('selectSaveSlot(1);start(0);closeModal();');game.ctx.style=style;
  const result=JSON.parse(game.run(`JSON.stringify((()=>{
    const doc=exportableBalance();doc.textStyles=[style];
    doc.equipmentForms[0][0][0].textStyleId=style.id;
    doc.equipmentPowerSystem.bossAffixes[0].textStyleId=style.id;
    doc.items[0].textStyleId=style.id;applyBalanceConfig(doc);
    const g={id:'styled',job:0,formJob:0,slot:0,form:0,tier:1,powerTier:1,plus:0,rar:0,difficulty:0,affix:[]};
    const boss={...g,boss:0,region:0};
    return {styles:exportableBalance().textStyles,gear:equipmentNameHTML(g),boss:equipmentNameHTML(boss),item:textRarityItemHTML(SHOP[0]),row:textRarityEquipmentBlockPresentation(g),designer:[typeof textRarityView,typeof newTextRarity,typeof selectTextRarity]};
  })())`));
  assert.deepEqual(result.styles,[style]);
  for(const html of [result.gear,result.boss,result.item]){
    assert.match(html,/tr-special-galleryGlitch/);assert.match(html,/tr-border-pulse/);assert.match(html,/--tr-color:#aaffcc/);
  }
  assert.equal(result.row.bg,style.blockColor);assert.equal(result.row.block,'aurora');assert.match(result.row.animation,/tr-block-flow/);
  assert.deepEqual(result.designer,['undefined','undefined','undefined']);
  const reloaded=loadRuntime(root,'index.html',Object.fromEntries(game.values));
  assert.deepEqual(JSON.parse(reloaded.run('JSON.stringify(exportableBalance().textStyles)')),[style]);
  assert.equal(reloaded.run('textRarityStyleById("designer-only").blockColor'),style.blockColor);
  // In the browser the published loader always provides this; reset restores it (the load-time fallback predates the skill system).
  game.ctx.published=JSON.parse(require('node:fs').readFileSync(path.join(root,'data/balance.json'),'utf8'));game.run('globalThis.__EMBERWILD_PUBLISHED_BALANCE=published;');
  assert.equal(game.run('resetBalanceJSON()'),true);assert.deepEqual(JSON.parse(game.run('JSON.stringify(exportableBalance().textStyles)')),[]);
  assert.deepEqual(game.errors,[]);assert.deepEqual(reloaded.errors,[]);
});

test('invalid appearance definitions and missing references are rejected before changing active settings',()=>{
  const game=loadRuntime(root);game.ctx.style=style;
  game.run('const appearanceBaseline=exportableBalance();');
  for(const mutation of [
    'doc.textStyles=[style,style]',
    'doc.textStyles=[{...style,textColor:"red"}]',
    'doc.textStyles=[{...style,textEffect1:"unknown"}]',
    'doc.equipmentForms[0][0][0].textStyleId="missing"',
    'doc.equipmentPowerSystem.bossAffixes[0].textStyleId="missing"',
    'doc.equipmentPowerSystem.rerollItem.textStyleId="missing"',
    'doc.items[0].textStyleId="missing"'
  ])assert.throws(()=>game.run(`(()=>{const doc=structuredClone(appearanceBaseline);${mutation};applyBalanceConfig(doc);})()`),/文字稀有度/);
  assert.equal(game.run('JSON.stringify(exportableBalance())===JSON.stringify(appearanceBaseline)'),true);
  assert.deepEqual(game.errors,[]);
});
