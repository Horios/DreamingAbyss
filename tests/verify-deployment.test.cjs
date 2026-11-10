'use strict';
// The deployment check must fail unless the served site is the stated commit: build.json, the data file,
// the module manifest and every script index.html loads. Served from a local HTTP server; nothing external.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const {verify,assets,gitBlob,summary}=require('../scripts/verify-deployment.cjs');
const root=path.resolve(__dirname,'..'),commit='c'.repeat(40);
const source=fs.readFileSync(path.join(root,'data/balance.json'));

async function site(overrides={}){
 const hits=[];
 const server=http.createServer((req,res)=>{
  const file=decodeURIComponent(new URL(req.url,'http://x').pathname.replace(/^\/preview\//,''));hits.push(file);
  if(Object.prototype.hasOwnProperty.call(overrides,file)){const v=typeof overrides[file]==='function'?overrides[file]():overrides[file];if(v===null){res.writeHead(404);res.end();return;}res.writeHead(200);res.end(v);return;}
  const full=path.join(root,file);if(!full.startsWith(root)||!fs.existsSync(full)||fs.statSync(full).isDirectory()){res.writeHead(404);res.end();return;}
  res.writeHead(200);res.end(fs.readFileSync(full));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 return {url:'http://127.0.0.1:'+server.address().port+'/preview/',hits,close:()=>new Promise(r=>server.close(r))};
}
const build=(extra={})=>JSON.stringify({branch:'chatgpt-dev',commit,balanceBlob:gitBlob(source),...extra});
const run=(s,extra={})=>verify({url:s.url,branch:'chatgpt-dev',commit,source:root,attempts:1,interval:0,...extra});

test('index.html assets are listed with their cache parameters',()=>{
 const list=assets(fs.readFileSync(path.join(root,'index.html'),'utf8'));
 assert(list.length>100,'the game loads many scripts');assert(list.some(f=>f.startsWith('js/balance/balance-modules.js')));assert(list.some(f=>f.endsWith('.css')||f.includes('.css?')));
 assert.deepEqual(assets('<script src="https://cdn.example/x.js"></script><link href="css/a.css?v=1" rel="stylesheet"><script data-balance-src="js/b.js?v=2"></script>'),['css/a.css?v=1','js/b.js?v=2']);
});

test('a site serving exactly this commit passes every layer',async()=>{
 const s=await site({'data/build.json':build()});
 try{
  const r=await run(s);assert.equal(r.ok,true,JSON.stringify(r.checks.filter(c=>!c.ok)));assert.equal(r.layer,null);
  assert.deepEqual([...new Set(r.checks.map(c=>c.layer))],['部署','載入']);assert.equal(r.checks.length,6);
  assert(s.hits.includes('data/balance/manifest.json'));assert.match(summary(r),/部署驗證：通過/);
 }finally{await s.close();}
});

test('another commit or data blob in build.json fails at the deployment layer without reading further',async()=>{
 for(const wrong of [{commit:'d'.repeat(40)},{balanceBlob:'0'.repeat(40)},{branch:'main'}]){
  const s=await site({'data/build.json':build(wrong)});
  try{const r=await run(s);assert.equal(r.ok,false);assert.equal(r.layer,'部署');assert(!s.hits.includes('data/balance.json'));assert.match(summary(r),/未通過（部署）/);}finally{await s.close();}
 }
 const s=await site({'data/build.json':null});
 try{const r=await run(s);assert.equal(r.layer,'部署');assert.match(r.checks[0].detail.error,/404/);}finally{await s.close();}
});

test('a matching build.json with stale or broken data fails at the loading layer',async()=>{
 const stale=Buffer.from(source.toString('utf8').replace('"schema"','"schema" '));
 for(const data of [stale,Buffer.from('{not json')]){
  const s=await site({'data/build.json':build(),'data/balance.json':data});
  try{const r=await run(s);assert.equal(r.ok,false);assert.equal(r.layer,'載入');}finally{await s.close();}
 }
});

test('a stale manifest or a script from another build fails at the loading layer',async()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/balance/manifest.json'),'utf8'));
 let s=await site({'data/build.json':build(),'data/balance/manifest.json':JSON.stringify({...manifest,dataRevision:manifest.dataRevision+1})});
 try{const r=await run(s);assert.equal(r.layer,'載入');assert.equal(r.checks.find(c=>c.name.startsWith('模組清單與來源')).ok,false);}finally{await s.close();}
 s=await site({'data/build.json':build(),'js/balance/balance-modules.js':'/* older build */'});
 try{const r=await run(s);assert.equal(r.ok,false);const c=r.checks.find(x=>x.name.startsWith('網站的程式'));assert.equal(c.ok,false);assert.match(c.detail.different[0],/balance-modules\.js/);}finally{await s.close();}
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/(js\/balance\/balance-modules\.js)\?[^"]*/,'$1?v=old');
 s=await site({'data/build.json':build(),'index.html':html});
 try{const r=await run(s);assert.equal(r.checks.find(x=>x.name.startsWith('index.html')).ok,false,'a different cache parameter is a different build');}finally{await s.close();}
});

test('the check retries until the CDN serves the new build',async()=>{
 let n=0;const s=await site({'data/build.json':()=>++n<3?build({commit:'d'.repeat(40)}):build()});
 try{const r=await run(s,{attempts:5});assert.equal(r.ok,true);assert.equal(r.attempts,3);}finally{await s.close();}
});
