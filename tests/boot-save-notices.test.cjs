const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');

test('published saves defer hydration until the final loader, without provisional warnings or backup recovery',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();state.consumables.exp_100_30m=3;save()');
 const key=r.run('KEY'),raw=r.values.get(key),backup=r.values.get(key+'-backup');
 for(const withBackup of [false,true]){
  const storage={[key]:raw,...(withBackup?{[key+'-backup']:backup}:{})};
  const cold=loadRuntime(root,'index.html',storage,r.now,{transformSource:(file,code)=>file==='js/core/core-game.js'?
   'globalThis.__EMBERWILD_BALANCE_SOURCE='+JSON.stringify(seed)+';\n'+code+`
;globalThis.bootNotices=[];{const original=toast;toast=message=>{bootNotices.push(message);return original(message);};}`:code});
  assert(cold.run('!!state&&!!party'));assert.equal(cold.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
  assert.equal(cold.run('state.consumables.exp_100_30m'),3);
  assert(!cold.warnings.some(w=>/存檔等待完整模組載入後重試|存檔使用尚未載入的測試裝備類型/.test(w)),'published saves must not run provisional save validation');
  assert(!cold.ctx.bootNotices.some(m=>/存檔未能載入|已自動恢復/.test(m)));
  for(const [k,v] of Object.entries(storage))assert.equal(cold.values.get(k),v);
 }
});

test('fractional party EXP remains reloadable and pre-fix decimal EXP is migrated without losing progress',()=>{
 const r=loadRuntime(root);
 r.run('selectSaveSlot(1);start(0);closeModal();awardXP(19.8);save()');
 const key=r.run('KEY'),first=JSON.parse(r.values.get(key));
 assert.equal(first.members[0].xp,19);
 assert(Math.abs(first.members[0].xpFraction-.8)<1e-9);
 r.run('awardXP(19.8);save()');
 const saved=r.values.get(key),second=JSON.parse(saved);
 assert.equal(second.members[0].xp,39);
 assert(Math.abs(second.members[0].xpFraction-.6)<1e-9);
 const cold=loadRuntime(root,'index.html',{[key]:saved},r.now);
 assert.equal(cold.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
 assert.equal(cold.run('state.xp'),39);
 assert(Math.abs(cold.run('state.xpFraction')-.6)<1e-9);
 const legacy=structuredClone(first);legacy.members[0].xp=19.8;legacy.members[0].xpFraction=0;
 const raw=JSON.stringify(legacy),migrated=loadRuntime(root,'index.html',{[key]:raw},r.now);
 assert.equal(migrated.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
 assert.equal(migrated.run('state.xp'),19);
 assert(Math.abs(migrated.run('state.xpFraction')-.8)<1e-9);
 assert.equal(migrated.values.get(key),raw,'cold-load migration does not overwrite the original saved bytes');
 const corrupt=structuredClone(first);corrupt.members[0].xp='19.8';
 const rejected=loadRuntime(root,'index.html',{[key]:JSON.stringify(corrupt)},r.now);
 assert.equal(rejected.run('!!state'),false);
 assert.match(rejected.ctx.__EMBERWILD_BOOT_SAVE_ERROR,/資源數值無效/);
});

test('failed primary save does not erase its backup or corrupt the previous committed save',()=>{
 const r=loadRuntime(root);
 r.run('selectSaveSlot(1);start(0);closeModal();state.gold+=13;save()');
 const key=r.run('KEY'),backupKey=r.run('BACKUP_KEY'),previous=r.values.get(key);
 assert(previous,'must have a committed primary before testing storage failure');
 const originalWrite=r.ctx.localStorage.setItem;
 r.ctx.localStorage.setItem=(k,v)=>{if(k===key)throw Error('quota fault injection');return originalWrite(k,v);};
 try{
  r.run('state.gold+=1');
  assert.equal(r.run('save()'),false);
  assert.equal(r.values.get(key),previous,'the failed primary write leaves the previous valid save intact');
  const backup=r.values.get(backupKey);
  assert(backup,'backup must survive quota failure even when the primary cannot be written');
  assert.doesNotThrow(()=>JSON.parse(backup));
  assert.doesNotThrow(()=>JSON.parse(previous));
  const cold=loadRuntime(root,'index.html',{[key]:previous,[backupKey]:backup},r.now);
  assert.equal(cold.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
  assert.equal(cold.run('!!state&&!!party'),true);
 }finally{r.ctx.localStorage.setItem=originalWrite;}
 assert.equal(r.run('save()'),true,'saving is retryable after storage access is restored');
 assert.equal(r.run('validateParty(JSON.parse(localStorage.getItem(KEY))).members[0].gold'),r.run('state.gold'));
});

test('unexpected changes to the stored primary can never replace a verified backup',()=>{
 const r=loadRuntime(root);
 r.run('selectSaveSlot(1);start(0);closeModal();state.gold+=3;save()');
 const key=r.run('KEY'),backupKey=r.run('BACKUP_KEY');
 r.run('state.gold+=4;save()');
 const verifiedBackup=r.values.get(backupKey);
 assert(verifiedBackup);
 assert.doesNotThrow(()=>JSON.parse(verifiedBackup));
 r.ctx.localStorage.setItem(key,'{damaged external write');
 r.run('state.gold+=1');
 assert.equal(r.run('save()'),true);
 assert.equal(r.values.get(backupKey),verifiedBackup,'the damaged main must never enter the backup rotation');
 assert.equal(JSON.parse(r.values.get(key)).members[0].gold,r.run('state.gold'));
 const cold=loadRuntime(root,'index.html',{[key]:r.values.get(key),[backupKey]:verifiedBackup},r.now);
 assert.equal(cold.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
 assert.equal(cold.run('!!state&&!!party'),true);
});
