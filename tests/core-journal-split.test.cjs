'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

test('battle journal helpers are extracted without moving the runtime wrapper order',()=>{
  const core=fs.readFileSync(path.join(root,'js/core/core-game.js'),'utf8');
  const journal=fs.readFileSync(path.join(root,'js/ui/core-battle-journal.js'),'utf8');
  for(const name of [
    'sharedBattleJournal','isEditingControl','refreshGlobalJournal',
    'battleLogMatches','battleLogEntryClass','lootRarityFromText','battleLogTextHTML',
    'battleLogRowsHTML','isBattleLogAtBottom','ensureBattleLogScrollState',
    'forceBattleLogBottom','scrollBattleLogToBottom','appendBattleLogLine',
    'toggleBattleReport','setBattleLogFilter','battleJournalFilter',
    'syncBattleLogHeader','markBattleLogGeneration','captureBattleLogScroll',
    'restoreBattleLogScroll'
  ]){
    assert.match(journal,new RegExp('\\bfunction '+name+'\\b'),name+' missing from module');
    assert.doesNotMatch(core,new RegExp('\\bfunction '+name+'\\b'),name+' duplicated in core');
  }
  for(const assignment of ['note=function(t,type=', 'render=function(){', 'refreshGlobalJournal=function(){', 'resetSession=function(){']){
    assert(core.includes(assignment),assignment+' must remain installed in core');
    assert(!journal.includes(assignment),assignment+' must not be installed early');
  }
});

test('filtered journal rows preserve event types and rarity formatting',()=>{
  const r=loadRuntime(root);
  assert.deepEqual(r.errors,[]);
  r.run('selectSaveSlot(1);start(0);closeModal();logs=[];battleLogGeneration++;note("冒險開始","system");note("擊中敵人","playerDamage");note("獲得 傳說裝備","item");');
  assert.equal(r.run('lootRarityFromText("獲得 傳說裝備")'),3);
  assert.match(r.run('battleLogTextHTML({type:"item",text:"獲得 傳說裝備"})'),/loot-rarity-3/);
  assert.equal(r.run('battleLogMatches({type:"item"})'),true);
  r.run('setBattleLogFilter("item")');
  assert.equal(r.run('battleLogMatches({type:"playerDamage"})'),false);
  const html=r.run('battleLogRowsHTML()');
  assert.match(html,/data-event-type="item"/);
  assert.doesNotMatch(html,/data-event-type="playerDamage"/);
  assert.match(r.run('battleJournalFilter()'),/value="item" selected/);
  assert.deepEqual(r.errors,[]);
});

test('auto-follow and report pause use the unchanged scroll boundaries',()=>{
  const r=loadRuntime(root);
  const result=JSON.parse(r.run('JSON.stringify((()=>{const stream={dataset:{},scrollHeight:420,clientHeight:120,scrollTop:0,isConnected:true,addEventListener(){}};forceBattleLogBottom(stream);const followed={top:stream.scrollTop,auto:stream.dataset.autoScroll,bottom:isBattleLogAtBottom(stream)};battleReportPaused=true;stream.scrollTop=70;forceBattleLogBottom(stream);const paused={top:stream.scrollTop,auto:stream.dataset.autoScroll};battleReportPaused=false;return {followed,paused};})())'));
  assert.deepEqual(result,{followed:{top:300,auto:'1',bottom:true},paused:{top:70,auto:'1'}});
  assert.deepEqual(r.errors,[]);
});

test('cold start retains the journal and save after an extracted renderer loads',()=>{
  const r=loadRuntime(root);
  r.run('selectSaveSlot(1);start(0);closeModal();save()');
  assert.match(r.run('logContent()'),/battle-log-stream/);
  assert.equal(r.run('typeof sharedBattleJournal'),'function');
  const loaded=loadRuntime(root,'index.html',Object.fromEntries(r.values));
  assert.equal(loaded.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR'),null);
  assert.deepEqual(loaded.errors,[]);
});
