const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime,ADD_TEST_MAP,ADD_TEST_FINAL,ADD_HIDDEN_TEST_COMPANIONS}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),editor=require('./runtime.cjs').balanceRoot(root);
const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
// v0.179: achievement and shop tickets are off in the game; these mechanics tests switch them back on.
// v0.228: the game ships one map and 洛恩／艾琳; tests add maps 1 and 2 (final) and hidden companions 11／12／14 (formerly 15／16／17).
function game(){const r=loadRuntime(root);r.run(ADD_TEST_MAP);r.run(ADD_TEST_FINAL);r.run(ADD_HIDDEN_TEST_COMPANIONS);r.run('__EMBERWILD_SET_EXTRA_TICKET_SOURCES(true);selectSaveSlot(1);start(0);closeModal();');return r;}
function rules(r){r.run(`const d=exportableBalance();for(const [id,unlockCondition] of [[11,{type:'region',mapIndex:2}],[12,{type:'elite',mapIndex:0,count:50}],[14,{type:'ticket',chance:1,price:100}]]){const p=d.companions.find(p=>p.id===id);p.availability='visible';p.unlockCondition=unlockCondition;}applyBalanceConfig(d);`);}
test('Visibility has only two values, legacy states migrate and condition editor exports valid rules',()=>{
 const e=loadRuntime(editor,'balance-editor.html');assert.deepEqual(json(e,'validateData()'),[]);
 assert.deepEqual(json(e,'Object.keys(EmberwildCompanionSkills.availabilityLabels)'),['visible','hidden']);
 assert.deepEqual(json(e,"data.companions.filter(p=>p.availability==='visible').map(p=>p.id)"),[10,13]);
 e.run("selectCompanionUnlock(13);document.getElementById('companionUnlockType').onchange({target:{value:'achievement'}});setCompanionAchievementCondition('region-0-elite-50',true);setCompanionAchievementCondition('region-0-open',false);");
 assert.deepEqual(json(e,'data.companions.find(p=>p.id===13).unlockCondition.achievementIds'),['region-0-elite-50']);
 assert.deepEqual(json(e,'validateData()'),[]);
 e.run("selectCompanionDesign(13);document.getElementById('companionAvailability').onchange({target:{value:'visible'}})");
 const r=game();r.ctx.doc=json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport()');r.run('applyBalanceConfig(doc)');assert.deepEqual(json(r,'exportableBalance().companions.find(p=>p.id===13).unlockCondition'),{type:'achievement',achievementIds:['region-0-elite-50']});
 assert.equal(r.run("EmberwildCompanionSkills.availability({id:15,availability:'locked'})"),'visible');
 assert.deepEqual(json(r,"EmberwildCompanionSkills.unlockCondition({id:15,availability:'locked'})"),{type:'achievement',achievementIds:['region-1-open']});
});
test('Region unlock uses the player gate; elite progress counts only elites in the configured region exactly once',()=>{
 const r=game();rules(r);assert.equal(r.run('companionUnlocked(11)'),false);assert.equal(r.run('companionUnlocked(12)'),false);
 r.run('acquireCompanion(12);');assert.equal(r.run('partyMember(12)'),undefined);
 // v0.161: regions open by defeating the previous map bosses (no character level).
 r.run('for(let i=0;i<2;i++)playerHero().kills[MAPS[i].boss[2]]=1;syncParty();save();claimAllMailboxAttachments()');assert.equal(r.run('companionTicketCount(11)'),1);r.run('useCompanionRecruitmentTicket(11)');assert.equal(r.run('companionUnlocked(11)'),true);
 r.run("globalThis.defeat=(kind,region)=>{const e=makeEnemy(region,playerHero(),()=>.5);e.kind=kind;e.hp=0;rewardGroupKill(e);return e;};defeat('normal',0);defeat('boss',0);defeat('elite',1);");assert.equal(r.run('party.companionUnlocks.eliteKills[0]||0'),0);
 r.run("for(let i=0;i<49;i++)defeat('elite',0)");assert.equal(r.run('companionUnlocked(12)'),false);assert.equal(r.run('party.achievements.eliteKills[0]'),49);
 r.run("globalThis.last=defeat('elite',0);rewardGroupKill(last);claimAllMailboxAttachments();");assert.equal(r.run('party.companionUnlocks.eliteKills[0]'),50);assert.equal(r.run('companionTicketCount(12)'),1);r.run('useCompanionRecruitmentTicket(12)');assert.equal(r.run('companionUnlocked(12)'),true);
 r.run('acquireCompanion(12);closeModal();save();loadParty(structuredClone(packParty()));');assert.equal(r.run('partyMember(12).name'),'測試夥伴12');assert.equal(r.run('party.companionUnlocks.eliteKills[0]'),50);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('party.companionUnlocks.eliteKills[0]'),50);assert.equal(reload.run('companionUnlocked(12)'),true);
 assert.deepEqual(r.errors,[]);assert.deepEqual(reload.errors,[]);
});
test('Random recruitment offers purchase once, survive load, stop spawning and roll back on save failure',()=>{
 const r=game();rules(r);r.run('party.market=generateMarket();save();loadParty(structuredClone(packParty()));globalThis.offer=party.market.offers.find(o=>o.ruleId==="companion-recruit-14");');assert.equal(r.run('!!offer'),true);
 r.run('playerHero().gold=99;buyMarketOffer(offer.id)');assert.equal(r.run('companionUnlocked(14)'),false);assert.equal(r.run('offer.sold'),false);
 r.run('playerHero().gold=100;globalThis.origSave=save;save=()=>false;buyMarketOffer(offer.id);save=origSave');assert.equal(r.run('companionUnlocked(14)'),false);assert.equal(r.run('playerHero().gold'),100);assert.equal(r.run('offer.sold'),false);
 r.run('buyMarketOffer(offer.id);buyMarketOffer(offer.id)');assert.equal(r.run('companionUnlocked(14)'),false);assert.equal(r.run('companionTicketCount(14)'),1);r.run('useCompanionRecruitmentTicket(14)');assert.equal(r.run('companionUnlocked(14)'),true);assert.equal(r.run('playerHero().gold'),0);assert.equal(r.run('offer.sold'),true);assert.equal(r.run('generateMarket().offers.some(o=>o.ruleId==="companion-recruit-14")'),false);
 r.run('save();');const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('companionUnlocked(14)'),true);assert.equal(reload.run('party.companionUnlocks.eliteKills[0]||0'),0);assert.deepEqual(reload.errors,[]);
 const other=game();rules(other);assert.equal(other.run('companionUnlocked(14)'),false);
 r.run("const h=exportableBalance();h.companions.find(p=>p.id===14).availability='hidden';applyBalanceConfig(h);acquireCompanion(14)");assert.equal(r.run('party.members.filter(h=>h.companionId===14).length'),1,'v0.178: the ticket brought 14; hiding it never adds a second copy');assert.equal(r.run('generateMarket().offers.some(o=>o.ruleId==="companion-recruit-14")'),false);
});
test('Malformed conditions and account progress fail atomically; acquired legacy companions remain unlocked',()=>{
 const r=game();const before=r.run('JSON.stringify(exportableBalance())');
 for(const c of [{type:'bad'},{type:'region',mapIndex:900},{type:'elite',mapIndex:0,count:0},{type:'ticket',chance:2,price:10}]){r.ctx.bad=c;assert.throws(()=>r.run('{const d=exportableBalance();d.companions[0].unlockCondition=bad;applyBalanceConfig(d)}'),/夥伴/);assert.equal(r.run('JSON.stringify(exportableBalance())'),before);}
 r.run('acquireCompanion(10);closeModal();globalThis.old=structuredClone(packParty());delete old.companionUnlocks;loadParty(old)');assert.equal(r.run('companionUnlocked(10)'),true);assert.equal(r.run('partyMember(10).name'),'洛恩');
 const saveBefore=r.run('JSON.stringify(packParty())');r.run('globalThis.badSave=structuredClone(packParty());badSave.companionUnlocks.eliteKills[0]=-1');assert.throws(()=>r.run('loadParty(badSave)'),/夥伴解鎖進度無效/);assert.equal(r.run('JSON.stringify(packParty())'),saveBefore);
});

test('Recruitment-only shop can refresh and malformed saved progress remains available for recovery',()=>{
 const r=game();rules(r);r.run("{const d=exportableBalance();d.shopSettings.randomOffers.entries=[];applyBalanceConfig(d);}playerHero().gold=10000;globalThis.serial=party.market.serial;refreshMarket();");assert.equal(r.run('party.market.serial'),r.run('serial+1'));assert.equal(r.run('party.market.offers.length'),1);
 r.run('save();globalThis.raw=JSON.parse(localStorage.getItem(KEY));raw.companionUnlocks.eliteKills[0]=-1;localStorage.setItem(KEY,JSON.stringify(raw));');const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('party'),null);assert.match(reload.run('String(__EMBERWILD_BOOT_SAVE_ERROR)'),/夥伴解鎖進度/);assert.equal(reload.run('JSON.parse(localStorage.getItem(KEY)).companionUnlocks.eliteKills[0]'),-1);
});
