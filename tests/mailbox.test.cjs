const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),A=require('../js/character/achievement-model.js');
const root=path.resolve(__dirname,'..'),editor=path.resolve(process.env.EMBERWILD_EDITOR_ROOT||path.join(root,'../Emberwild-Balance')),json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();party.mailbox=EmberwildAchievements.mailboxDefaults();loadParty(packParty())');return r;}
function bind(r,id,ids=['region-0-open']){r.ctx.ids=ids;r.run(`{const d=exportableBalance(),p=d.companions.find(p=>p.id===${id});p.availability='visible';p.unlockCondition={type:'achievement',achievementIds:ids};applyBalanceConfig(d);}`);}
test('Achievements only record progress; unbound completion creates no mail or achievement popup',()=>{
 const r=game();r.run('setTab("achievements")');assert(!r.elements.get('modal').innerHTML.includes('成就與獎勵通知'));assert(!r.elements.get('modal').innerHTML.includes('achievement-notice'));assert(!r.elements.get('modal').innerHTML.includes('招募券獎勵'));assert(r.run('party.achievements.completed.length>0'));assert.equal(r.run('party.mailbox.messages.length'),0);assert.equal(r.run('party.achievements.notifications'),undefined);assert.equal(r.elements.get('modal').open,true);
 r.run('setTab("mailbox")');assert.match(r.elements.get('modal').innerHTML,/尚無郵件/);assert.deepEqual(r.errors,[]);
});
test('Achievement sends one named attachment; claiming puts it in inventory once and use unlocks the companion',()=>{
 const r=game();bind(r,15,['region-0-elite-50','region-0-elite-100']);r.run('party.achievements.eliteKills[0]=49;globalThis.e=makeEnemy(0,playerHero(),()=>.5);e.kind="elite";e.hp=0;rewardGroupKill(e)');assert.equal(r.run('party.mailbox.messages.length'),1);assert.equal(r.run('companionTicketCount(15)'),0);assert.equal(r.run('companionUnlocked(15)'),false);assert.match(r.elements.get('toast').textContent,/信箱/);assert.equal(r.run('companionPendingMail(15)'),true);
 r.run('setTab("mailbox")');assert.match(r.elements.get('modal').innerHTML,/雷昂招募券/);assert.equal(r.elements.get('utilityReminder-mailbox').textContent,'1');assert.equal(r.run('openMailboxMail(1)'),true);assert.equal(r.run('party.mailbox.messages[0].read'),true);assert.equal(r.run('party.mailbox.messages[0].claimed'),false);
 assert.equal(r.run('claimMailboxAttachments(1)'),true);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('party.mailbox.messages[0].claimed'),true);assert.equal(r.run('claimMailboxAttachments(1)'),false);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('companionUnlocked(15)'),false);
 r.run('party.achievements.eliteKills[0]=100;save()');assert.equal(r.run('party.mailbox.messages.length'),1);assert.equal(r.run('useCompanionRecruitmentTicket(15)'),true);assert.equal(r.run('companionUnlocked(15)'),true);assert.deepEqual(r.errors,[]);
});
test('Pending and claimed mail survive export and cold reload without resending or replaying reward notices',async()=>{
 const r=game();bind(r,15);r.run('save()');const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(reload.run('party.mailbox.messages.length'),1);assert.equal(reload.run('companionTicketCount(15)'),0);reload.run('continueFromTitle();closeModal()');await reload.run('EmberwildOffline.settle()');reload.run('loadParty(structuredClone(packParty()))');assert.equal(reload.run('claimMailboxAttachments(1)'),true);
 const second=loadRuntime(root,'index.html',Object.fromEntries(reload.values));assert.equal(second.run('party.mailbox.messages.length'),1);assert.equal(second.run('party.mailbox.messages[0].claimed'),true);assert.equal(second.run('companionTicketCount(15)'),1);assert.equal(second.run('claimMailboxAttachments(1)'),false);assert.deepEqual(second.errors,[]);
});
test('Individual and all-mail claims roll back on save failure and reject stock overflow without losing rewards',()=>{
 const r=game();bind(r,15);bind(r,16);assert.equal(r.run('party.mailbox.messages.length'),2);r.run('globalThis.realSave=save;save=()=>false');assert.equal(r.run('claimMailboxAttachments(1)'),false);assert.equal(r.run('claimAllMailboxAttachments()'),false);assert.equal(r.run('companionTicketCount(15)'),0);assert.equal(r.run('party.mailbox.messages.every(m=>!m.claimed)'),true);
 r.run('save=realSave;party.achievements.tickets[15]=1e9');assert.equal(r.run('claimAllMailboxAttachments()'),false);assert.equal(r.run('party.mailbox.messages.every(m=>!m.claimed)'),true);assert.equal(r.run('companionTicketCount(16)'),0);
 r.run('delete party.achievements.tickets[15]');assert.equal(r.run('claimAllMailboxAttachments()'),true);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('companionTicketCount(16)'),1);assert.equal(r.run('party.mailbox.messages.every(m=>m.claimed&&m.read)'),true);assert.equal(r.run('claimAllMailboxAttachments()'),false);
});
test('A ticket claimed after a separate unlock still uses the duplicate gold conversion',()=>{
 const r=game();bind(r,15);r.run('party.companionUnlocks.unlocked.push(15);globalThis.gold=state.gold;claimMailboxAttachments(1)');assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('useCompanionRecruitmentTicket(15)'),true);assert.equal(r.run('state.gold'),r.run('gold+100'));assert.match(r.elements.get('modal').innerHTML,/已解鎖/);assert.match(r.elements.get('modal').innerHTML,/100 金幣/);
});
test('Legacy notifications disappear while earned inventory and kill progress remain; no old reward is mailed twice',()=>{
 const r=game();r.run('globalThis.old=structuredClone(packParty());old.achievements.version=1;old.achievements.notifications=[{id:1,title:"獲得夥伴招募券",text:"雷昂",at:Date.now(),seen:false}];old.achievements.noticeSerial=1;old.achievements.eliteKills[0]=150;old.achievements.rewardCompanions=[15];old.achievements.tickets[15]=1;delete old.mailbox;loadParty(old);');bind(r,15);assert.equal(r.run('party.achievements.version'),3);assert.equal(r.run('party.achievements.notifications'),undefined);assert.equal(r.run('party.achievements.eliteKills[0]'),150);assert.equal(r.run('companionTicketCount(15)'),1);assert.equal(r.run('party.mailbox.messages.length'),0);
});
test('Malformed mailbox data rejects before replacing the save',()=>{
 const r=game();bind(r,15);const before=r.run('JSON.stringify(packParty())');
 for(const mutate of ['bad.mailbox.messages[0].claimed=true;bad.mailbox.messages[0].read=false','bad.mailbox.messages[0].attachments[0].quantity=-1','bad.mailbox.messages.push(structuredClone(bad.mailbox.messages[0]))','bad.mailbox.serial=0']){r.run('globalThis.bad=structuredClone(packParty());'+mutate);assert.throws(()=>r.run('loadParty(bad)'),/信箱存檔無效/);assert.equal(r.run('JSON.stringify(packParty())'),before);}
 assert.equal(A.validateState({version:2,eliteKills:{},bossKills:{},completed:[],rewardCompanions:[],tickets:{}}).version,3);assert.deepEqual(r.errors,[]);
});

test('Standalone editor accepts the shared mailbox contract',{skip:fs.existsSync(path.join(editor,'balance-editor.html'))?false:'Standalone editor checkout is not available; set EMBERWILD_EDITOR_ROOT to run this cross-repository check'},()=>{
 const e=loadRuntime(editor,'balance-editor.html');assert.deepEqual(json(e,'validateData()'),[]);
});
