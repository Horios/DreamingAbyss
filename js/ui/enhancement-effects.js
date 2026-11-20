/* v0.183: presentation of committed enhancement results only.
   Current rules guarantee success through +10. Higher-level, failure and destruction
   effects accept explicit results; this module never rolls RNG or removes equipment. */
(()=>{
 'use strict';
 const flashMs=200,gapMs=300;
 let layer=null,currentGear=null;
 const visible=()=>!!party&&tab==='forge'&&!document.hidden&&!globalThis.isEmberwildTitleOpen?.();
 function clear(){layer?.remove();layer=null;currentGear=null;}
 function rect(node){if(!node?.isConnected)return null;const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&s.visibility!=='hidden'?r:null;}
 function anchor(id){
  if(document.body.dataset.sheet==='forge'){const heading=rect(document.querySelector('.forge-detail-pane .gear-detail-header h2'));if(heading)return heading;}
  const icon=[...document.querySelectorAll('.forge-gear-item[data-item-gear]')].find(n=>n.dataset.itemGear===String(id));
  return rect(icon?.querySelector('.item-slot-art'))||rect(document.querySelector('.forge-detail-pane .gear-detail-header h2'))||rect(document.querySelector('.forge-detail-pane'));
 }
 function sequence(level){if(!Number.isInteger(level)||level<1||level>12)return [];return ['small',...(level>=4?['medium']:[]),...(level>=8?['large']:[]),...(level>=11?['rainbow']:[])];}
 function present(result){
  if(!result||!['success','failure','destroyed'].includes(result.outcome)||!visible())return false;
  const steps=result.outcome==='success'?sequence(result.level):[result.outcome==='failure'?'mist':'explosion'];if(!steps.length)return false;
  const r=anchor(result.gearId);if(!r)return false;
  clear();currentGear=String(result.gearId);layer=document.createElement('div');layer.className='forge-enhance-layer';layer.setAttribute('aria-hidden','true');layer.dataset.outcome=result.outcome;layer.dataset.gearId=currentGear;
  layer.style.left=Math.max(45,Math.min(innerWidth-45,r.left+r.width/2))+'px';layer.style.top=Math.max(45,Math.min(innerHeight-45,r.top+r.height/2))+'px';
  const lifetime=result.outcome==='success'?steps.length*flashMs+(steps.length-1)*gapMs:result.outcome==='failure'?650:450;
  layer.style.setProperty('--enhance-lifetime',lifetime+'ms');
  steps.forEach((type,i)=>{const n=document.createElement('i');n.className='forge-enhance-flash forge-enhance-'+type;n.dataset.enhanceFx=type;n.style.setProperty('--enhance-delay',(i*(flashMs+gapMs))+'ms');layer.appendChild(n);});
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
 // Explicit presentation contract for future committed failure/destruction results.
 addEventListener('emberwild:enhancement-result',event=>safePresent(event.detail));
 const tabBase=setTab;setTab=function(...args){clear();return tabBase.apply(this,args);};
 const chooseBase=chooseForge;chooseForge=function(...args){clear();return chooseBase.apply(this,args);};
 for(const name of ['resetSession','loadParty','returnToTitle']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(...args){clear();return base.apply(this,args);};}
 const renderBase=render;render=function(...args){const out=renderBase.apply(this,args);if(layer&&(!visible()||String(forgeSelection)!==currentGear))clear();return out;};
 for(const event of ['pagehide','visibilitychange','resize'])addEventListener(event,clear);
 addEventListener('scroll',event=>{const field=document.querySelector('.forge-workbench');if(event.target===document||field&&event.target?.contains?.(field)||event.target?.classList?.contains('responsive-detail-body'))clear();},{capture:true,passive:true});
 globalThis.EmberwildEnhancementEffects={present:safePresent,clear,sequence,flashMs,gapMs,get activeCount(){return layer?layer.childElementCount:0;}};
})();
