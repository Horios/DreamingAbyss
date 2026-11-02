/* Account quests: five immutable daily choices at Taipei midnight; four claims per day. */
(()=>{
  const C=EmberwildCommissions,M=EmberwildQuestDesign,copy=M.copy;
  const current=b=>b?.dailyVersion===2&&b.day>=C.day(Date.now())&&C.validBoard(b);
  const design=()=>GAMEPLAY_SETTINGS.quests.design;
  const context=()=>({level:playerHero().lv,map:party.map,claimed:playerHero().claimed});
  const itemName=id=>SHOP.find(i=>i.id===id)?.name||id;
  function count(o){
    const h=playerHero();
    if(['nearKill','salvage','enhance'].includes(o.type))return o.progress||0;
    if(o.type==='material')return materialCount(o.key);
    if(o.type==='potion')return healPotionCount(o.key);
    if(o.type==='item')return h.consumables[o.key]||0;
    if(o.type==='kill')return h.kills[o.key]||0;
    if(o.type==='totalKills')return h.totalKills;
    if(o.type==='level')return h.lv;
    if(o.type==='region')return Number(!!MAPS[o.key]&&solo.canVisit(o.key,h));
    const values=party.achievements?.[o.type==='bossKill'?'bossKills':'eliteKills']||{};
    return o.key===-1?Object.values(values).reduce((n,v)=>n+v,0):(values[o.key]||0);
  }
  function setCount(o,n){const h=playerHero();if(o.type==='potion')setHealPotionCount(o.key,n);else if(o.type==='item')h.consumables[o.key]=n;else setMaterialCount(o.key,n);}
  const tier=map=>regionTier(map);
  function resolveRewards(r,map){
    const out=copy(r),t=tier(map);out.gold+=out.goldPerTier*t;out.ore+=out.orePerTier*t;out.goldPerTier=out.orePerTier=0;
    if(out.choice==='gearOrGems'){if(Math.random()<out.gearChance){out.randomGems=0;out.gemCounts=[0,0,0];}else out.gear=[];out.choice='all';}
    out.gear=out.gear.map(g=>({...g,tier:g.tier||t,slot:g.slot===-1?rand(4):g.slot,job:g.job===-1?rand(4):g.job,rar:Math.random()<g.legendaryChance?3:g.rar,legendaryChance:0}));
    return out;
  }
  function nearMonsters(){
    const h=playerHero(),min=Math.max(1,h.lv-5),max=h.lv+5;
    const rows=GAMEPLAY_SETTINGS.monsters.catalog.filter(m=>m.kind==='normal'&&m.enabled!==false&&solo.canVisit(m.mapIndex,h)&&!worldIsFinalMap(m.mapIndex)&&MAPS[m.mapIndex].max>=min&&MAPS[m.mapIndex].min<=max);
    return rows.map(m=>({...m,levelMin:Math.max(min,MAPS[m.mapIndex].min),levelMax:Math.min(max,MAPS[m.mapIndex].max)}));
  }
  function resolveObjectives(q,map){
    return q.objectives.map(o=>{const out=copy(o);if(out.key==='@currentMap'){const pool=MAPS[map]?.mobs||[];out.key=pool[rand(pool.length)][2];}
      if(out.type==='nearKill'){const pool=nearMonsters(),m=pool[rand(pool.length)];out.key=m.id;out.levelMin=m.levelMin;out.levelMax=m.levelMax;}
      if(['nearKill','salvage','enhance'].includes(out.type))out.progress=0;
      out.quantity=Math.min(1000000,out.quantity+rand(out.quantityMax-out.quantity+1)+(tier(map)-1)*out.perTier);out.quantityMax=out.quantity;out.perTier=0;
      if(['material','potion','item'].includes(out.type))out.consume=true;return out;});
  }
  function available(q){return q.objectives.every(o=>o.key!=='@currentMap'||MAPS[questRegion(playerHero())]?.mobs?.length)&&q.objectives.every(o=>o.type!=='nearKill'||nearMonsters().length)&&q.objectives.every(o=>!['potion','item'].includes(o.type)||SHOP.some(i=>i.id===o.key))&&['potions','items'].every(k=>q.rewards[k].every(x=>SHOP.some(i=>i.id===x.key)));}
  function generate(){
    const mi=questRegion(playerHero()),d=design(),pool=d.daily.enabled?d.daily.entries.filter(q=>M.eligible(q,context())&&available(q)):[];
    const board={dailyVersion:2,designVersion:1,day:C.day(Date.now()),next:C.next(Date.now()),serial:(playerHero().board?.serial||0)+1,tasks:[],bonusClaimed:false};
    while(pool.length&&board.tasks.length<5){const q=M.weighted(pool);pool.splice(pool.indexOf(q),1);
      const objectives=resolveObjectives(q,mi),rewards=resolveRewards(q.rewards,mi),o=objectives[0],g=rewards.gear[0],rewardPool=d.daily.materialRewards,pick=rewardPool[rand(rewardPool.length)];
      const amount=pick.min+rand(pick.max-pick.min+1);if(pick.key==='鍛鐵')rewards.ore+=amount;else if(pick.key==='粉塵')rewards.dust+=amount;else {const old=rewards.materials.find(x=>x.key===pick.key);if(old)old.quantity+=amount;else rewards.materials.push({key:pick.key,quantity:amount});}
      const source=o.type==='potion'?'potion':o.type==='material'?(o.key==='紅色草'?'gather':o.key==='紅色草泥'?'alchemy':'monster'):'design';
      board.tasks.push({id:uid(),designVersion:1,templateId:q.id,title:q.title,description:q.description,objectives,rewards,map:mi,mat:o.type==='potion'?itemName(o.key):String(o.key),n:o.quantity,source,...(o.type==='potion'?{item:o.key}:{}),kind:g?'gear':'gem',gem:rand(3),slot:g?.slot??0,rar:g?.rar??2,job:g?.job??0,done:false,started:false});
    }return board;
  }
  ensureBoard=function(){
    if(!party||!state)return false;ensureAccountQuests();const h=playerHero();if(current(h.board))return true;
    const old=h.board;try{h.board=generate();if(old?.dailyVersion===1&&old.day===h.board.day&&old.tasks[0]){const previous=copy(old.tasks[0]);if(previous.designVersion!==1)Object.assign(previous,legacyTask(previous),{designVersion:1,templateId:'legacy_daily',title:previous.mat+'募集',description:'更新前接取的每日委託。'});previous.started=true;h.board.tasks=[previous,...h.board.tasks.filter(q=>q.templateId!==previous.templateId)].slice(0,5);}if(save()!==true)throw Error('儲存失敗');return true;}catch(e){h.board=old;return false;}
  };
  buildBoard=function(){return ensureBoard();};
  refreshBoard=confirmRefresh=function(){toast('每天五項選四項完成，台灣時間 00:00 更新');return false;};
  claimRepeat=function(){toast('常駐募集已改為每日委託');return false;};
  function legacyTask(q){const b=GAMEPLAY_SETTINGS.quests.board;return {objectives:[M.objective(q.source==='potion'?'potion':'material',q.source==='potion'?q.item:q.mat,q.n)],rewards:{...M.reward(),gold:tier(q.map)*Math.round(b.goldPerTier),ore:tier(q.map)*Math.round(b.orePerTier),randomGems:0,gemCounts:[0,1,2].map(i=>q.kind==='gem'&&i===q.gem?Math.round(b.gemReward):0),gear:q.kind==='gear'?[{quantity:1,tier:tier(q.map),slot:q.slot,rar:q.rar,job:q.job,legendaryChance:0}]:[]}};}
  function requirements(q){return q.designVersion===1?q:legacyTask(q);}
  function blocked(q){
    const h=playerHero(),r=q.rewards,slots=r.gear.reduce((n,g)=>n+g.quantity,0);
    if(q.objectives.some(o=>['potion','item'].includes(o.type)&&!SHOP.some(i=>i.id===o.key))||['potions','items'].some(k=>r[k].some(x=>!SHOP.some(i=>i.id===x.key))))return '任務需要的道具目前未開放，請稍後再領取。';
    if(h.bag.length+slots>RULES.bagCapacity)return '背包空間不足，請先整理裝備。';
    if(h.gold+r.gold>1e12||h.ore+r.ore>1e12||h.dust+r.dust>1e12||h.gems.some((v,i)=>v+r.gemCounts[i]+r.randomGems>1e9))return '獎勵庫存已達上限。';
    for(const [key,type] of [['materials','material'],['potions','potion'],['items','item']])for(const x of r[key])if(count({type,key:x.key})+x.quantity>1e9)return '獎勵庫存已達上限。';
    return '';
  }
  function ready(q){if(!q||q.done||!q.started||playerHero().board.tasks.filter(x=>x.done).length>=4)return false;const req=requirements(q);return req.objectives.every(o=>count(o)>=o.quantity)&&!blocked(req);}
  function sideReady(q){return q&&M.eligible(q,context())&&!playerHero().claimed.includes(q.id)&&q.objectives.every(o=>count(o)>=o.quantity)&&!blocked({...q,rewards:{...q.rewards,gold:q.rewards.gold+q.rewards.goldPerTier*tier(questRegion(playerHero())),ore:q.rewards.ore+q.rewards.orePerTier*tier(questRegion(playerHero()))}});}
  function grant(r){
    const h=playerHero();h.gold+=r.gold;h.ore+=r.ore;h.dust+=r.dust;
    r.gemCounts.forEach((v,i)=>h.gems[i]+=v);for(let i=0;i<r.randomGems;i++)h.gems[rand(3)]++;
    for(const [key,type] of [['materials','material'],['potions','potion'],['items','item']])for(const x of r[key]){const o={type,key:x.key};setCount(o,count(o)+x.quantity);}
    for(const g of r.gear)for(let i=0;i<g.quantity;i++)withHero(h,()=>addGear(gear(g.tier,g.slot,g.rar,g.job)));
    if(r.xp)withHero(h,()=>awardXP(r.xp));
  }
  function transaction(q,finish){
    packParty(); // Normalize the existing shared stores before taking the transaction snapshot.
    const before=copy(party),members=party.members.map(h=>copy(h));
    const restore=(target,source,exclude=[])=>{for(const key of Object.keys(target))if(!exclude.includes(key)&&!Object.hasOwn(source,key))delete target[key];for(const key of Object.keys(source))if(!exclude.includes(key))target[key]=copy(source[key]);};
    try{for(const o of q.objectives)if(o.consume)setCount(o,count(o)-o.quantity);grant(q.rewards);finish();if(save()!==true)throw Error('儲存失敗');}
    catch(e){restore(party,before,['members']);party.members.forEach((h,i)=>restore(h,members[i]));toast('任務未能儲存，需求與獎勵已回復');return false;}
    render();return true;
  }
  globalThis.startDailyCommission=function(id){if(!ensureBoard())return false;const q=playerHero().board.tasks.find(q=>q.id===id);if(!q||q.started||q.done||playerHero().board.tasks.filter(x=>x.done).length>=4)return false;const old=q.started;q.started=true;if(save()!==true){q.started=old;return false;}render();return true;};
  globalThis.recordDailyProgress=function(type,key='',quantity=1,level=0){
    if(!party||!state||!current(playerHero().board))return;for(const q of playerHero().board.tasks){if(!q.started||q.done)continue;for(const o of q.objectives)if(o.type===type&&(type!=='nearKill'||o.key===key&&level>=o.levelMin&&level<=o.levelMax))o.progress=Math.min(o.quantity,(o.progress||0)+quantity);}
  };
  claimBoard=function(id){if(!ensureBoard())return false;const board=playerHero().board,q=board.tasks.find(q=>q.id===id);if(!ready(q))return false;const req=requirements(q);if(!transaction(req,()=>{q.done=true;playerHero().repeat++;}))return false;toast('每日委託完成，已領取素材獎勵');return true;};
  claimQuest=function(id){
    ensureAccountQuests();const q=design().side.find(q=>q.id===id);if(!sideReady(q)||playerHero().claimed.length>=200)return false;
    const resolved={...q,rewards:resolveRewards(q.rewards,questRegion(playerHero()))};if(blocked(resolved))return false;
    if(!transaction(resolved,()=>playerHero().claimed.push(id)))return false;toast('支線完成，已領取獎勵');return true;
  };
  globalThis.questReadyCount=function(){if(!party||!state)return 0;ensureBoard();return (current(playerHero().board)?playerHero().board.tasks.filter(ready).length:0);};
  globalThis.sideQuestReminder=function(){if(!party||!state)return {ready:0,new:0};return {ready:design().side.filter(sideReady).length,new:design().side.filter(q=>M.eligible(q,context())&&!playerHero().claimed.includes(q.id)&&!sideReady(q)&&!party.story?.flags['side_started_'+q.id]).length};};
  globalThis.dailyQuestReminder=function(){if(!party||!state)return {ready:0,new:0};return {ready:questReadyCount(),new:current(playerHero().board)&&playerHero().board.tasks.filter(q=>q.done).length<4?playerHero().board.tasks.filter(q=>!q.started).length:0};};
  globalThis.startSideQuest=function(id){const q=design().side.find(q=>q.id===id);if(!q||!M.eligible(q,context()))return false;party.story??={version:1,quests:{},flags:{},unlocks:{},vip:0,autoBuy:false};const key='side_started_'+id,old=party.story.flags[key];party.story.flags[key]=true;if(!save()){if(old===undefined)delete party.story.flags[key];else party.story.flags[key]=old;return false;}render();return true;};
  function objectiveName(o){if(o.type==='nearKill'){const m=GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id===o.key);return (m?.name||o.key)+' · '+(MAPS[m?.mapIndex]?.name||'未知地區')+' · LV'+o.levelMin+'～'+o.levelMax;}if(o.type==='salvage')return '分解裝備件數';if(o.type==='enhance')return '成功強化次數';if(['potion','item'].includes(o.type))return itemName(o.key);if(o.type==='level')return '主角等級';if(o.type==='totalKills')return '累計擊殺';if(o.type==='kill')return '擊敗掉落「'+o.key+'」的怪物';if(o.type==='region')return '開放 '+(MAPS[o.key]?.name||o.key);if(['bossKill','eliteKill'].includes(o.type))return (o.key===-1?'全部地區':MAPS[o.key]?.name||o.key)+(o.type==='bossKill'?' BOSS 擊殺':' 菁英擊殺');return o.key;}
  function progressHTML(q){return `<ul class="quest-objectives">${q.objectives.map(o=>`<li class="${count(o)>=o.quantity?'quest-met':''}"><span>${esc(objectiveName(o))}</span><span>${count(o)} / ${o.quantity} ${o.consume?'· 交付消耗':'· 不消耗'}</span></li>`).join('')}</ul>`;}
  function rewardText(r){
    const list=[];for(const [k,name] of [['gold','金幣'],['ore','鍛鐵'],['dust','粉塵'],['xp','EXP']])if(r[k]||r[k+'PerTier'])list.push((r[k]||0)+(r[k+'PerTier']?'＋每階 '+r[k+'PerTier']:'')+' '+name);
    if(r.randomGems)list.push('隨機寶石 ×'+r.randomGems);r.gemCounts.forEach((n,i)=>{if(n)list.push(GEMS[i].name+' ×'+n);});
    for(const k of ['materials','potions','items'])for(const x of r[k])list.push((k==='materials'?x.key:itemName(x.key))+' ×'+x.quantity);
    for(const g of r.gear)list.push(`${g.rar===3?'傳說':RARITY[g.rar]} ${g.job===-1?'隨機職業':CLASSES[g.job].name}${g.slot===-1?'隨機部位':SLOTS[g.slot]} ×${g.quantity}（${g.tier?'階級 '+g.tier:'依所在地區階級'}）`);
    return list.length?list.join(' · '):'無物品獎勵';
  }
  let sideFilter='available';globalThis.setQuestSideFilter=function(value){if(['available','locked','done','all'].includes(value)){sideFilter=value;render();}};
  questView=function(){
    ensureBoard();const h=playerHero(),board=h.board,tasks=current(board)?board.tasks:[],done=tasks.filter(q=>q.done).length;
    const daily=tasks.map(q=>{const req=requirements(q);return `<article class="card quest-design-card"><span class="tag">${q.done?'今日已完成':q.started?'進行中':'未開始'}</span>${!q.started&&done<4?'<span class="quest-new quest-new-detail" aria-label="有未開始任務">NEW!</span>':''}<h2>${esc(q.title)}</h2><p>${esc(q.description)}</p>${progressHTML(req)}<p class="gold">${esc(rewardText(req.rewards))}</p>${q.started?`<button class="primary" onclick="claimBoard('${q.id}')" ${ready(q)?'':'disabled'}>${q.done?'今日已完成':done>=4?'今日已完成四項':'交付並領獎'}</button>`:`<button onclick="startDailyCommission('${q.id}')" ${done>=4?'disabled':''}>開始任務</button>`}</article>`;}).join('');
    return heading('COMMISSIONS / 每日委託','委託')+`<section class="panel"><b>每日委託 · 今日 ${done} / 4（五選四）</b><p class="small">每天隨機五項，最多完成四項，全隊共用。台灣時間 00:00 更新；切換角色、地圖或匯入設計不會重抽。擊殺、分解與強化從開始任務後計算；收集道具交付時會實際扣除。每項隨機素材獎勵已抽定。</p></section><div class="cards">${daily||'<p>目前沒有可接取的每日委託。</p>'}</div>`;
  };
  globalThis.sideQuestListHTML=function(){const h=playerHero(),d=design();
    const counts={available:0,locked:0,done:0};
    const rows=d.side.filter(q=>q.enabled||h.claimed.includes(q.id)).map(q=>{const done=h.claimed.includes(q.id),unlocked=M.eligible(q,context()),status=done?'done':unlocked?'available':'locked';counts[status]++;return {q,done,unlocked,status};});
    const side=rows.filter(x=>sideFilter==='all'||x.status===sideFilter).map(({q,done,unlocked})=>{
      const missing=q.prerequisites.filter(id=>!h.claimed.includes(id)).map(id=>d.side.find(p=>p.id===id)?.title||id),locks=[...(!q.enabled?['任務已停用']:[]),...(h.lv<q.minLevel?['需要 LV'+q.minLevel]:[]),...(q.maxLevel&&h.lv>q.maxLevel?['限 LV'+q.maxLevel+' 以下']:[]),...(q.mapIndices.length&&!q.mapIndices.includes(party.map)?['需在 '+q.mapIndices.map(i=>MAPS[i]?.name).join('、')]:[]),...(missing.length?['前置支線：'+missing.join('、')]:[])];
      return `<article class="card quest-design-card"><span class="tag">${done?'已完成':unlocked?'一次性支線':'尚未解鎖'}</span><h2>${esc(q.title)}</h2>${!done&&unlocked&&!party.story?.flags['side_started_'+q.id]&&!sideReady(q)?`<span class="quest-new quest-new-detail" aria-label="有未開始任務">NEW!</span><button onclick="startSideQuest('${q.id}')">開始任務</button>`:''}<p>${esc(q.description)}</p>${locks.length&&!done?`<p class="small">${esc(locks.join(' · '))}</p>`:''}${progressHTML(q)}<p class="gold">${esc(rewardText(q.rewards))}${q.rewards.choice==='gearOrGems'?'（裝備／寶石二選一）':''}</p>${!done&&unlocked&&blocked(q)?`<p class="small">${esc(blocked(q))}</p>`:''}<button class="primary" onclick="claimQuest('${q.id}')" ${sideReady(q)?'':'disabled'}>${done?'已完成':unlocked?'完成並領獎':'尚未解鎖'}</button></article>`;
    }).join('');
    return `<h2>一般支線</h2><div class="actions quest-filter">${[['available','可進行'],['locked','未解鎖'],['done','已完成'],['all','全部']].map(([id,label])=>`<button class="${sideFilter===id?'primary':''}" onclick="setQuestSideFilter('${id}')">${label} ${id==='all'?rows.length:counts[id]}</button>`).join('')}</div><div class="cards">${side||'<p>此分類沒有支線。</p>'}</div>`;
  };
  globalThis.__EMBERWILD_QUESTS={design,count,ready,sideReady,resolveRewards,generate};
  const baseStart=start;start=function(...args){const out=baseStart(...args);ensureBoard();render();return out;};
  const baseLoad=loadParty;loadParty=function(...args){const out=baseLoad(...args);ensureBoard();return out;};
  if(state){ensureBoard();render();}
})();
