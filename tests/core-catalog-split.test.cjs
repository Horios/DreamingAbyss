'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

test('static catalog and defaults load ahead of core, exactly once',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*data-balance-src="([^"]+)"[^>]*><\/script>/g)].map(m=>m[1].split('?')[0]);
  const coreIndex=scripts.indexOf('js/core/core-game.js');
  assert(coreIndex>=9);
  assert.deepEqual(scripts.slice(coreIndex-9,coreIndex),[
    'js/core/game-catalog.js',
    'js/balance/game-balance-defaults.js',
    'js/balance/gameplay-defaults.js',
    'js/core/save-validation.js',
    'js/skills/skill-presentation-metadata.js',
    'js/balance/gameplay-settings-schema.js',
    'js/ui/core-screen-views.js',
    'js/ui/core-equipment-views.js',
    'js/ui/core-battle-journal.js'
  ]);
  assert.equal(scripts.filter(s=>s==='js/core/core-game.js').length,1);
  const core=fs.readFileSync(path.join(root,'js/core/core-game.js'),'utf8');
  for(const name of ['CLASSES','MAPS','GEMS','SUPPORT','ITEM_FORMS','GAME_BALANCE_DEFAULTS','GAMEPLAY_SETTINGS_DEFAULTS']){
    assert(!core.includes('const '+name+'='),name+' is still declared in core');
  }
});

test('catalog, runtime balance initialization and previous save remain available after split',()=>{
  const game=loadRuntime(root);
  assert.deepEqual(game.errors,[]);
  assert.equal(game.run('CLASSES.length'),4);
  assert.equal(game.run('GEMS.length'),15);
  assert(game.run('MAPS.length')>=7);
  assert.equal(game.run('SUPPORT.length'),4);
  assert.equal(game.run('ITEM_FORMS.length'),5);
  assert.equal(game.run('GAME_BALANCE_DEFAULTS.combat.minimumActiveCooldown'),1);
  assert(game.run('GAMEPLAY_SETTINGS_DEFAULTS.progression.levelCaps.beforeClear')>0);
  game.run('selectSaveSlot(1);start(0);closeModal();save()');
  assert(game.run('party&&state'));
  assert.equal(game.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);
  const snapshot=JSON.parse(game.run('JSON.stringify({lv:state.lv,job:state.job,gold:state.gold,bag:state.bag.map(g=>g.id)})'));
  const loaded=loadRuntime(root,'index.html',Object.fromEntries(game.values));
  assert.equal(loaded.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);
  assert.deepEqual(JSON.parse(loaded.run('JSON.stringify({lv:state.lv,job:state.job,gold:state.gold,bag:state.bag.map(g=>g.id)})')),snapshot);
  assert.deepEqual(loaded.errors,[]);
});
