/* Region vouchers: settled offline exploration time turned into earnings tickets of one region.
   Ticket length, sample length, sample gap tolerance and potion charging are balance settings
   (balanceSettings.rewards.regionVouchers, defaults 30 / 30 / 10 minutes and charged).

   Issue  (EmberwildRegionVouchers.issue, called by offline settlement when the player chooses vouchers)
   - Uses the region's stored snapshot scaled to one ticket (online-idle-statistics.js, highest earnings). A region
     without a snapshot cannot issue vouchers; offline settlement keeps its full simulation there.
   - Converted time plus the region's saved remainder makes floor(total / ticket length) tickets; the rest stays
     in the remainder ledger. Tickets are mailed as one voucher attachment per offline settlement.
   - Each ticket locks the snapshot values at issue time: XP, gold, the enemy kill distribution used for
     item drops, and the region's level range. Later gear, skill, team or map changes never raise it.
   - When potion charging is on, consumables used during the sample are charged as their shop price from
     the ticket gold (never below 0); the player's own potions are not consumed.

   Use (ticket items live in the inventory's item tab; one save for the whole batch)
   - Claiming the ticket mail moves the tickets into the item inventory. The item shows only a short
     description; earnings are calculated when the player chooses to use it, then mailed.
   - Projected hero level > region max level: only the region's overlevelVoucherGold (balance editor).
     The projection includes XP still waiting in unclaimed voucher mail, and is re-checked per ticket.
   - Otherwise: the locked XP and gold, plus item drops rolled by the existing per-enemy loot rules
     (rollEnemyItemLoot: base ore, configured drop table, ether) into a scratch inventory and mailed.
     Gear needs free bag space when the item mail is claimed, as with any other mail.
   - Using tickets never runs inside a combat reward, so it never enters battle or idle statistics, kill
     counts, quests or achievements. A failed save restores the tickets and the mailbox together. */
(()=>{
 'use strict';
 const RULES={version:1,get ticketMs(){return S()?.RULES.ticketMs??30*60*1000;},historyLimit:20,maxStacks:500};
 const S=()=>globalThis.EmberwildIdleStatistics;
 const copy=v=>v==null?v:JSON.parse(JSON.stringify(v));
 const regionKey=(map,difficulty)=>map+':'+difficulty;
 const num=(v,min=0,max=1e15)=>Number.isFinite(v)?Math.max(min,Math.min(max,v)):0;
 const modeName=d=>MODES?.[d]?.name||['普通','困難','地獄'][d]||'';
 function mapRow(map){return typeof worldMapConfig==='function'?worldMapConfig(map):null;}
 function overlevelGold(map){const m=mapRow(map);return Number.isFinite(m?.overlevelVoucherGold)?m.overlevelVoucherGold:(globalThis.defaultOverlevelVoucherGold?.(MAPS[map]?.min||1)??0);}
 function eligibleMap(map){return Number.isInteger(map)&&map>=0&&map<MAPS.length&&!(typeof isFinalMap==='function'&&isFinalMap(map));}
 // Price of one consumed unit, using the shop definitions (legacy potions are the standard heal potion).
 function unitPrice(key){
  const [kind,id]=key.split(/:(.+)/);if(kind!=='item')return 0;
  const item=SHOP.find(x=>x.id===(id==='legacy-potion'?'heal_standard':id))||globalThis.__EMBERWILD_INVENTORY_STOCK?.item?.(id);
  return Math.max(0,Number(item?.cost??item?.price)||0);
 }
 function itemName(key){
  const [kind,id]=key.split(/:(.+)/);
  if(kind==='gem')return GEMS[Number(id)]?.name||'寶石';
  if(kind==='material')return id==='粉塵'?'寶石粉塵':id;
  if(id==='legacy-potion')return '治療藥水';
  return SHOP.find(x=>x.id===id)?.name||globalThis.__EMBERWILD_INVENTORY_STOCK?.item?.(id)?.name||id;
 }
 // ---------------------------------------------------------------- ledger
 function emptyLedger(){return {version:RULES.version,serial:0,remainders:{},stacks:[],history:[]};}
 function counts(raw,limit=400){const out={};if(raw&&typeof raw==='object'&&!Array.isArray(raw))for(const [k,v] of Object.entries(raw).slice(0,limit)){const n=num(Number(v));if(n&&k.length<=120&&!['__proto__','constructor','prototype'].includes(k))out[k]=n;}return out;}
 // A voucher body (without id/count). Returns null when anything is malformed.
 function voucherOf(raw){
  if(!raw||typeof raw!=='object'||!eligibleMap(raw.map)||![0,1,2].includes(raw.difficulty)||typeof raw.snapshotId!=='string'||!raw.snapshotId||raw.snapshotId.length>80)return null;
  const v={map:raw.map,difficulty:raw.difficulty,mapName:String(raw.mapName||MAPS[raw.map].name).slice(0,60),levelMin:Math.round(num(raw.levelMin,1,1e4))||1,levelMax:Math.round(num(raw.levelMax,1,1e4))||1,snapshotId:raw.snapshotId,
   xp:Math.round(num(raw.xp)),gold:Math.round(num(raw.gold)),baseGold:Math.round(num(raw.baseGold)),potionCost:Math.round(num(raw.potionCost)),consumed:counts(raw.consumed,40),enemies:counts(raw.enemies,200),expectedItems:counts(raw.expectedItems,200),expectedGear:num(raw.expectedGear,0,1e4),createdAt:num(raw.createdAt),
   // Tickets issued before the duration became editable represent 30 minutes.
   minutes:Number.isInteger(raw.minutes)&&raw.minutes>=1&&raw.minutes<=1440?raw.minutes:30};
  if(v.levelMax<v.levelMin||!Object.keys(v.enemies).length)return null;
  return v;
 }
 function normalize(raw){
  const out=emptyLedger();if(!raw||typeof raw!=='object'||raw.version!==RULES.version)return out;
  out.serial=Math.floor(num(raw.serial,0,1e12));
  for(const [k,v] of Object.entries(raw.remainders||{}).slice(0,200))if(/^\d+:[012]$/.test(k)&&eligibleMap(Number(k.split(':')[0])))out.remainders[k]=Math.floor(num(v,0,RULES.ticketMs-1));
  const ids=new Set();
  for(const s of Array.isArray(raw.stacks)?raw.stacks.slice(0,RULES.maxStacks):[]){
   const v=voucherOf(s),count=Number(s?.count);
   if(!v||typeof s.id!=='string'||!/^v\d{1,13}$/.test(s.id)||ids.has(s.id)||!Number.isSafeInteger(count)||count<1||count>1e6)continue;ids.add(s.id);out.stacks.push({id:s.id,count,...v});
  }
  for(const h of Array.isArray(raw.history)?raw.history.slice(-RULES.historyLimit):[])if(h&&typeof h==='object')out.history.push({at:num(h.at),tickets:Math.floor(num(h.tickets,0,1e6)),overlevel:Math.floor(num(h.overlevel,0,1e6)),xp:Math.round(num(h.xp)),gold:Math.round(num(h.gold)),items:counts(h.items,200),gear:Math.floor(num(h.gear,0,1e6)),regions:Array.isArray(h.regions)?h.regions.slice(0,30).map(x=>String(x).slice(0,80)):[]});
  return out;
 }
 function ledger(){if(party.regionVouchers?.version!==RULES.version||!Array.isArray(party.regionVouchers.stacks))party.regionVouchers=normalize(party.regionVouchers);return party.regionVouchers;}
 const sameValue=(a,b)=>JSON.stringify({...a,createdAt:0})===JSON.stringify({...b,createdAt:0});
 function addStack(v,count){
  const l=ledger(),found=l.stacks.find(s=>{const {id,count,...rest}=s;return sameValue(rest,v);});
  if(found){found.count+=count;return found;}
  if(l.stacks.length>=RULES.maxStacks)throw Error('收益券種類過多，請先使用部分收益券');
  const stack={id:'v'+(++l.serial),count,...copy(v)};l.stacks.push(stack);return stack;
 }
 // ---------------------------------------------------------------- issue
 // Locked ticket values from the region's highest-earning snapshot, or null when no snapshot exists.
 function ticketFor(map,difficulty){
  if(!eligibleMap(map))return null;
  const s=S()?.snapshot(map,difficulty);if(!s||!Object.keys(s.perTicket.enemies||{}).length)return null;
  const t=s.perTicket,charge=S()?.voucherSettings?.().chargePotions!==false,potionCost=charge?Math.round(Object.entries(t.consumed||{}).reduce((n,[k,c])=>n+unitPrice(k)*c,0)):0,baseGold=Math.round(t.gold);
  return voucherOf({map,difficulty,mapName:MAPS[map].name+(difficulty?'（'+modeName(difficulty)+'）':''),levelMin:MAPS[map].min,levelMax:MAPS[map].max,snapshotId:s.id,minutes:Math.round(t.ms/60000),xp:t.xp,gold:Math.max(0,baseGold-potionCost),baseGold,potionCost,consumed:t.consumed,
   enemies:t.enemies,expectedItems:t.items,expectedGear:Object.values(t.gear||{}).reduce((a,b)=>a+b,0),createdAt:Date.now()});
 }
 function available(map=party?.map,difficulty=party?.difficulty||0){return !!party&&!!ticketFor(map,difficulty);}
 // How many tickets a span of settled time yields, including the region's saved remainder.
 function quote(map,difficulty,ms){const rem=party?.regionVouchers?.remainders?.[regionKey(map,difficulty)]||0,total=Math.max(0,Math.floor(ms))+rem;return {tickets:Math.floor(total/RULES.ticketMs),remainder:total%RULES.ticketMs};}
 function issue(map,difficulty,ms){
  const v=ticketFor(map,difficulty);if(!v)throw Error('此地區尚未建立收益樣本，無法改領收益券');
  const l=ledger(),q=quote(map,difficulty,ms),key=regionKey(map,difficulty);
  if(q.remainder)l.remainders[key]=q.remainder;else delete l.remainders[key];
  if(!q.tickets)return 0;
  const mailbox=party.mailbox??=EmberwildAchievements.mailboxDefaults(),id=++mailbox.serial;
  mailbox.messages.push({id,rewardKey:'voucher-'+id,subject:`${v.mapName} ${v.minutes} 分鐘收益券 ×${q.tickets}`,body:`離線探索改領收益券。每張代表在 ${v.mapName} 探索 ${v.minutes} 分鐘的收益。領取後放入背包的道具欄；使用時才計算經驗、金幣與道具，收益寄到信箱。主角等級超過 Lv.${v.levelMax} 後，此券只能兌換固定金幣 ${overlevelGold(map).toLocaleString()}。`,at:Date.now(),read:false,claimed:false,
   attachments:[{type:'regionVoucher',name:v.mapName+' '+v.minutes+' 分鐘收益券',quantity:q.tickets,voucher:v}]});
  return q.tickets;
 }
 // ---------------------------------------------------------------- mailbox
 // Three voucher mail kinds, validated here because the shared mailbox model only knows starter and
 // companion mail:  voucher-<id>        the tickets themselves (claimed into the item inventory),
 //                  voucher-gold-<id>   XP and gold earned by using tickets (claimed by awardXP / gold),
 //                  voucher-items-<id>  items and gear earned by using tickets (claimed by the base mailbox).
 const MAIL=/^voucher-(?:(gold|items)-)?(\d+)$/;
 const mailKind=m=>{const x=typeof m?.rewardKey==='string'&&MAIL.exec(m.rewardKey);return x?(x[1]||'ticket'):null;};
 const isVoucherMail=m=>!!mailKind(m);
 const validateBase=EmberwildAchievements.validateMailbox;
 function attachmentOf(kind,a){
  if(!a||typeof a!=='object'||!Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>1e12||typeof a.name!=='string'||!a.name.trim()||a.name.length>200)return null;
  if(kind==='ticket'){const v=voucherOf(a.voucher);return a.type==='regionVoucher'&&v&&a.quantity<=1e6?{type:'regionVoucher',name:a.name,quantity:a.quantity,voucher:v}:null;}
  if(kind==='gold')return ['voucherXp','voucherGold'].includes(a.type)?{type:a.type,name:a.name,quantity:a.quantity}:null;
  if(a.type==='gear')return a.gear&&typeof a.gear.id==='string'&&Number.isInteger(a.gear.plus)&&a.gear.plus>=0&&a.quantity===1?{type:'gear',name:a.name,quantity:1,gear:copy(a.gear)}:null;
  if(a.type!=='catalogue'||!['item','material','gem'].includes(a.kind)||typeof a.key!=='string'||!a.key||a.key.length>100||/[<>]/.test(a.key)||['__proto__','constructor','prototype'].includes(a.key))return null;
  if(a.kind==='gem'&&!(Number.isInteger(Number(a.key))&&Number(a.key)>=0&&Number(a.key)<GEMS.length))return null;
  return {type:'catalogue',kind:a.kind,key:a.key,name:a.name,quantity:a.quantity};
 }
 EmberwildAchievements.validateMailbox=function(raw){
  if(!raw||!Array.isArray(raw.messages)||!raw.messages.some(isVoucherMail))return validateBase(raw);
  const fail=()=>{throw Error('信箱存檔無效');},vouchers=new Map();
  for(const m of raw.messages.filter(isVoucherMail)){
   const kind=mailKind(m),id=Number(MAIL.exec(m.rewardKey)[2]);
   if(!Number.isSafeInteger(m.id)||m.id<1||m.id>raw.serial||id!==m.id||typeof m.subject!=='string'||!m.subject.trim()||m.subject.length>100||typeof m.body!=='string'||m.body.length>1000||!Number.isSafeInteger(m.at)||typeof m.read!=='boolean'||typeof m.claimed!=='boolean'||m.claimed&&!m.read||!Array.isArray(m.attachments)||m.attachments.length<1||m.attachments.length>6||kind==='ticket'&&m.attachments.length!==1)fail();
   const attachments=m.attachments.map(a=>attachmentOf(kind,a));if(attachments.some(a=>!a))fail();
   vouchers.set(m.id,{id:m.id,rewardKey:m.rewardKey,subject:m.subject,body:m.body,at:m.at,read:m.read,claimed:m.claimed,attachments});
  }
  const rest=validateBase({...raw,messages:raw.messages.filter(m=>!isVoucherMail(m))});
  if(new Set([...rest.messages.map(m=>m.id),...vouchers.keys()]).size!==rest.messages.length+vouchers.size)fail();
  const others=new Map(rest.messages.map(m=>[m.id,m]));
  return {...rest,messages:raw.messages.map(m=>isVoucherMail(m)?vouchers.get(m.id):others.get(m.id))};
 };
 function pushMail(rewardKey,subject,body,attachments){
  const mailbox=party.mailbox??=EmberwildAchievements.mailboxDefaults(),id=++mailbox.serial;
  mailbox.messages.push({id,rewardKey:rewardKey+id,subject:subject.slice(0,100),body:body.slice(0,1000),at:Date.now(),read:false,claimed:false,attachments});return id;
 }
 // Tickets and XP/gold mail are claimed here; item mail goes through the base claim (bag space, stock limits).
 function claimOwnMail(ids){
  const messages=(party?.mailbox?.messages||[]).filter(m=>ids.includes(m.id)&&['ticket','gold'].includes(mailKind(m))&&!m.claimed);if(!messages.length)return null;
  if(globalThis.__EMBERWILD_SAVE_OWNER===false)return false;
  const h=party.members[0],before={vouchers:copy(ledger()),mailbox:copy(party.mailbox),lv:h.lv,xp:h.xp,xpFraction:h.xpFraction,hp:h.hp,gold:h.gold};
  const out={tickets:0,xp:0,gold:0};
  try{for(const m of messages){
   for(const a of m.attachments){
    if(a.type==='regionVoucher'){addStack(a.voucher,a.quantity);out.tickets+=a.quantity;}
    else if(a.type==='voucherXp'){withHero(h,()=>awardXP(a.quantity));out.xp+=a.quantity;}
    else if(a.type==='voucherGold'){h.gold+=a.quantity;out.gold+=a.quantity;}
   }
   m.claimed=true;m.read=true;
  }}catch(error){party.regionVouchers=before.vouchers;party.mailbox=before.mailbox;Object.assign(h,{lv:before.lv,xp:before.xp,xpFraction:before.xpFraction,hp:before.hp,gold:before.gold});toast(error.message);return false;}
  let saved=false;try{saved=save()===true;}catch{}
  if(!saved){party.regionVouchers=before.vouchers;party.mailbox=before.mailbox;Object.assign(h,{lv:before.lv,xp:before.xp,xpFraction:before.xpFraction,hp:before.hp,gold:before.gold});toast('儲存失敗，附件保留在信箱');return false;}
  return out;
 }
 const claimedText=o=>[o.tickets?o.tickets+' 張收益券已放入背包的道具欄':'',o.xp?'經驗 +'+o.xp.toLocaleString('zh-TW'):'',o.gold?'金幣 +'+o.gold.toLocaleString('zh-TW'):''].filter(Boolean).join('；');
 const claimOneBase=claimMailboxAttachments,claimAllBase=claimAllMailboxAttachments;
 globalThis.claimMailboxAttachments=function(id){
  const m=party?.mailbox?.messages.find(x=>x.id===id),kind=mailKind(m);if(!kind||kind==='items')return claimOneBase(id);
  const out=claimOwnMail([id]);if(out){render();toast('已領取：'+claimedText(out));}return !!out;
 };
 globalThis.claimAllMailboxAttachments=function(){
  const ids=(party?.mailbox?.messages||[]).filter(m=>['ticket','gold'].includes(mailKind(m))&&!m.claimed).map(m=>m.id),out=ids.length?claimOwnMail(ids):null;
  if(out===false)return false;
  if((party?.mailbox?.messages||[]).some(m=>!m.claimed&&!['ticket','gold'].includes(mailKind(m))))return claimAllBase();
  if(out){render();toast('已領取：'+claimedText(out));}return !!out;
 };
 // ---------------------------------------------------------------- use
 function stock(h){
  const out={'material:鍛鐵':h.ore,'material:粉塵':h.dust,'item:legacy-potion':h.potions};
  h.gems.forEach((n,i)=>out['gem:'+i]=n);for(const k in h.materials)out['material:'+k]=h.materials[k];
  for(const k in h.healingPotions||{})out['item:'+k]=h.healingPotions[k];for(const k in h.consumables||{})out['item:'+k]=h.consumables[k];
  return out;
 }
 function enemies(v){
  const out=[];
  for(const [key,expected] of Object.entries(v.enemies)){
   const [monsterId,kind,lv,mat]=key.split('|'),n=Math.floor(expected)+(Math.random()<expected%1?1:0);
   for(let i=0;i<n;i++)out.push({monsterId:monsterId||undefined,kind:kind||'normal',lv:Number(lv)||1,mat,difficulty:v.difficulty,region:v.map,name:''});
  }
  return out;
 }
 // Rolls loot of the locked enemies with the existing rules into a scratch copy of the inventory, so the
 // results can be mailed instead of granted. The real inventory, bag and journal are restored untouched.
 function rollLoot(rolls){
  const h=party.members[0],saved={ore:h.ore,dust:h.dust,potions:h.potions,gems:h.gems,materials:h.materials,healingPotions:h.healingPotions,consumables:h.consumables,bag:h.bag},claims=party.etherBossClaims,noteBase=note;
  h.gems=[...h.gems];h.materials={...h.materials};h.healingPotions={...h.healingPotions};h.consumables={...h.consumables};h.bag=[];party.etherBossClaims=[...(claims||[])];
  const before=stock(h),items={};
  try{note=()=>{};withHero(h,()=>{for(const stack of rolls)for(const e of enemies(stack))rollEnemyItemLoot(e,{voucher:true});});
   const after=stock(h);for(const k in after){const d=(after[k]||0)-(before[k]||0);if(d>0)items[k]=d;}
   return {items,gear:h.bag.slice()};
  }finally{note=noteBase;Object.assign(h,saved);party.etherBossClaims=claims;}
 }
 // XP and level the hero will have after claiming every unclaimed voucher XP mail.
 function projectedHero(){
  const h=party.members[0];let lv=h.lv,xp=h.xp+(h.xpFraction||0);const cap=typeof levelCap==='function'?levelCap(h):Infinity;
  const pending=(party.mailbox?.messages||[]).filter(m=>mailKind(m)==='gold'&&!m.claimed).flatMap(m=>m.attachments).filter(a=>a.type==='voucherXp').reduce((n,a)=>n+a.quantity,0);
  const p={lv,xp,cap,add(amount){if(this.lv>=this.cap)return;this.xp+=amount;while(this.lv<this.cap&&this.xp>=need(this.lv)){this.xp-=need(this.lv);this.lv++;}}};p.add(pending);return p;
 }
 // Per-ticket plan: the projected level is re-checked before every ticket, including XP still in the mailbox.
 function plan(requests){
  const l=ledger(),p=projectedHero(),out={tickets:0,full:0,overlevel:0,xp:0,gold:0,potionCost:0,items:{},gear:0,rows:[],levelBefore:p.lv,levelAfter:p.lv,rolls:[]};
  for(const r of requests||[]){
   const s=l.stacks.find(x=>x.id===r.id),n=Math.min(Number(r.count)||0,s?.count||0);if(!s||!Number.isSafeInteger(n)||n<1)continue;
   const row={id:s.id,name:s.mapName,levelMax:s.levelMax,count:n,full:0,overlevel:0,overGold:overlevelGold(s.map)};
   for(let i=0;i<n;i++){
    if(p.lv>s.levelMax){row.overlevel++;out.gold+=row.overGold;continue;}
    row.full++;out.xp+=s.xp;out.gold+=s.gold;out.potionCost+=s.potionCost;out.gear+=s.expectedGear;out.rolls.push(s);
    for(const [k,c] of Object.entries(s.expectedItems))out.items[k]=(out.items[k]||0)+c;p.add(s.xp);
   }
   out.tickets+=n;out.full+=row.full;out.overlevel+=row.overlevel;out.rows.push(row);
  }
  out.levelAfter=p.lv;return out;
 }
 function preview(requests){if(!party)return null;const {rolls,...rest}=plan(requests);return rest;}
 const catalogueKey=k=>{const [kind,id]=k.split(/:(.+)/);return kind==='item'&&id==='legacy-potion'?['item','heal_standard']:[kind,id];};
 // Uses tickets: removes them and mails XP/gold and items/gear, all in one save. Returns the summary or false.
 function redeem(requests){
  if(!party||globalThis.__EMBERWILD_SAVE_OWNER===false){toast('存檔已由另一分頁使用');return false;}
  if(globalThis.EmberwildOffline?.busy){toast('離線收益結算中，請稍候再使用收益券');return false;}
  const p=plan(requests);if(!p.tickets)return false;
  const backup={vouchers:copy(ledger()),mailbox:copy(party.mailbox)},l=ledger();
  try{
   const loot=rollLoot(p.rolls),regions=p.rows.map(r=>r.name).join('、');
   for(const r of p.rows)l.stacks.find(s=>s.id===r.id).count-=r.count;l.stacks=l.stacks.filter(s=>s.count>0);
   const subject=`收益券收益：${regions}`.slice(0,90),note=`使用 ${p.tickets} 張收益券（${regions}）${p.overlevel?`，其中 ${p.overlevel} 張超過地區等級，只兌換固定金幣`:''}。`;
   const mails=[];
   const currency=[p.xp>0?{type:'voucherXp',name:'經驗值',quantity:Math.round(p.xp)}:null,p.gold>0?{type:'voucherGold',name:'金幣',quantity:Math.round(p.gold)}:null].filter(Boolean);
   if(currency.length)mails.push(pushMail('voucher-gold-',subject+' · 經驗與金幣',note+'領取後經驗與金幣直接入帳。',currency));
   const goods=[...Object.entries(loot.items).map(([k,n])=>{const [kind,key]=catalogueKey(k);return {type:'catalogue',kind,key,name:itemName(k),quantity:n};}),...loot.gear.map(g=>({type:'gear',name:equipmentDisplayName(g),quantity:1,gear:g}))];
   for(let i=0;i<goods.length;i+=6)mails.push(pushMail('voucher-items-',subject+` · 道具${goods.length>6?`（${i/6+1}/${Math.ceil(goods.length/6)}）`:''}`,note+'領取後道具放入背包；裝備需要背包空位。',goods.slice(i,i+6)));
   const total={tickets:p.tickets,overlevel:p.overlevel,xp:Math.round(p.xp),gold:Math.round(p.gold),gear:loot.gear.length,items:loot.items,regions:p.rows.map(r=>r.name),mails:mails.length,levelBefore:p.levelBefore,levelAfter:p.levelAfter};
   l.history.push({at:Date.now(),tickets:total.tickets,overlevel:total.overlevel,xp:total.xp,gold:total.gold,items:total.items,gear:total.gear,regions:total.regions});if(l.history.length>RULES.historyLimit)l.history.splice(0,l.history.length-RULES.historyLimit);
   if(save()!==true)throw Error('無法儲存使用結果');
   return total;
  }catch(error){
   party.regionVouchers=backup.vouchers;party.mailbox=backup.mailbox;
   toast('收益券使用失敗，收益券維持原狀：'+(error.message||error));return false;
  }
 }
 // ---------------------------------------------------------------- inventory item
 const fmt=n=>Math.round(n).toLocaleString('zh-TW');
 function itemsHTML(items,approx){const rows=Object.entries(items).filter(([,n])=>n>=(approx?.05:1)).sort((a,b)=>b[1]-a[1]);return rows.length?`<ul class="region-voucher-items">${rows.map(([k,n])=>`<li>${esc(itemName(k))} <b>${approx?'約 ':''}×${approx?(n>=10?fmt(n):Math.round(n*10)/10):fmt(n)}</b></li>`).join('')}</ul>`:'<p class="small">無</p>';}
 // Standard item slots (item-presentation.js virtual items): the ticket carries only a short description;
 // earnings are calculated when the player chooses to use it.
 const VIRTUAL=/^region-voucher:(v\d+)$/,MAIL_VIRTUAL=/^region-voucher-mail:(\d+):([012])(?::(\d+))?$/;
 const regionName=(map,difficulty)=>MAPS[map]?.name?MAPS[map].name+(difficulty?'（'+modeName(difficulty)+'）':''):'地區';
 globalThis.__EMBERWILD_VIRTUAL_ITEM=function(key){
  if(key==='voucher-xp')return {name:'經驗值',glyph:'sparkles',description:'收益券的經驗收益。領取附件後直接入帳。'};
  if(key==='voucher-gold')return {name:'金幣',glyph:'coins',description:'收益券的金幣收益。領取附件後直接入帳。'};
  const mail=MAIL_VIRTUAL.exec(key);
  if(mail){const name=regionName(Number(mail[1]),Number(mail[2])),minutes=Number(mail[3]||30);return {name:name+' '+minutes+' 分鐘收益券',glyph:'ticket',description:`記錄在 ${name} 探索 ${minutes} 分鐘的收益。領取後放入背包的道具欄，使用時才計算收益。`};}
  const m=VIRTUAL.exec(key),s=m&&party?ledger().stacks.find(x=>x.id===m[1]):null;if(!s)return null;
  return {name:s.mapName+' '+s.minutes+' 分鐘收益券',glyph:'ticket',description:`記錄在 ${s.mapName} 探索 ${s.minutes} 分鐘的收益。使用時計算經驗、金幣與道具，收益寄到信箱。`,
   detail:()=>`<p>持有 ${fmt(s.count)} 張</p>`,
   actions:()=>`<div class="actions"><button onclick="closeItemDetails();useRegionVouchers('${esc(s.id)}',1)">使用</button>${s.count>1?`<button onclick="closeItemDetails();useRegionVouchers('${esc(s.id)}',${s.count})">全部使用（${fmt(s.count)}）</button>`:''}</div>`};
 };
 globalThis.__EMBERWILD_VIRTUAL_MAIL_KEY=a=>a?.type==='regionVoucher'?`region-voucher-mail:${a.voucher.map}:${a.voucher.difficulty}:${a.voucher.minutes||30}`:a?.type==='voucherXp'?'voucher-xp':a?.type==='voucherGold'?'voucher-gold':null;
 function inventorySlots(){
  if(!party)return {slots:[],action:''};const l=ledger();
  return {slots:l.stacks.map(s=>`<div class="account-item-row icon-only-row" data-voucher-stack="${esc(s.id)}">${itemSlotHTML('item','region-voucher:'+s.id,{count:s.count,context:'inventory'})}</div>`),
   action:l.stacks.length>1?`<button type="button" onclick="useRegionVouchers('all')">一鍵使用全部收益券</button>`:''};
 }
 let pendingRequests=null;
 // The mailbox is a utility dialog that re-renders itself; the voucher dialog takes the modal over.
 function detachModal(){const modal=$('modal');if(String(modal.dataset.view||'').startsWith('utility-'))delete modal.dataset.view;modal.classList.remove('utility-dialog');return modal;}
 globalThis.useRegionVouchers=function(target,count){
  if(!party)return false;const requests=target==='all'?ledger().stacks.map(s=>({id:s.id,count:s.count})):[{id:target,count:Number(count)||1}],p=preview(requests);if(!p?.tickets)return false;
  pendingRequests=requests;const modal=detachModal();
  modal.innerHTML=`<h2>使用收益券 · ${fmt(p.tickets)} 張</h2>${p.rows.map(r=>`<p>${esc(r.name)}：${fmt(r.count)} 張${r.overlevel?` · <b>${fmt(r.overlevel)} 張超過地區等級（Lv.${r.levelMax}）</b>，每張只兌換固定 ${fmt(r.overGold)} 金幣`:''}</p>`).join('')}
   <h3>預估收益</h3><p>經驗 ${fmt(p.xp)}${p.levelAfter>p.levelBefore?`（Lv.${p.levelBefore} → 約 Lv.${p.levelAfter}）`:''} · 金幣 ${fmt(p.gold)}${p.potionCost?`（已扣除藥水費用 ${fmt(p.potionCost)}）`:''}</p>
   ${p.full?`<p>裝備 約 ${Math.round(p.gear*10)/10} 件</p><h3>道具（預估）</h3>${itemsHTML(p.items,true)}<p class="small">確認後依地區掉落機率實際抽取道具與裝備。</p>`:'<p>全部超過地區等級，只兌換固定金幣，不發放經驗與道具。</p>'}
   <p class="small">收益寄到信箱，領取後入帳。每張使用前都會依目前等級（含信箱中尚未領取的收益券經驗）判斷是否超過地區等級上限。</p>
   <div class="actions"><button type="button" class="primary" onclick="confirmRegionVouchers()">確認使用</button><button type="button" onclick="closeModal()">取消</button></div>`;
  if(!modal.open)modal.showModal();return true;
 };
 globalThis.confirmRegionVouchers=function(){
  const requests=pendingRequests;pendingRequests=null;if(!requests)return false;
  const t=redeem(requests);if(!t){closeModal();return false;}
  const modal=detachModal();
  modal.innerHTML=`<h2>收益已寄到信箱</h2><p>使用 ${fmt(t.tickets)} 張收益券${t.overlevel?`（其中 ${fmt(t.overlevel)} 張只兌換固定金幣）`:''}，收益分為 ${t.mails} 封郵件。</p><p>經驗 ${fmt(t.xp)} · 金幣 ${fmt(t.gold)} · 裝備 ${fmt(t.gear)} 件</p><h3>道具</h3>${itemsHTML(t.items,false)}<div class="actions"><button type="button" class="primary" onclick="openUtilityPanel('mailbox')">前往信箱</button><button type="button" onclick="closeModal()">關閉</button></div>`;
  if(!modal.open)modal.showModal();render();return true;
 };
  // ---------------------------------------------------------------- save
 const createBase=createParty;createParty=function(...args){const p=createBase.apply(this,args);p.regionVouchers=emptyLedger();return p;};
 const validatePartyBase=validateParty;validateParty=function(data){const p=validatePartyBase(data);p.regionVouchers=normalize(data?.regionVouchers);return p;};
 globalThis.EmberwildRegionVouchers={RULES,inventorySlots,normalize,ticketFor,available,quote,issue,redeem,preview,projectedHero,overlevelGold,unitPrice,ledger:()=>party?copy(ledger()):null};
})();
