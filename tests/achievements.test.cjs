const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),A=require('../js/character/achievement-model.js');
const root=path.resolve(__dirname,'..'),editor=path.resolve(root,'../Emberwild-Balance'),json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal()');return r;}
function bind(r,id,achievementIds){r.ctx.ids=achievementIds;r.run(`{const d=exportableBalance(),p=d.companions.find(p=>p.id===${id});p.availability='visible';p.unlockCondition={type:'achievement',achievementIds:ids};applyBalanceConfig(d);claimAllMailboxAttachments();}`);}
function kill(r,kind,region=0){r.ctx.killKind=kind;r.ctx.killRegion=region;r.run('globalThis.last=makeEnemy(killRegion,playerHero(),()=>.5);last.kind=killKind;last.hp=0;rewardGroupKill(last);claimAllMailboxAttachments()');}
test('Every eligible region has open achievements and exactly 20 stages per kill category at 50..1000',()=>{
 const c=A.catalog([{name:'草原',mapType:'normal',eliteEnabled:true,bossEnabled:true},{name:'終局',mapType:'final',eliteEnabled:false},{name:'安全区',mapType:'normal',eliteEnabled:false,bossEnabled:false}]);
 assert.equal(c.length,63);assert.deepEqual(c.filter(x=>x.mapIndex===0&&x.kind==='elite').map(x=>x.count),Array.from({length:20},(_,i)=>(i+1)*50));assert.equal(c.filter(x=>x.mapIndex===1&&x.kind==='elite').length,0);assert.equal(c.filter(x=>x.mapIndex===1&&x.kind==='boss').length,20);assert.equal(c.filter(x=>x.mapIndex===2).length,1);
 for(const id of ['region-0-elite-0','region-0-boss-1050','region-0-elite-55','bad'])assert.equal(A.parse(id),null);
});
test('Editor-embedded achievement model matches the game module when editor fixture is connected',t=>{
 const file=path.join(editor,'balance-editor.html');
 if(!fs.existsSync(file))return t.skip('Private balance editor fixture unavailable in standalone CI');
 const html=fs.readFileSync(file,'utf8');
 assert.equal(html.match(/<script id="achievement-model-v1">\n([\s\S]*?)<\/script>/)[1],fs.readFileSync(path.join(root,'js/character/achievement-model.js'),'utf8'));
});
test('Real kills count their own region and category once; staged achievements stop at 1000 and include final bosses',()=>{
 const r=game();r.run('party.achievements.eliteKills[0]=49;party.achievements.bossKills[0]=49;');kill(r,'normal');assert.equal(r.run('party.achievements.eliteKills[0]'),49);kill(r,'elite',1);assert.equal(r.run('party.achievements.eliteKills[0]'),49);
 kill(r,'elite');assert.equal(r.run('party.achievements.completed.includes("region-0-elite-50")'),true);r.run('rewardGroupKill(last)');assert.equal(r.run('party.achievements.eliteKills[0]'),50);assert.equal(r.run('party.achievements.bossKills[0]'),49);
 kill(r,'boss');assert.equal(r.run('party.achievements.completed.includes("region-0-boss-50")'),true);
 r.run('party.achievements.eliteKills[0]=999');kill(r,'elite');assert.equal(r.run('party.achievements.completed.includes("region-0-elite-1000")'),true);assert.equal(r.run('party.achievements.completed.filter(id=>id.startsWith("region-0-elite-")).length'),20);
 r.run('party.achievements.bossKills[6]=49;playerHero().lv=30;syncParty()');kill(r,'final',6);assert.equal(r.run('party.achievements.completed.includes("region-6-boss-50")'),true);assert.deepEqual(r.errors,[]);
});
test('Achievement awards a named ticket once, not immediate unlock; actual inventory use unlocks and later stages do not award again',()=>{
 const r=game();bind(r,15,['region-0-elite-50','region-0-elite-100']);r.run('party.achievements.eliteKills[0]=49');kill(r,'elite');
 assert.equal(r.run('companionUnlocked(15)'),false);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('party.achievements.rewardCompanions.includes(15)'),true);assert.match(r.run('accountItemsView()'),/雷昂招募券/);assert.match(r.elements.get('toast').textContent,/已領取.*道具已放入背包/);
 r.run('acquireCompanion(15)');assert.equal(r.run('partyMember(15)'),undefined);
 r.run('party.achievements.eliteKills[0]=99');kill(r,'elite');assert.equal(r.run('companionTicketCount(15)'),1);
 assert.equal(r.run('useCompanionRecruitmentTicket(15)'),true);assert.equal(r.run('companionUnlocked(15)'),true);assert.equal(r.run('companionTicketCount(15)'),0);assert.equal(r.run('useCompanionRecruitmentTicket(15)'),false);
 r.run('recruitCompanion(15);closeModal();save();loadParty(structuredClone(packParty()));save()');assert.equal(r.run('partyMember(15).name'),'雷昂');assert.equal(r.run('companionTicketCount(15)'),0);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('party.achievements.eliteKills[0]'),100);assert.equal(reload.run('companionTicketCount(15)'),0);assert.equal(reload.run('partyMember(15).name'),'雷昂');assert.deepEqual(reload.errors,[]);
});
test('Region completion and retroactive linking issue tickets; hidden companions wait, owned companions keep their unlocks',()=>{
 const r=game();bind(r,15,['region-2-open']);assert.equal(r.run('companionTicketCount(15)'),0);r.run('playerHero().lv=20;syncParty();save();claimAllMailboxAttachments()');assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('companionUnlocked(15)'),false);
 bind(r,16,['region-0-open']);assert.equal(r.run('companionTicketCount(16)'),1);
 r.run("{const d=exportableBalance(),p=d.companions.find(p=>p.id===17);p.unlockCondition={type:'achievement',achievementIds:['region-0-open']};applyBalanceConfig(d)}");assert.equal(r.run('companionTicketCount(17)'),0);
 r.run("{const d=exportableBalance();d.companions.find(p=>p.id===17).availability='visible';applyBalanceConfig(d);claimAllMailboxAttachments()}");assert.equal(r.run('companionTicketCount(17)'),1);
 r.run('acquireCompanion(10);closeModal()');bind(r,10,['region-0-boss-1000']);assert.equal(r.run('companionUnlocked(10)'),true);assert.equal(r.run('companionTicketCount(10)'),0);
});
test('Shop tickets enter inventory, pending tickets stop refresh, failed purchase/use do not consume gold or tickets',()=>{
 const r=game();r.run("{const d=exportableBalance(),p=d.companions.find(p=>p.id===15);p.availability='visible';p.unlockCondition={type:'ticket',chance:1,price:100};applyBalanceConfig(d);}playerHero().gold=100;globalThis.offer=party.market.offers.find(o=>o.ruleId==='companion-recruit-15');globalThis.saved=save;save=()=>false;buyMarketOffer(offer.id);save=saved");assert.equal(r.run('playerHero().gold'),100);assert.equal(r.run('companionTicketCount(15)'),0);assert.equal(r.run('offer.sold'),false);
 r.run('buyMarketOffer(offer.id);buyMarketOffer(offer.id)');assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('companionUnlocked(15)'),false);assert.equal(r.run('playerHero().gold'),0);assert.equal(r.run('generateMarket().offers.some(o=>o.ruleId==="companion-recruit-15")'),false);
 r.run('save=()=>false');assert.equal(r.run('useCompanionRecruitmentTicket(15)'),false);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('companionUnlocked(15)'),false);r.run('save=saved');bind(r,15,['region-0-open']);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('party.achievements.rewardCompanions.includes(15)'),true);assert.equal(r.run('useCompanionRecruitmentTicket(15)'),true);
});
test('Claimed mail persists without duplicate prizes on reload; invalid data fails atomically and player saves are isolated',()=>{
 const r=game(),initialMail=r.run('party.mailbox.messages.length');
 bind(r,15,['region-0-open']);r.run('save()');
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));
 assert.equal(reload.run('party.mailbox.messages.length'),initialMail+1,'exactly one new companion reward mail');
 assert.equal(reload.run('companionTicketCount(15)'),1);
 assert.equal(reload.run("party.mailbox.messages.filter(m=>m.rewardKey==='companion-15').length"),1,'reward mail is unique');
 assert.equal(reload.run("party.mailbox.messages.find(m=>m.rewardKey==='companion-15')?.claimed"),true);
 const other=game();assert.equal(other.run('companionTicketCount(15)'),0);
 const before=r.run('JSON.stringify(packParty())');r.run('globalThis.bad=structuredClone(packParty());bad.achievements.bossKills[0]=-1');assert.throws(()=>r.run('loadParty(bad)'),/成就與招募券存檔無效/);assert.equal(r.run('JSON.stringify(packParty())'),before);
 const balance=r.run('JSON.stringify(exportableBalance())');r.run("globalThis.bad=exportableBalance();bad.companions[0].unlockCondition={type:'achievement',achievementIds:['region-0-elite-1050']}");assert.throws(()=>r.run('applyBalanceConfig(bad)'),/成就/);assert.equal(r.run('JSON.stringify(exportableBalance())'),balance);
});
test('Legacy elite counters migrate into achievements without losing counts; existing unlocks are retained and boss counters start at zero',()=>{
 const r=game();r.run('globalThis.old=structuredClone(packParty());delete old.achievements;old.companionUnlocks.eliteKills[0]=150;loadParty(old);save()');assert.equal(r.run('party.achievements.eliteKills[0]'),150);assert.equal(r.run('party.achievements.completed.includes("region-0-elite-150")'),true);assert.deepEqual(json(r,'party.achievements.bossKills'),{});
 const c=r.run("EmberwildCompanionSkills.unlockCondition({id:15,unlockCondition:{type:'elite',mapIndex:0,count:50}})");assert.equal(c.type,'achievement');assert.deepEqual(Array.from(c.achievementIds),['region-0-elite-50']);assert.equal(r.run('companionUnlocked(10)'),true);
});
test('Designer links multiple real achievements and exports rules that produce game tickets; filters show progress and rewards',t=>{
 if(!fs.existsSync(path.join(editor,'balance-editor.html')))return t.skip('Requires private balance editor fixture');
 const e=loadRuntime(editor,'balance-editor.html');e.run("selectCompanionUnlock(15);document.getElementById('companionUnlockType').onchange({target:{value:'achievement'}});setCompanionAchievementCondition('region-0-boss-50',true);document.getElementById('companionAvailability').value='visible';selectCompanionDesign(15);document.getElementById('companionAvailability').onchange({target:{value:'visible'}})");assert.deepEqual(json(e,'validateData()'),[]);
 const r=game();r.ctx.doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');r.run('applyBalanceConfig(doc);setAchievementFilter("region","0");setAchievementFilter("kind","boss");setTab("achievements")');assert.match(r.elements.get('modal').innerHTML,/region-0-boss-50/);assert(!r.elements.get('modal').innerHTML.includes('成就與獎勵通知'));assert(!r.elements.get('modal').innerHTML.includes('data-achievement="region-0-elite-50"'));
 r.run('party.achievements.bossKills[0]=49');kill(r,'boss');assert.equal(r.run('companionTicketCount(15)'),1);assert.deepEqual(r.errors,[]);assert.deepEqual(e.errors,[]);
});

test('Duplicate tickets convert once with a popup and configurable gold; failed saves and gold cap preserve the voucher',t=>{
 if(!fs.existsSync(path.join(editor,'balance-editor.html')))return t.skip('Requires private balance editor fixture');
 const e=loadRuntime(editor,'balance-editor.html');e.run("selectCompanionUnlock(10);document.getElementById('companionDuplicateGold').onchange({target:{value:'123'}})");assert.deepEqual(json(e,'validateData()'),[]);
 const r=game();r.ctx.doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');r.run('applyBalanceConfig(doc);party.achievements.tickets[10]=2;globalThis.gold=state.gold;');// Compact item slots; the conversion amount is checked by actually using the duplicate ticket below.
 assert.match(r.run('accountItemsView()'),/data-item-key="companion-ticket-10"[^>]*data-item-quantity="2"/);
 assert.equal(r.run('useCompanionRecruitmentTicket(10)'),true);assert.equal(r.run('state.gold'),r.run('gold+123'));assert.equal(r.run('companionTicketCount(10)'),1);assert.match(r.elements.get('modal').innerHTML,/已解鎖/);assert.match(r.elements.get('modal').innerHTML,/123 金幣/);assert.equal(r.elements.get('modal').open,true);
 r.run('closeModal();globalThis.originalSave=save;save=()=>false;globalThis.gold=state.gold');assert.equal(r.run('useCompanionRecruitmentTicket(10)'),false);assert.equal(r.run('state.gold'),r.run('gold'));assert.equal(r.run('companionTicketCount(10)'),1);assert.equal(r.elements.get('modal').open,false);
 r.run('save=originalSave;state.gold=1e12');assert.equal(r.run('useCompanionRecruitmentTicket(10)'),false);assert.equal(r.run('companionTicketCount(10)'),1);assert.equal(r.run('state.gold'),1e12);
 r.run('state.gold=0');assert.equal(r.run('useCompanionRecruitmentTicket(10)'),true);assert.equal(r.run('state.gold'),123);assert.equal(r.run('companionTicketCount(10)'),0);assert.equal(r.run('useCompanionRecruitmentTicket(10)'),false);
 const before=r.run('JSON.stringify(exportableBalance())');r.run('globalThis.bad=exportableBalance();bad.companions[0].duplicateTicketGold=-1');assert.throws(()=>r.run('applyBalanceConfig(bad)'),/重複招募券轉換金幣無效/);assert.equal(r.run('JSON.stringify(exportableBalance())'),before);assert.deepEqual(r.errors,[]);assert.deepEqual(e.errors,[]);
});
