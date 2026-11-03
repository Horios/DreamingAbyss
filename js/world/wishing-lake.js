/* Permanent place; consumes and grants through the existing account stores. */
(()=>{
 'use strict';
 const M=EmberwildWishingLake,copy=x=>JSON.parse(JSON.stringify(x));
 let design=M.normalize(JSON.parse(balanceSourceText()||'null')?.wishingLake,exportableBalance()),busy=false,selection='',quantity=0,lastHTML='';
 const doc=()=>exportableBalance(),stock=()=>globalThis.__EMBERWILD_INVENTORY_STOCK;
 const ledgerKey=p=>KEY+'-wishing-lake-'+p.members[0].created;
 function ledger(p){const raw=localStorage.getItem(ledgerKey(p));if(!raw)return null;const x=JSON.parse(raw);if(!x||typeof x.day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x.day)||!Number.isSafeInteger(x.used)||x.used<0)throw Error('許願湖本機紀錄無效');return x;}
 function normalizeState(raw){
  const out=raw===undefined?{unlocked:false,notified:false,day:'',used:0,lastReward:null,festivalClaims:{},fairyEvents:{},companionTriggers:{},questCompletions:{}}:copy(raw);
  if(!out||typeof out.unlocked!=='boolean'||typeof out.notified!=='boolean'||typeof out.day!=='string'||out.day!==''&&!/^\d{4}-\d{2}-\d{2}$/.test(out.day)||!Number.isSafeInteger(out.used)||out.used<0||out.used>100000)throw Error('許願湖存檔無效');
  for(const k of ['festivalClaims','fairyEvents','companionTriggers','questCompletions']){out[k]??={};if(!out[k]||typeof out[k]!=='object'||Array.isArray(out[k])||Object.keys(out[k]).length>1000)throw Error('許願湖預留紀錄無效');}
  if(out.lastReward!==null&&(typeof out.lastReward!=='object'||!['gold','item','equipment'].includes(out.lastReward.type)||typeof out.lastReward.day!=='string'))throw Error('許願湖回贈紀錄無效');
  return out;
 }
 function ensure(p=party){
  if(!p)return null;
  const s=p.wishingLake??=normalizeState();
  if(p.mapClears?.[design.unlock.mapId])s.unlocked=true;
  const today=M.day();if(today>s.day){s.day=today;s.used=0;}
  // Retain a high-water mark even when an older export is imported in this browser.
  const l=ledger(p);if(l&&(l.day>s.day||l.day===s.day&&l.used>s.used)){s.day=l.day;s.used=l.used;}
  return s;
 }
 const exportBase=exportableBalance;exportableBalance=()=>({...exportBase(),wishingLake:copy(design)});
 const validateBase=validateBalanceConfig;validateBalanceConfig=function(input){const next=M.normalize(input.wishingLake,input),out=validateBase(input);out.wishingLake=next;return out;};
 const applyBase=applyBalanceConfig;applyBalanceConfig=function(input,options={}){const next=M.normalize(input.wishingLake,input),out=applyBase(input,options);design=next;if(options.persist!==false)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));return out;};
 const validatePartyBase=validateParty;validateParty=function(raw){const p=validatePartyBase(raw);p.wishingLake=normalizeState(raw.wishingLake);ensure(p);return p;};
 const packBase=packParty;packParty=function(){ensure();const out=packBase();out.wishingLake=copy(party.wishingLake);return out;};
 const loadBase=loadParty;loadParty=function(raw,...args){
  // A prepared journal contains the complete post-transaction save. Recover it
  // after a crash between the journal write and the ordinary save write.
  const candidate=raw.version===3?raw:null,l=candidate?.members?.[0]?ledger(candidate):null;
  const committed=l?.pending&&raw.wishingLake?.lastReward?.txId===l.txId;
  const source=l?.pending&&!committed?JSON.parse(l.pending):raw;
  const out=loadBase(source,...args);ensure();selection='';quantity=0;
  if(l?.pending){try{if(!committed){localStorage.setItem(KEY,l.pending);globalThis.__EMBERWILD_BOOT_SAVE_RAW=l.pending;}localStorage.setItem(ledgerKey(party),JSON.stringify({day:l.day,used:l.used,txId:l.txId}));}catch{}}
  return out;
 };
 function notify(){if(globalThis.EmberwildOffline?.busy)return;const s=ensure();if(!s?.unlocked||s.notified)return;s.notified=true;if(save()!==true){s.notified=false;return;}note('許願湖永久解鎖：每天可投入物品，等待湖泊回贈。','item');toast('已發現特殊地點：許願湖');}
 const clearBase=globalThis.recordMapClear;globalThis.recordMapClear=function(...args){const out=clearBase(...args);notify();return out;};
 function held(r){return r.kind==='material'?materialCount(r.key):r.kind==='item'?stock().count(r.key):0;}
 function setHeld(r,n){if(r.kind==='material'){setMaterialCount(r.key,n);return true;}return stock().set(r.key,n);}
 function gearCandidates(r){return (party?.members[0]?.bag||[]).filter(g=>{const id=globalThis.__EMBERWILD_GEAR_CATALOGUE_KEY(g),refs=globalThis.EmberwildTeams?.references(globalThis.__EMBERWILD_TEAMS.build(),g.id)||[];return id.kind===r.kind&&id.key===r.key&&!g.locked&&!g.lock&&!g.storyRewardKey&&!gearWearer(g.id)&&!refs.length&&!inlineAffixDrafts.has(affixDraftKey(g))&&!g.skillSockets?.gems?.some(x=>x!==null)&&globalThis.__EMBERWILD_CAN_SELL_GEAR(g);});}
 function choices(){
  if(!party)return [];
  const d=doc(),triggers=new Set(design.future.companionQuests.map(x=>x.triggerItemId));
  return design.inputs.filter(r=>r.enabled&&design.pools.find(p=>p.id===r.poolId)?.enabled!==false&&!r.specialTrigger&&!triggers.has(r.key)).flatMap(r=>{
   if(['material','item'].includes(r.kind))return M.safe(d,r.kind,r.key)&&held(r)>0?[{...r,choice:r.id,held:held(r)}]:[];
   if(!(r.kind==='equipment'?design.allowEquipment:design.allowTokens))return [];
   return gearCandidates(r).map(g=>({...r,choice:r.id+'/'+g.id,held:1,gear:g}));
  });
 }
 const remaining=()=>{const s=ensure();return s?Math.max(0,design.dailyLimit-s.used):0;};
 function current(){const rows=choices();return rows.find(r=>r.choice===selection)||null;}
 globalThis.selectLakeOffering=function(id){const r=choices().find(r=>r.choice===id);selection=r?.choice||'';quantity=r?.min||0;refresh();};
 globalThis.setLakeQuantity=function(n){quantity=Number(n);refresh();};
 function resultHTML(r){if(!r)return '<p class="small">湖面平靜，尚未收到回贈。</p>';
  const response={gold:'水面泛起金色漣漪，幾枚金幣接連浮出。',item:'湖底的微光緩緩升起，將一份禮物送到岸邊。',equipment:'一道微光劃過水面，一件裝備被輕輕推向岸邊。'};
  let reward=r.type==='gold'?'<strong>'+esc(r.amount)+' G</strong>':r.type==='item'?itemSlotHTML(r.kind,r.key,{count:r.quantity}):r.gear?gearSlotHTML(r.gear,{count:1,preview:r.gear}):esc(r.name||'裝備');
  return '<div class="lake-result" role="status"><p>'+response[r.type]+'</p>'+reward+'<p class="small">'+esc(r.day)+'</p></div>';
 }
 function view(){const s=ensure(),r=current(),n=remaining(),locked=!s?.unlocked;
  return '<div class="utility-dialog-controls"><button onclick="closeModal()">關閉</button></div><section class="lake-panel"><div class="eyebrow">SPECIAL PLACE</div><h1>許願湖</h1><p>林間的湖泊安靜映著天光。據說，沉入湖底的小小心意，有時也會得到回應。</p>'+(locked?'<p>通過第一片冒險區域後，或許就能找到那座傳說中的湖。</p>':'<p>今日剩餘 <b>'+n+'</b>／'+design.dailyLimit+' 次 · 台灣時間 00:00 重置</p>'+(!design.enabled?'<p>湖泊今日暫不接受投入。</p>':'')+(!n?'<p class="lake-complete">今日投入已完成，明天再來看看。</p>':'')+'<div class="lake-offerings">'+choices().map(x=>'<button class="lake-choice '+(x.choice===selection?'selected':'')+'" onclick="selectLakeOffering('+esc(JSON.stringify(x.choice))+')">'+(x.gear?gearSlotHTML(x.gear,{count:1}):itemSlotHTML(x.kind,x.key,{count:x.held}))+'<small>每次投入 '+x.min+(x.max!==x.min?'～'+x.max:'')+'</small></button>').join('')+'</div>'+(choices().length?'':'<p>尚未持有可投入的物品。</p>')+(r?'<div class="lake-confirm">'+(r.gear?gearSlotHTML(r.gear):itemSlotHTML(r.kind,r.key,{count:r.held}))+'<p>持有 '+r.held+' · 本次消耗 '+quantity+' · 今日剩餘 '+n+' 次</p>'+(r.quantityMode==='range'?'<label>投入數量 <input type="number" min="'+r.min+'" max="'+Math.min(r.max,r.held)+'" value="'+quantity+'" onchange="setLakeQuantity(this.value)"></label>':'')+'<button class="primary" onclick="confirmLakeOffering()" '+(!design.enabled||!n||busy||!Number.isInteger(quantity)||quantity<r.min||quantity>r.max||quantity>r.held?'disabled':'')+'>確認投入並領取回贈</button></div>':'')+'<h2>最近一次回贈</h2>'+resultHTML(s.lastReward))+'</section>';
 }
 function refresh(){const modal=$('modal');if(!modal.open||modal.dataset.view!=='wishing-lake')return;const html=view();if(html!==lastHTML){modal.innerHTML=html;lastHTML=html;}}
 globalThis.openWishingLake=function(){if(!party||!state||isEmberwildTitleOpen())return false;notify();const modal=$('modal');modal.dataset.view='wishing-lake';modal.classList.add('utility-dialog');modal.setAttribute('aria-label','許願湖');lastHTML='';if(!modal.open)modal.showModal();refresh();return true;};
 globalThis.confirmLakeOffering=function(){
  if(busy||!party||!state||partyBusy||globalThis.__EMBERWILD_SAVE_OWNER===false||!saveReady||globalThis.__EMBERWILD_BALANCE_SOURCE&&!globalThis.__EMBERWILD_BALANCE_READY)return false;
  globalThis.EmberwildOffline?.sync();
  if(globalThis.EmberwildOffline?.busy||globalThis.EmberwildOffline?.failed){toast('請先完成離線收益結算');return false;}
  let before=null,oldJournal=null,key=null;
  busy=true;
  try{
   const s=ensure(),r=current(),d=doc(),n=quantity;
   if(!s.unlocked||!design.enabled||!remaining()||!r||!Number.isSafeInteger(n)||n<r.min||n>r.max||n>r.held)throw Error('今日次數、投入物品或數量不符');
   M.normalize(design,d);
   // A full bag never takes extra gear (overflow is salvaged). Refuse before drawing when this pool can
   // yield equipment, so nothing is consumed and the draw cannot be re-rolled by filling the bag.
   {const pool=design.pools.find(p=>p.id===r.poolId),weights=pool?.typeWeights??design.typeWeights;
    if(playerHero().bag.length>=RULES.bagCapacity&&weights?.equipment>0&&M.eligible(design,d,r.poolId,party.mapClears).some(x=>x.type==='equipment'))throw Error('背包已滿，這個回贈池可能給予裝備，請先整理背包');}
   const result=M.draw(design,d,r.poolId,party.mapClears),h=playerHero();
   if(result.type==='gold'&&h.gold+result.amount>1e12||result.type==='item'&&(result.kind==='item'?stock().count(result.key):materialCount(result.key))+result.quantity>(result.kind==='item'?1e6:1e9))throw Error('回贈會超出庫存上限，請先整理背包');
   before={lake:copy(s),gold:h.gold,ore:h.ore,dust:h.dust,bag:[...h.bag],running,input:r.gear?null:held(r),reward:result.type==='item'?(result.kind==='item'?stock().count(result.key):materialCount(result.key)):null,r,result};
   if(r.gear){const i=h.bag.findIndex(g=>g.id===r.gear.id);if(i<0)throw Error('投入裝備已變動');h.bag.splice(i,1);}else if(!setHeld(r,held(r)-n))throw Error('無法消耗道具');
   if(result.type==='gold')h.gold+=result.amount;
   else if(result.type==='item'){if(!setHeld(result,held(result)+result.quantity))throw Error('回贈道具不存在');}
   else{
    const quality=GAMEPLAY_SETTINGS.rewards.equipmentQuality,rar=Math.random()<quality.rareChance?2:Math.random()<quality.fineConditionalChance?1:0;
    const g=withHero(h,()=>gear(result.tier,rand(4),rar));
    Object.assign(g,{equipmentLevel:result.level,acquiredAt:Date.now()});delete g.baseSnapshot;
    modeAffixes(g,0);globalThis.__EMBERWILD_EQUIPMENT_SKILLS.generate(g,{source:'drop',context:{map:result.mapIndex,difficulty:0},force:true});gearStatBreakdown(g);addGear(g);
    result.gear=copy(g);result.name=equipmentDisplayName(g);
   }
   s.used++;s.lastReward={...result,day:s.day,at:Date.now(),txId:crypto.randomUUID()};
   key=ledgerKey(party);oldJournal=localStorage.getItem(key);
   localStorage.setItem(key,JSON.stringify({day:s.day,used:s.used,txId:s.lastReward.txId,pending:JSON.stringify(packParty())}));
   if(save()!==true)throw Error('無法儲存，本次投入已取消');
   // If this small cleanup write fails, the complete journal safely replays the
   // same snapshot on reload rather than drawing or granting a second reward.
   try{localStorage.setItem(key,JSON.stringify({day:s.day,used:s.used,txId:s.lastReward.txId}));}catch{}
   before=null;selection='';quantity=0;render();refresh();return true;
  }catch(error){
   if(before){const h=playerHero(),b=before;party.wishingLake=b.lake;h.gold=b.gold;h.ore=b.ore;h.dust=b.dust;h.bag.splice(0,h.bag.length,...b.bag);running=b.running;
    if(b.result.type==='item')setHeld(b.result,b.reward);if(!b.r.gear)setHeld(b.r,b.input);
    if(key)try{if(oldJournal===null)localStorage.removeItem(key);else localStorage.setItem(key,oldJournal);}catch{}
   }
   toast(error.message);refresh();return false;
  }finally{busy=false;}
 };
 const navBase=globalThis.gameNavigationHTML;globalThis.gameNavigationHTML=function(...args){return navBase(...args)+'<button type="button" data-page="wishingLake" onclick="openWishingLake()">'+'<span class="game-nav-label">'+__EMBERWILD_SKILL_ICONS.svgFor('lucide:waves',[],{size:18})+'許願湖'+(ensure()?.unlocked?'':__EMBERWILD_SKILL_ICONS.svgFor('lucide:lock',[],{size:12}))+'</span>'+'</button>';};
 const tabBase=setTab;setTab=function(id){return id==='wishingLake'?openWishingLake():tabBase(id);};
 const after=globalThis.__EMBERWILD_AFTER_RENDER;globalThis.__EMBERWILD_AFTER_RENDER=function(...args){after?.(...args);if(party&&state){const utility=$('utilityNavigation');if(!document.getElementById('utilityButton-wishingLake'))utility.insertAdjacentHTML('beforeend','<button id="utilityButton-wishingLake" class="utility-icon-button" onclick="openWishingLake()" aria-label="許願湖" title="許願湖">'+__EMBERWILD_SKILL_ICONS.svgFor('lucide:waves',[],{size:18})+'<span class="utility-label">許願湖</span></button>');}refresh();};
 const closeBase=closeModal;closeModal=function(...args){if($('modal').dataset.view==='wishing-lake')delete $('modal').dataset.view;lastHTML='';return closeBase(...args);};
 setInterval(()=>{if(!party||!state)return;notify();refresh();},1000);
 globalThis.__EMBERWILD_WISHING_LAKE={ensure,choices,remaining,view,normalizeState,ledgerKey,design:()=>copy(design)};
 if(party)ensure();
})();
