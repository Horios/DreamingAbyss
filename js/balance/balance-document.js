/* Shared document preflight. Runtime/editor validators remain the domain authorities. */
(function(root){
 const VERSION=1,SCHEMA='emberwild-balance-v1';
 const REQUIRED=['balance','classes','supportSkills','equipmentForms','items','balanceSettings','equipmentPowerSystem','statusDefinitions','companions','passiveDefinitions','companionSettings','shopSettings','companionTokens','teamSettings','lifeSkills'];
 const copy=x=>structuredClone(x),array=x=>Array.isArray(x)?x:[];
 // Extend the existing lifeSkills document; legacy timings migrate once into each job.
 function lifeDefaults(){return {materialBuyPrices:{'清水':1,'藥水瓶':1},gathering:[{id:'herb',name:'紅色草',periodMs:5000,chance:1,quantity:1,output:'紅色草',outputType:'material',bonusDrops:[{output:'小蟲',outputType:'material',quantity:1,chance:.05}]}],recipes:{alchemy:{name:'煉製簡易治療藥水',inputs:[['清水',1],['藥水瓶',1],['紅色草',1]],output:'heal_small',outputType:'item',periodMs:5000,chance:1,quantity:1}}};}
 function normalizeLife(life,items=[]){
  const d=copy(life),ids=new Set(items.map(x=>x.id)),period=d.periodMs??5000;
  if(d.gathering===undefined){d.gathering=lifeDefaults().gathering;d.gathering[0].periodMs=period;d.gathering[0].bonusDrops[0].chance=d.bugChance??.05;}
  for(const r of Object.values(d.recipes||{})){r.periodMs??=period;r.chance??=1;r.quantity??=1;r.outputType??=ids.has(r.output)||r.output==='heal_small'?'item':'material';}
  delete d.periodMs;delete d.bugChance;return d;
 }
 function lifeIssues(life,items=[]){
  const errors=[],add=(p,r,o)=>errors.push(issue('lifeSkills.'+p,r,o)),ids=new Set(items.map(x=>x.id));
  const name=x=>typeof x==='string'&&x.trim()===x&&x.length>0&&x.length<=80&&!['__proto__','constructor','prototype'].includes(x);
  if(!life||typeof life!=='object'||Array.isArray(life)){add('','必須為物件');return errors;}
  if(life.periodMs!==undefined&&(!Number.isSafeInteger(life.periodMs)||life.periodMs<50))add('periodMs','必須為至少 50 毫秒的安全整數');
  if(life.bugChance!==undefined&&(!Number.isFinite(life.bugChance)||life.bugChance<0||life.bugChance>1))add('bugChance','必須介於 0～1');
  if(!life.materialBuyPrices||typeof life.materialBuyPrices!=='object'||Array.isArray(life.materialBuyPrices))add('materialBuyPrices','商店材料價格必須為物件');
  else for(const [k,v]of Object.entries(life.materialBuyPrices))if(!name(k)||!Number.isSafeInteger(v)||v<0||v>1e9)add('materialBuyPrices.'+k,'材料名稱無效或價格必須為 0～1000000000 的整數');
  for(const k of ['清水','藥水瓶'])if(!Number.isFinite(life.materialBuyPrices?.[k])||life.materialBuyPrices[k]<0)add('materialBuyPrices.'+k,'購買價格必須為非負數');
  function product(r,p,legacy=false,bonus=false){
   if(!r||typeof r!=='object'||Array.isArray(r)){add(p,'必須為物件');return;}
   if(!bonus&&(!name(r.name)))add(p+'.name','名稱不可空白，最多 80 字',r);
   if(!bonus&&!(legacy&&r.periodMs===undefined)&&(!Number.isSafeInteger(r.periodMs)||r.periodMs<50))add(p+'.periodMs','必須為至少 50 毫秒的安全整數',r);
   if(!(legacy&&r.chance===undefined)&&(!Number.isFinite(r.chance)||r.chance<0||r.chance>1))add(p+'.chance','機率必須介於 0～1',r);
   if(!(legacy&&r.quantity===undefined)&&(!Number.isSafeInteger(r.quantity)||r.quantity<1||r.quantity>1e9))add(p+'.quantity','產物數量必須為 1～1000000000 的整數',r);
   const type=r.outputType??(legacy?(ids.has(r.output)?'item':'material'):undefined);
   if(!['item','material'].includes(type))add(p+'.outputType','必須選擇材料或消耗道具',r);
   if(!name(r.output)||type==='item'&&!ids.has(r.output))add(p+'.output','產物名稱無效或引用不存在的道具',r);
  }
  if(life.gathering!==undefined){
   if(!Array.isArray(life.gathering))add('gathering','必須為陣列');
   else for(const [i,r] of life.gathering.entries()){
    const p='gathering.'+i;product(r,p);if(!r)continue;
    if(typeof r.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(r.id)||!name(r.id))add(p+'.id','ID 無效',r);
    if(r.bonusDrops!==undefined&&!Array.isArray(r.bonusDrops))add(p+'.bonusDrops','必須為陣列',r);
    else for(const [j,b] of array(r.bonusDrops).entries())product(b,p+'.bonusDrops.'+j,false,true);
   }
  }
  if(!life.recipes||typeof life.recipes!=='object'||Array.isArray(life.recipes))add('recipes','必須為配方物件');
  else for(const [id,r] of Object.entries(life.recipes)){
   const p='recipes.'+id;product(r,p,life.gathering===undefined);if(!r)continue;
   if(!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(id)||!name(id))add(p,'配方 ID 無效',r);
   if(!Array.isArray(r.inputs)||r.inputs.length<1||r.inputs.length>5){add(p+'.inputs','材料最少 1 種、最多 5 種',r);continue;}
   const seen=new Set();for(const [i,row] of r.inputs.entries()){
    if(!Array.isArray(row)||![2,3].includes(row.length)){add(p+'.inputs.'+i,'材料格式無效',r);continue;}
    const [key,n,type='material']=row,identity=type+':'+key;
    if(!name(key)||!['material','item'].includes(type)||type==='item'&&!ids.has(key))add(p+'.inputs.'+i,'材料名稱無效或引用不存在的道具',r);
    if(!Number.isSafeInteger(n)||n<1||n>1e9)add(p+'.inputs.'+i,'材料數量必須為 1～1000000000 的整數',r);
    if(seen.has(identity))add(p+'.inputs.'+i,'同一材料請合併數量，不可重複',r);seen.add(identity);
   }
  }
  return errors;
 }
 function issue(path,reason,object){path=path.replace(/^\$\./,'');if(path.includes('.quests.'))reason='委託／支線：'+reason;return {system:({textStyles:'文字稀有度',skillIcons:'技能圖示',classes:'職業',companions:'夥伴',companionSettings:'夥伴',teamSettings:'隊伍',statusDefinitions:'自訂狀態',passiveDefinitions:'被動',items:'道具',equipmentPowerSystem:'裝備',equipmentForms:'裝備',balanceSettings:'平衡設定',lifeSkills:'生活技能'})[path.split('.')[0]]||(path.includes('.quests.')?'委託／支線':path.split('.')[0]),object:object?.name||object?.title||object?.id||'',field:path,reason};}
 // Each block declares the data it reads. inspect(d,{scope}) runs only the blocks a change can affect and walks only
 // the changed records; without a scope every block runs, exactly as before. The rules themselves are unchanged.
 const READS={
  preflight:[{path:'schema',shallow:true},{path:'schemaVersion',shallow:true},...REQUIRED.map(k=>({path:k,shallow:true}))],
  arrays:['classes','supportSkills','equipmentForms','items','statusDefinitions','companions','passiveDefinitions'].map(k=>({path:k,shallow:true})),
  healing:[{path:'items'},{path:'balanceSettings.drops.entries'}],
  seconds:[{path:'balanceSettings.meta'},{path:'balanceSettings.combat'},{path:'balanceSettings.rewards'},{path:'balanceSettings.monsters.catalog',fields:['id','kind','timing']},{path:'skillSystem.definitions'},{path:'statusDefinitions'},{path:'items'},{path:'companionTokens'},{path:'equipmentForms'},{path:'timeUnits'}],
  skillSystem:[{path:'skillSystem'}],
  statuses:[{path:'statusDefinitions'}],
  power:[{path:'equipmentPowerSystem.prefixes'},{path:'equipmentPowerSystem.suffixes'},{path:'equipmentPowerSystem.bossAffixes'}],
  drops:[{path:'balanceSettings.drops.entries'},{path:'items',keys:true},{path:'balanceSettings.monsters.catalog',keys:true}],
  unlocks:[{path:'classes'},{path:'balanceSettings.quests.design.side',keys:true},{path:'balanceSettings.quests.side',keys:true},{path:'balanceSettings.quests.design',shallow:true},{path:'balanceSettings.maps.catalog',shallow:true}],
  wishingLake:[{path:'wishingLake'},{path:'items',keys:true},{path:'inventoryIcons'},{path:'companions',keys:true},{path:'balanceSettings.equipment'},{path:'balanceSettings.monsters.catalog',keys:true},{path:'balanceSettings.progression'},{path:'balanceSettings.maps.catalog',keys:true}],
  life:[{path:'lifeSkills'},{path:'items',keys:true}],
  story:[{path:'story'},{path:'balanceSettings.maps.catalog',keys:true},{path:'balanceSettings.monsters.catalog',keys:true},{path:'items',keys:true},{path:'lifeSkills.recipes'},{path:'skillSystem.definitions',keys:true},{path:'equipmentForms'}],
  catalogue:[{path:'inventoryIcons'},{path:'items'},{path:'shopSettings'},{path:'lifeSkills'},{path:'companionTokens'},{path:'equipmentPowerSystem'},{path:'companions',keys:true},{path:'classes'},{path:'equipmentForms'},{path:'supportSkills'},{path:'starterPacks'},{path:'starterPackItems'},{path:'skillIcons'},{path:'balanceSettings.drops.entries'},{path:'balanceSettings.economy'},{path:'balanceSettings.equipment'},{path:'balanceSettings.maps.catalog',keys:true},{path:'balanceSettings.monsters.catalog',keys:true},{path:'balanceSettings.progression'},{path:'balanceSettings.quests'},{path:'balanceSettings.skills'}]
 };
 function inspect(d,{complete=true,scope=null,report=null}={}){
  const errors=[],add=(p,r,o)=>errors.push(issue(p,r,o));
  if(!d||typeof d!=='object'||Array.isArray(d))return [issue('$','必須為 JSON 物件')];
  const ran=[],run=(name,fn)=>{if(scope&&!scope.touches(READS[name]))return;ran.push(name);fn();};
  run('preflight',()=>{
  if(d.schema!==SCHEMA)add('schema','不支援的 schema');
  if(d.schemaVersion!==undefined&&d.schemaVersion!==VERSION)add('schemaVersion','不支援此版本；禁止自動降版');
  if(complete)for(const k of REQUIRED)if(d[k]===undefined)add(k,'缺少必要設定');
  });
  run('arrays',()=>{
  const arrays=['classes','supportSkills','equipmentForms','items','statusDefinitions','companions','passiveDefinitions'];
  for(const k of arrays)if(d[k]!==undefined&&!Array.isArray(d[k]))add(k,'必須為陣列');
  });
  run('healing',()=>{
  if(root.EmberwildHealingPotions){for(const [i,item] of array(d.items).entries())if(item.type==='healPotion'&&item.healFraction===undefined)for(const reason of root.EmberwildHealingPotions.issues(item))add('items.'+i,reason,item);for(const [i,rule] of array(d.balanceSettings?.drops?.entries).entries())for(const reason of root.EmberwildHealingPotions.dropIssues(rule))add('balanceSettings.drops.entries.'+i,reason,rule);}
  });
  const chanceKey=/^(?:chance|.*Chance|.*ChancePerLevel|healFraction|critChance)$/;
  const nonnegative=/^(?:hp|atk|def|cost|sellPrice|unitPrice|cooldown|duration|durationMinutes|periodMs|requiredLevel|requiredMasteryLevel|power|powerPerLevel|quantity|quantityMin|quantityMax|minLevel|maxLevel|weight|hitCount|delayTurns|intervalTurns)$/;
  const enums={activation:['active','proc'],availability:['visible','locked','hidden'],kind:null};
  function entry(k,v,p,owner){
    const field=p?p+'.'+k:k;
    if(['accessToken','personalAccessToken','githubToken','privateKey','clientSecret','password'].includes(k))add(field,'認證資料不得存入平衡 JSON',owner);
    if(['__proto__','constructor','prototype'].includes(k))add(field,'禁止的物件鍵',owner);
    if(typeof v==='number'&&nonnegative.test(k)&&v<0)add(field,'不得為負值',owner);
    const chanceMax=field.startsWith('balance.affixes.poolBySlotRank.')&&k==='chance'?100:1;
    if(chanceKey.test(k)&&typeof v==='number'&&(v<0||v>chanceMax))add(field,'機率必須介於 0～'+chanceMax,owner);
    if(k==='chanceByDifficulty'&&(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||n<0||n>1)))add(field,'三個難度機率必須介於 0～1',owner);
    if(k==='chanceByTier'&&(!Array.isArray(v)||v.length!==10||v.some(n=>!Number.isFinite(n)||n<0||n>100)))add(field,'十階機率必須介於 0～100',owner);
    if(enums[k]&&!enums[k].includes(v))add(field,(k==='availability'?'顯示狀態無效；':'')+'未知 enum：'+v,owner);
    walk(v,field,owner);
  }
  function ids(x,p){const seen=new Set();for(let i=0;i<x.length;i++){const row=x[i];if(row&&typeof row==='object'&&!Array.isArray(row)&&row.id!==undefined){if(!['string','number'].includes(typeof row.id)||seen.has(row.id))add(p+'.'+i+'.id','ID 無效或重複',row);seen.add(row.id);}}}
  function walk(x,p='',owner=null){
   if(typeof x==='number'){if(!Number.isFinite(x))add(p,'必須為有限數值',owner);return;}
   if(x===undefined||typeof x==='function'||typeof x==='bigint'){add(p,'不是合法 JSON 值',owner);return;}
   if(!x||typeof x!=='object')return;
   if(Array.isArray(x)){
    const seen=new Set();for(let i=0;i<x.length;i++){const row=x[i];if(row&&typeof row==='object'&&!Array.isArray(row)&&row.id!==undefined){if(!['string','number'].includes(typeof row.id)||seen.has(row.id))add(p+'.'+i+'.id','ID 無效或重複',row);seen.add(row.id);}walk(row,p+'.'+i,row?.id!==undefined?row:owner);}return;
   }
   for(const [k,v] of Object.entries(x))entry(k,v,p,owner);
  }
  // Field rules for one changed path: the nearest property entry, or the whole record for record rows.
  function walkChange(change){
   let owner=null,x=d;const rows=[];
   for(let i=0;i<change.length;i++){if(Array.isArray(x)&&x[change[i]]&&typeof x[change[i]]==='object'&&x[change[i]].id!==undefined)rows.push(i);x=x==null?undefined:x[change[i]];}
   for(let j=change.length;j>=1;j--){
    const parent=j===1?d:change.slice(0,j-1).reduce((o,k)=>o==null?undefined:o[k],d),key=change[j-1],pp=change.slice(0,j-1).join('.');
    if(parent===undefined||parent===null)continue;
    if(Array.isArray(parent)){const row=parent[key];if(row&&typeof row==='object'&&!Array.isArray(row)&&row.id!==undefined){if(j===change.length||change[j]==='id')ids(parent,pp);walk(row,change.slice(0,j).join('.'),row);return;}continue;}
    if(typeof parent==='object'){for(const i of rows)if(i<j-1){const r=change.slice(0,i+1).reduce((o,k)=>o?.[k],d);owner=r;}if(Object.prototype.hasOwnProperty.call(parent,key))entry(key,parent[key],pp,owner);return;}
   }
  }
  if(scope){const seen=new Set();for(const c of scope.changes){const k=c.join('.');if(seen.has(k))continue;seen.add(k);walkChange(c);}ran.push('field-rules('+seen.size+')');}
  else{walk(d);ran.push('field-rules');}
  run('seconds',()=>{
  if(d.balanceSettings?.meta?.combatTimingVersion&&root.EmberwildSecondsSchema){try{root.EmberwildSecondsSchema.validateImport(d);}catch(e){add('balanceSettings.combat.seconds',e.message);}}
  });
  run('skillSystem',()=>{
  if(d.skillSystem&&root.EmberwildSkillSystem){try{root.EmberwildSkillSystem.validate(d.skillSystem);}catch(e){add('skillSystem',e.message);}}
  });
  // Detect destructive sanitization using the existing final status normalizer.
  // Its allowed enums are maintained by the status module, including late extensions.
  run('statuses',()=>{
  if(typeof normalizeStatusDefinition==='function')for(const [i,row] of (Array.isArray(d.statusDefinitions)?d.statusDefinitions:[]).entries()){
   const normalized=normalizeStatusDefinition(row,i);
   function unchanged(raw,value,p){if(Array.isArray(raw)&&Array.isArray(value)){if(raw.length!==value.length)add(p,'超出允許數量或含有未知 enum',row);for(let n=0;n<Math.min(raw.length,value.length);n++)unchanged(raw[n],value[n],p+'.'+n);}else if(raw&&value&&typeof raw==='object'&&typeof value==='object'){for(const k of Object.keys(raw))if(value[k]!==undefined)unchanged(raw[k],value[k],p+'.'+k);}else if(raw!==value)add(p,'非法值會被正規化改寫；請修正後再發布',row);}
   unchanged(row,normalized,'statusDefinitions.'+i);
  }
  });
  run('power',()=>{
  const livePowerKeys=root.__EMBERWILD_EQUIPMENT_IDENTITY?.effectKeys;
  if(livePowerKeys)for(const kind of ['prefixes','suffixes','bossAffixes'])for(const [i,row] of array(d.equipmentPowerSystem?.[kind]).entries()){
   const allowed=kind==='bossAffixes'?livePowerKeys:livePowerKeys.filter(k=>!['gearAtkPct','bossDamagePct'].includes(k));
   for(const effect of kind==='bossAffixes'?row.effects||[]:[row.effect])if(!effect||!allowed.includes(effect.key)||(effect.key==='basicElement'?!['physical','fire','ice','wind','light','shadow'].includes(effect.value):!Number.isFinite(effect.value)))add('equipmentPowerSystem.'+kind+'.'+i+'.effect','未知裝備效果或效果值型別錯誤',row);
  }
  });
  run('drops',()=>{
  const monsterIds=new Set(array(d.balanceSettings?.monsters?.catalog).map(x=>x.id)),itemIds=new Set(array(d.items).map(x=>x.id));
  for(const [i,row] of array(d.balanceSettings?.drops?.entries).entries()){
   if(row.type==='item'&&!itemIds.has(row.key))add('balanceSettings.drops.entries.'+i+'.key','引用不存在的道具',row);
   if(Array.isArray(row.sources)&&row.sources.some(id=>!monsterIds.has(id)))add('balanceSettings.drops.entries.'+i+'.sources','引用不存在的怪物',row);
  }
  });
  run('unlocks',()=>{
  const mapCount=d.balanceSettings?.maps?.catalog?.length;
  const side=array(d.balanceSettings?.quests?.design?.side||d.balanceSettings?.quests?.side),questIds=new Set(['tutorial',...side.map(x=>x.id)]);
  for(const [job,c] of array(d.classes).entries())for(const [i,skill] of array(c?.skills).entries()){
   const u=skill.unlockConditions;if(!u)continue;
   for(const id of array(u.quests))if(!questIds.has(id))add('classes.'+job+'.skills.'+i+'.unlockConditions.quests','引用不存在的任務：'+id,skill);
   for(const key of ['bossKills','eliteKills','bossEquipment'])for(const row of array(u[key]))if(Number.isInteger(mapCount)&&(row.mapIndex<-1||row.mapIndex>=mapCount))add('classes.'+job+'.skills.'+i+'.unlockConditions.'+key,'引用不存在的地圖',skill);
  }
  });
  run('wishingLake',()=>{if(d.wishingLake!==undefined&&root.EmberwildWishingLake)for(const reason of root.EmberwildWishingLake.issues(d.wishingLake,d))errors.push(issue('wishingLake',reason));});
  run('life',()=>{if(d.lifeSkills!==undefined)errors.push(...lifeIssues(d.lifeSkills,array(d.items)));});
  run('story',()=>{if(d.story!==undefined&&root.EmberwildStory)for(const reason of root.EmberwildStory.issues(d.story,{maps:d.balanceSettings?.maps?.catalog,monsters:d.balanceSettings?.monsters?.catalog,items:array(d.items),recipes:d.lifeSkills?.recipes,skills:d.skillSystem?.definitions,forms:d.equipmentForms}))errors.push(issue('story',reason));});
  run('catalogue',()=>{if(root.EmberwildInventoryIcons)errors.push(...root.EmberwildInventoryIcons.issues(d).map(reason=>issue('inventoryIcons',reason)));});
  if(report)report.blocks=ran;
  return errors;
 }
 function migrate(input,defaults){
  const errors=inspect(input,{complete:input?.schemaVersion!==undefined});if(errors.length)throw Object.assign(Error(errors.map(x=>x.system+' '+x.object+' '+x.field+'：'+x.reason).join('\n')),{issues:errors});
  const d=root.EmberwildHealingPotions?root.EmberwildHealingPotions.migrate(copy(input)):copy(input);if(d.schemaVersion===undefined){if(!defaults)throw Error('舊 JSON 需要有效的遷移基準');for(const k of REQUIRED)if(d[k]===undefined)d[k]=copy(defaults[k]);d.schemaVersion=VERSION;}
  d.lifeSkills=normalizeLife(d.lifeSkills,array(d.items));
  if(root.EmberwildInventoryIcons)Object.assign(d, root.EmberwildInventoryIcons.migrateDescriptions(d,{hydrate:true}));
  const full=inspect(d);if(full.length)throw Object.assign(Error(full.map(x=>x.system+' '+x.object+' '+x.field+'：'+x.reason).join('\n')),{issues:full});return d;
 }
 function validate(input,domainValidate,defaults){const d=migrate(input,defaults);
  const typeErrors=[];
  function types(v,b,p){if(b===null||b===undefined||v===undefined)return;if(v===null){if(['mastery','requiredMastery','partnerId','unitPrice','control','durationSeconds'].includes(p.split('.').at(-1)))return;typeErrors.push(issue(p,'此欄位不可為 null'));return;}if(Array.isArray(b)){if(!Array.isArray(v)){typeErrors.push(issue(p,'必須為陣列'));return;}for(let i=0;i<v.length;i++)types(v[i],b[i]??b[0],p+'.'+i);return;}if(typeof b==='object'){if(!v||typeof v!=='object'||Array.isArray(v)){typeErrors.push(issue(p,'必須為物件'));return;}for(const k of Object.keys(v))types(v[k],b[k],p+'.'+k);return;}if(!/\.(key|value)$/.test(p)&&typeof v!==typeof b)typeErrors.push(issue(p,'型別必須為 '+typeof b));}
  if(defaults)types(d,defaults,'$');if(typeErrors.length)throw Object.assign(Error(typeErrors.map(x=>x.system+' '+x.object+' '+x.field+'：'+x.reason).join('\n')),{issues:typeErrors});
if(domainValidate){try{domainValidate(copy(d));}catch(e){throw Object.assign(Error(e.message),{issues:e.issues||[issue('domain',e.message)]});}}return d;}
 const api={READS,balanceModulesVersion:1,textOverridesVersion:1,combatTimingVersion:1,independentActionsVersion:1,continuousExplorationVersion:1,wishingLakeVersion:1,healingPotionVersion:1,equipmentGemModeVersion:2,storyEquipmentLessonsVersion:1,skillSystemVersion:1,questEncountersVersion:1,consumableClockVersion:1,equipmentAcquisitionVersion:1,storyVersion:1,starterMailVersion:1,monsterDesignVersion:1,iconColorTemplatesVersion:1,inventoryIconsVersion:2,VERSION,SCHEMA,REQUIRED,copy,inspect,migrate,validate,lifeDefaults,normalizeLife,lifeIssues,itemDetailsVersion:2,lifeShopMaterialsVersion:1,lifeProductsVersion:1};root.EmberwildBalanceDocument=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
