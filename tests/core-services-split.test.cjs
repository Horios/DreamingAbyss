'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

test('extracted save, skill and gameplay helpers are absent from core, loaded in order',()=>{
  const core=fs.readFileSync(path.join(root,'js/core/core-game.js'),'utf8');
  const definitions={
    'js/core/save-validation.js':['migrateLegacyEquipmentSlotsInSave','validateSave'],
    'js/skills/skill-presentation-metadata.js':['skillMechanics','skillTypeTags','skillTypeBadges','skillMechanicsDetails'],
    'js/balance/gameplay-settings-schema.js':['cloneGameplaySettings','mergeGameplayShape','gameplayAt','validateGameplaySettings','normalizeGameplaySettings']
  };
  for(const [filename,names] of Object.entries(definitions)){
    const source=fs.readFileSync(path.join(root,filename),'utf8');
    for(const name of names){
      assert.match(source,new RegExp('\\bfunction '+name+'\\b'),name+' missing from '+filename);
      assert.doesNotMatch(core,new RegExp('\\bfunction '+name+'\\b'),name+' remained in core');
    }
  }
});

test('gameplay schema preserves fallback, copying and validation boundaries',()=>{
  const r=loadRuntime(root);
  assert.deepEqual(r.errors,[]);
  assert.equal(r.run('typeof normalizeGameplaySettings'),'function');
  assert.equal(r.run('typeof validateGameplaySettings'),'function');
  const result=JSON.parse(r.run("JSON.stringify((()=>{const old=GAMEPLAY_SETTINGS_DEFAULTS.combat.autoPotionThreshold;const cfg=normalizeGameplaySettings({combat:{autoPotionThreshold:.42},unrelated:{unused:true}});const clone=cloneGameplaySettings(cfg);clone.combat.autoPotionThreshold=.33;return {old,normalized:cfg.combat.autoPotionThreshold,cloned:clone.combat.autoPotionThreshold,unknown:Object.hasOwn(cfg,'unrelated'),valid:validateGameplaySettings(cfg)===cfg};})())"));
  assert.equal(result.normalized,.42);
  assert.equal(result.cloned,.33);
  assert.equal(result.unknown,false);
  assert.equal(result.valid,true);
  assert.notEqual(result.old,result.cloned);
  assert.equal(r.run("(()=>{const cfg=normalizeGameplaySettings();cfg.combat.autoPotionThreshold=2;try{validateGameplaySettings(cfg);return false;}catch(e){return String(e.message).includes('平衡設定機率');}})()"),true);
  assert.equal(r.run("(()=>{const cfg=normalizeGameplaySettings();cfg.monsters.encounter.bossChance=.9;cfg.monsters.encounter.eliteChance=.9;try{validateGameplaySettings(cfg);return false;}catch(e){return String(e.message).includes('遭遇率');}})()"),true);
});

test('skill metadata remains presentation-only and handles core/support/control tags',()=>{
  const r=loadRuntime(root);
  assert.equal(r.run('skillMechanics(0,0).activation'),'active');
  assert.equal(r.run('skillMechanics(0,2).activation'),'proc');
  assert.equal(r.run("skillMechanics(0,0,'support').target"),'allies');
  const tags=JSON.parse(r.run("JSON.stringify(skillTypeTags({activation:'active',castTimeSeconds:2,target:'enemies',maxTargets:3,effects:[{kind:'freeze',durationSeconds:3},{kind:'burn'}]}).map(x=>x.id))"));
  for(const id of ['cast','area','duration','control','freeze','burn'])assert(tags.includes(id),id);
  assert.match(r.run("skillTypeBadges(0,2)"),/觸發/);
  assert.equal(r.run("skillMechanicsDetails(0,0)"),'');
});

test('legacy save validator stays available and leaves unsupported input untouched',()=>{
  const r=loadRuntime(root);
  assert.equal(r.run('typeof migrateLegacyEquipmentSlotsInSave'),'function');
  assert.equal(r.run('typeof validateSave'),'function');
  const original={version:99};
  r.ctx.invalidSave=original;
  assert.equal(r.run("(()=>{try{validateSave(invalidSave);return false;}catch(e){return String(e.message).includes('存檔版本不符');}})()"),true);
  assert.deepEqual(original,{version:99});
  r.run('selectSaveSlot(1);start(0);closeModal();save()');
  assert(r.run('party&&state'));
  const storage=Object.fromEntries(r.values);
  const reloaded=loadRuntime(root,'index.html',storage);
  assert.equal(reloaded.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);
  assert.deepEqual(reloaded.errors,[]);
});
