/* v0.228 bag capacity: each tab opens balanceSettings.inventory.capacities slots (default 100, ceiling 3000).
   Loot that needs more slots than a tab has open goes to the mailbox as an "overflow" mail; it disappears when it is not
   claimed within 72 hours. Claiming it follows the normal mailbox claim, which refuses attachments that do not fit.
   Shop purchases and mail claims never overflow: they are refused (inventory-runtime slots, shop-inventory, companion-unlocks).
   A tab that was already over its open slots (an older save) is not cut back; it only cannot grow further. */
(function(){
  'use strict';
  const HOURS=72,EXPIRY_MS=HOURS*3600000,MERGE_MS=3600000,MAX_ATTACHMENTS=100,KEY=/^overflow-(\d+)$/;
  const items=()=>globalThis.EmberwildItems;
  const copy=x=>JSON.parse(JSON.stringify(x));
  const isOverflow=m=>typeof m?.rewardKey==='string'&&KEY.test(m.rewardKey);
  const gearBag=()=>{if(typeof ensureSharedGear==='function')ensureSharedGear();return party?.sharedGear?.items||state?.bag||[];};
  const worn=g=>typeof gearWearer==='function'&&!!gearWearer(g.id);
  const gearTab=g=>globalThis.EmberwildTokens?.isToken(g)?'token':'equipment';
  const tabOf=id=>{const d=items().definition(id);return d.occupiesSlot?d.tab:null;};

  /* ---------- capacity helpers shared with purchases and mail claims ---------- */
  function usage(){try{return items()?.slots()?.tabs||null;}catch{return null;}}
  // Tabs that are over their open slots and grew compared with `before` (a usage() result).
  function grownOver(before,after=usage()){
    if(!before||!after)return [];
    return Object.keys(after).filter(t=>after[t].used>after[t].capacity&&after[t].used>(before[t]?.used||0));
  }
  globalThis.__EMBERWILD_BAG_CAPACITY={usage,grownOver,expiryMs:EXPIRY_MS};

  /* ---------- loot overflow ---------- */
  function capture(){
    const counts=new Map();for(const st of items().stacks())counts.set(st.item,(counts.get(st.item)||0)+st.qty);
    return {counts,gear:new Set(gearBag().map(g=>g.id)),usage:usage()};
  }
  function attachmentFor(id,quantity){
    const p=items().model.parseId(id);if(!p)return null;
    const name=p.kind==='gem'?(GEMS[Number(p.key)]?.name||'寶石'):p.kind==='item'?(SHOP.find(x=>x.id===p.key)?.name||p.key):p.key;
    return {type:'catalogue',kind:p.kind,key:p.key,name,quantity};
  }
  // Keeps as much of this enemy's new loot as the open slots allow and returns the rest as mail attachments.
  function settle(before){
    const over=grownOver(before.usage);if(!over.length)return [];
    const out=[];
    for(const tab of over){
      const limit=Math.max(before.usage[tab].capacity,before.usage[tab].used),used=()=>items().slots().tabs[tab].used;
      const now=new Map();for(const st of items().stacks())now.set(st.item,(now.get(st.item)||0)+st.qty);
      const gained=[...now].filter(([id,n])=>n>(before.counts.get(id)||0)&&tabOf(id)===tab).map(([id,n])=>[id,n-(before.counts.get(id)||0)]);
      const bag=gearBag(),fresh=bag.filter(g=>!before.gear.has(g.id)&&!worn(g)&&gearTab(g)===tab);
      for(const [id,n] of gained)items().remove(id,n);
      for(const g of fresh)bag.splice(bag.indexOf(g),1);
      // Put back the largest amount that still fits, item by item, in the order the loot arrived.
      for(const [id,n] of gained){
        let lo=0,hi=n;
        while(lo<hi){const mid=Math.ceil((lo+hi)/2);items().add(id,mid);const fits=used()<=limit;items().remove(id,mid);if(fits)lo=mid;else hi=mid-1;}
        if(lo)items().add(id,lo);
        if(n-lo){const a=attachmentFor(id,n-lo);if(a)out.push(a);}
      }
      for(const g of fresh){if(used()+1<=limit)bag.push(g);else out.push({type:'gear',name:typeof equipmentDisplayName==='function'?equipmentDisplayName(g):g.name,quantity:1,gear:copy(g)});}
    }
    return out;
  }
  function deadline(at){const d=new Date(at+EXPIRY_MS),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}/${p(d.getMonth()+1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;}
  function mailOverflow(attachments){
    if(!attachments.length)return null;
    purgeExpired();
    const mailbox=party.mailbox??=EmberwildAchievements.mailboxDefaults(),now=Date.now();
    // Loot of the last hour gathers in one mail while it has room; its 72 hours count from the first item.
    let m=[...mailbox.messages].reverse().find(x=>isOverflow(x)&&!x.claimed&&now-x.at<MERGE_MS);
    for(const a of attachments){
      if(m&&a.type==='catalogue'){const same=m.attachments.find(x=>x.type==='catalogue'&&x.kind===a.kind&&x.key===a.key);if(same&&same.quantity+a.quantity<=1e12){same.quantity+=a.quantity;continue;}}
      if(!m||m.attachments.length>=MAX_ATTACHMENTS){
        const id=++mailbox.serial;
        m={id,rewardKey:'overflow-'+id,subject:'背包已滿：戰利品暫存',body:`背包格數不足，放不下的戰利品暫存在這封信。請在 ${deadline(now)} 前整理背包後領取，逾期未領取的附件會消失。`,at:now,expiresAt:now+EXPIRY_MS,read:false,claimed:false,attachments:[]};
        mailbox.messages.push(m);
      }
      m.attachments.push(copy(a));
    }
    if(typeof note==='function')note(`背包格數不足，${attachments.length} 項戰利品已寄到信箱（${HOURS} 小時內領取）。`,'item');
    return m.id;
  }
  // Every kill's loot is granted inside solo.victory (rewardGroupKill runs it for the receiving hero). Region vouchers
  // roll loot into a scratch inventory and mail it themselves, so they are not affected. victory saves before it
  // returns; the overflow mail is saved with the next save, and until then the save still holds the loot itself.
  const victoryBase=solo.victory;
  solo.victory=function(...args){
    if(!party||!items())return victoryBase.apply(this,args);
    const before=capture(),out=victoryBase.apply(this,args);
    mailOverflow(settle(before));
    return out;
  };

  /* ---------- expiry ---------- */
  function purgeExpired(now=Date.now()){
    const box=party?.mailbox;if(!box?.messages)return 0;
    const keep=box.messages.filter(m=>!(isOverflow(m)&&!m.claimed&&m.expiresAt<=now)),n=box.messages.length-keep.length;
    if(n){box.messages=keep;const locks=party.members?.[0]?.lockedMailIds;if(Array.isArray(locks)){const ids=new Set(keep.map(m=>m.id));locks.splice(0,locks.length,...locks.filter(id=>ids.has(id)));}}
    return n;
  }
  globalThis.purgeExpiredOverflowMail=purgeExpired;
  for(const name of ['claimMailboxAttachments','claimAllMailboxAttachments','mailboxView']){
    const base=globalThis[name];if(typeof base!=='function')continue;
    globalThis[name]=function(...args){if(party)purgeExpired();return base.apply(this,args);};
  }
  if(typeof loadParty==='function'){const base=loadParty;loadParty=function(...args){const out=base.apply(this,args);if(party)purgeExpired();return out;};}

  /* ---------- save validation ---------- */
  const validateBase=EmberwildAchievements.validateMailbox;
  function attachment(a){
    if(!a||typeof a!=='object'||!Number.isSafeInteger(a.quantity)||a.quantity<1||a.quantity>1e12||typeof a.name!=='string'||!a.name.trim()||a.name.length>200)return null;
    if(a.type==='gear')return a.gear&&typeof a.gear.id==='string'&&Number.isInteger(a.gear.plus)&&a.gear.plus>=0&&a.quantity===1?{type:'gear',name:a.name,quantity:1,gear:copy(a.gear)}:null;
    if(a.type!=='catalogue'||!['item','material','gem'].includes(a.kind)||typeof a.key!=='string'||!a.key||a.key.length>100||/[<>]/.test(a.key)||['__proto__','constructor','prototype'].includes(a.key))return null;
    if(a.kind==='gem'&&!(Number.isInteger(Number(a.key))&&Number(a.key)>=0&&Number(a.key)<GEMS.length))return null;
    return {type:'catalogue',kind:a.kind,key:a.key,name:a.name,quantity:a.quantity};
  }
  EmberwildAchievements.validateMailbox=function(raw){
    if(!raw||!Array.isArray(raw.messages)||!raw.messages.some(isOverflow))return validateBase(raw);
    const fail=()=>{throw Error('信箱存檔無效');},own=new Map();
    for(const m of raw.messages.filter(isOverflow)){
      if(own.has(m.id)||!Number.isSafeInteger(m.id)||m.id<1||m.id>raw.serial||Number(KEY.exec(m.rewardKey)[1])!==m.id||typeof m.subject!=='string'||!m.subject.trim()||m.subject.length>100||typeof m.body!=='string'||m.body.length>1000||!Number.isSafeInteger(m.at)||m.at<0||!Number.isSafeInteger(m.expiresAt)||m.expiresAt<=m.at||m.expiresAt>m.at+EXPIRY_MS||typeof m.read!=='boolean'||typeof m.claimed!=='boolean'||m.claimed&&!m.read||!Array.isArray(m.attachments)||m.attachments.length<1||m.attachments.length>MAX_ATTACHMENTS)fail();
      const attachments=m.attachments.map(attachment);if(attachments.some(a=>!a))fail();
      own.set(m.id,{id:m.id,rewardKey:m.rewardKey,subject:m.subject,body:m.body,at:m.at,expiresAt:m.expiresAt,read:m.read,claimed:m.claimed,attachments});
    }
    const rest=validateBase({...raw,messages:raw.messages.filter(m=>!isOverflow(m))});
    if(new Set([...rest.messages.map(m=>m.id),...own.keys()]).size!==rest.messages.length+own.size)fail();
    const others=new Map(rest.messages.map(m=>[m.id,m]));
    return {...rest,messages:raw.messages.map(m=>isOverflow(m)?own.get(m.id):others.get(m.id))};
  };
})();
