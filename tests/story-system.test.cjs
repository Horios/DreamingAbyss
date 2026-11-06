const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),M=require('../js/story/story-model.js');
const root=path.resolve(__dirname,'..'),editor=path.resolve(root,'../balance-site'),seed=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json')));
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
async function game(){const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);r.ctx.doc=structuredClone(seed);r.run('applyBalanceConfig(doc);selectSaveSlot(1);start(0);closeModal()');await r.run('EmberwildOffline.settle()');return r;}
function complete(r,id,choice=''){const s=r.run(`party.story.quests['${id}'].current`);assert.equal(r.run(`completeStoryStage('${id}','${choice}','${s}')`),true,id+'/'+s);}
function recruit(r){r.run('recruitCompanion(10);recruitCompanion(11);closeModal()');}
function kill(r,map=0,id){r.ctx.targetMonster=id||seed.balanceSettings.monsters.catalog.find(x=>x.mapIndex===map&&x.kind==='normal').id;r.run(`party.map=${map};syncParty();party.bossChallenge=null;globalThis.testEnemy=makeEnemy(${map},playerHero(),()=>.99);var row=monsterCatalog().find(x=>x.id===targetMonster);testEnemy.monsterId=row.id;testEnemy.mat=row.material;testEnemy.name=row.name;testEnemy.region=${map};testEnemy.id='foe-'+uid();testEnemy.rewarded=false;foes=[testEnemy];enemy=testEnemy;testEnemy.hp=0;rewardGroupKill(testEnemy);save()`);}
function boss(r,map){r.run(`party.map=${map};syncParty();party.bossChallenge=null;bossProgressEntry(${map}).charges=1;startBossChallenge();for(const e of [...foes]){e.hp=0;rewardGroupKill(e);}save();leaveBossChallenge();running=false;resetEncounter();closeModal()`);}
async function tick(r,ms){r.advance(ms);await r.run('EmberwildOffline.settle()');r.run('tickLifeSkills()');}
function replace(r,edit){const d=json(r,'exportableBalance()');edit(d);r.ctx.doc=d;r.run('applyBalanceConfig(doc)');return d;}
async function reload(r){
 r.run('save()');
 const n=loadRuntime(root,'index.html',Object.fromEntries(r.values),r.now);
 if(n.run('!party')){
  // Keep the real failure: surface the underlying cold-boot hydration reason.
  const diagnostics={
   bootError:n.run('globalThis.__EMBERWILD_BOOT_SAVE_ERROR??null'),
   deferredSave:n.run('Boolean(globalThis.__EMBERWILD_BOOT_SAVE_RAW)'),
   offlinePending:n.run('globalThis.EmberwildOffline?.isSettling?.()??null'),
   snapshot:n.run(`(()=>{const p=globalThis.__EMBERWILD_BOOT_SAVE_RAW;if(!p)return null;const d=JSON.parse(p),c=d.offlineExploration?.combat;return {members:d.members?.length,snapshotHeroes:c?.heroes?.map(h=>({hp:h.hp,shield:h.shield,keys:Object.keys(h)})),foes:c?.foes?.map(e=>({id:e.id,hp:e.hp,maxhp:e.maxhp})),status:d.offlineExploration?.status};})()`),
   errors:n.errors.slice(-3),warnings:n.warnings.slice(-3)
  };
  console.error('STORY_RELOAD_FAILURE',JSON.stringify(diagnostics));
 }
 n.ctx.setTimeout=fn=>setImmediate(fn);n.run('continueFromTitle();closeModal()');await n.run('EmberwildOffline.settle()');return n;
}

test('new/legacy saves migrate, real recruitment, kills and enhancement complete goddess mainline; rewards are exactly once',async()=>{
 let r=await game();assert.equal(r.run('party.story.quests.goddess_intro.current'),'welcome');complete(r,'goddess_intro');complete(r,'goddess_intro');assert.equal(r.run("completeStoryStage('goddess_intro')"),false);recruit(r);complete(r,'goddess_intro');complete(r,'goddess_intro');complete(r,'goddess_intro');kill(r);complete(r,'goddess_intro');complete(r,'goddess_intro');r.run('enhance(playerHero().bag[0].id)');assert.equal(r.run('party.progressStats.enhance'),1);complete(r,'goddess_intro');const gold=r.run('state.gold');complete(r,'goddess_intro');assert.equal(r.run('state.gold'),gold+200);const snapshot=json(r,'party.story');r=await reload(r);assert.deepEqual(json(r,'party.story'),snapshot);assert.equal(r.run("completeStoryStage('goddess_intro')"),false);assert.equal(r.run('state.gold'),gold+200);
 const old=json(r,'packParty()');delete old.story;delete old.progressStats;r.ctx.old=old;r.run('loadParty(old)');assert.equal(r.run('party.story.quests.goddess_intro.current'),'welcome');assert(r.run('party.progressStats.enhance')>=1);assert(r.run('party.progressStats.explore[0]')>=1);assert.deepEqual(r.errors,[]);
});

test('cross-map side chain uses original kill and boss histories and survives each stage reload',async()=>{
 let r=await game();recruit(r);for(let map=0;map<2;map++){for(let i=0;i<3;i++)kill(r,map);complete(r,'two_regions');r=await reload(r);complete(r,'two_regions');boss(r,map);assert(r.run(`party.achievements.bossKills[${map}]`)>=1);complete(r,'two_regions');r=await reload(r);}assert.equal(r.run('party.story.quests.two_regions.done'),true);assert.equal(r.run("completeStoryStage('two_regions')"),false);assert.deepEqual(r.errors,[]);
});

test('shop NPC chain requires actual gathering, recipe, materials and permanently unlocks VIP',async()=>{
 let r=await game();recruit(r);for(let i=0;i<3;i++)kill(r);complete(r,'shop_rescue');r.run("setMaterialCount('黏稠凝膠',2);save()");complete(r,'shop_rescue');r.run("buyLifeMaterial('清水',1);buyLifeMaterial('藥水瓶',1)");assert.equal(r.run('party.progressStats.gather'),0);r.run("startLifeGathering('herb')");await tick(r,20000);r.run('stopLifeGathering()');assert.equal(r.run('party.progressStats.gatherItems["material:紅色草"]'),4);complete(r,'shop_rescue');assert.equal(r.run("startLifeWork('alchemy')"),true);await tick(r,5000);r.run('stopLifeWork()');complete(r,'shop_rescue');complete(r,'shop_rescue','thanks');assert.equal(r.run('hasShopVIP()'),true);assert.equal(r.run('party.story.autoBuy'),false);r=await reload(r);assert.equal(r.run('hasShopVIP()'),true);assert.equal(r.run('party.story.quests.shop_rescue.choices.vip'),'thanks');assert.deepEqual(r.errors,[]);
});

test('locked alchemy links to NPC story; VIP buys only exact deficits at shared discounted prices and respects toggle/funds',async()=>{
 const r=await game(),startingPotions=r.run('healPotionCount("heal_small")');assert.match(r.run('alchemyView()'),/完成商店的特殊任務線/);r.run("openStory('shop_rescue','npc')");assert.equal(r.run('tab'),'story');assert.match(r.run('storyView()'),/商店任務線/);assert.equal(r.run('setAlchemyAutoBuy(true)'),false);
 replace(r,d=>{d.lifeSkills.materialBuyPrices.清水=100;d.lifeSkills.materialBuyPrices.藥水瓶=20;d.lifeSkills.recipes.alchemy.inputs=[['清水',3],['藥水瓶',2],['紅色草',1]];});
 r.run("state.materials={清水:1,藥水瓶:1,紅色草:1};state.gold=1000;save()");assert.equal(r.run("startLifeWork('alchemy')"),false);r.run('party.story.vip=1;save();setAlchemyAutoBuy(true)');assert.equal(r.run('shopPayablePrice(200)'),190);assert.equal(r.run("startLifeWork('alchemy')"),true);assert.equal(r.run('state.gold'),1000);await tick(r,5000);assert.equal(r.run('state.gold'),791);assert.equal(r.run('materialCount("清水")'),0);assert.equal(r.run('materialCount("藥水瓶")'),0);assert.equal(r.run('healPotionCount("heal_small")'),startingPotions+1);assert.equal(r.run('__EMBERWILD_LIFE_SKILLS.jobs.work'),null);
 r.run("setMaterialCount('紅色草',2);state.gold=1;save()");assert.equal(r.run("startLifeWork('alchemy')"),false);await tick(r,5000);assert.equal(r.run('state.gold'),1);assert.equal(r.run('healPotionCount("heal_small")'),startingPotions+1);assert.equal(r.run('materialCount("清水")'),0);
 r.run('state.gold=1000;setAlchemyAutoBuy(false)');assert.equal(r.run("startLifeWork('alchemy')"),false);r.run("buyLifeMaterial('清水',3);buyLifeMaterial('藥水瓶',2)");assert.equal(r.run('state.gold'),677);assert.equal(r.run("startLifeWork('alchemy')"),true);await tick(r,5000);assert.equal(r.run('state.gold'),677);assert.equal(r.run('healPotionCount("heal_small")'),startingPotions+2);assert.deepEqual(r.errors,[]);
});

test('VIP discount applies to fixed and random merchandise, minimum coin cost and failed saves roll back',async()=>{
 const r=await game();r.run('party.story.vip=1;state.gold=100000;save()');const d=replace(r,d=>{d.shopSettings.fixedOffers.entries=[{id:'test_ore',enabled:true,type:'ore',key:'',name:'測試',description:'',quantity:2,unitPrice:101}];d.shopSettings.randomOffers.entries=[{id:'test_random',enabled:true,type:'ore',key:'',name:'測試',description:'',quantityMin:2,quantityMax:2,unitPrice:101,weight:1,selection:'weighted',chance:1,quantityScalesWithTier:false,priceScalesWithTier:false}];});
 const before=r.run('state.gold');r.run("buyFixedShopOffer('test_ore')");assert.equal(r.run('state.gold'),before-191);r.run('party.market=generateMarket();buyMarketOffer(party.market.offers[0].id)');assert.equal(r.run('state.gold'),before-382);assert.equal(r.run('shopPayablePrice(1)'),1);assert.equal(r.run('shopPayablePrice(0)'),0);
 const held=r.run('state.ore');r.run('globalThis.originalSave=save;save=()=>false;buyFixedShopOffer("test_ore");save=originalSave');assert.equal(r.run('state.gold'),before-382);assert.equal(r.run('state.ore'),held);assert.deepEqual(r.errors,[]);
});

test('lifetime and stage baselines, all/any, flags, choices and conditional quest chains execute from edited data',async()=>{
 const r=await game(),q=M.quest('branch_test','分歧','side','NPC'),left=M.stage('left','左'),right=M.stage('right','右'),a=M.quest('follow_a','後續 A'),b=M.quest('follow_b','後續 B');q.stages.push(left,right);const first=q.stages[0];first.conditions=M.group([M.condition('kills','',2,'stage')]);first.choices=[{id:'left',text:'向左',conditions:M.group(),effects:[{type:'flag',key:'left',value:true}],next:'left',nextQuests:[]},{id:'right',text:'向右',conditions:M.group([M.condition('flag','right')]),effects:[],next:'right',nextQuests:[]}];q.nextQuests=[{questId:'follow_a',conditions:M.group([M.condition('flag','left')])},{questId:'follow_b',conditions:M.group([M.condition('flag','right')])}];
 kill(r);kill(r);replace(r,d=>d.story.quests.push(q,a,b));assert.equal(r.run('party.story.quests.branch_test.baseline["kills||material"]'),2);assert.equal(r.run("completeStoryStage('branch_test','left')"),false);kill(r);kill(r);const saved=json(r,'packParty()');complete(r,'branch_test','left');assert.equal(r.run('party.story.quests.branch_test.current'),'left');complete(r,'branch_test');assert(r.run('!!party.story.quests.follow_a'));assert.equal(r.run('!!party.story.quests.follow_b'),false);
 r.ctx.saved=saved;r.run('loadParty(saved);party.story.flags.right=true');complete(r,'branch_test','right');assert.equal(r.run('party.story.quests.branch_test.current'),'right');complete(r,'branch_test');assert(r.run('!!party.story.quests.follow_b'));
 const conditional=M.quest('condition_branch','條件分歧');conditional.stages.push(M.stage('yes','成立'),M.stage('no','不成立'));conditional.stages[0].branches=[{conditions:{mode:'any',conditions:[M.condition('flag','right'),M.condition('level','',999)]},next:'yes'}];conditional.stages[0].next='no';replace(r,d=>d.story.quests.push(conditional));complete(r,'condition_branch');assert.equal(r.run('party.story.quests.condition_branch.current'),'yes');assert.deepEqual(r.errors,[]);
});

test('story reward/flags/progression and alchemy auto-purchase all roll back on storage failure',async()=>{
 const r=await game();replace(r,d=>{d.story.quests[0].stages[0].rewards={gold:100,ore:9,items:[{type:'material',key:'紅色草',quantity:4}]};d.story.quests[0].stages[0].effects=[{type:'flag',key:'test',value:true}];});
 const before=json(r,'packParty()');r.run('globalThis.storageSet=localStorage.setItem;localStorage.setItem=()=>{throw Error("quota")};');assert.equal(r.run("completeStoryStage('goddess_intro')"),false);assert.deepEqual(json(r,'packParty()'),before);r.run('localStorage.setItem=storageSet');complete(r,'goddess_intro');assert.equal(r.run('state.gold'),before.members[0].gold+100);
 r.run("party.story.vip=1;setAlchemyAutoBuy(true);state.gold=100;setMaterialCount('紅色草',2);setMaterialCount('清水',0);setMaterialCount('藥水瓶',0);save();startLifeWork('alchemy')");const stock=json(r,'({gold:state.gold,materials:state.materials,potions:healingInventory(),stats:party.progressStats})');const comparable=v=>({...v,stats:{...v.stats,acquired:Object.fromEntries(Object.entries(v.stats.acquired).filter(([,n])=>n!==0))}});r.run('localStorage.setItem=()=>{throw Error("quota")};');await tick(r,5000);r.run('localStorage.setItem=storageSet');assert.deepEqual(comparable(json(r,'({gold:state.gold,materials:state.materials,potions:healingInventory(),stats:party.progressStats})')),comparable(stock));assert.equal(r.run('__EMBERWILD_LIFE_SKILLS.jobs.work'),null);
});

test('cumulative acquisition survives consuming items; per-recipe/gather/level/flag predicates use real stats',async()=>{
 const r=await game(),startingPotions=r.run('healPotionCount("heal_small")'),startingAcquired=r.run('party.progressStats.acquired["item:heal_small"]||0');r.run("setMaterialCount('清水',2);setMaterialCount('藥水瓶',2);setMaterialCount('紅色草',2);save();startLifeWork('alchemy')");await tick(r,10000);assert.equal(r.run('party.progressStats.recipes.alchemy'),2);assert.equal(r.run('party.progressStats.acquired["item:heal_small"]'),startingAcquired+2);assert.equal(r.run('healPotionCount("heal_small")'),startingPotions+2);assert.equal(r.run('party.progressStats.acquired["material:紅色草"]'),2);assert.equal(r.run('materialCount("紅色草")'),0);r.run('party.story.flags.ready=true;party.story.unlocks.special=true');
 for(const c of [M.condition('recipe','alchemy',2),M.condition('alchemy','',2),M.condition('stock','heal_small',2),M.condition('acquired','heal_small',2),M.condition('level'),M.condition('flag','ready'),M.condition('unlock','special')]){if(['stock','acquired'].includes(c.type))c.itemType='item';r.ctx.c=c;assert(r.run('__EMBERWILD_STORY.value(c)>=c.count'),c.type);}
});

test('editor stage creation, serialization/import, dialogue and branch editing roundtrip into executable runtime',async t=>{
 if(!fs.existsSync(path.join(editor,'balance-editor.html')))return t.skip('Balance editor fixture is not available in standalone game CI');
 const e=loadRuntime(editor,'balance-editor.html');e.run("__EMBERWILD_STORY_EDITOR.select('goddess_intro');globalThis.newStage=__EMBERWILD_STORY_EDITOR.addStage();__EMBERWILD_STORY_EDITOR.set('name','女神主線改名');");const d=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');assert.equal(d.story.quests[0].stages.length,10);assert.deepEqual(json(e,'validateData()'),[]);const r=await game();r.ctx.doc=d;r.run('applyBalanceConfig(doc)');assert.equal(r.run('exportableBalance().story.quests[0].name'),'女神主線改名');assert.deepEqual(json(r,'exportableBalance().story'),d.story);
 e.ctx.doc=json(r,'exportableBalance()');e.run('data=__EMBERWILD_VALIDATE_DOCUMENT(doc);ensureArrays()');assert.deepEqual(json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport().story'),d.story);assert.deepEqual(e.errors,[]);assert.deepEqual(r.errors,[]);
});

test('invalid references, unreachable nodes, cycles and malformed rewards are rejected before changing data',async()=>{
 const r=await game(),before=json(r,'exportableBalance()');for(const change of [d=>d.story.quests[0].stages[0].next='missing',d=>d.story.quests[0].nextQuests=[{questId:'missing',conditions:M.group()}],d=>d.story.quests[0].stages[1].next='welcome',d=>d.story.quests[0].stages.push(M.stage('orphan','孤立')),d=>d.story.quests[0].stages[0].conditions.conditions=[M.condition('recipe','missing')],d=>d.story.quests[0].stages[0].rewards.gold=-1,d=>d.story.quests[0].stages[0].choices=[{id:'bad',text:'bad',next:'missing',conditions:M.group(),effects:[],nextQuests:[]}]]){const d=structuredClone(before);change(d);r.ctx.bad=d;assert.throws(()=>r.run('applyBalanceConfig(bad)'),/劇情/);assert.deepEqual(json(r,'exportableBalance()'),before);}
});

test('new stage executes after editor changes; sequential quest links and prior permanent conditions need no replay',async()=>{
 const r=await game(),a=M.quest('chain_a','A'),b=M.quest('chain_b','B'),c=M.quest('chain_c','C');a.nextQuests=[{questId:b.id,conditions:M.group()}];b.nextQuests=[{questId:c.id,conditions:M.group()}];const extra=M.stage('extra','新增階段');a.stages[0].next=extra.id;a.stages.push(extra);
 replace(r,d=>d.story.quests.push(a,b,c));assert.equal(r.run('!!party.story.quests.chain_b'),false);complete(r,'chain_a');assert.equal(r.run('party.story.quests.chain_a.current'),'extra');complete(r,'chain_a');assert(r.run('!!party.story.quests.chain_b'));complete(r,'chain_b');assert(r.run('!!party.story.quests.chain_c'));complete(r,'chain_c');assert.equal(r.run('party.story.quests.chain_c.done'),true);
 boss(r,0);const prior=M.quest('prior','已完成 BOSS');prior.stages[0].conditions=M.group([M.condition('boss','0'),M.condition('bosses'),M.condition('quest','chain_c'),M.condition('stage','chain_a/extra'),M.condition('region','0')]);replace(r,d=>d.story.quests.push(prior));complete(r,'prior');
});

test('runtime dialogue continuation/exit and every guide preserve the independent exploration state',async()=>{
 const r=await game();r.run("openStory('goddess_intro');readStory('goddess_intro')");assert.match(r.run('storyView()'),/歡迎來到營地/);r.run('nextStoryDialogue()');assert.match(r.run('storyView()'),/完成階段／繼續劇情/);r.run('endStoryDialogue()');assert.equal(r.run('party.story.quests.goddess_intro.current'),'welcome');const old=json(r,'({map:party.map,kills:state.totalKills,running})');for(const id of Object.keys(M.GUIDES)){r.run(`storyNavigate('${id}')`);assert.equal(r.run('tab'),id);}assert.deepEqual(json(r,'({map:party.map,kills:state.totalKills,running})'),old);assert.deepEqual(r.errors,[]);
});

test('failed recipe attempts count actions but cannot satisfy successful recipe condition; missing other ingredients never buys basics',async()=>{
 const r=await game(),startingPotions=r.run('healPotionCount("heal_small")');replace(r,d=>{d.lifeSkills.recipes.alchemy.chance=0;d.lifeSkills.materialBuyPrices.清水=100;});r.run("party.story.vip=1;setAlchemyAutoBuy(true);state.gold=1000;setMaterialCount('紅色草',1);save();startLifeWork('alchemy')");await tick(r,5000);assert.equal(r.run('party.progressStats.alchemy'),1);assert.equal(r.run('party.progressStats.recipes.alchemy||0'),0);assert.equal(r.run('healPotionCount("heal_small")'),startingPotions);assert.equal(r.run('state.gold'),904);const gold=r.run('state.gold');assert.equal(r.run("startLifeWork('alchemy')"),false);assert.equal(r.run('state.gold'),gold);assert.equal(r.run('materialCount("清水")'),0);
});

test('invalid story save is rejected atomically and an unassigned protagonist cannot satisfy a ready party',async()=>{
 const r=await game();recruit(r);r.run('party.buildSystem.plans.find(p=>p.id===party.buildSystem.activeId).job=null');r.ctx.c=M.condition('party','',3);assert.equal(r.run('__EMBERWILD_STORY.value(c)'),0);
 // Restore through the existing team projection before the malformed save check.
 r.run('party.buildSystem.plans.find(p=>p.id===party.buildSystem.activeId).job=0');const before=json(r,'packParty()'),bad=structuredClone(before);bad.story.quests.goddess_intro.baseline={bad:'not-a-number'};r.ctx.bad=bad;assert.throws(()=>r.run('loadParty(bad)'),/任務階段存檔/);assert.deepEqual(json(r,'packParty()'),before);
});
