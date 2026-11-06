'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

test('legacy rendering functions are owned only by the extracted UI scripts',()=>{
  const core=fs.readFileSync(path.join(root,'js/core/core-game.js'),'utf8');
  const expected={
    'js/ui/core-screen-views.js':['meter','battleShieldValue','battleHealthMeter','pixel','enemyArt','creationSkillPreview','render','setTab','heading','tutorial','characterView','skillsView','skillDescription','questView','guideView','logContent','battleView','modePicker','bossCraftView','playerProgressView','shopView','rosterView','showRegionBestiary','uiHelp'],
    'js/ui/core-equipment-views.js':['gearFilters','resourceLine','materialView','equipmentView','showGearDetail','forgeView']
  };
  for(const [file,names] of Object.entries(expected)){
    const src=fs.readFileSync(path.join(root,file),'utf8');
    for(const name of names){
      assert.match(src,new RegExp('\\bfunction '+name+'\\b'),name+' missing in '+file);
      assert.doesNotMatch(core,new RegExp('\\bfunction '+name+'\\b'),name+' duplicated in core');
    }
  }
});

test('pre-core extracted functions preserve cold render, tabs, character and equipment views',()=>{
  const r=loadRuntime(root);
  assert.deepEqual(r.errors,[]);
  assert.equal(r.run('typeof render'),'function');
  assert.equal(r.run('typeof equipmentView'),'function');
  assert.equal(r.run('typeof battleView'),'function');
  assert.match(r.elements.get('app')?.innerHTML||'',/DREAMING ABYSS|夢淵|遠征/);
  r.run('selectSaveSlot(1);start(0);closeModal();save()');
  assert.equal(r.run('!!party && !!state'),true);
  assert.equal(r.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);
  assert.match(r.run('creationSkillPreview(0)'),/技能預覽/);
  assert.match(r.run('characterView()'),/角色能力/);
  assert.match(r.run('skillsView()'),/技能/);
  assert.match(r.run('battleView()'),/探索|戰鬥/);
  assert.equal(typeof r.run('equipmentView()'),'string');
  assert.match(r.run('heading("A","B")'),/A.*B/s);
  assert.match(r.run('battleHealthMeter(30,100,20)'),/battle-shield-fill/);
  assert.deepEqual(r.errors,[]);
});

test('extracted UI keeps save state stable across a reload',()=>{
  const r=loadRuntime(root);
  r.run('selectSaveSlot(1);start(0);closeModal();save()');
  const snapshot=JSON.parse(r.run('JSON.stringify({level:state.lv,gold:state.gold,job:state.job})'));
  const loaded=loadRuntime(root,'index.html',Object.fromEntries(r.values));
  assert.equal(loaded.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);
  assert.deepEqual(JSON.parse(loaded.run('JSON.stringify({level:state.lv,gold:state.gold,job:state.job})')),snapshot);
  assert.deepEqual(loaded.errors,[]);
});
