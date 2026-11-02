/* Development-only profiler/equivalence runner. No instrumentation ships to the game.
   node tests/offline-performance.cjs <baseline git ref> [--quick]
   Reports inclusive timings (do not sum nested stock/capture/collect metrics). */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),{performance}=require('node:perf_hooks');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),file='js/combat/offline-exploration.js';
const baseline=process.argv[2];if(!baseline)throw Error('Pass the baseline git ref');
const sources={before:execFileSync('git',['show',baseline+':'+file],{cwd:root,encoding:'utf8'}),after:fs.readFileSync(path.join(root,file),'utf8')};
const metrics=['captureResources','collect','stock','commit','snapshot','event','consumeTo','advance'];
function transform(source){return source.replace('globalThis.EmberwildOffline={',`globalThis.__offlineProfile={};globalThis.__offlineSaving=false;${metrics.map(name=>`{const base=${name};${name}=function(...args){const t=performance.now();${name==='commit'?'__offlineSaving=true;':''}try{return base(...args);}finally{${name==='commit'?'__offlineSaving=false;':''}const p=__offlineProfile.${name}??={calls:0,ms:0};p.calls++;p.ms+=performance.now()-t;}};}`).join('')}globalThis.EmberwildOffline={`);}
function game(source,bag=0){
 const r=loadRuntime(root,'index.html',{},undefined,{transformSource:(name,code)=>name===file?transform(source):code});
 r.ctx.performance.now=performance.now.bind(performance);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`globalThis.rngState=123456;globalThis.randomCalls=0;Math.random=()=>{randomCalls++;rngState=(Math.imul(rngState,1664525)+1013904223)>>>0;return rngState/4294967296;};uidSerial=0;selectSaveSlot(1);start(0);closeModal();state.lv=20;syncParty();refillParty();GAMEPLAY_SETTINGS.equipment.bagCapacity=10000;
 const token=createCompanionToken(EmberwildTokens.normalize().catalog[0].id);
 for(let i=0;i<${bag};i++)state.bag.push({...structuredClone(i%2?token:state.bag[0]),id:'load-'+i});
 startSelectedExploration();save();__offlineProfile={};
 globalThis.saveJSON={calls:0,ms:0};const stringify=JSON.stringify;JSON.stringify=function(...args){if(!__offlineSaving)return stringify.apply(this,args);const t=performance.now();try{return stringify.apply(this,args);}finally{saveJSON.calls++;saveJSON.ms+=performance.now()-t;}};`);
 return r;
}
function result(r){return JSON.parse(r.run(`JSON.stringify({save:packParty(),rngState,randomCalls,uidSerial,battleRate,combat:EmberwildOffline.snapshot()})`));}
async function replay(source,hours,bag){const r=game(source,bag);let writes=0,writeMs=0;const put=r.ctx.localStorage.setItem;r.ctx.localStorage.setItem=(k,v)=>{const t=performance.now();try{writes++;return put(k,v);}finally{writeMs+=performance.now()-t;}};
 r.advance(Math.round(hours*3600000));const t=performance.now();await r.run('EmberwildOffline.settle()');const ms=performance.now()-t;assert.equal(r.run('EmberwildOffline.failed'),false);assert.deepEqual(r.errors,[]);
 const profile=JSON.parse(r.run('JSON.stringify(__offlineProfile)'));return {r,state:result(r),measurement:{hours,initialBag:bag,ms,profile,saveJSON:JSON.parse(r.run('JSON.stringify(saveJSON)')),writes,writeMs,kills:r.run('state.totalKills'),finalBag:r.run('state.bag.length')}};}
async function equivalenceScenarios(){
 // Test-only high drop probabilities ensure generated token/affix data is
 // actually compared, rather than accepting a seed that happens to drop none.
 const scenarios={
  boosts:`for(const id of ['exp_100_30m','drop_50_30m']){state.consumables[id]=1;useSupply(id);}party.timedBoosts[0].remainingMs=20000;party.timedBoosts[1].remainingMs=45000;save();`,
  drops:`state.lv=1;syncParty();refillParty();state.healingPotions.heal_standard=5000;for(const row of GAMEPLAY_SETTINGS.drops.entries)if(['gear','equipment'].includes(row.type))row.chanceByDifficulty=[1,1,1];save();`
 };
 for(const [scenario,setup] of Object.entries(scenarios)){
  const states=[];let summary;
  for(const phase of ['before','after']){
   const r=game(sources[phase]);r.run(setup);r.advance(600000);await r.run('EmberwildOffline.settle()');assert.equal(r.run('EmberwildOffline.failed'),false);states.push(result(r));
   summary={kills:r.run('state.totalKills'),gear:r.run('(party.offlineExploration.receipt||party.offlineExploration.pendingReceipt).gear.length'),tokens:r.run('state.bag.filter(EmberwildTokens.isToken).length')};
   if(scenario==='drops'){assert(summary.tokens>0);assert(summary.gear>summary.tokens);assert(r.run('Object.values(party.offlineExploration.receipt.consumed).some(n=>n>0)'));}
  }
  assert.deepEqual(states[1],states[0]);console.log(JSON.stringify({scenario,...summary,equivalent:true}));
 }
}
async function main(){
 const cases=process.argv.includes('--quick')?[[1/60,0],[1/60,1500]]:[[1/60,0],[8,0],[24,0],[1/60,1500]];
 for(const [hours,bag] of cases){const before=await replay(sources.before,hours,bag);console.log(JSON.stringify({phase:'before',...before.measurement}));const after=await replay(sources.after,hours,bag);assert.deepEqual(after.state,before.state);console.log(JSON.stringify({phase:'after',...after.measurement,speedup:before.measurement.ms/after.measurement.ms,equivalent:true}));}
 await equivalenceScenarios();
}
module.exports={game,result,replay,sources,equivalenceScenarios};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
