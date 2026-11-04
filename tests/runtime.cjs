const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
async function openRuntime(root,entry='index.html',storage={},options={}) {
  const browser=await chromium.launch({headless:true,args:['--no-sandbox'],...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage();
  const errors=[];
  if(options.clockTime){await page.clock.install({time:options.clockTime});await page.clock.pauseAt(options.clockTime);}
  page.on('pageerror',e=>errors.push(e.message));
  // The static test server has no release service; the editor's /api/ calls fail by design and are not page errors.
  page.on('console',m=>{if(m.type()!=='error')return;if(/^Failed to load resource/.test(m.text())&&/\/api\//.test(m.location()?.url||''))return;errors.push(m.text());});
  await page.route('http://localhost/**',async route=>{
    const url=new URL(route.request().url());
    const pathname=options.pathname?url.pathname.replace(options.pathname,'/'):url.pathname;
    const file=path.resolve(root,pathname==='/'?entry:'.'+decodeURIComponent(pathname));
    if(!file.startsWith(path.resolve(root)+path.sep))return route.fulfill({status:403,body:'Forbidden'});
    if(!fs.existsSync(file))return route.fulfill({status:404,body:'Not found'});
    await route.fulfill({status:200,body:fs.readFileSync(file),contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html'});
  });
  await page.addInitScript(({s,once})=>{
    // A recovery test must not re-inject corrupt fixtures on every reload:
    // otherwise it tests another forced corruption instead of the saved main.
    const marker='__emberwild_test_storage_seeded';
    if(once&&localStorage.getItem(marker)==='1')return;
    for(const [k,v] of Object.entries(s))localStorage.setItem(k,typeof v==='string'?v:JSON.stringify(v));
    if(once)localStorage.setItem(marker,'1');
  },{s:storage,once:options.seedStorageOnce===true});
  await page.goto('http://localhost'+(options.pathname||'/'),{waitUntil:'load',timeout:30000});
  async function waitForBoot(){
    if(entry!=='index.html'||!fs.existsSync(path.join(root,'data/balance.json')))return;
    const deadline=Date.now()+30000;
    while(Date.now()<deadline){if(await page.evaluate(()=>globalThis.__EMBERWILD_BALANCE_READY===true||globalThis.__EMBERWILD_BALANCE_LOAD_ERROR))return;await new Promise(resolve=>setTimeout(resolve,25));}
    throw Error('Published balance bootstrap timed out');
  }
  try{await waitForBoot();}catch(e){await browser.close();throw e;}
  for(const method of ['reload','goto']){const original=page[method].bind(page);page[method]=async(...args)=>{const result=await original(...args);await waitForBoot();return result;};}
  return {browser,page,errors};
}
async function openEditorSection(page,id){
  const button=page.locator('[data-sec="'+id+'"]');
  if(!await button.isVisible())await page.locator('.nav-group').filter({has:button}).locator('summary').click();
  await button.click();
}
async function installCompanionFixtures(page){
  const setup=()=>{
    globalThis.__testCloneCompanion=function(doc,id,name,sourceId=10){
      const p=structuredClone(doc.companions.find(p=>p.id===sourceId));
      p.id=id;p.name=name;p.availability='visible';p.unlockCondition={type:'initial'};
      delete p.names;delete p.role;
      EmberwildCompanionSkills.cloneSkills(doc,p);
      EmberwildCompanionSkills.clonePassives(doc,p);
      doc.companions.push(p);return p;
    };
  };
  await page.addInitScript(setup);await page.evaluate(setup);
}
// The preview no longer shows a balance JSON button (the developer mode owns imports);
// tests import through the same importBalanceJSON handler the button used.
async function importBalanceFile(page,name,buffer){
  return page.evaluate(({name,text})=>importBalanceJSON({target:{files:[new File([text],name,{type:'application/json'})],value:''}}),{name,text:Buffer.from(buffer).toString('utf8')});
}
module.exports={importBalanceFile,openRuntime,openEditorSection,installCompanionFixtures};
