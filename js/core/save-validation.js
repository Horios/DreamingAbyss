'use strict';
// Extracted from core-game.js without changing exported globals or validation rules.
function migrateLegacyEquipmentSlotsInSave(s){
 if(!s||!Array.isArray(s.bag))return s;
 const movedToAccessory=new Set();
 for(const g of s.bag){
  if(g?.boss!==undefined){
    // BOSS equipment has its own fixed identity/profile and must not retain the
    // random base-form metadata produced by gear() before it becomes boss gear.
    const expectedSlot=bossEquipmentSlot(g.boss);
    if(Number.isInteger(expectedSlot)&&g.slot!==expectedSlot){g.slot=expectedSlot;movedToAccessory.add(g.id);}
    delete g.form;
    delete g.formJob;
    delete g.weaponType;
    continue;
  }
  if(g?.slot!==2||!Number.isInteger(g.form)||g.form<1)continue;
  // Older saves used one mixed third equipment slot. After it was split into
  // off-hand + accessories, form 0 stayed in slot 2 and form 1+ moved to slot 3.
  // Some transitional saves already had formJob, so the old migration's
  // "formJob is undefined" check missed them.
  if(itemForm(g))continue;
  const candidate={...g,slot:3,form:g.form-1};
  if(itemForm(candidate)){g.slot=3;g.form=candidate.form;movedToAccessory.add(g.id);}
 }
 if(!Array.isArray(s.equipped))return s;
 if(s.equipped.length===3){
  const oldEquipped=[...s.equipped];
  s.equipped=[oldEquipped[0]??null,oldEquipped[1]??null,null,null,null];
  const oldThird=oldEquipped[2];
  if(oldThird!==null&&oldThird!==undefined){
   const gear=s.bag.find(g=>g.id===oldThird),positions=gearEquipPositions(gear);
   if(positions.length)s.equipped[positions[0]]=oldThird;
  }
  return s;
 }
 if(s.equipped.length===5&&movedToAccessory.size){
  for(let position=0;position<s.equipped.length;position++){
   const id=s.equipped[position];
   if(!movedToAccessory.has(id))continue;
   const gear=s.bag.find(g=>g.id===id),positions=gearEquipPositions(gear);
   if(positions.includes(position))continue;
   s.equipped[position]=null;
   const target=positions.find(p=>s.equipped[p]===null||s.equipped[p]===undefined);
   if(target!==undefined)s.equipped[target]=id;
  }
 }
 return s;
}
// Validate a private copy; migrations never modify an untrusted caller object.
function validateSave(input,{companion=false}={}) {
  const fail=message=>{throw Error(message);};
  const int=(v,min=0,max=1e12)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
  const num=(v,min=0,max=1e12)=>Number.isFinite(v)&&v>=min&&v<=max;
  const array=(v,n)=>Array.isArray(v)&&v.length===n;
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  if(!object(input)||![1,2].includes(input.version))fail('存檔版本不符');
  const s=migrateLegacyEquipmentSlotsInSave(JSON.parse(JSON.stringify(input))),legacy=s.version===1;
  if(Array.isArray(s.gems)&&s.gems.length===3){s.gems=[...s.gems,...Array(GEMS.length-3).fill(0)];if(Array.isArray(s.sockets))s.sockets=s.sockets.map((v,i)=>v===1&&CLASSES[s.job]?.skills?.[i]?.[1]==='proc'?2:v===2&&CLASSES[s.job]?.skills?.[i]?.[1]==='active'?3:v);}
  delete s.sp;delete s.ap;delete s.stats;s.xpFraction??=0;
  // Older builds could persist fractional XP after shared combat rewards.
  // Normalize only valid numeric fractions; malformed values still fail below.
  if(Number.isFinite(s.xp)&&s.xp>=0&&s.xp<=1e12&&!Number.isInteger(s.xp)&&num(s.xpFraction,0,1)&&s.xpFraction<1){
    const base=Math.floor(s.xp),fraction=s.xp-base+s.xpFraction,carry=Math.floor(fraction);
    s.xp=base+carry;s.xpFraction=fraction-carry;
  }
  if(!int(s.job,0,3)||!int(s.lv,1,RULES.maxLevel)||!int(s.map,0,MAPS.length-1))fail('角色或地圖無效');
  if(s.avatarId!==undefined&&s.avatarId!==null&&s.avatarId!==''&&!['guardian','mage','ranger','healer','wanderer','phoenix'].includes(s.avatarId))fail('角色圖示無效');
  for(const k of ['gold','ore','dust','totalKills','repeat','potions','xp'])if(!int(s[k]))fail('資源數值無效');
  for(const k of ['hp','shield'])if(!num(s[k]))fail('生命資料無效');
  const skillCount=CLASSES[s.job].skills.length,MAX_SAVE_SKILLS=64;
  // Boot-time validation runs before some late modules append their built-in skills.
  // Preserve a bounded trailing skill/socket segment here and validate it again after
  // those modules are installed; otherwise a save written by the same build cannot reload.
  if(Array.isArray(s.skills)&&s.skills.length<skillCount)while(s.skills.length<skillCount)s.skills.push(0);
  if(Array.isArray(s.sockets)&&s.sockets.length<skillCount)while(s.sockets.length<skillCount)s.sockets.push(null);
  if(!Number.isFinite(s.xpFraction)||s.xpFraction<0||s.xpFraction>=1)fail('小數經驗資料無效');
  if(!Array.isArray(s.skills)||s.skills.length<skillCount||s.skills.length>MAX_SAVE_SKILLS||!s.skills.every(v=>int(v,0,RULES.skillMax)))fail('技能陣列無效');
  if(!array(s.gems,GEMS.length)||!s.gems.every(v=>int(v,0,1e9)))fail('寶石陣列無效');
  for(const k of ['advanced','won','autoPotion'])if(typeof s[k]!=='boolean')fail('角色狀態無效');
  if(!int(s.tutorial,0,3)||s.advanced&&s.lv<GS('progression.advance.level',15)||s.won&&s.lv<GS('progression.levelCaps.beforeClear',30))fail('角色進度無效');
  for(let i=0;i<skillCount;i++)if(!companion&&s.skills[i]>0&&(s.lv<CLASSES[s.job].skills[i][2]||skillRequiresAdvanced(CLASSES[s.job].skills[i],i)&&!s.advanced))fail('尚未解鎖的技能');
  if(!array(s.active,(s.skillLoadout||companion)?globalThis.__EMBERWILD_SKILLS?.slotCounts(s).active??2:2)||!s.active.every(i=>i===null||int(i,0,s.skills.length-1)&&(i>=skillCount||s.skills[i]>0&&CLASSES[s.job].skills[i][1]==='active'))||new Set(s.active.filter(i=>i!==null)).size!==s.active.filter(i=>i!==null).length)fail('主動槽無效');
  // Unknown trailing active slots belong to late-installed skills. Do not expose them
  // to early renderers; the original boot bytes are rehydrated after those skills exist.
  if(s.active.some(i=>i!==null&&i>=skillCount))s.active=s.active.map(i=>i!==null&&i>=skillCount?null:i);
  if(!Array.isArray(s.sockets)||s.sockets.length!==s.skills.length||s.sockets.length>MAX_SAVE_SKILLS||!s.sockets.every((v,i)=>v===null||int(v,0,GEMS.length-1)&&s.skills[i]>0))fail('寶石插槽無效');
  if(!Array.isArray(s.bag)||s.bag.length>EmberwildGearInventory.SAVE_LIMIT)fail('背包無效');
  for(const g of s.bag)if(g?.acquiredAt!==undefined&&(!Number.isSafeInteger(g.acquiredAt)||g.acquiredAt<0))fail('裝備取得時間無效');
  const ids=new Set();
  for(const g of s.bag) {
    if(EmberwildTokens.isToken(g)){EmberwildTokens.validateItem(g,RULES.enhanceMax);if(ids.has(g.id))fail('信物 ID 重複');ids.add(g.id);continue;}
    // Types 16/17/18 are persisted by later gameplay modules, so boot-time validation must accept them before those modules execute.
    if(!object(g)||typeof g.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(g.id)||ids.has(g.id)||typeof g.name!=='string'||g.name.length>80||/[<>]/.test(g.name)||!int(g.tier,1,12)||!int(g.slot,0,3)||!int(g.rar,0,3)||!int(g.plus,0,RULES.enhanceMax)||!Array.isArray(g.affix)||g.affix.length>2)fail('裝備資料無效');
    ids.add(g.id);
    if(g.equipmentLevel!==undefined&&!int(g.equipmentLevel,1,RULES.maxLevel))fail('裝備等級無效');
    if(g.baseRuleVersion!==undefined&&![0,1].includes(g.baseRuleVersion))fail('裝備基底版本無效');
    for(const key of ['canEnhance','canReroll'])if(g[key]!==undefined&&typeof g[key]!=='boolean')fail('裝備培養設定無效');
    if(g.equipmentSource!==undefined&&g.equipmentSource!=='shop')fail('裝備取得來源無效');
    if(g.baseSnapshot!==undefined){const b=g.baseSnapshot;if(!object(b)||b.version!==1||!num(b.mult,.01,100)||['raw','body','base'].some(key=>!object(b[key])||['atk','hp','def'].some(k=>!int(b[key][k],0,1e9))))fail('裝備基底快照無效');}
    if(g.rerolled!==undefined&&typeof g.rerolled!=='boolean')fail('洗鍊紀錄無效');
    if(g.affixLock!==undefined&&(!int(g.affixLock,0,1)||g.affixLock>=g.affix.length))fail('潛能鎖定資料無效');
    if(!legacy&&!int(g.job,0,3))fail('裝備職業無效');
    if(g.boss!==undefined&&!int(g.boss,0,5))fail('首領裝備無效');
    if(g.difficulty!==undefined&&!int(g.difficulty,0,2))fail('裝備難度無效');
    if(g.region!==undefined&&(!int(g.region,0,MAPS.length-1)||g.region===6||g.boss===undefined||regionFamily(g.region)!==g.boss||regionTier(g.region)!==g.tier))fail('裝備來源無效');
    for(const a of g.affix)if(!object(a)||!int(a.type,0,legacy?3:18)||!num(a.value,0,RULES.affixMax)||!legacy&&!int(a.rank,0,3)||[4,5].includes(a.type)&&!int(a.skill,0,MAX_SAVE_SKILLS-1)||[12,14].includes(a.type)&&!['fire','ice','wind','light','shadow'].includes(a.element)||a.type===13&&!['beast','plant','undead','construct','demon','spirit'].includes(a.race))fail('詞條資料無效');
  }
  if(!array(s.equipped,5)||new Set(s.equipped.filter(Boolean)).size!==s.equipped.filter(Boolean).length||!s.equipped.every((id,i)=>id===null||s.bag.some(g=>g.id===id&&gearEquipPositions(g).includes(i)&&(legacy||gearWearableJobs(g).includes(s.job))&&s.lv>=gearRequiredLevel(g))))fail('穿戴資料無效');
  for(const k of ['materials','kills'])if(!object(s[k])||Object.entries(s[k]).some(([key,n])=>key.length>80||/[<>]/.test(key)||['__proto__','constructor','prototype'].includes(key)||!int(n,0,1e9)))fail('素材資料無效');
  for(const k of ['claimed','discovered'])if(!Array.isArray(s[k])||s[k].length>200||!s[k].every(v=>typeof v==='string'&&v.length<100))fail('圖鑑資料無效');
  // A v1 save has no commission board; ignore unknown extension fields.
  if(legacy)delete s.board;
  migrate(s);
  const b=s.board,questIds=new Set();
  if(!object(b)||!int(b.next,0,8.64e15)||!int(b.serial)||!Array.isArray(b.tasks)||b.tasks.length>12||!EmberwildCommissions.validBoard(b))fail('委託看板無效');
  for(const q of b.tasks) {
    if(q.designVersion===1){
      if(!object(q)||typeof q.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)||questIds.has(q.id)||!int(q.map,0,MAPS.length-1)||q.map===6||!EmberwildQuestDesign.validSnapshot(q))fail('委託設計內容無效');
      questIds.add(q.id);continue;
    }
    if(!object(q)||typeof q.id!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(q.id)||questIds.has(q.id)||!int(q.map,0,MAPS.length-1)||q.map===6||!EmberwildCommissions.validSource(q,MAPS)||!int(q.n,1,100)||!['gear','gem'].includes(q.kind)||!int(q.gem,0,GEM_KINDS-1)||!int(q.slot,0,3)||![2,3].includes(q.rar)||typeof q.done!=='boolean')fail('委託內容無效');
    questIds.add(q.id);
  }
  if(!int(s.difficulty,0,2)||!array(s.modeClears,3)||!s.modeClears.every(v=>int(v)))fail('難度資料無效');
  if(s.lv>levelCap(s)||!solo.canVisit(s.map,s))fail('尚未解鎖此等級或區域');
  return s;
}
