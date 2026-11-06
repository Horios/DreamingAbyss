#!/usr/bin/env node
/* Read-only performance probe. Boots the real game in Chromium, plays for a few
   seconds, then measures full-page render cost per tab, save cost/size and the
   CPU profile of repeated battle-tab renders. It never writes repository files
   and is not part of the regression gate: numbers depend on the host machine,
   so compare runs on the same machine only.

   Usage: node tools/perf-probe.cjs [--widths=1280,390] [--renders=60] [--json=out.json]
*/
'use strict';
const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const {openRuntime}=require(path.join(root,'tests/runtime.cjs'));
const arg=(name,fallback)=>{const hit=process.argv.find(a=>a.startsWith('--'+name+'='));return hit?hit.slice(name.length+3):fallback;};
const widths=arg('widths','1280,390').split(',').map(Number).filter(Boolean);
const renders=Math.max(5,Number(arg('renders',60))||60);
const jsonOut=arg('json',null);

async function probe(width){
 const t0=Date.now();
 const g=await openRuntime(root);
 const bootMs=Date.now()-t0;
 try{
  await g.page.setViewportSize({width,height:900});
  const measured=await g.page.evaluate(async()=>{
   selectSaveSlot(1);start(1);closeModal();continueFromTitle();
   await new Promise(resolve=>setTimeout(resolve,6000));
   const time=(fn,n)=>{const a=performance.now();for(let i=0;i<n;i++)fn();return +((performance.now()-a)/n).toFixed(2);};
   const out={render:{},dom:{}};
   for(const t of ['battle','equipment','skills','character']){
    setTab(t);out.render[t]=time(()=>render(),t==='battle'?30:10);out.dom[t]=document.querySelectorAll('#app *').length;
   }
   setTab('battle');
   out.saveBytes=JSON.stringify(packParty()).length;
   out.saveMs=time(()=>save(),20);
   return out;
  });
  const cdp=await g.page.context().newCDPSession(g.page);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:100});await cdp.send('Profiler.start');
  await g.page.evaluate(n=>{for(let i=0;i<n;i++)render();},renders);
  const {profile}=await cdp.send('Profiler.stop');
  const byId=new Map(profile.nodes.map(n=>[n.id,n])),self=new Map();let total=0;
  profile.samples.forEach((id,i)=>{const f=byId.get(id).callFrame,dt=profile.timeDeltas[i]||0;const key=(f.functionName||'(anonymous)')+' '+(f.url.split('/').pop().split('?')[0]||'')+':'+(f.lineNumber+1);self.set(key,(self.get(key)||0)+dt);total+=dt;});
  await cdp.send('Performance.enable');
  const metrics=Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  return {width,bootMs,...measured,
   battleRenderProfile:{renders,totalMs:+(total/1000).toFixed(1),top:[...self].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([k,v])=>({fn:k,ms:+(v/1000).toFixed(1),share:+(v/total*100).toFixed(1)}))},
   jsHeapMB:+(metrics.JSHeapUsedSize/1048576).toFixed(1),errors:g.errors.slice(0,10)};
 }finally{await g.browser.close();}
}

(async()=>{
 const results=[];
 for(const width of widths)results.push(await probe(width));
 const text=JSON.stringify(results,null,1);
 if(jsonOut)fs.writeFileSync(jsonOut,text);
 console.log(text);
 if(results.some(r=>r.errors.length))process.exitCode=1;
})().catch(error=>{console.error(error);process.exit(1);});
