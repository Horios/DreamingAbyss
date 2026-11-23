/* Presentation of committed enhancement results only; never changes equipment or RNG. */
(()=>{
 'use strict';
 const lifetimeMs=1500;
 let layer=null,currentGear=null;
 const visible=()=>!!party&&tab==='forge'&&!document.hidden&&!globalThis.isEmberwildTitleOpen?.();
 function clear(){layer?.remove();layer=null;currentGear=null;}
 function present(result){
  if(!result||!['success','failure','destroyed'].includes(result.outcome)||!visible())return false;
  const success=result.outcome==='success';
  if(success&&(!Number.isInteger(result.level)||result.level<1||result.level>12))return false;
  clear();currentGear=String(result.gearId);layer=document.createElement('div');layer.className='forge-enhance-layer '+(success?'forge-enhance-success':'forge-enhance-failure');layer.setAttribute('role','status');layer.dataset.outcome=result.outcome;layer.dataset.gearId=currentGear;
  layer.textContent=success?'強化成功！':'失敗 ...';
  layer.style.setProperty('--enhance-lifetime',lifetimeMs+'ms');
  layer.addEventListener('animationend',event=>{if(event.target===layer)clear();});layer.addEventListener('animationcancel',event=>{if(event.target===layer)clear();});
  document.body.appendChild(layer);return true;
 }
 function safePresent(result){try{return present(result);}catch(error){clear();console.warn('強化演出已清理',error);return false;}}
 const enhanceBase=enhance;
 enhance=function(id,...args){
  const g=findGear(id),before=g?.plus,out=enhanceBase.call(this,id,...args),after=findGear(id);
  // A rejected action, insufficient materials or a rolled-back save is not a failed roll.
  if(g&&after&&after.plus>before)safePresent({outcome:'success',level:after.plus,gearId:id});
  else if(out&&['failure','destroyed'].includes(out.outcome))safePresent({outcome:out.outcome,level:out.level,gearId:id});
  return out;
 };
 // Presentation contract for committed failure/destruction results.
 addEventListener('emberwild:enhancement-result',event=>safePresent(event.detail));
 const tabBase=setTab;setTab=function(...args){clear();return tabBase.apply(this,args);};
 const chooseBase=chooseForge;chooseForge=function(...args){clear();return chooseBase.apply(this,args);};
 for(const name of ['resetSession','loadParty','returnToTitle']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(...args){clear();return base.apply(this,args);};}
 const renderBase=render;render=function(...args){const out=renderBase.apply(this,args);// A destroyed item leaves the forge selection; keep its result visible.
 if(layer&&(!visible()||(layer.dataset.outcome!=='destroyed'&&String(forgeSelection)!==currentGear)))clear();return out;};
 for(const event of ['pagehide','visibilitychange','resize'])addEventListener(event,clear);
 globalThis.EmberwildEnhancementEffects={present:safePresent,clear,get activeCount(){return layer?1:0;}};
})();
