// v0.076: 已讀全部 and 刪除已讀及已領取信件; unread mail shows a red dot; unread, unclaimed or locked mail is never deleted.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,x)=>JSON.parse(r.run('JSON.stringify('+x+')'));
test('read-all clears the dots, deleting removes only read and claimed mail, and nothing is resent',()=>{
 const r=loadRuntime(root);r.ctx.confirm=()=>true;r.run('selectSaveSlot(1);start(1);closeModal();clearInterval(timer);');
 const total=r.run('party.mailbox.messages.length');assert(total>=1,'the starter pack mail exists');
 let html=r.run('mailboxView()');assert.match(html,/mail-dot/);assert.doesNotMatch(html,/NEW|未讀 · 待領取/);assert.match(html,/已讀全部/);assert.match(html,/刪除已讀及已領取信件/);
 assert.equal(r.run('markAllMailRead()'),true);assert.equal(r.run('party.mailbox.messages.every(m=>m.read)'),true);
 html=r.run('mailboxView()');assert.doesNotMatch(html,/mail-dot/,'read mail has no dot');
 assert.equal(r.run('deleteReadClaimedMail()'),false,'nothing read and claimed yet');assert.equal(r.run('party.mailbox.messages.length'),total);
 r.run('claimAllMailboxAttachments()');assert.equal(r.run('party.mailbox.messages.every(m=>m.claimed)'),true);
 assert.equal(r.run('deleteReadClaimedMail()'),true);assert.equal(r.run('party.mailbox.messages.length'),0);
 // Reload and a sync never resend the starter pack.
 r.run('globalThis.saved=JSON.parse(JSON.stringify(packParty()));loadParty(saved);');assert.equal(r.run('party.mailbox.messages.length'),0);
 r.run('mailboxView();');assert.equal(r.run('party.mailbox.messages.length'),0);
 assert.deepEqual(r.errors,[]);
});
test('a cancelled delete changes nothing and unread mail survives',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(2);closeModal();clearInterval(timer);');
 r.run('claimAllMailboxAttachments()');r.ctx.confirm=()=>false;const n=r.run('party.mailbox.messages.length');
 assert.equal(r.run('deleteReadClaimedMail()'),false);assert.equal(r.run('party.mailbox.messages.length'),n);
 assert.deepEqual(r.errors,[]);
});

test('locked mail survives 刪除已讀及已領取信件 and reload; unlocking makes it deletable again',()=>{
 const r=loadRuntime(root);r.ctx.confirm=()=>true;r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);claimAllMailboxAttachments();');
 const id=r.run('party.mailbox.messages[0].id');assert.equal(r.run(`toggleMailLock(${id})`),true);assert.match(r.run('mailboxView()'),/解除鎖定/);
 r.run('globalThis.saved=JSON.parse(JSON.stringify(packParty()));loadParty(saved);');assert.deepEqual(json(r,'party.members[0].lockedMailIds'),[id]);
 assert.equal(r.run('deleteReadClaimedMail()'),false,'only locked mail is read and claimed');assert.equal(r.run(`party.mailbox.messages.some(m=>m.id===${id})`),true);
 r.run(`toggleMailLock(${id})`);assert.equal(r.run('deleteReadClaimedMail()'),true);assert.equal(r.run(`party.mailbox.messages.some(m=>m.id===${id})`),false);
 assert.deepEqual(json(r,'party.members[0].lockedMailIds'),[]);assert.deepEqual(r.errors,[]);
});

test('a mail with attachments shows its first attachment icon before the title; a mail without attachments does not',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(1);closeModal();clearInterval(timer);');
 const html=r.run('mailboxView()'),m=json(r,'party.mailbox.messages.map(m=>({id:m.id,n:m.attachments?.length||0,subject:m.subject}))');
 const withAtt=m.find(x=>x.n>0);assert(withAtt,'starter pack has attachments');
 const item=html.split('mailbox-list-item').find(s=>s.includes(withAtt.subject));
 assert.match(item,/<b><span class="mail-title-icon" aria-hidden="true"><svg/,'icon comes first inside the title');
 assert.equal(r.run(`mailAttachmentIcon(${withAtt.id},0)`),r.run(`mailAttachmentIcon(${withAtt.id})`));
 r.run(`party.mailbox.messages.push({id:9999,subject:'無附件測試',body:'',at:Date.now(),read:false,claimed:true,attachments:[]})`);
 const plain=r.run('mailboxView()').split('mailbox-list-item').find(s=>s.includes('無附件測試'));
 assert.doesNotMatch(plain,/mail-title-icon/);assert.deepEqual(r.errors,[]);
});
