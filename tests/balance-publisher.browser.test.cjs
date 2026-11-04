const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright'),{loadRuntime}=require('./headless-runtime.cjs'),{createServer}=require('../../Emberwild-Balance/server/server.cjs'),{ReleaseService}=require('../../Emberwild-Balance/server/release-service.cjs');
function gitFixture(){
 const sha=x=>crypto.createHash('sha1').update(x).digest('hex'),docs=new Map(),docBlobs=new Map(),commits=new Map(),refs={main:sha('main'), 'chatgpt-dev':sha('dev')},blobs=new Map(),trees=new Map();
 for(const [branch,head] of Object.entries(refs)){docs.set(head,JSON.parse(fs.readFileSync(branch==='main'?'../Emberwild-main/data/balance.json':'data/balance.json')));commits.set(head,{sha:head,commit:{message:'Initial balance',committer:{date:new Date().toISOString()}},parents:[]});}
 const hashDoc=d=>sha(JSON.stringify(d));for(const [head,d] of docs)docBlobs.set(head,hashDoc(d));
 async function api(p,o={}){
  if(p.includes('/git/ref/heads/'))return {object:{sha:refs[p.split('/').at(-1)]}};
  if(p.includes('/contents/js/balance/balance-document.js'))return {type:'file',encoding:'base64',content:fs.readFileSync('js/balance/balance-document.js').toString('base64')};
  if(p.includes('/contents/')){const ref=new URL('https://mock'+p).searchParams.get('ref'),d=docs.get(ref);assert(d,'document '+ref);return {type:'file',encoding:'base64',sha:docBlobs.get(ref),content:Buffer.from(JSON.stringify(d)).toString('base64')};}
  if(p.includes('/compare/')){const [base,head]=p.split('/compare/')[1].split('...');let cursor=head;while(cursor&&cursor!==base)cursor=commits.get(cursor)?.parents[0]?.sha;return {status:head===base?'identical':cursor===base?'ahead':'diverged'};}
  if(p.includes('/commits?')){const branch=new URL('https://mock'+p).searchParams.get('sha'),rows=[];let cursor=refs[branch];while(cursor){rows.push(commits.get(cursor));cursor=commits.get(cursor).parents[0]?.sha;}return rows;}
  if(p.includes('/git/commits/')&&!o.method)return {tree:{sha:p.split('/').at(-1)}};
  if(p.endsWith('/git/blobs')){const id=sha(o.body.content);blobs.set(id,JSON.parse(o.body.content));return {sha:id};}
  if(p.endsWith('/git/trees')){const id=sha(JSON.stringify(o.body));trees.set(id,{data:blobs.get(o.body.tree[0].sha),blob:o.body.tree[0].sha});return {sha:id};}
  if(p.endsWith('/git/commits')){const id=sha(JSON.stringify(o.body));docs.set(id,trees.get(o.body.tree).data);docBlobs.set(id,trees.get(o.body.tree).blob);commits.set(id,{sha:id,commit:{message:o.body.message,committer:{date:new Date().toISOString()}},parents:o.body.parents.map(sha=>({sha}))});return {sha:id};}
  if(p.includes('/git/refs/heads/')){const branch=p.split('/').at(-1),next=o.body.sha;assert.equal(o.body.force,false);assert.equal(commits.get(next).parents[0].sha,refs[branch]);refs[branch]=next;return {object:{sha:next}};}
  throw Error('Unexpected API '+p);
 }
 return {api,docs,refs,commits};
}
test('real private UI + loopback HTTP: validate, preview commit/history, restore and pinned production promotion',{timeout:120000},async()=>{
 const git=gitFixture(),runtime=loadRuntime(process.cwd()),service=new ReleaseService({api:git.api,validate:d=>{runtime.ctx.doc=d;return JSON.parse(runtime.run('JSON.stringify(EmberwildBalanceDocument.validate(doc,validateBalanceConfig,exportableBalance()))'));}}),port=44318,server=createServer({service,port});
 await new Promise((resolve,reject)=>{server.on('error',reject);server.listen(port,'127.0.0.1',resolve);});
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}),page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:'+port);await page.evaluate(()=>{currentSection='releases';render();});
  await page.getByRole('button',{name:'取得線上版本',exact:true}).click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.snapshots['chatgpt-dev']);
  const original=git.refs['chatgpt-dev'],base=structuredClone(git.docs.get(original));
  await page.evaluate(doc=>{data=doc;data.items[0].cost+=1;markDirty();render();},base);
  await page.locator('#releaseMessage').fill('整合測試調整一項價格');await page.locator('#releasePreview').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.prepared);assert.equal(await page.locator('#release-edit-status').innerText(),'有未發布變更');
  await page.locator('#releaseConfirm').check();await page.locator('#releaseCommit').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.lastCommit);assert.notEqual(git.refs['chatgpt-dev'],original);assert.equal(git.docs.get(git.refs['chatgpt-dev']).items[0].cost,base.items[0].cost+1);
  await page.locator('#releaseHistory').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.history?.versions.length===2);
  await page.locator('#releaseMessage').fill('將已測試的價格版本升級正式版');await page.locator('#releasePromote').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.prepared?.sourceCommit);const testSource=git.refs['chatgpt-dev'];assert.equal(await page.locator('#releaseCommit').isDisabled(),true);
  await page.locator('#releaseProductionConfirm').fill('正式版');await page.locator('#releaseConfirm').check();await page.locator('#releaseCommit').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.lastCommit?.branch==='main');assert.deepEqual(git.docs.get(git.refs.main),git.docs.get(testSource));assert.match(git.commits.get(git.refs.main).commit.message,new RegExp('Source-Test-Commit: '+testSource));
  await page.evaluate(()=>{__EMBERWILD_RELEASE_EDITOR.state.target='chatgpt-dev';render();});await page.locator('#releaseHistory').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.history?.branch==='chatgpt-dev');
  await page.locator('details').filter({has:page.locator('[data-release-version="'+original+'"][data-action="restore"]')}).locator('summary').click();
  await page.locator('[data-release-version="'+original+'"][data-action="restore"]').click();await page.waitForFunction(()=>__EMBERWILD_RELEASE_EDITOR.state.prepared?.message.startsWith('restore'));
  await page.locator('#releaseConfirm').check();await page.locator('#releaseCommit').click();await page.waitForFunction(()=>!__EMBERWILD_RELEASE_EDITOR.state.prepared);
  // Every release passes the game validator, which fills defaults (such as item descriptions) the stored file may lack;
  // a restore therefore equals the original version as validated, with every original value kept.
  runtime.ctx.doc=base;const validatedBase=JSON.parse(runtime.run('JSON.stringify(EmberwildBalanceDocument.validate(doc,validateBalanceConfig,exportableBalance()))'));
  const filled=require('../js/balance/balance-diff.js').diff(base,validatedBase);assert.equal(filled.modified+filled.deleted,0,'validation only adds defaults');assert.deepEqual(git.docs.get(git.refs['chatgpt-dev']),validatedBase);assert.equal(git.docs.get(git.refs['chatgpt-dev']).items[0].cost,base.items[0].cost);assert.equal(git.commits.get(git.refs['chatgpt-dev']).parents[0].sha,testSource);assert.deepEqual(errors,[]);
  const response=await fetch('http://127.0.0.1:'+port+'/api/prepare',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401);
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
});
