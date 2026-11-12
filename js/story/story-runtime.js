/* Story orchestration reads existing account stores; only missing lifetime metrics live in progressStats. */
(()=>{
 const M=EmberwildStory,copy=M.copy;
 let design=M.defaults(),category='main',selected='',dialogue=null,trackingOwner=null,inventoryBefore={},committedInventory={},pendingGains={};
 const context=d=>({companions:d.companions,classes:d.classes,maps:d.balanceSettings?.maps?.catalog,monsters:d.balanceSettings?.monsters?.catalog,items:d.items,recipes:d.lifeSkills?.recipes,skills:d.skillSystem?.definitions,forms:d.equipmentForms});
 function fresh(){return {version:1,quests:{},flags:{},unlocks:{},vip:0,autoBuy:false};}
 function freshStats(){return {version:1,encounters:{},visits:{},explore:{},gatherItems:{},gather:0,recipes:{},alchemy:0,enhance:0,enhanceLevel:0,acquired:{}};}
 function validData(raw,fallback){if(raw===undefined)return fallback;const x=copy(raw);function walk(v){if(!v||typeof v!=='object')return;for(const [k,n] of Object.entries(v)){if(['__proto__','constructor','prototype'].includes(k))throw Error('劇情存檔包含無效鍵值');if(typeof n==='number'&&(!Number.isSafeInteger(n)||n<0||n>1e12))throw Error('劇情存檔數值無效');walk(n);}}walk(x);return x;}
 function validateProgress(raw,stats){const q=validData(raw,fresh()),p=validData(stats,freshStats());
  if(p.version!==1||q.version!==1||(!Number.isSafeInteger(q.vip)||q.vip<0||q.vip>99)||typeof q.autoBuy!=='boolean'||!q.quests||!q.flags||!q.unlocks||[q.quests,q.flags,q.unlocks].some(x=>Array.isArray(x)||typeof x!=='object'))throw Error('劇情存檔格式無效');
  for(const [id,r] of Object.entries(q.quests)){if(!r||r.recoveryUses!==undefined&&(!Number.isSafeInteger(r.recoveryUses)||r.recoveryUses<0||r.recoveryUses>5)||r.started!==undefined&&typeof r.started!=='boolean'||typeof r.current!=='string'||typeof r.done!=='boolean'||!Array.isArray(r.completed)||r.completed.some(x=>typeof x!=='string')||!r.baseline||!r.choices||Array.isArray(r.baseline)||Array.isArray(r.choices)||typeof r.baseline!=='object'||typeof r.choices!=='object'||new Set(r.completed).size!==r.completed.length||Object.values(r.baseline).some(n=>!Number.isSafeInteger(n)||n<0)||Object.values(r.choices).some(v=>typeof v!=='string'))throw Error('任務階段存檔無效：'+id);}
  for(const f of [q.flags,q.unlocks])if(Object.values(f).some(v=>typeof v!=='boolean'))throw Error('任務解鎖格式無效');
  for(const k of Object.keys(freshStats()))if(p[k]===undefined)p[k]=freshStats()[k];
  for(const k of ['encounters','visits','explore','gatherItems','recipes','acquired'])if(!p[k]||Array.isArray(p[k])||typeof p[k]!=='object'||Object.values(p[k]).some(n=>!Number.isSafeInteger(n)||n<0))throw Error('永久統計格式無效');
  for(const k of ['gather','alchemy','enhance','enhanceLevel'])if(!Number.isSafeInteger(p[k])||p[k]<0)throw Error('永久統計數值無效');return {story:q,progressStats:p};
 }
 function migrateStats(account){const p=freshStats(),h=account.members?.[0];if(!h)return p;p.visits[String(account.map??0)]=1;p.enhance=(h.bag||[]).reduce((n,g)=>n+(g.plus||0),0);p.enhanceLevel=Math.max(0,...(h.bag||[]).map(g=>g.plus||0));
  const catalog=GAMEPLAY_SETTINGS.monsters.catalog;for(let i=0;i<MAPS.length;i++){const keys=new Set(catalog.filter(m=>m.mapIndex===i&&!catalog.some(other=>other.mapIndex!==i&&other.material===m.material)).map(m=>m.material));p.explore[i]=[...keys].reduce((n,k)=>n+(h.kills[k]||0),0);if(p.explore[i]||account.achievements?.bossKills[i])p.visits[i]=1;}return p;}
 function ensure(){if(!party)return null;party.story??=fresh();party.progressStats??=migrateStats(party);return party.story;}
 const stats=()=>{ensure();return party.progressStats;};
 function inventory(){if(!party)return {};const h=playerHero(),out={};for(const [k,n] of Object.entries(h.materials||{}))out['material:'+k]=n;out['material:鍛鐵']=h.ore;out['material:粉塵']=h.dust;for(const i of SHOP)out['item:'+i.id]=globalThis.__EMBERWILD_INVENTORY_STOCK?.count(i.id)||0;return out;}
 function resetTracking(){trackingOwner=party;inventoryBefore=inventory();committedInventory=copy(inventoryBefore);pendingGains={};if(party)for(const [k,n] of Object.entries(inventoryBefore))stats().acquired[k]=Math.max(stats().acquired[k]||0,n);}
 function ensureTracking(){ensure();if(trackingOwner!==party){resetTracking();for(const [k,n] of Object.entries(inventoryBefore))stats().acquired[k]=Math.max(stats().acquired[k]||0,n);}}
 function observeInventory(explicitKey='',quantity=0){const current=inventory();for(const key of new Set([...Object.keys(current),explicitKey])){if(!key)continue;const gain=Math.max(0,(current[key]||0)-(inventoryBefore[key]||0),key===explicitKey?quantity:0);if(gain)pendingGains[key]=(pendingGains[key]||0)+gain;}inventoryBefore=current;}
 globalThis.recordStoryAcquisition=(type,key,n)=>{ensureTracking();observeInventory(type+':'+key,n);};
 globalThis.recordLifeProgress=(kind,key,type,quantity)=>{ensureTracking();const p=stats();if(kind==='gather')p.gather++;else if(kind==='alchemy')p.alchemy++;else if(kind==='recipe')p.recipes[key]=(p.recipes[key]||0)+1;if(quantity&&kind==='gather')p.gatherItems[type+':'+key]=(p.gatherItems[type+':'+key]||0)+quantity;};
 globalThis.recordGatheredItem=(type,key,n)=>{const p=stats();p.gatherItems[type+':'+key]=(p.gatherItems[type+':'+key]||0)+n;};
 const countStock=c=>c.itemType==='item'?(globalThis.__EMBERWILD_INVENTORY_STOCK?.count(c.key)||0):materialCount(c.key);
 const ownedGear=key=>party.members.flatMap(h=>h.bag||[]).filter(g=>g.storyRewardKey===key);
 const wornReward=(h,key)=>__EMBERWILD_SKILLS.worn(h).find(g=>g.storyRewardKey===key);
 function gemEffect(h,g,n,mode){const E=__EMBERWILD_EQUIPMENT_SKILLS,id=g?.skillSockets?.gems[n];if(!g||id==null||E.mode(h,g,n)!==mode)return 0;const def=__EMBERWILD_SKILLS.system().gems.find(x=>x.kind===id%5),tier=Math.floor(id/5);if(mode==='base')return def.base.values[tier];return E.compatible(id,__EMBERWILD_SKILLS.byId(g.skillId),n)?E.skillRate(h,g.skillId,def.skill.key):0;}
 function value(c){const h=playerHero(),p=stats(),q=ensure(),sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);switch(c.type){
  case 'gearWorn':return Number(!!wornReward(h,c.key));
  case 'gearSkillActive':{const g=wornReward(h,c.key);return Number(!!g&&h.activeSkillEquipmentId===g.id);}
  case 'skillSlotted':{const S=__EMBERWILD_SKILLS,sk=S.byId(c.key);return Number(!!sk&&S.learned(h,sk)&&h.skillLoadout?.[sk.type]?.includes(sk.id)&&S.validCast(h,EmberwildSkillSystem.adapterFor(sk,h.job).index,sk.adapter.kind));}
  case 'gearSkillGem':return Number(gemEffect(h,wornReward(h,c.key),0,'skill')>0);
  case 'gearBaseGem':return Number(gemEffect(h,wornReward(h,c.key),c.slot,'base')>0);
  case 'encounter':return p.encounters[c.key]||0;
  case 'companions':return party.members.length-1;case 'party':return party.buildSystem?.plans?.find(x=>x.id===party.buildSystem.activeId)?.job===null?0:heroes().length;
  case 'region':return Number(!!MAPS[Number(c.key)]&&solo.canVisit(Number(c.key),h));case 'visit':return Number(p.visits[c.key]||party.map===Number(c.key));case 'explore':return p.explore[c.key]||0;
  case 'kill':{const m=GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id===c.key);return m?h.kills[m.material]||0:0;}case 'kills':return h.totalKills;
  case 'boss':return party.achievements?.bossKills[c.key]||0;case 'bosses':return sum(party.achievements?.bossKills);
  case 'stock':return countStock(c);case 'acquired':return p.acquired[c.itemType+':'+c.key]||0;
  case 'gatherItem':return p.gatherItems[c.itemType+':'+c.key]||0;case 'gather':return p.gather;case 'recipe':return p.recipes[c.key]||0;case 'alchemy':return p.alchemy;
  case 'enhance':return Math.max(p.enhance,...h.bag.map(g=>g.plus||0),0);case 'enhanceLevel':return Math.max(p.enhanceLevel,...h.bag.map(g=>g.plus||0),0);case 'level':return h.lv;
  case 'quest':return Number(!!q.quests[c.key]?.done);case 'stage':{const [id,s]=c.key.split('/');return Number(q.quests[id]?.completed.includes(s)||false);}case 'flag':return Number(!!q.flags[c.key]);case 'unlock':return Number(!!q.unlocks[c.key]);default:return 0;
 }}
 const signature=c=>[c.type,c.key,c.itemType].join('|');
 const progress=(c,r)=>Math.max(0,value(c)-(c.mode==='stage'?(r?.baseline[signature(c)]||0):0));
 const met=(g,r)=>g.conditions.length===0||(g.mode==='any'?g.conditions.some(c=>progress(c,r)>=c.count):g.conditions.every(c=>progress(c,r)>=c.count));
 const record=id=>ensure()?.quests[id];
 const allConditions=s=>[...s.conditions.conditions,...s.branches.flatMap(b=>b.conditions.conditions),...s.choices.flatMap(c=>[...c.conditions.conditions,...c.nextQuests.flatMap(n=>n.conditions.conditions)])];
 function enter(q,r,id){r.current=id;r.baseline={};const s=q.stages.find(s=>s.id===id);if(!s)throw Error('下一階段不存在');for(const c of [...allConditions(s),...q.nextQuests.flatMap(n=>n.conditions.conditions)])if(c.mode==='stage')r.baseline[signature(c)]=value(c);}
 function eligible(q){return q.enabled&&q.prerequisites.every(id=>record(id)?.done)&&met(q.unlock);}
 const prologueRunning=()=>{const q=M.prologueQuest(design),r=q&&party?.story?.quests[q.id];return !!r&&!r.done;};
 function activate(q){if(q.prologue||prologueRunning()||record(q.id)||!eligible(q))return false;const r={current:'',started:false,done:false,completed:[],baseline:{},choices:{}};ensure().quests[q.id]=r;enter(q,r,q.entry);return true;}
 function linkedIds(){return new Set(design.quests.flatMap(q=>[...q.nextQuests,...q.stages.flatMap(s=>s.choices.flatMap(c=>c.nextQuests))].map(n=>n.questId)));}
 function sync(){ensureTracking();const linked=linkedIds();for(const q of design.quests)if(!linked.has(q.id)||ensure().unlocks['quest_'+q.id])activate(q);}
 // Named applyEffects: the quest-encounter spawn below assigns the core's battle `effects` array, which would otherwise replace this function.
 function applyEffects(list){for(const e of list){if(e.type==='vip'){ensure().vip=Math.max(ensure().vip,e.value);ensure().unlocks.shop_vip_bronze=true;}else ensure()[e.type==='flag'?'flags':'unlocks'][e.key]=e.value;}}
 function grantGear(key){if(ownedGear(key).length)return;const spec=design.gearRewards.find(x=>x.id===key),h=playerHero();if(h.bag.length>=RULES.bagCapacity)throw Error('請先清出一個背包空位');let ref;ITEM_FORMS.forEach((slots,job)=>slots.forEach((rows,slot)=>rows.forEach((f,form)=>{if(f.id===spec.formId)ref={job,slot,form};})));if(!ref)throw Error('獎勵裝備不存在');const g=gear(spec.powerTier,ref.slot,spec.rarity,h.job);Object.assign(g,{formJob:ref.job,form:ref.form,powerTier:spec.powerTier,equipmentLevel:spec.level,plus:0,affix:[],prefixId:'',suffixId:'',skillId:spec.skillId,storyRewardKey:key,acquiredAt:Date.now(),skillSockets:{version:1,count:spec.socketCount,gems:Array(spec.socketCount).fill(null),firstMode:'skill'}});delete g.baseSnapshot;g.name=gearName(g);h.bag.push(g);}
 function reward(r){const h=playerHero();if(h.gold+r.gold>1e12||h.ore+r.ore>1e12)throw Error('獎勵超出庫存上限');h.gold+=r.gold;h.ore+=r.ore;for(const x of r.items){if(x.job!==undefined&&x.job!==h.job)continue;if(x.type==='gear'){grantGear(x.key);continue;}if(x.type==='gem'){if((h.gems[Number(x.key)]||0)+x.quantity>1e9)throw Error('寶石超出庫存上限');h.gems[Number(x.key)]=(h.gems[Number(x.key)]||0)+x.quantity;continue;}if(x.type==='skill'){__EMBERWILD_SKILLS.grantSkill(h,x.key);continue;}const c={itemType:x.type,key:x.key},n=countStock(c)+x.quantity;if(n>1e9)throw Error('獎勵超出庫存上限');if(x.type==='material')setMaterialCount(x.key,n);else if(!globalThis.__EMBERWILD_INVENTORY_STOCK.set(x.key,n))throw Error('道具不存在');}}
 function recoverable(q,r){return !!q?.recovery&&!!r&&!r.done&&r.completed.includes(q.recovery.afterStage)&&!ownedGear(q.recovery.gearKey).length&&(r.recoveryUses||0)<q.recovery.limit;}
 globalThis.recoverStoryRewards=function(id){sync();const q=design.quests.find(q=>q.id===id),r=record(id);if(!recoverable(q,r))return false;const ok=transaction(()=>{const x=q.recovery;grantGear(x.gearKey);const h=playerHero(),type=Number(x.gemKey),owned=(h.gems[type]||0)+party.members.flatMap(h=>h.bag).reduce((n,g)=>n+(g.skillSockets?.gems.filter(i=>i===type).length||0),0);h.gems[type]+=Math.max(0,Math.min(x.gemQuantity,q.stages.filter(s=>r.completed.includes(s.id)).flatMap(s=>s.rewards.items).filter(i=>i.type==='gem'&&i.key===x.gemKey).reduce((n,i)=>n+i.quantity,0))-owned);r.recoveryUses=(r.recoveryUses||0)+1;});if(ok)render();return ok;};
 function protectedGear(g){return design.quests.some(q=>q.recovery&&q.recovery.gearKey===g.storyRewardKey&&record(q.id)&&!record(q.id).done);}
 function unlockLinks(links,r){for(const n of links)if(met(n.conditions,r)){ensure().unlocks['quest_'+n.questId]=true;activate(design.quests.find(q=>q.id===n.questId));}}
 function transaction(action){packParty();const before=copy(party),members=party.members.map(copy),inv=copy(inventoryBefore),gains=copy(pendingGains);const restore=(a,b,skip=[])=>{for(const k of Object.keys(a))if(!skip.includes(k)&&!Object.hasOwn(b,k))delete a[k];for(const k of Object.keys(b))if(!skip.includes(k))a[k]=copy(b[k]);};try{action();if(save()!==true)throw Error('無法儲存');return true;}catch(e){restore(party,before,['members']);party.members.forEach((h,i)=>restore(h,members[i]));inventoryBefore=inv;pendingGains=gains;toast('任務未完成：'+e.message);return false;}}
 globalThis.completeStoryStage=function(id,choiceId='',expectedStage=''){sync();const q=design.quests.find(q=>q.id===id),r=record(id),s=q?.stages.find(s=>s.id===r?.current);if(!q?.enabled||!r||r.done||!s||expectedStage&&s.id!==expectedStage||r.completed.includes(s.id)||!met(s.conditions,r))return false;
  const choices=s.choices.filter(c=>met(c.conditions,r)),choice=choices.find(c=>c.id===choiceId);if(s.choices.length&&!choice)return false;
  const ok=transaction(()=>{r.started=true;const next=choice?choice.next:s.branches.find(b=>met(b.conditions,r))?.next??s.next;reward(s.rewards);applyEffects(s.effects);if(q.prologue)globalThis.__EMBERWILD_PROLOGUE?.commitStage?.(q,s);if(choice){r.choices[s.id]=choice.id;applyEffects(choice.effects);unlockLinks(choice.nextQuests,r);}r.completed.push(s.id);if(next)enter(q,r,next);else {r.done=true;reward(q.rewards);applyEffects(q.effects);unlockLinks(q.nextQuests,r);}sync();});if(ok){dialogue=null;render();}return ok;
 };
 globalThis.storyNavigate=function(page){if(!Object.hasOwn(M.GUIDES,page))return;closeModal();setTab(page);};
 globalThis.openStory=function(id='',type=''){closeModal();sync();const q=design.quests.find(q=>q.id===id);selected=q?.id||'';category=q?.type||type||category;dialogue=null;setTab('story');};
 globalThis.setStoryCategory=type=>{if(['main','side','npc'].includes(type)){category=type;selected='';dialogue=null;setTab('story');}};
 globalThis.currentStoryCategory=()=>category;
 globalThis.readStory=id=>{sync();const q=design.quests.find(q=>q.id===id),r=record(id);if(!q?.enabled||!r||r.done)return;if(!r.started){if(!transaction(()=>{r.started=true;}))return;}selected=id;dialogue={id,stage:r.current,index:0};render();};
 globalThis.nextStoryDialogue=()=>{if(dialogue){dialogue.index++;render();}};
 globalThis.endStoryDialogue=()=>{dialogue=null;render();};
 function conditionLabel(c){const m=GAMEPLAY_SETTINGS.monsters.catalog.find(x=>x.id===c.key);let key=c.key;if(['region','visit','explore','boss'].includes(c.type))key=MAPS[Number(c.key)]?.name||c.key;if(c.type==='kill')key=m?.name||c.key;if(c.type==='quest')key=design.quests.find(q=>q.id===c.key)?.name||c.key;if(c.type==='recipe')key=__EMBERWILD_LIFE_SKILLS.design.recipes[c.key]?.name||c.key;if(c.itemType==='item'&&['stock','acquired','gatherItem'].includes(c.type))key=SHOP.find(x=>x.id===c.key)?.name||c.key;if(['gearWorn','gearSkillActive','gearSkillGem','gearBaseGem'].includes(c.type))key=design.gearRewards.find(g=>g.id===c.key)?.name||c.key;if(c.type==='skillSlotted')key=__EMBERWILD_SKILLS.byId(c.key)?.name||c.key;return M.TYPES[c.type]+(key?' · '+key:'');}
 function lessonEffects(s){const h=playerHero();return s.conditions.conditions.filter(c=>['gearSkillGem','gearBaseGem'].includes(c.type)).map(c=>{const g=wornReward(h,c.key),n=c.type==='gearSkillGem'?0:c.slot,id=g?.skillSockets?.gems[n];if(id==null)return '<p>鑲嵌前：此孔加成 0。</p>';const def=__EMBERWILD_SKILLS.system().gems.find(x=>x.kind===id%5),v=gemEffect(h,g,n,c.type==='gearSkillGem'?'skill':'base');return '<p>鑲嵌前：此孔加成 0 → 目前：'+(c.type==='gearSkillGem'?'技能 '+({effect:'效果',procChance:'觸發率',cooldown:'冷卻縮短機率',heal:'治療',shield:'護盾'}[def.skill.key]||def.skill.key)+' +'+Number((v*100).toFixed(2))+'%':({atk:'攻擊',hp:'生命',def:'防禦',speed:'速度',crit:'暴擊率'}[def.base.stat])+' +'+v*(def.base.unit==='ratio'?100:1)+(def.base.unit==='ratio'?'%':''))+'</p>';}).join('');}
 const objectives=(g,r)=>`<p class="small">${g.mode==='any'?'任一達成':'全部達成'}</p><ul class="story-objectives">${g.conditions.map(c=>`<li class="${progress(c,r)>=c.count?'story-met':''}"><span>${esc(conditionLabel(c))}${c.mode==='stage'?'（本階段起算）':''}</span><b>${progress(c,r)} / ${c.count}</b></li>`).join('')||'<li>閱讀劇情即可繼續</li>'}</ul>`;
 const rewardName=x=>x.type==='gear'?design.gearRewards.find(g=>g.id===x.key)?.name:x.type==='gem'?GEMS[Number(x.key)]?.name:x.type==='skill'?__EMBERWILD_SKILLS.byId(x.key)?.name:x.type==='item'?SHOP.find(i=>i.id===x.key)?.name:x.key;
 const rewardText=r=>[r.gold?'金幣 ×'+r.gold:'',r.ore?'鍛鐵 ×'+r.ore:'',...r.items.filter(x=>x.job===undefined||x.job===playerHero().job).map(x=>(rewardName(x)||x.key)+' ×'+x.quantity)].filter(Boolean).join('、');
 globalThis.storyReadyCount=()=>{if(!party)return 0;sync();return design.quests.filter(q=>q.enabled&&record(q.id)&&!record(q.id).done&&met(q.stages.find(s=>s.id===record(q.id).current)?.conditions||M.group([M.condition('level','',1e9)]),record(q.id))).length;};
 globalThis.storyView=function(){sync();const title={main:'主線',side:'支線',npc:'NPC 任務'}[category],rows=design.quests.filter(q=>q.type===category&&(q.enabled||record(q.id))&&(!q.hidden||record(q.id))&&(!q.prologue||record(q.id)));return heading('MISSIONS / 主要任務',title)+(category==='side'?sideQuestListHTML():'')+`<div class="story-list">${rows.map(q=>{const r=record(q.id),s=q.stages.find(s=>s.id===r?.current),ready=!!s&&!r.done&&met(s.conditions,r),status=r?.done?'已完成':!r?'未解鎖':ready?'可繼續':'進行中';let talk='';if(dialogue?.id===q.id&&dialogue.stage===s?.id){const line=s.dialogue[dialogue.index];talk=`<section class="story-dialogue" aria-live="polite">${line?`<b>${esc(line.kind==='player'?characterName(playerHero()):line.speaker||s.speaker||q.npc)}</b><p>${esc(line.text)}</p><button onclick="nextStoryDialogue()">繼續</button>`:ready?(s.choices.length?s.choices.filter(c=>met(c.conditions,r)).map(c=>`<button onclick="completeStoryStage('${q.id}','${c.id}','${s.id}')">${esc(c.text)}</button>`).join(''):`<button class="primary" onclick="completeStoryStage('${q.id}','','${s.id}')">完成階段／繼續劇情</button>`):'<p>完成下方目標後，可回來繼續。</p>'}<button onclick="endStoryDialogue()">結束對話</button></section>`;}
 return `<article class="panel story-card ${selected===q.id?'story-selected':''}"><div class="row"><h2>${esc(q.name)}</h2>${r&&!r.done&&!r.started?'<span class="quest-new quest-new-detail" aria-label="有未開始任務">NEW!</span>':''}<span class="tag">${ready?'● ':''}${status}</span></div><p class="small">${{main:'主線',side:'支線',npc:'特殊 NPC'}[q.type]} · NPC：${esc(q.npc||'旁白')}</p><p>${esc(q.description)}</p>${!r?`<p>前置任務：${esc(q.prerequisites.map(id=>design.quests.find(q=>q.id===id)?.name||id).join('、')||'無')}</p>${objectives(q.unlock)}`:r.done?`<p>已領取獎勵${rewardText(q.rewards)?'：'+esc(rewardText(q.rewards)):''}${q.effects.some(e=>e.type==='vip')?' · 商店 VIP 卡・銅級':''}</p>${(q.completionGuides||[]).map(g=>`<button onclick="storyNavigate('${g}')">${M.GUIDES[g]}：配置取得的輔助技能</button>`).join('')}`:!s?'<p>目前階段已從設計中移除，請還原此階段 ID 以接續進度。</p>':`<h3>${esc(s.name)}</h3><p>${esc(s.description)}</p>${objectives(s.conditions,r)}${lessonEffects(s)}${recoverable(q,r)?`<button onclick="recoverStoryRewards('${q.id}')">補發遺失任務裝備（剩餘 ${q.recovery.limit-(r.recoveryUses||0)} 次）</button>`:''}${rewardText(s.rewards)?'<p>階段獎勵：'+esc(rewardText(s.rewards))+'</p>':''}<div class="actions">${s.guides.map(g=>`<button onclick="storyNavigate('${g}')">${M.GUIDES[g]}</button>`).join('')}<button onclick="readStory('${q.id}')">閱讀劇情</button></div>${talk}`}</article>`;}).join('')||'<p>這個分類目前沒有任務。</p>'}</div>`;};
 globalThis.hasShopVIP=()=>!!party&&ensure().vip>=1;
 // Round the payable amount once, consistently for all shop goods. Free goods remain free.
 globalThis.shopPayablePrice=price=>hasShopVIP()?(price>0?Math.max(1,Math.floor(price*95/100)):0):price;
 globalThis.setAlchemyAutoBuy=enabled=>{if(!hasShopVIP())return false;return transaction(()=>{ensure().autoBuy=!!enabled;});};
 globalThis.alchemyVIPView=()=>hasShopVIP()?`<div class="story-vip"><span>商店 VIP 卡・銅級 · 商品 95 折</span><label><input type="checkbox" onchange="setAlchemyAutoBuy(this.checked);render()" ${ensure().autoBuy?'checked':''}>自動購買基礎材料（只補本次缺少的清水與藥水瓶，依商店售價扣款）</label></div>`:`<div class="story-vip"><b>🔒 自動補充清水與空瓶</b><p>完成商店的特殊任務線即可解鎖。</p><button onclick="openStory('shop_rescue','npc')">查看任務</button></div>`;
 const validateBase=validateParty;validateParty=function(raw){const p=validateBase(raw);Object.assign(p,validateProgress(raw?.story,raw?.progressStats));if(raw?.progressStats===undefined)p.progressStats=migrateStats(p);return p;};
 const packBase=packParty;packParty=function(){ensure();return {...packBase(),story:copy(party.story),progressStats:copy(party.progressStats)};};
 const saveBase=save;save=function(...args){if(!party)return saveBase(...args);ensureTracking();const p=stats(),before=copy(p);observeInventory();for(const [k,n] of Object.entries(pendingGains))p.acquired[k]=Math.min(1e12,(p.acquired[k]||0)+n);const result=saveBase(...args);if(result===true){committedInventory=copy(inventoryBefore);pendingGains={};}else {party.progressStats=before;inventoryBefore=copy(committedInventory);pendingGains={};}return result;};
 const loadBase=loadParty;loadParty=function(...args){const result=loadBase(...args);ensure();resetTracking();dialogue=null;sync();return result;};
 const startBase=start;start=function(...args){const result=startBase(...args);ensure();resetTracking();sync();save();return result;};
 const rewardBase=rewardGroupKill;rewardGroupKill=function(e){if(!party||!e||e.rewarded)return rewardBase(e);ensureBoard();ensureTracking();observeInventory();const p=stats(),region=String(e.region??party.map);p.explore[region]=(p.explore[region]||0)+1;p.visits[region]=1;globalThis.recordDailyProgress?.('nearKill',e.monsterId,1,e.lv);const out=rewardBase(e);observeInventory();return out;};
 const mapBase=chooseMap;chooseMap=function(...args){const out=mapBase(...args);if(party){stats().visits[String(party.map)]=1;save();}return out;};
 // The forge's own transaction records these metrics before its save.
 globalThis.recordEnhancement=level=>{const p=stats();p.enhance++;globalThis.recordDailyProgress?.('enhance');p.enhanceLevel=Math.max(p.enhanceLevel,level);};
 const exportBase=exportableBalance;exportableBalance=function(){return {...exportBase(),story:copy(design)};};
 const validateBalanceBase=validateBalanceConfig;validateBalanceConfig=function(input){const d=validateBalanceBase(input);d.story=M.validate(input.story??M.defaults(),context(d));return d;};
 const applyBase=applyBalanceConfig;applyBalanceConfig=function(input,options={}){const d=validateBalanceConfig(input),old=design;design=d.story;try{const out=applyBase(d,options);// A refused update (the team is exploring or fighting) must leave the running story untouched.
  if(out===false){design=old;return out;}if(party)sync();return out;}catch(e){design=old;throw e;}};
 try{const d=JSON.parse(balanceSourceText()||'null');if(d?.story)design=M.validate(d.story,context(d));}catch(e){console.warn(e);}
 newcomerPartyGuide=function(){return '';};
 tutorial=function(){if(prologueRunning())return '';const target=record('goddess_intro')?.done||!design.quests.some(q=>q.id==='goddess_intro')?'skill_equipment_intro':'goddess_intro';return tab==='story'||!party||record(target)?.done?'':`<div class="tutorial"><p>新手引導與任務進度可在「主要任務」查看。</p><button onclick="openStory('${target}','main')">前往主線</button></div>`;};
 claimTutorial=function(){openStory(design.quests.some(q=>q.id==='goddess_intro')?'goddess_intro':'skill_equipment_intro','main');return false;};
 globalThis.storyCategoryReminder=type=>{if(!party||!state)return {ready:0,new:0};sync();const rows=design.quests.filter(q=>q.type===type&&q.enabled&&record(q.id)&&!record(q.id).done);const out={ready:0,new:0};for(const q of rows){const r=record(q.id),s=q.stages.find(s=>s.id===r.current);if(s&&met(s.conditions,r)&&(!s.choices.length||s.choices.some(c=>met(c.conditions,r))))out.ready++;if(!r.started)out.new++;}if(type==='side'){const extra=sideQuestReminder();out.ready+=extra.ready;out.new+=extra.new;}return out;};
 const badgeBase=numberBadgeHTML;globalThis.numberBadgeHTML=function(id){if(id!=='story')return badgeBase(id);const n=storyReadyCount();return n?`<span class="number-badge" aria-label="可繼續任務 ${n}">${n}</span>`:'';};

 // Task stages supply encounter data to the existing spawn/round/reward pipeline.
 function questEncounterRows(){
  if(!party)return [];sync();const out=[];
  for(const q of design.quests){const r=record(q.id);if(!q.enabled||q.hidden&&!r)continue;
   for(const s of q.stages){const e=s.encounter;if(!e?.enabled)continue;const key=q.id+'/'+s.id,completed=(stats().encounters[key]||0)>0;
    const reached=!!r&&(r.current===s.id&&!r.done||e.repeatable&&(r.completed.includes(s.id)||r.done));
    out.push({key,questId:q.id,stageId:s.id,name:e.name,source:q.name,mapIndex:e.mapIndex,enemies:copy(e.enemies),repeatable:e.repeatable,training:e.training===true,foeName:e.training===true&&M.prologueQuest(design)?.prologue?.training?.name||'',completed,unlocked:!!r?.started&&reached&&(!completed||e.repeatable)&&canVisit(e.mapIndex)});
   }
  }return out;
 }
 globalThis.questEncounterRows=questEncounterRows;
 globalThis.startQuestEncounter=function(key){
  const row=questEncounterRows().find(x=>x.key===key);if(!row?.unlocked)return toast('任務進度尚未開放此關卡，或關卡已完成');
  if(!globalThis.__EMBERWILD_TEAMS?.valid())return toast('請先完成可探索的隊伍編成');
  if(state.bag.length>=RULES.bagCapacity)return toast('背包已滿，請先整理裝備');
  globalThis.__EMBERWILD_TIMED_BOOST_TEST.syncCombatClock();
  stopTeamExploration();chooseMap(row.mapIndex);party.questChallenge={key:row.key,name:row.name,mapIndex:row.mapIndex};
  globalThis.expeditionChallengeResult=null;running=true;spawnGroup();globalThis.__EMBERWILD_TIMED_BOOST_TEST.syncCombatClock();save();render();return true;
 };
 const spawnBase=spawnGroup;spawnGroup=function(){
  const ch=party?.questChallenge;if(!ch)return spawnBase();
  const row=questEncounterRows().find(x=>x.key===ch.key);if(!row?.unlocked){running=false;party.questChallenge=null;return false;}
  const h=[...heroes()].sort((a,b)=>a.lv-b.lv)[0],mi=row.mapIndex,mode=party.difficulty||0;
  foes=[];effects=[];actorCooldowns={};supportCooldowns={};round=0;for(const hero of heroes())hero.shield=0;
  for(const spec of row.enemies){const m=monsterCatalog().find(x=>x.id===spec.monsterId),kind=m.kind;
   const ahead=EmberwildProgression.encounterLevelLead(GAMEPLAY_SETTINGS,h.lv),max=Math.max(MAPS[mi].min,Math.min(MAPS[mi].max,h.lv+ahead));
   for(let i=0;i<spec.count;i++){const lv=row.training?MAPS[mi].min:kind==='boss'?MAPS[mi].max:MAPS[mi].min+Math.floor(Math.random()*(max-MAPS[mi].min+1)),v=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,lv,kind,mode,m);
    foes.push({id:'foe-'+uid(),monsterId:m.id,name:row.foeName||m.name,icon:'',mat:m.material,lv,...v,maxhp:v.hp,kind,turn:0,rewarded:row.training,training:row.training,element:m.element,race:m.race,maxDrops:m.maxDrops,difficulty:mode,region:mi,questEncounter:ch.key});
   }
  }
  enemy=foes[0]||null;beginBattleStatistics();note('任務關卡開始：'+row.name+'。');return true;
 };
 function finishQuestEncounter(ch=party?.questChallenge){
  if(!ch||party?.questChallenge!==ch)return;
  const success=foes.length>0&&foes.every(e=>e.hp<=0);
  if(success||!running&&!foes.length){
   running=false;party.questChallenge=null;
   if(success){stats().encounters[ch.key]=(stats().encounters[ch.key]||0)+1;sync();}
   globalThis.expeditionChallengeResult={name:ch.name,success,key:ch.key};
   note('任務關卡「'+ch.name+'」'+(success?'挑戰成功，任務進度已更新。':'挑戰失敗，可依任務規則重試。'));save();render();
  }
 }
 globalThis.EmberwildQuestEncounter={complete:finishQuestEncounter};
 const questRoundBase=pacedRound;pacedRound=function*(){const ch=party?.questChallenge;yield* questRoundBase();finishQuestEncounter(ch);};
 const stopBase=stopTeamExploration;stopTeamExploration=function(...args){if(party)party.questChallenge=null;return stopBase(...args);};
 const changeMapBase=chooseMap;chooseMap=function(...args){if(party)party.questChallenge=null;globalThis.expeditionChallengeResult=null;return changeMapBase(...args);};

 globalThis.__EMBERWILD_STORY={/* The basic tutorial gate for skills: the old intro quest, the prologue, or neither exists any more. */tutorialDone:()=>!!record('goddess_intro')?.done||!!record(M.prologueQuest(design)?.id)?.done||!design.quests.some(q=>q.id==='goddess_intro'),prologueRunning,prologueQuest:()=>M.prologueQuest(design),begin(id,stageId,completed=[]){const q=design.quests.find(q=>q.id===id);if(!q||record(id))return false;if(q.prologue)ensure().quests={};const r={current:'',started:true,done:false,completed:[...completed],baseline:{},choices:{}};ensure().quests[id]=r;enter(q,r,stageId);return true;},get design(){return copy(design);},isRewardForm:id=>design.gearRewards.some(g=>g.formId===id),protectedGear,value,progress,met,sync,record,transaction,stats,resetTracking,validateProgress};
})();

