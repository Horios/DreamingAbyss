/* Read the current published skill definitions without changing game balance.
   Default: audit old time units and conversion requirements.
   --candidate path.json --seconds 28800: simulate explicitly supplied scheduling
   and MP parameters. This is NOT a damage, survival or reward simulator. */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {performance}=require('node:perf_hooks');
const {loadRuntime}=require('../tests/headless-runtime.cjs');
const Engine=require('../js/combat/seconds-timeline.js');
const root=path.resolve(__dirname,'..');
function audit(){
 const r=loadRuntime(root);
 return JSON.parse(r.run(`JSON.stringify((()=>{
   const doc=exportableBalance(),pacing=GAMEPLAY_SETTINGS.combat.pacing;
   const definitions=doc.skillSystem.definitions;
   return {
    previewVersion:${JSON.stringify(JSON.parse(fs.readFileSync(path.join(root,'data/preview-version.json'),'utf8')).version)},
    runtimeSwitched:false,
    timeUnits:doc.timeUnits,
    legacyCadence:{actionIntervalSeconds:pacing.actionIntervalMs/1000,roundMinimumSeconds:pacing.roundMinimumMs/1000,
     noSupportExamples:[1,3,5].map(enemies=>({heroes:1,enemies,roundLowerBoundSeconds:Math.max(pacing.roundMinimumMs,pacing.actionIntervalMs*(enemies+1))/1000})),
     note:'下限估計；輔助施放、控制與結束流程仍影響實際間隔。舊速度僅影響順序，未決定行動頻率。'},
    classCounts:CLASSES.map((c,job)=>({job,name:c.name,core:c.skills.length,support:SUPPORT[job].length,legacyBaseSpeed:GAMEPLAY_SETTINGS.combat.speed.heroBase[job]})),
    sharedSkills:definitions.length,
    skillTypes:definitions.reduce((out,s)=>(out[s.type]=(out[s.type]||0)+1,out),{}),
    statuses:doc.statusDefinitions.length,
    missingSecondsDesign:definitions.map(s=>({id:s.id,name:s.name,type:s.type,legacyCooldown:s.cooldown??null,
     requires:s.type==='passive'?['event timing / internal cooldown review']:['cooldownSeconds','mpCost',...(s.type==='trigger'?[]:['castSeconds','actionCostSeconds','priority / condition'])]})),
    blockers:[
     'Class base intervals and the minimum action interval are not finalized; examples in the plan are not defaults.',
     'MP pools, skill costs and regeneration need resource modelling before activation.',
     'Global-round support duration and actor-turn cooldown require separate conversions.',
     'Holy prison, death curse, cleave, controls and boss counters need explicit event adapters.',
     'Offline snapshot validation currently requires integer round clocks and a round cursor.',
     'The old offline fast sampler is invalid for the new model until its cache key and guards are migrated.'
    ]
   };
 })())`));
}
function simulate(input,seconds){
 const counts={},first={},last={},minMp={};let realTimeSimulationStart=performance.now();
 const t=Engine.create(input.config,input.actors,{
  onEvent(e,t){
   const key=e.actorId+':'+(e.skillId||e.type);counts[key]=(counts[key]||0)+1;
   first[key]??=e.timeSeconds;last[key]=e.timeSeconds;
   for(const a of input.actors)minMp[a.id]=Math.min(minMp[a.id]??a.mp,t.actor(a.id).mp);
  }
 });
 for(const s of input.statuses||[])t.addStatus(s);
 let result,chunks=0;
 do{result=t.advanceTo(seconds,{maxEvents:10000});chunks++;}while(!result.complete);
 return {scope:'scheduling-and-MP-only',seconds,chunks,events:t.serial,elapsedMs:performance.now()-realTimeSimulationStart,
  counts,first,last,minMp,actors:input.actors.map(a=>t.actor(a.id)),
  limitations:['No existing skill damage or reward hooks are installed.','No proposed parameter is persisted to game balance.','Conditions must be verified in the future game adapter.']};
}
if(require.main===module){
 const option=process.argv.indexOf('--candidate');
 if(option>=0){
  const duration=process.argv.indexOf('--seconds'),seconds=duration<0?28800:Number(process.argv[duration+1]);
  console.log(JSON.stringify(simulate(JSON.parse(fs.readFileSync(process.argv[option+1],'utf8')),seconds),null,2));
 }else console.log(JSON.stringify(audit(),null,2));
}
module.exports={audit,simulate};
