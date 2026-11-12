/* Catalog rules are global; achievements, tickets and unlocks belong to one player save. */
(()=>{
  const model=EmberwildCompanionSkills,A=EmberwildAchievements,copy=A.copy||((x)=>JSON.parse(JSON.stringify(x)));
  const plans=()=>__EMBERWILD_COMPANION_TEST_API.plans,validateProgress=model.validateUnlockProgress;
  const catalog=()=>{const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;if(!cache)return A.catalog(GAMEPLAY_SETTINGS.maps.catalog);return cache.achievements??=A.catalog(GAMEPLAY_SETTINGS.maps.catalog);};
  let syncing=false;
  const announced=new Set(party?.mailbox?.messages.map(m=>m.id)||[]);
  function syncUnlocks(){
    if(!party||syncing)return;syncing=true;
    try{
      const progress=party.companionUnlocks??=validateProgress(),a=party.achievements??=A.migrate(undefined,progress),mailbox=party.mailbox??=A.mailboxDefaults();
      const cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE,key=cache?JSON.stringify([playerHero().lv,playerHero().won,party.members.map(h=>[memberKey(h),h.companionId]),progress.unlocked,a.eliteKills,a.bossKills]):null;
      if(cache?.achievementOwner===party&&cache.achievementKey===key)return;
      for(const h of party.members.slice(1))if(h.companionId!==undefined&&!progress.unlocked.includes(h.companionId))progress.unlocked.push(h.companionId);
      MAPS.forEach((m,i)=>{if(solo.canVisit(i,playerHero())&&!progress.regions.includes(i))progress.regions.push(i);});
      const completed=new Set(a.completed);
      for(const entry of catalog()){
        const value=entry.kind==='open'?Number(progress.regions.includes(entry.mapIndex)):(entry.kind==='elite'?a.eliteKills:a.bossKills)[entry.mapIndex]||0;
        if(!completed.has(entry.id)&&value>=(entry.kind==='open'?1:entry.count)){completed.add(entry.id);a.completed.push(entry.id);if(tab==='achievements'||globalThis.isUtilityDialogOpen?.('achievements'))a.readCompleted.push(entry.id);}
      }
      for(const p of plans()){
        if(p.availability==='hidden'||progress.unlocked.includes(p.id))continue;
        const c=p.unlockCondition;
        if(c.type==='initial')progress.unlocked.push(p.id);
        else if(c.type==='achievement'&&!a.rewardCompanions.includes(p.id)&&c.achievementIds.some(id=>completed.has(id))){
          a.rewardCompanions.push(p.id);
          if(!a.tickets[p.id]&&!mailbox.messages.some(m=>m.rewardKey==='companion-'+p.id)){const achievement=catalog().find(x=>c.achievementIds.includes(x.id)&&completed.has(x.id));mailbox.serial++;mailbox.messages.push({id:mailbox.serial,rewardKey:'companion-'+p.id,subject:p.name+'招募券成就獎勵',body:`已達成「${achievement?.name||'指定成就'}」。請領取附件，${p.name}招募券將存入背包 → 道具，使用後開放該夥伴招募。`,at:Date.now(),read:false,claimed:false,attachments:[{type:'companionTicket',companionId:p.id,quantity:1,name:p.name+'招募券'}]});}
        }
      }
      if(cache){cache.achievementOwner=party;cache.achievementKey=key;}
    }finally{syncing=false;}
  }
  function flushMailNotice(){const list=party?.mailbox?.messages.filter(m=>!announced.has(m.id))||[];if(!list.length)return;for(const m of list){announced.add(m.id);note('收到獎勵郵件：'+m.subject);}toast(`收到 ${list.length} 封獎勵郵件，請到信箱領取附件`);}
  globalThis.companionPendingMail=function(id){syncUnlocks();return party?.mailbox?.messages.some(m=>!m.claimed&&m.attachments.some(x=>x.companionId===id))||false;};
  globalThis.companionUnlocked=function(id){syncUnlocks();return !!party?.companionUnlocks?.unlocked.includes(id);};
  globalThis.companionTicketCount=function(id){syncUnlocks();return party?.achievements?.tickets[id]||0;};
  globalThis.companionUnlockText=function(p){
    syncUnlocks();if(companionUnlocked(p.id))return '已解鎖，可招募';if(companionTicketCount(p.id))return '已持有招募券，請到背包 → 道具使用';if(companionPendingMail(p.id))return '招募券已寄到信箱，請領取附件';
    const c=p.unlockCondition;
    if(c.type==='achievement'){const names=new Map(catalog().map(x=>[x.id,x.name]));return '達成任一成就會寄送招募券：'+c.achievementIds.map(id=>names.get(id)||id).join('、');}
    return c.type==='ticket'?`購買商店隨機刷出的「${p.name}招募券」，到背包使用後解鎖`:'初始開放';
  };
  const baseValidate=validateParty;
  validateParty=function(raw){const progress=validateProgress(raw?.companionUnlocks),achievements=A.migrate(raw?.achievements,progress),out=baseValidate(raw);out.companionUnlocks=progress;out.achievements=achievements;out.mailbox=A.validateMailbox(raw?.mailbox);
    for(const m of out.mailbox.messages)for(const item of m.attachments)if(item.type==='gear'){
      solo.validateSave({...copy(out.members[0]),bag:[copy(item.gear)],equipped:Array(5).fill(null)},{companion:true});
      const meta=item.gear.starterPack;
      if(meta&&(meta.baseAttack!==undefined&&(!Number.isFinite(meta.baseAttack)||meta.baseAttack<0||meta.baseAttack>10000)))throw Error('信箱武器基礎攻擊無效');
    }
    return out;};
  const basePack=packParty;
  packParty=function(){syncUnlocks();return {...basePack(),companionUnlocks:copy(party.companionUnlocks),achievements:copy(party.achievements),mailbox:copy(party.mailbox)};};
  const baseSave=save;
  save=function(...args){syncUnlocks();const result=baseSave(...args);if(result===true)flushMailNotice();return result;};
  const baseLoad=loadParty;
  loadParty=function(...args){const out=baseLoad(...args);selectedMail=null;announced.clear();for(const m of party?.mailbox?.messages||[])announced.add(m.id);syncUnlocks();return out;};
  const baseStart=start;
  start=function(...args){selectedMail=null;announced.clear();return baseStart(...args);};
  const baseReward=rewardGroupKill;
  rewardGroupKill=function(e){
    if(!e||e.rewarded||!party)return baseReward(e);
    syncUnlocks();const a=party.achievements,before=a.completed.length,beforeMail=party.mailbox.serial,region=e.region??party.map;
    if(Number.isInteger(region)&&MAPS[region]){
      if(e.kind==='elite'){a.eliteKills[region]=Math.min(1e12,(a.eliteKills[region]||0)+1);party.companionUnlocks.eliteKills[region]=a.eliteKills[region];}
      if(['boss','final'].includes(e.kind))a.bossKills[region]=Math.min(1e12,(a.bossKills[region]||0)+1);
    }
    const out=baseReward(e);syncUnlocks();globalThis.__EMBERWILD_TEAMS?.refreshUnlocks?.();if(a.completed.length>before||party.mailbox.serial>beforeMail)save();return out;
  };
  globalThis.useCompanionRecruitmentTicket=function(id){
    const p=plans().find(p=>p.id===id)||party?.companionProfiles?.[id],duplicate=companionUnlocked(id);
    if(!p||companionTicketCount(id)<1||p.availability==='hidden'&&!duplicate)return false;
    const old=copy(party.achievements),progress=copy(party.companionUnlocks),gold=state.gold,value=model.duplicateTicketGold(p);
    if(duplicate&&gold+value>1e12){toast('金幣已達上限，招募券已保留');return false;}
    party.achievements.tickets[id]--;if(!party.achievements.tickets[id])delete party.achievements.tickets[id];
    if(duplicate)state.gold+=value;else party.companionUnlocks.unlocked.push(id);
    if(!save()){party.achievements=old;party.companionUnlocks=progress;state.gold=gold;return false;}
    render();
    if(duplicate){$('modal').innerHTML=`<h2>夥伴已解鎖</h2><p>「${esc(p.name)}」已解鎖，${esc(p.name)}招募券 ×1 已轉換為 <b>${value} 金幣</b>。</p><button onclick="closeModal()">確認</button>`;$('modal').showModal();toast(`夥伴已解鎖，招募券已轉換為 ${value} 金幣`);}
    else toast(`已解鎖 ${p.name}，可到夥伴名冊招募`);return true;
  };
  const candidates=()=>plans().filter(p=>p.availability==='visible'&&p.unlockCondition.type==='ticket'&&!companionUnlocked(p.id)&&!companionTicketCount(p.id)&&!companionPendingMail(p.id));
  globalThis.hasCompanionRecruitmentOffers=()=>!!party&&candidates().length>0;
  const baseGenerate=generateMarket;
  generateMarket=function(){const market=baseGenerate();for(const p of candidates()){if(market.offers.length>=100)break;const c=p.unlockCondition;if(Math.random()<c.chance)market.offers.push({id:`${market.serial}-${market.offers.length}`,kind:'material',key:`夥伴招募券-${p.id}`,qty:1,price:c.price,sold:false,ruleId:`companion-recruit-${p.id}`});}return market;};
  function ticketPlan(o){return o?.ruleId?.startsWith('companion-recruit-')?plans().find(p=>p.id===Number(o.ruleId.slice(18))&&p.availability==='visible'&&p.unlockCondition.type==='ticket'&&o.kind==='material'&&o.key===`夥伴招募券-${p.id}`&&o.qty===1&&o.price===p.unlockCondition.price):null;}
  const baseCards=marketCards;
  marketCards=function(){const extra=(party.market?.offers||[]).map(o=>{const p=ticketPlan(o);if(!p)return '';const done=o.sold||companionUnlocked(p.id)||companionTicketCount(p.id)||companionPendingMail(p.id);return `<article class="shop-product-row icon-product random-shop-row">${itemSlotHTML('item','companion-ticket-'+p.id,{count:1,context:'shop',detailLabel:'商品數量',price:globalThis.shopPayablePrice?.(o.price)??o.price,shopType:'market',shopId:o.id,sold:done,soldLabel:'已取得'})}</article>`;}).join('');const base=baseCards();return (extra&&base.includes('本批沒有隨機商品')?'':base)+extra;};
  const baseBuy=buyMarketOffer;
  buyMarketOffer=function(id){const o=party?.market?.offers.find(o=>o.id===id);if(!o?.ruleId?.startsWith('companion-recruit-'))return baseBuy(id);const p=ticketPlan(o);if(!p||o.sold||companionUnlocked(p.id)||companionTicketCount(p.id)||companionPendingMail(p.id))return;const price=globalThis.shopPayablePrice?.(o.price)??o.price;if(state.gold<price)return toast('金幣不足');const gold=state.gold,old=copy(party.achievements);state.gold-=price;o.sold=true;party.achievements.tickets[p.id]=1;if(!save()){state.gold=gold;o.sold=false;party.achievements=old;return;}render();toast(`${p.name}招募券已放入背包，使用後解鎖`);};
  const baseInventory=accountItemsView;
  // Recruitment tickets are listed in the item tab's ticket block (shop-inventory.js).
  accountItemsView=function(){syncUnlocks();return baseInventory();};

  globalThis.accountItemsView=accountItemsView;
  let selectedMail=null;
  const unclaimedMail=()=>party?.mailbox?.messages.filter(m=>!m.claimed)||[];
  globalThis.mailboxLabel=function(){const count=unclaimedMail().length;return count?'信箱 · '+count:'信箱';};
  globalThis.openMailboxMail=function(id){syncUnlocks();const m=party.mailbox.messages.find(m=>m.id===id);if(!m)return false;const before=m.read;m.read=true;if(!save()){m.read=before;return false;}selectedMail=id;render();return true;};
  function catalogueAttachment(row,job,doc){
    if(row.kind==='equipment'){
      const ref=EmberwildMonsterDesign.equipmentRef(row.key,doc);if(!ref)throw Error('新手禮包裝備引用無效');
      let g;
      if(ref.region!==undefined)g=bossGear(ref.region,ref.job,0);
      else {
        const jobs=gearWearableJobs({job:ref.job,formJob:ref.job,slot:ref.slot,form:ref.index});
        g=gear(1,ref.slot,0,jobs.includes(job)?job:jobs[0]??0);
        Object.assign(g,{formJob:ref.job,form:ref.index,powerTier:1,prefixId:'',suffixId:'',affix:[],plus:0});
        if(ref.form.weaponType)g.weaponType=ref.form.weaponType;
        g.name=gearName(g);
      }
      return {type:'gear',gear:g,name:equipmentDisplayName(g),quantity:row.quantity};
    }
    if(row.kind==='token'){
      const g=createCompanionToken(row.key);if(!g)throw Error('新手禮包信物引用無效');
      return {type:'gear',gear:g,name:g.name,quantity:row.quantity};
    }
    if(row.kind==='item'&&row.key.startsWith('companion-ticket-'))return {type:'companionTicket',companionId:Number(row.key.slice(17)),quantity:row.quantity,name:row.name};
    return copy(row);
  }
  globalThis.sendStarterPackMail=function(job,rows,text={}){
    syncUnlocks();const mailbox=party.mailbox;
    if(mailbox.messages.some(m=>m.rewardKey.startsWith('starter-')))return false;
    const doc=exportableBalance(),attachments=rows.map(row=>row.type==='catalogue'?catalogueAttachment(row,job,doc):copy(row));
    const parts=Math.ceil(attachments.length/6);
    for(let i=0;i<parts;i++)mailbox.messages.push({id:++mailbox.serial,rewardKey:`starter-${job}-${i+1}`,subject:(text.subject||CLASSES[job].name+'新手禮包')+(parts>1?`（${i+1}/${parts}）`:''),body:text.body||'歡迎來到夢淵！初始裝已穿戴；領取附件後，可到背包自行換上新手武器。新手武器可強化，不可洗鍊詞綴或重鑄基底。',at:Date.now(),read:false,claimed:false,attachments:attachments.slice(i*6,i*6+6)});
    return true;
  };
  function claimMail(ids){
    syncUnlocks();ensureSharedGear();ensureAccountResources();ensureSharedItems();ensureHealingPotionState();
    const messages=party.mailbox.messages.filter(m=>ids.includes(m.id)&&!m.claimed);if(!messages.length)return false;
    const tickets=copy(party.achievements.tickets),bag=[...state.bag],materials=copy(state.materials),consumables=copy(state.consumables),gems=[...state.gems],potions=copy(healingInventory());
    let ore=state.ore,dust=state.dust;
    const add=(object,key,n,limit=1e9)=>{const next=(object[key]||0)+n;if(!Number.isSafeInteger(next)||next>limit)throw Error('道具庫存已達上限，附件保留在信箱');object[key]=next;};
    try{
      for(const m of messages)for(const item of m.attachments){
        if(item.type==='companionTicket')add(tickets,item.companionId,item.quantity);
        else if(item.type==='gear'){
          if(bag.length+item.quantity>RULES.bagCapacity)throw Error('背包空間不足，請整理後再領取附件');
          for(let i=0;i<item.quantity;i++)bag.push({...copy(item.gear),id:uid()});
        }else if(item.kind==='gem')add(gems,Number(item.key),item.quantity);
        else if(item.kind==='material'){
          if(item.key==='鍛鐵'){ore+=item.quantity;if(ore>1e12)throw Error('鍛鐵庫存已達上限');}
          else if(item.key==='粉塵'){dust+=item.quantity;if(dust>1e12)throw Error('粉塵庫存已達上限');}
          else add(materials,item.key,item.quantity);
        }else if(item.kind==='item'){
          const definition=__EMBERWILD_INVENTORY_STOCK.item(item.key);
          if(!definition)throw Error('附件道具目前無法使用，已保留在信箱');
          if(item.key==='level_scroll')add(materials,'升級卷軸',item.quantity);
          else add(isHealPotion(definition)?potions:consumables,item.key,item.quantity);
        }
      }
    }catch(error){toast(error.message);return false;}
    const before={tickets:party.achievements.tickets,bag:state.bag,materials:state.materials,consumables:state.consumables,gems:state.gems,potions:party.members[0].healingPotions,ore:state.ore,dust:state.dust,mailbox:copy(party.mailbox)};
    party.achievements.tickets=tickets;state.bag=bag;state.materials=materials;state.consumables=consumables;state.gems=gems;state.ore=ore;state.dust=dust;party.members[0].healingPotions=potions;
    for(const m of messages){m.claimed=true;m.read=true;}
    let saved=false;try{saved=save()===true;}catch(error){toast('儲存失敗，附件保留在信箱');}
    if(!saved){party.achievements.tickets=before.tickets;state.bag=before.bag;state.materials=before.materials;state.consumables=before.consumables;state.gems=before.gems;state.ore=before.ore;state.dust=before.dust;party.members[0].healingPotions=before.potions;party.mailbox=before.mailbox;return false;}
    render();toast('已領取 '+messages.length+' 封郵件的附件，道具已放入背包');return true;
  }
  globalThis.claimMailboxAttachments=id=>claimMail([id]);
  globalThis.claimStarterPackMail=()=>{syncUnlocks();const ids=party.mailbox.messages.filter(m=>m.rewardKey.startsWith('starter-')&&!m.claimed).map(m=>m.id);return ids.length?claimMail(ids):party.mailbox.messages.some(m=>m.rewardKey.startsWith('starter-'));};
  globalThis.claimAllMailboxAttachments=function(){syncUnlocks();return claimMail(unclaimedMail().map(m=>m.id));};
  // v0.076: read everything, and delete only mail that is both read and claimed. Unread or unclaimed (NEW) mail stays.
  // Reward resends are guarded elsewhere (starter packs only on a new game, companion rewards by rewardCompanions).
  globalThis.markAllMailRead=function(){syncUnlocks();const before=party.mailbox.messages.map(m=>m.read);let n=0;for(const m of party.mailbox.messages)if(!m.read){m.read=true;n++;}if(!n)return false;if(save()===false){party.mailbox.messages.forEach((m,i)=>m.read=before[i]);toast('儲存失敗，信件狀態未變更');return false;}render();toast('已將 '+n+' 封信件標為已讀');return true;};
  // Locked mail (ids kept on the party leader, since voucher mail objects are rebuilt by their validator) is never deleted.
  const lockedIds=()=>{const h=party.members[0];if(!Array.isArray(h.lockedMailIds))h.lockedMailIds=[];return h.lockedMailIds;};
  const mailLocked=id=>!!party?.members?.[0]?.lockedMailIds?.includes(id);
  globalThis.toggleMailLock=function(id){syncUnlocks();if(!party.mailbox.messages.some(m=>m.id===id))return false;const ids=lockedIds(),i=ids.indexOf(id),before=[...ids];if(i>=0)ids.splice(i,1);else ids.push(id);if(save()===false){ids.splice(0,ids.length,...before);toast('儲存失敗，鎖定狀態未變更');return false;}render();return true;};
  const deletable=m=>m.read&&m.claimed&&!mailLocked(m.id);
  globalThis.deleteReadClaimedMail=function(){syncUnlocks();const list=party.mailbox.messages,doomed=list.filter(deletable);if(!doomed.length)return false;if(!confirm('刪除 '+doomed.length+' 封已讀且已領取的信件？未讀、附件未領取或已鎖定的信件不會被刪除。'))return false;const before=[...list],locks=[...lockedIds()];party.mailbox.messages=list.filter(m=>!deletable(m));{const kept=new Set(party.mailbox.messages.map(m=>m.id)),ids=lockedIds();ids.splice(0,ids.length,...ids.filter(id=>kept.has(id)));}if(save()===false){party.mailbox.messages=before;lockedIds().splice(0,lockedIds().length,...locks);toast('儲存失敗，信件未刪除');return false;}if(!party.mailbox.messages.some(m=>m.id===selectedMail))selectedMail=null;render();toast('已刪除 '+doomed.length+' 封信件');return true;};
  globalThis.mailboxView=function(){
    syncUnlocks();const messages=[...party.mailbox.messages].reverse(),pending=unclaimedMail().length,m=messages.find(m=>m.id===selectedMail)||messages[0];
    return heading('MAILBOX / 玩家信箱','信箱',`<span class="tag">未領取 ${pending}</span>`)+`<section class="panel"><div class="row"><p class="small">新手禮包與成就獎勵會寄到此處。每封最多六格附件；領取後存入背包。</p><span class="actions mailbox-actions"><button onclick="claimAllMailboxAttachments()" ${pending?'':'disabled'}>全部領取</button><button onclick="markAllMailRead()" ${party.mailbox.messages.some(m=>!m.read)?'':'disabled'}>已讀全部</button><button onclick="deleteReadClaimedMail()" ${party.mailbox.messages.some(deletable)?'':'disabled'}>刪除已讀及已領取信件</button></span></div><div class="mailbox-layout"><div class="mailbox-list">${messages.map(mail=>`<button class="mailbox-list-item ${mail.id===m?.id?'selected':''}" data-mail-id="${mail.id}" aria-pressed="${mail.id===m?.id}" onclick="openMailboxMail(${mail.id})">${!mail.read?'<span class="mail-dot" aria-label="未讀"></span>':''}<b>${mail.attachments?.length&&typeof mailAttachmentIcon==='function'?mailAttachmentIcon(mail.id,0):''}${esc(mail.subject)}</b><time class="small">${esc(new Date(mail.at).toLocaleString('zh-TW'))}</time></button>`).join('')||'<p class="empty">尚無郵件。</p>'}</div>${m?`<article class="mailbox-detail" data-mail-detail="${m.id}"><h2>${esc(m.subject)}</h2><p class="small">${esc(new Date(m.at).toLocaleString('zh-TW'))} · ${m.claimed?'附件已領取':'附件待領取'}${mailLocked(m.id)?' · 已鎖定（不會被刪除）':''}</p><button type="button" class="mail-lock" onclick="toggleMailLock(${m.id})" aria-pressed="${mailLocked(m.id)}">${mailLocked(m.id)?'解除鎖定':'鎖定信件'}</button><p class="mailbox-body">${esc(m.body)}</p><h3>附件</h3><div class="mailbox-attachments">${Array.from({length:6},(_,i)=>m.attachments[i]?mailAttachmentSlot(m.id,i):'<span class="item-slot item-slot-empty" aria-hidden="true"></span>').join('')}</div><button class="primary" onclick="claimMailboxAttachments(${m.id})" ${m.claimed?'disabled':''}>${m.claimed?'已領取':'領取附件'}</button></article>`:'<div class="mailbox-detail"><p class="small">達成綁定夥伴的成就後，獎勵郵件會出現在這裡。</p></div>'}</div></section>`;
  };
  let regionFilter=String(party?.map??0),kindFilter='all',statusFilter='all';
  globalThis.setAchievementFilter=function(key,value){if(key==='region'&&(value==='all'||/^\d+$/.test(value)&&MAPS[Number(value)]))regionFilter=value;else if(key==='kind'&&['all','open','elite','boss'].includes(value))kindFilter=value;else if(key==='status'&&['all','done','pending'].includes(value))statusFilter=value;else return false;render();return true;};
  globalThis.achievementsView=function(){
    syncUnlocks();const a=party.achievements,all=catalog(),done=new Set(a.completed),rows=all.filter(x=>(regionFilter==='all'||x.mapIndex===Number(regionFilter))&&(kindFilter==='all'||x.kind===kindFilter)&&(statusFilter==='all'||done.has(x.id)===(statusFilter==='done')));
    const select=(key,value,list)=>`<select aria-label="${key==='region'?'地區':key==='kind'?'成就類型':'達成狀態'}" onchange="setAchievementFilter('${key}',this.value)">${list.map(([id,label])=>`<option value="${id}" ${value===id?'selected':''}>${esc(label)}</option>`).join('')}</select>`;
    return heading('ACHIEVEMENTS / 玩家成就','成就',`<span class="tag">達成 ${all.filter(x=>done.has(x.id)).length} / ${all.length}</span>`)+`<section class="panel"><p class="small">各地區獨立計數，各難度合計；菁英與 BOSS 每 50 隻一階，最高 1000。終局首領計入 BOSS。成就僅記錄達成進度。</p><div class="achievement-filters">${select('region',regionFilter,[['all','全部地區'],...MAPS.map((m,i)=>[String(i),m.name])])}${select('kind',kindFilter,[['all','全部類型'],['open','地區開放'],['elite','菁英擊殺'],['boss','BOSS 擊殺']])}${select('status',statusFilter,[['all','全部狀態'],['done','已達成'],['pending','未達成']])}</div><div class="achievement-list">${rows.map(x=>{const count=x.kind==='open'?Number(party.companionUnlocks.regions.includes(x.mapIndex)):(x.kind==='elite'?a.eliteKills:a.bossKills)[x.mapIndex]||0,target=x.kind==='open'?1:x.count;return `<article class="achievement-row ${done.has(x.id)?'done':''}" data-achievement="${x.id}"><div><b>${esc(x.name)}</b><span class="small">${done.has(x.id)?'已達成':'未達成'} · ${Math.min(count,target)} / ${target}</span><progress max="${target}" value="${Math.min(count,target)}" aria-label="${esc(x.name)}進度"></progress></div></article>`;}).join('')||'<p class="empty">沒有符合篩選的成就。</p>'}</div></section>`;
  };
  const baseApply=applyBalanceConfig;
  applyBalanceConfig=function(input,options={}){const before=JSON.stringify(plans().map(p=>[p.id,p.availability,p.unlockCondition])),out=baseApply(input,{persist:false});syncUnlocks();if(party&&before!==JSON.stringify(plans().map(p=>[p.id,p.availability,p.unlockCondition])))party.market=generateMarket();if(options.persist!==false){localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));if(party)save();}if(state)render();return out;};
  if(party)syncUnlocks();
  globalThis.__EMBERWILD_COMPANION_UNLOCK_TEST={validateProgress,syncUnlocks,ticketPlan,catalog};
})();
