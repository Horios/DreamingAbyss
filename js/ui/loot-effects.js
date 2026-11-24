/* v0.182: read-only victory presentation. Inventory is already committed by rewardGroupKill.
   Never awaited by the combat timeline; offline replay never takes a snapshot or queues an effect. */
(()=>{
 'use strict';
 const key='emberwild-battle-effects.loot',modes=['off','stream','local'];
 let preference='stream',pending=new Map(),encounter=null,owner=null,layer=null;
 const active=new Set(),slots=new Set(),reduced=matchMedia('(prefers-reduced-motion: reduce)');
 try{const saved=localStorage.getItem(key);if(modes.includes(saved))preference=saved;}catch{}
 // v0.182: beam size. 小 is the original size; 中 and 大 scale the beam, glow, flight trail and arrival flash.
 const sizeKey='emberwild-battle-effects.loot-size',SIZES={small:1,medium:1.6,large:2.2},SIZE_NAMES={small:'小',medium:'中',large:'大'};
 let size='small';try{const saved=localStorage.getItem(sizeKey);if(saved in SIZES)size=saved;}catch{}
 const live=()=>!!party&&tab==='battle'&&!document.hidden&&!$('modal')?.open&&!globalThis.isEmberwildTitleOpen?.()&&!globalThis.EmberwildOffline?.busy&&!party.offlineExploration?.receipt;
 function rect(node){if(!node?.isConnected)return null;const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth&&s.visibility!=='hidden'&&s.display!=='none'?r:null;}
 function clear(){for(const n of active)n.remove();active.clear();slots.clear();layer?.remove();layer=null;pending.clear();encounter=null;owner=null;}
 function safe(fn){try{return fn();}catch(error){clear();console.warn('戰利品演出已清理',error);}}
 function stock(){
  const h=party.members[0],items=new Map();
  const put=(kind,id,name,n)=>items.set(kind+':'+id,{kind,key:id,name,count:Number(n)||0});
  put('material','鍛鐵','鍛鐵',h.ore);put('material','粉塵','寶石粉塵',h.dust);
  for(const [id,n] of Object.entries(h.materials||{}))put('material',id,id,n);
  h.gems.forEach((n,i)=>put('gem',String(i),GEMS[i].name,n));
  for(const item of SHOP)put('item',item.id,item.name,__EMBERWILD_INVENTORY_STOCK.count(item.id));
  return {items,gear:new Set(h.bag.map(g=>g.id))};
 }
 function add(item,e){
  if(item.count<=0)return;
  // Only stackable inventory identities merge. Equipment instances keep their own names/quality.
  const id=item.gear?'gear:'+item.gear.id:item.kind+':'+item.key,old=pending.get(id);
  if(old)old.count+=item.count;else if(pending.size<128)pending.set(id,{...item,enemyId:e.id});
 }
 const rewardBase=rewardGroupKill;
 rewardGroupKill=function(e,...args){
  if(!e||e.rewarded||preference==='off'||!live())return rewardBase.call(this,e,...args);
  const before=safe(()=>{if(encounter!==foes||owner!==party){pending.clear();encounter=foes;owner=party;}return stock();});
  const out=rewardBase.call(this,e,...args);
  if(before&&e.rewarded)safe(()=>{
   const after=stock();for(const [id,item] of after.items){const n=item.count-(before.items.get(id)?.count||0);if(n>0)add({...item,count:n},e);}
   for(const g of party.members[0].bag)if(!before.gear.has(g.id))add({kind:'gear',key:g.id,name:equipmentDisplayName(g),count:1,gear:g},e);
  });
  return out;
 };
 function root(){if(!layer){layer=document.createElement('div');layer.className='loot-fx-layer';layer.dataset.lootSize=size;layer.style.setProperty('--loot-size',String(SIZES[size]));layer.setAttribute('aria-hidden','true');document.body.appendChild(layer);}return layer;}
 function remove(n){active.delete(n);n.remove();if(!active.size){layer?.remove();layer=null;}}
 function mount(n){active.add(n);root().appendChild(n);}
 function finishAnimation(n,fn,slot){
  n.addEventListener('animationend',event=>{if(event.target===n)safe(()=>{if(!active.has(n))return;remove(n);if(live())fn?.();});});
  n.addEventListener('animationcancel',event=>{if(event.target===n){remove(n);if(slot!==undefined)slots.delete(slot);}});
 }
 function target(){
  const group=globalThis.EmberwildNavigation?.design.groups.find(g=>g.pages.some(p=>p.id==='equipment'))?.id;
  const nodes=[...document.querySelectorAll('.game-nav [data-page],nav [data-nav-group]')];
  for(const node of nodes){if(node.dataset.page!=='equipment'&&(!group||node.dataset.navGroup!==group))continue;const r=rect(node);if(r)return {x:Math.max(18,Math.min(innerWidth-18,r.left+r.width/2)),y:Math.max(18,Math.min(innerHeight-18,r.top+r.height/2)),node};}
  return {x:innerWidth-28,y:Math.max(50,innerHeight-85),node:null};
 }
 function itemRank(item){return item.gear?(item.gear.unidentified?0:gearQualityRank(item.gear)):item.kind==='material'&&(item.key==='以太鍛鐵'||item.key==='光輝碎塊')?3:0;}
 function palette(item){
  const g=item.gear,rank=itemRank(item);
  // These are the existing rare crafting material inventory keys, not matches on display names.
  const rare=item.kind==='material'&&(item.key==='以太鍛鐵'||item.key==='光輝碎塊');
  const sample=document.createElement('span');sample.className=g?(g.unidentified?'loot-rarity-0':equipmentNameClass(g)):'loot-rarity-'+(rare?3:0);
  if(g)sample.innerHTML=equipmentNameHTML(g);
  const definition=item.kind==='item'?__EMBERWILD_INVENTORY_STOCK.item(item.key):null;
  const style=textRarityStyleById(definition?.textStyleId);
  sample.style.cssText='position:fixed;visibility:hidden;pointer-events:none';root().appendChild(sample);
  const text=sample.querySelector('.tr-text,.enhanced-name')||sample,color=style?.textColor||getComputedStyle(text).color;
  sample.remove();return {color,rank:rare?3:rank};
 }
 function node(cls,item,color){const n=document.createElement('div');n.className=cls;n.dataset.lootName=item.name;n.style.setProperty('--loot-color',color);return n;}
 function label(item,color,x,y,width,slot){
  const limit=matchMedia('(max-width:600px)').matches?8:12;if(active.size>=limit){slots.delete(slot);return;}
  const n=node('loot-fx-name',item,color);n.textContent=item.name+' × '+item.count;
  n.style.width=width+'px';n.style.left=Math.max(6,Math.min(innerWidth-width-6,x-width/2))+'px';n.style.top=Math.max(6,Math.min(innerHeight-50,y))+'px';
  mount(n);finishAnimation(n,()=>slots.delete(slot),slot);
 }
 function receive(item,color,slot,width){
  const end=target(),limit=matchMedia('(max-width:600px)').matches?8:12;
  if(active.size<limit&&end.node){const flash=node('loot-fx-receive',item,color);flash.style.left=end.x+'px';flash.style.top=end.y+'px';mount(flash);finishAnimation(flash);}
  label(item,color,end.x,end.y-48-slot*40,width,slot);
 }
 function flight(item,color,x,y,slot,width){
  if(!live())return;const end=target(),n=node('loot-fx-flight',item,color);
  n.style.left=x+'px';n.style.top=y+'px';n.style.setProperty('--loot-dx',(end.x-x)+'px');n.style.setProperty('--loot-dy',(end.y-y)+'px');n.style.setProperty('--loot-mx',((end.x-x)*.45)+'px');n.style.setProperty('--loot-my',((end.y-y)*.45-55)+'px');
  mount(n);finishAnimation(n,()=>receive(item,color,slot,width),slot);
 }
 function present(){
  const items=[...pending.values()];pending.clear();encounter=null;owner=null;
  if(preference==='off'||!live()||!items.length)return;
  const field=document.querySelector('#battleEnemyIcons'),r=rect(field);if(!r)return;
  const mobile=matchMedia('(max-width:600px)').matches,limit=mobile?8:12,local=preference==='local'||reduced.matches;
  const columns=Math.max(1,Math.floor(r.width/150));
  const max=Math.min(mobile?4:6,local?columns:Infinity);
  const allyHead=rect(document.querySelector('.seconds-side-ally>.seconds-side-head'));
  const localTop=allyHead&&allyHead.top-r.bottom>=38?r.bottom+4:r.top+4;
  if(local)items.sort((a,b)=>itemRank(b)-itemRank(a));
  // No unbounded queue under rapid victories. Already-visible names keep their full lifetime.
  const free=Array.from({length:max},(_,i)=>i).filter(i=>!slots.has(i));
  const count=Math.min(items.length,free.length,Math.max(0,Math.floor((limit-active.size)/2)));if(!count)return;
  const width=Math.min(220,Math.max(100,r.width/columns-8));
  for(const [i,item] of items.slice(0,count).entries()){
   const {color,rank}=palette(item),enemy=[...field.querySelectorAll('[data-enemy-id]')].find(n=>n.dataset.enemyId===String(item.enemyId)),er=rect(enemy);
   const slot=free[i];slots.add(slot);
   const col=slot%columns,x=local?r.left+(col+.5)*r.width/columns:Math.max(r.left+12,Math.min(r.right-12,(er?er.left+er.width/2:r.left+r.width/2)+(i-(count-1)/2)*22));
   const y=local?Math.min(innerHeight-20,localTop+36):Math.min(innerHeight-20,(er?.bottom||r.bottom)-8);
   const n=node('loot-fx-drop'+(local?' loot-fx-local':''),item,color);n.style.left=x+'px';n.style.top=y+'px';n.style.setProperty('--loot-power',String(1+rank*.15));
   n.innerHTML='<i class="loot-fx-beam"></i><i class="loot-fx-point"></i>';mount(n);
   if(local)label(item,color,x,localTop,width,slot);
   finishAnimation(n,local?null:()=>flight(item,color,x,y,slot,width),slot);
  }
 }
 const finalizeBase=finalizeBattleStatistics;
 finalizeBattleStatistics=function(result,...args){const out=finalizeBase.call(this,result,...args);safe(()=>{if(result==='victory'&&owner===party&&encounter===foes)present();else pending.clear();});return out;};
 const optionsBase=battleEffectsOptionsView;
 battleEffectsOptionsView=function(){return optionsBase()+'<section class="panel option-row"><div><h2>戰利品掉落演出</h2><p class="small">勝利後顯示已取得的道具，不影響掉落結算與探索速度。</p></div><select data-loot-effects aria-label="戰利品掉落演出" onchange="setLootEffects(this.value)">'+modes.map((v,i)=>'<option value="'+v+'" '+(v===preference?'selected':'')+'>'+['關閉','流光入袋','原地顯示'][i]+'</option>').join('')+'</select></section>'+
  '<section class="panel option-row"><div><h2>掉落光柱大小</h2><p class="small">小為原本大小；中、大會放大光柱、光點與飛行軌跡。</p></div><select data-loot-size aria-label="掉落光柱大小" onchange="setLootEffectSize(this.value)">'+Object.keys(SIZES).map(v=>'<option value="'+v+'" '+(v===size?'selected':'')+'>'+SIZE_NAMES[v]+'</option>').join('')+'</select></section>';};
 globalThis.setLootEffectSize=function(value){if(!(value in SIZES))return false;size=value;clear();try{localStorage.setItem(sizeKey,value);}catch{toast('光柱大小已套用，但瀏覽器無法保存設定。');}document.querySelectorAll('[data-loot-size]').forEach(n=>n.value=value);return true;};
 globalThis.setLootEffects=function(value){if(!modes.includes(value))return false;preference=value;clear();try{localStorage.setItem(key,value);}catch{toast('掉落演出已套用，但瀏覽器無法保存設定。');}document.querySelectorAll('[data-loot-effects]').forEach(n=>n.value=value);return true;};
 for(const name of ['resetEncounter','resetSession','loadParty','stopTeamExploration','returnToTitle']){const base=globalThis[name];if(typeof base==='function')globalThis[name]=function(...args){clear();return base.apply(this,args);};}
 const tabBase=setTab;setTab=function(id,...args){clear();return tabBase.call(this,id,...args);};
 const renderBase=render;render=function(...args){if(!live())clear();return renderBase.apply(this,args);};
 const modal=$('modal');if(modal)new MutationObserver(()=>{if(modal.open)clear();}).observe(modal,{attributes:true,attributeFilter:['open']});
 for(const event of ['pagehide','visibilitychange','resize'])addEventListener(event,clear);
 addEventListener('scroll',event=>{const field=document.querySelector('#battleEnemyIcons');if(event.target===document||field&&event.target?.contains?.(field))clear();},{passive:true,capture:true});
 addEventListener('storage',e=>{if(e.key===key||e.key===null){preference=modes.includes(e.newValue)?e.newValue:'stream';clear();}if(e.key===sizeKey||e.key===null){size=e.newValue in SIZES?e.newValue:'small';clear();}});
 globalThis.EmberwildLootEffects={clear,get preference(){return preference;},get size(){return size;},SIZES,get activeCount(){return active.size;},get pendingCount(){return pending.size;}};
})();
