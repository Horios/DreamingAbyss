'use strict';
const fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright'),{openRuntime}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..'),out=path.resolve('ui-layout-review'),baseline=process.env.UI_LAYOUT_BASELINE;
const sizes=[[1920,1080],[1366,768],[1024,768],[768,1024],[390,844],[320,568],[844,390]];
const pages=['character','roster','partnerRoster','skills','equipment','inventory-materials','inventory-items','inventory-tokens','worn','forge','bossCraft','shop','story','story-side','story-npc','quests','gather','alchemy','statistics','battle'];
const pairs=[['character',1366],['equipment',1366],['skills',1366],['battle',1366],['equipment',390]],images=new Map(),metrics=[];
fs.mkdirSync(out,{recursive:true});
async function phase(dir,name){
 const v=JSON.parse(fs.readFileSync(path.join(dir,'data/preview-version.json'),'utf8')).version,r=await openRuntime(dir),p=r.page;
 try{
 await p.evaluate(()=>{let seed=34901;Math.random=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;selectSaveSlot(1);start(0);clearInterval(timer);closeModal();recruitCompanion(10);closeModal();recruitCompanion(12);closeModal();});
 await p.evaluate(async()=>{await EmberwildOffline.settle(undefined,false);if(EmberwildOffline.failed)throw Error('Offline setup failed');if(party.offlineExploration?.receipt?.complete)acknowledgeOfflineExploration();closeModal();clearInterval(timer);});
 await p.evaluate(version=>{document.body.insertAdjacentHTML('afterbegin','<div id="preview-build-banner" style="position:fixed;top:8px;right:8px;z-index:2147483647;padding:6px 10px;border-radius:4px;background:#8b3a2b;color:#fff;font:700 12px/1.2 system-ui,sans-serif;box-shadow:0 1px 4px #0008;">測試版本 '+version+'</div>');for(let i=0;i<32;i++)state.bag.push(gear(1,i%4,i%4,i%4));save();},v);
 for(const [width,height]of sizes){await p.setViewportSize({width,height});
  for(const id of pages){
   await p.evaluate(t=>{closeModal();if(t.startsWith('inventory-')){setTab('equipment');setInventoryCategory(t.slice(10));}else if(t.startsWith('story-'))setStoryCategory(t.slice(6));else{if(t==='equipment')setInventoryCategory('equipment');setTab(t);}if(t==='battle'){spawnGroup();render();}document.getElementById('toast').style.display='none';},id);
   const file=name+'-'+id+'-'+width+'.png',b=await p.screenshot({path:path.join(out,file)});if(pairs.some(([page,w])=>page===id&&w===width))images.set(file,b);
   metrics.push({phase:name,page:id,width,height,...await p.evaluate(()=>{const m=document.querySelector('main');return {overflow:m.scrollWidth-m.clientWidth};})});
  }
  if([1366,768,390].includes(width))for(const id of ['mailbox','achievements','options','guide','wishingLake']){await p.evaluate(t=>{closeModal();setTab(t);},id);await p.screenshot({path:path.join(out,name+'-utility-'+id+'-'+width+'.png')});}await p.evaluate(()=>closeModal());
 }
 if(r.errors.length)throw Error(JSON.stringify(r.errors));
 }finally{await r.browser.close();}return v;
}
(async()=>{
 if(!baseline)throw Error('UI_LAYOUT_BASELINE missing');
 const before=await phase(baseline,'before'),after=await phase(root,'after');
 const b=await chromium.launch({headless:true,args:['--no-sandbox']}),p=await b.newPage();
 try{for(const [id,width]of pairs){
  const height=width===390?844:768;await p.setViewportSize({width:width*2,height:height+56});
  const a=images.get('before-'+id+'-'+width+'.png').toString('base64'),z=images.get('after-'+id+'-'+width+'.png').toString('base64');
  await p.setContent('<html lang="zh-Hant"><meta charset="utf-8"><style>body{margin:0;font:24px system-ui}header{display:flex;height:56px;background:#f4f4f4;align-items:center}header b{width:50%;padding:8px 16px;box-sizing:border-box}main{display:flex}img{display:block;width:'+width+'px;height:'+height+'px}</style><header><b>改版前 '+before+' · '+id+'</b><b>改版後 '+after+' · '+id+'</b></header><main><img src="data:image/png;base64,'+a+'"><img src="data:image/png;base64,'+z+'"></main></html>');
  await p.waitForFunction(()=>Array.from(document.images).every(i=>i.complete));
  const name='comparison-'+id+'-'+width+'.png',png=await p.screenshot({path:path.join(out,name)}),data=png.toString('base64');
  console.log('UI_REVIEW_IMAGE_START '+name+' '+data.length);for(let i=0;i<data.length;i+=6000)console.log('UI_REVIEW_IMAGE_CHUNK '+name+' '+i+' '+data.slice(i,i+6000));console.log('UI_REVIEW_IMAGE_END '+name);
 }}finally{await b.close();}
 let html='<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>夢淵 UI 對照 '+after+'</title><style>body{font:16px system-ui;margin:24px;background:#eee}details{padding:12px;margin:8px;background:white}.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}img{width:100%;height:auto}figure{margin:0}summary{cursor:pointer}</style><h1>夢淵 '+before+' → '+after+'</h1><p>實際 Chromium 截圖，含 Pages 版本標示；使用測試角色，沒有私人存檔。點擊圖片開啟原尺寸。</p>';
 for(const [width,height]of sizes){html+='<h2>'+width+' × '+height+'</h2>';for(const id of pages){html+='<details><summary>'+id+'</summary><div class="pair">';for(const phase of ['before','after']){const f=phase+'-'+id+'-'+width+'.png';html+='<figure><figcaption>'+phase+'</figcaption><a href="'+f+'"><img loading="lazy" src="'+f+'"></a></figure>';}html+='</div></details>';}}
 html+='<h2>工具列彈窗</h2>';for(const f of fs.readdirSync(out).filter(n=>n.includes('-utility-')))html+='<details><summary>'+f+'</summary><a href="'+f+'"><img loading="lazy" src="'+f+'"></a></details>';fs.writeFileSync(path.join(out,'index.html'),html+'</html>');
 fs.writeFileSync(path.join(out,'review.json'),JSON.stringify({version:after,beforeVersion:before,commit:process.env.GITHUB_SHA,baseline:'a0177840154d7bb58e4e2cd16c9e1db82224edc4',metrics},null,2));
 const overflows=metrics.filter(x=>x.phase==='after'&&x.overflow>1);console.log('UI_REVIEW_COMPLETE '+JSON.stringify({version:after,images:fs.readdirSync(out).filter(f=>f.endsWith('.png')).length,afterOverflows:overflows}));if(overflows.length)throw Error('Review pages overflow: '+JSON.stringify(overflows));
})().catch(e=>{console.error(e);process.exit(1)});
