/* Runs the real published combat engine with an instrumented, controlled clock.
   node tests/realtime-combat-validation.cjs [--baseline <ref>] [--realtime]
   --realtime uses a real 50ms Node timer for 5 minutes (minimal DOM, no layout).
   Browser paint/layout/long-task measurements live in the browser regression. */
const fs=require('node:fs'),path=require('node:path'),{performance}=require('node:perf_hooks'),{execFileSync}=require('node:child_process');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
function game({baseline,rate=1,job=1,durable=false}={}){
 const old=baseline?execFileSync('git',['show',baseline+':js/combat/offline-exploration.js'],{cwd:root,encoding:'utf8'}):null;
 const r=loadRuntime(root,'index.html',{},undefined,{transformSource:(name,code)=>{
  if(name==='js/combat/offline-exploration.js')return (old||code).replace('actionSerial++;stepping=true;', 'globalThis.paceEvents?.push({at,serial:actionSerial+1});actionSerial++;stepping=true;');
  return code;
 }});
 r.ctx.performance.now=performance.now.bind(performance);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(${job});closeModal();globalThis.paceSeed=123456;Math.random=()=>{paceSeed=(Math.imul(paceSeed,1664525)+1013904223)>>>0;return paceSeed/4294967296;};startSelectedExploration();save();globalThis.paceEvents=[];globalThis.paceActions=[];globalThis.paceFrames=[];
 const paceRecord=recordAction;recordAction=function(...args){const out=paceRecord(...args);paceActions.push({at:Date.now(),id:args[0],kind:args[2],round,foes:foes.map(e=>({id:e.id,hp:e.hp}))});return out;};
 const paceRender=render;render=function(...args){const t=performance.now(),out=paceRender(...args);paceFrames.push({at:Date.now(),actions:paceActions.length,ms:performance.now()-t});return out;};
 const paceJournal=refreshGlobalJournal;refreshGlobalJournal=function(...args){const t=performance.now(),out=paceJournal(...args);paceFrames.push({at:Date.now(),actions:paceActions.length,ms:performance.now()-t});return out;};
 `);
 if(durable)r.run(`for(const h of heroes())h.shield=1e12;foes.forEach(e=>{e.hp=1e12;e.maxhp=1e12;e.atk=1;});`);
 r.run('paceEvents=[];paceActions=[];paceFrames=[];');return r;
}
function drive(r,ms,step=50){for(let t=0;t<ms;t+=step){r.advance(Math.min(step,ms-t));r.run('tick()');}}
function report(r){const a=json(r,'paceActions'),f=json(r,'paceFrames'),e=json(r,'paceEvents');const deltas=a.slice(1).map((v,i)=>v.at-a[i].at),batches=f.map((v,i)=>v.actions-(f[i-1]?.actions||0));return {actions:a.length,events:e.length,frames:f.length,minActionMs:Math.min(...deltas),maxActionMs:Math.max(...deltas),maxActionsPerFrame:Math.max(...batches),maxRenderMs:Math.max(...f.map(v=>v.ms)),kills:r.run('state.totalKills'),busy:r.run('EmberwildOffline.busy')};}
async function encounterReport(baseline,rate){
 const r=game({baseline,rate});r.run(`initiativeOrder=()=>[{side:'hero',id:heroKey(state),actor:state}];castPartySkill=()=>false;castSupport=()=>false;performHeroBasic=()=>{foes.forEach(e=>e.hp=0);};globalThis.encounterWins=[];globalThis.encounterSpawns=[];const paceFinish=finalizeBattleStatistics;finalizeBattleStatistics=function(result){if(activeBattleStat&&result==='victory')encounterWins.push(Date.now());return paceFinish(result);};const paceSpawn=spawnGroup;spawnGroup=function(...args){const out=paceSpawn(...args);encounterSpawns.push(Date.now());return out;};`);
 for(let t=0;t<30000;t+=50){r.advance(50);r.run('tick()');if(r.run('EmberwildOffline.busy'))await r.run('EmberwildOffline.settle(undefined,false)');}
 const w=json(r,'encounterWins'),sp=json(r,'encounterSpawns');return {rate,baseline,killToSettlementMs:w[0]-json(r,'paceActions')[0].at,settlementToSpawnMs:sp[0]-w[0],spawnToActionMs:json(r,'paceActions').find(a=>a.at>sp[0]).at-sp[0]};
}
async function main(){const i=process.argv.indexOf('--baseline'),baseline=i<0?null:process.argv[i+1];for(const rate of [1]){
 if(process.argv.includes('--encounters')){console.log(JSON.stringify(await encounterReport(baseline,rate)));continue;}
 const r=game({baseline,rate,durable:true});if(process.argv.includes('--realtime')){
  const start=performance.now();await new Promise(resolve=>{const timer=setInterval(()=>{const now=performance.now();r.advance(Math.round(now-start)-(r.now-r.startedWall));r.run('tick()');if(now-start>=300000){clearInterval(timer);resolve();}},50);r.startedWall=r.now;});
 }else {for(let t=0;t<300000;t+=50){r.advance(50);r.run('tick()');if(r.run('EmberwildOffline.busy'))await r.run('EmberwildOffline.settle(undefined,false)');}}
 console.log(JSON.stringify({rate,baseline,mode:process.argv.includes('--realtime')?'real-timer-minimal-DOM':'controlled-clock',...report(r)}));
 }}
module.exports={game,drive,json,report};if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
