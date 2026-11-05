// v0.077: a region without any earnings snapshot replays averageMinutes (default 180) offline, then the rest of the absence
// becomes tickets priced by that replay's average. A region with online time but no snapshot also samples offline.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),seed=require('../data/balance.json');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
const MIN=60000,HOUR=60*MIN;
function game(averageMinutes){
 const doc=JSON.parse(JSON.stringify(seed));if(averageMinutes)doc.balanceSettings.rewards.regionVouchers.averageMinutes=averageMinutes;
 const r=loadRuntime(root);r.ctx.seed=doc;r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`applyBalanceConfig(seed,{persist:false});selectSaveSlot(1);start(0);closeModal();globalThis.rngState=4242;Math.random=()=>{rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};startSelectedExploration();save();`);return r;
}
async function away(r,ms){r.advance(ms);r.run('globalThis.__job=EmberwildOffline.settle();globalThis.__note=0;1');
 while(r.run('EmberwildOffline.busy')){await new Promise(res=>setImmediate(res));if(r.run("/offline-voucher-average/.test(document.getElementById('offline-settlement').innerHTML)"))r.run('__note++');}
 await r.run('__job');assert.equal(r.run('EmberwildOffline.failed'),false);}
const tickets=r=>json(r,'party.mailbox.messages.filter(m=>/^voucher-\\d+$/.test(m.rewardKey)).map(m=>m.attachments[0].quantity)');

test('no snapshot: replay the average time, then the rest of the absence becomes tickets priced by that average',async()=>{
 const r=game(60);await away(r,3*HOUR);
 const rec=json(r,'party.offlineExploration.receipt'),s=json(r,'EmberwildIdleStatistics.snapshot(0,0)');
 assert.equal(s.source,'average');assert(s.sampleMs>=HOUR&&s.sampleMs<HOUR+2*MIN,'the average covers the configured replay time');
 assert.match(rec.reason,/無收益樣本：計算 1 小時後依平均改領收益券/);assert(rec.kills>0,'the average time was really replayed');
 assert(rec.effectiveMs>=HOUR&&rec.effectiveMs<HOUR+5*MIN,"replay stops shortly after the average is credited");assert.equal(rec.effectiveMs+rec.voucherMs,3*HOUR,'replayed plus converted time is the whole absence');
 assert.deepEqual(tickets(r),[3]);assert.equal(rec.vouchers,3);
 assert.equal(r.run('party.offlineExploration.lastAt'),r.now);
 const v=json(r,'EmberwildRegionVouchers.ticketFor(0,0)');assert.equal(v.snapshotId,s.id);assert(Math.abs(v.xp-s.perTicket.xp)<=1,'tickets carry the average earnings');
 assert(r.run('__note')>0,'the progress overlay explains the average');
 // Reload: the conversion is neither repeated nor re-offered.
 r.run('acknowledgeOfflineExploration();save()');const cold=loadRuntime(root,'index.html',Object.fromEntries(r.values));cold.ctx.setTimeout=fn=>setImmediate(fn);cold.run('continueFromTitle();closeModal()');await cold.run('EmberwildOffline.settle()');
 assert.deepEqual(tickets(cold),[3]);assert.equal(json(cold,'party.idleStatistics.progress').averageWindow,null);
 assert.deepEqual(r.errors,[]);assert.deepEqual(cold.errors,[]);
});

test('an absence too short for the average plus one ticket is replayed in full, as before',async()=>{
 const r=game(60);await away(r,80*MIN);
 const rec=json(r,'party.offlineExploration.receipt');assert.equal(rec.effectiveMs,80*MIN);assert(!rec.vouchers);assert.deepEqual(tickets(r),[]);
 assert.notEqual(json(r,'EmberwildIdleStatistics.snapshot(0,0)')?.source,'average');assert.deepEqual(r.errors,[]);
});

test('online time without a snapshot no longer blocks offline sampling',async()=>{
 const r=game();
 r.run("{const t=EmberwildIdleStatistics.normalize(null);party.idleStatistics.regions['0:0']={map:0,difficulty:0,first:Date.now()-2*3600000,last:Date.now()-3600000,total:{ms:40*60000,battles:90,wipes:1,deaths:4,xp:1,gold:1,goldLost:0,kills:{},monsters:{},enemies:{},items:{},consumed:{},gear:{}},snapshot:null};save();}");
 await away(r,2*HOUR);
 const s=json(r,'EmberwildIdleStatistics.snapshot(0,0)');assert(s,'a snapshot exists after the absence');assert.equal(s.source,'offline');
 assert.equal(json(r,'EmberwildIdleStatistics.totals(0,0)').ms,40*MIN,'offline replay never enters online totals');assert.deepEqual(r.errors,[]);
});

test('averageMinutes is optional and validated when present',()=>{
 const r=game();
 assert.equal(r.run('EmberwildIdleStatistics.RULES.averageMs'),3*HOUR,'default 3 hours');
 assert.throws(()=>r.run('EmberwildIdleStatistics.checkVoucherSettings({ticketMinutes:30,sampleMinutes:30,maxGapMinutes:10,chargePotions:true,averageMinutes:5})'),/無樣本時平均試算分鐘數/);
 assert.doesNotThrow(()=>r.run('EmberwildIdleStatistics.checkVoucherSettings({ticketMinutes:30,sampleMinutes:30,maxGapMinutes:10,chargePotions:true,averageMinutes:120})'));
 assert.doesNotThrow(()=>r.run('EmberwildIdleStatistics.checkVoucherSettings({ticketMinutes:30,sampleMinutes:30,maxGapMinutes:10,chargePotions:true})'));
});

test('closing the page during the average resumes it from the checkpoint and still converts the rest once',async()=>{
 // Default 180-minute average: the reopened page loads the published balance, which a running exploration cannot change.
 const r=game();r.ctx.performance.now=require('perf_hooks').performance.now.bind(require('perf_hooks').performance);
 r.advance(4*HOUR);r.run('globalThis.__job=EmberwildOffline.settle();1');
 let saved=null;
 while(r.run('EmberwildOffline.busy')){await new Promise(res=>setImmediate(res));
  const raw=r.values.get(r.run('KEY'));if(raw){const p=JSON.parse(raw);const run=p.idleStatistics?.progress?.run;if(run?.mode==='average'&&run.ms>60*MIN&&p.idleStatistics.progress.averageWindow){saved=Object.fromEntries(r.values);break;}}}
 assert(saved,'a checkpoint inside the average was committed');
 const cold=loadRuntime(root,'index.html',saved);cold.ctx.setTimeout=fn=>setImmediate(fn);cold.advance(r.now-cold.now);
 cold.run('continueFromTitle();closeModal()');await cold.run('EmberwildOffline.settle()');assert.equal(cold.run('EmberwildOffline.failed'),false);
 const rec=json(cold,'party.offlineExploration.receipt');assert.match(rec.reason||'',/依平均改領收益券/);
 assert.equal(json(cold,'EmberwildIdleStatistics.snapshot(0,0)').source,'average');assert.equal(tickets(cold).length,1,'one ticket mail');
 assert.equal(cold.run('party.offlineExploration.lastAt'),cold.now);assert.deepEqual(cold.errors,[]);
});
