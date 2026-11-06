const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {ReleaseService}=require('../../Emberwild-Balance/server/release-service.cjs');
test('expanded life designs cannot be promoted or restored into an older production engine',async()=>{
 const head='a'.repeat(40),source='b'.repeat(40);let upgraded=false;const calls=[],data={lifeSkills:{gathering:[]},value:2};
 const s=new ReleaseService({validate:x=>x,api:async p=>{calls.push(p);if(p.includes('/git/ref/heads/'))return {object:{sha:p.endsWith('main')?head:source}};if(p.includes('/compare/'))return {status:'ahead'};if(p.includes('/contents/js/')){assert(p.endsWith('ref='+head));return {type:'file',encoding:'base64',content:Buffer.from(upgraded?fs.readFileSync('js/balance/balance-document.js'):'const api={VERSION:1};').toString('base64')};}return {type:'file',encoding:'base64',sha:head,content:Buffer.from(JSON.stringify(p.endsWith('ref='+head)?{value:1}:data)).toString('base64')};}});
 const args={kind:'promote',sourceCommit:source,expectedCommit:head,message:'發布採集煉金設定'};
 await assert.rejects(()=>s.prepare(args,'s'),/正式版程式尚未支援/);assert.equal(s.tickets.size,0);
 await assert.rejects(()=>s.prepare({...args,kind:'restore',branch:'main',restoreCommit:source},'s'),/正式版程式尚未支援/);assert.equal(s.tickets.size,0);assert(!calls.some(p=>p.endsWith('/git/blobs')));
 upgraded=true;const out=await s.prepare(args,'s');assert.equal(out.branch,'main');assert.equal(s.tickets.size,1);
});
