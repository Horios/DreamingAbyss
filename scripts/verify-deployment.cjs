#!/usr/bin/env node
/* Proves that a Pages site serves one specific build. A finished workflow or a pushed commit is not that proof.

   node scripts/verify-deployment.cjs --url https://horios.github.io/DreamingAbyss/preview/ \
        --branch chatgpt-dev --commit <sha> --source <checkout of that commit> [--attempts 18 --interval 10]

   Checks, in order (the first one that fails names the layer):
   部署  data/build.json states this branch, this commit and the Git blob of this commit's data/balance.json
   載入  the served data/balance.json is that blob byte for byte and parses as JSON
   載入  the served manifest (when the source has one) equals the source manifest and its integrated hash
         matches the served data/balance.json
   載入  every script and stylesheet the served index.html references is the source file (so HTML, JS and
         data cannot come from different builds)
   The first two are retried until they pass or the attempts run out (Pages and its CDN need time).
   --json prints the result; a GitHub step summary is written when GITHUB_STEP_SUMMARY is set.
   Nothing is written to the repository or to the site. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const gitBlob=bytes=>crypto.createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex');
const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function fetchBytes(url,timeout=30000){
 const response=await fetch(url+(url.includes('?')?'&':'?')+'verify='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error('HTTP '+response.status);
 return Buffer.from(await response.arrayBuffer());
}
// Local files index.html references, without the cache-busting query.
function assets(html){
 const out=new Set();
 for(const m of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:data-balance-src|src|href)="([^"]+)"/g)){const f=m[1];if(/^(?:[a-z]+:)?\/\//i.test(f)||f.startsWith('data:')||f.startsWith('#'))continue;const clean=f.split(/[?#]/)[0];if(/\.(?:js|css)$/.test(clean))out.add(f);}
 return [...out];
}

async function verify({url,branch,commit,source,attempts=18,interval=10,log=()=>{}}){
 if(!url.endsWith('/'))url+='/';
 const result={url,branch,commit,ok:false,layer:null,attempts:0,checks:[]};
 const expected={blob:null};
 if(source){const file=path.join(source,'data/balance.json');if(!fs.existsSync(file))throw Error('來源沒有 data/balance.json：'+source);expected.blob=gitBlob(fs.readFileSync(file));}
 const check=(layer,name,ok,detail)=>{result.checks.push({layer,name,ok,detail});if(!ok&&!result.layer)result.layer=layer;return ok;};
 let served=null;
 for(let i=1;i<=attempts;i++){
  result.attempts=i;result.checks=[];result.layer=null;served=null;
  try{
   const build=JSON.parse((await fetchBytes(url+'data/build.json')).toString('utf8'));
   const wanted=expected.blob||build.balanceBlob;
   const buildOk=check('部署','build.json 的分支、commit 與資料 blob',build.branch===branch&&build.commit===commit&&(!expected.blob||build.balanceBlob===expected.blob),
    {served:build,expected:{branch,commit,balanceBlob:expected.blob}});
   if(buildOk){
    served=await fetchBytes(url+'data/balance.json');
    let parsed=true;try{JSON.parse(served.toString('utf8'));}catch{parsed=false;}
    check('載入','網站的 data/balance.json 與該 commit 的 blob 相同',parsed&&gitBlob(served)===wanted,{served:gitBlob(served),expected:wanted,bytes:served.length,json:parsed});
   }
  }catch(error){check('部署','讀取網站',false,{error:String(error.message||error)});}
  if(!result.layer)break;
  log('第 '+i+'／'+attempts+' 次：'+result.checks.filter(c=>!c.ok).map(c=>c.name).join('、')+' 尚未符合');
  if(i<attempts)await sleep(interval*1000);
 }
 if(result.layer)return result;
 if(source){
  const manifestFile=path.join(source,'data/balance/manifest.json');
  if(fs.existsSync(manifestFile)){
   try{
    const live=await fetchBytes(url+'data/balance/manifest.json'),local=fs.readFileSync(manifestFile);
    check('載入','模組清單與來源相同',live.equals(local),{served:sha256(live),expected:sha256(local)});
    check('載入','模組清單記錄的整合檔雜湊等於網站的 data/balance.json',JSON.parse(local).integrated?.sha256===sha256(served),{manifest:JSON.parse(local).integrated?.sha256,served:sha256(served)});
   }catch(error){check('載入','讀取模組清單',false,{error:String(error.message||error)});}
  }
  // The deployed preview index.html carries a banner, so it is not compared; what it loads is.
  try{
   const html=(await fetchBytes(url+'index.html')).toString('utf8'),localHtml=fs.readFileSync(path.join(source,'index.html'),'utf8');
   const live=assets(html),local=assets(localHtml),missing=local.filter(f=>!live.includes(f)),extra=live.filter(f=>!local.includes(f));
   check('載入','index.html 引用的程式與樣式（含快取參數）與來源相同',!missing.length&&!extra.length,{count:live.length,missing:missing.slice(0,10),extra:extra.slice(0,10)});
   const different=[];
   for(let i=0;i<live.length;i+=12)await Promise.all(live.slice(i,i+12).map(async f=>{
    const file=path.join(source,f.split(/[?#]/)[0]);
    try{const bytes=await fetchBytes(url+f);if(!fs.existsSync(file)||!bytes.equals(fs.readFileSync(file)))different.push(f);}catch(error){different.push(f+'（'+String(error.message||error)+'）');}
   }));
   check('載入','網站的程式與樣式檔內容與來源相同',!different.length,{count:live.length,different:different.slice(0,10)});
  }catch(error){check('載入','讀取 index.html',false,{error:String(error.message||error)});}
 }
 result.ok=!result.layer;
 return result;
}

function summary(r){
 const lines=['### 部署驗證：'+(r.ok?'通過':'未通過（'+r.layer+'）'),'',r.url,'','`'+r.branch+'` `'+r.commit+'`，第 '+r.attempts+' 次檢查','','| 層級 | 檢查 | 結果 |','|---|---|---|'];
 for(const c of r.checks)lines.push('| '+c.layer+' | '+c.name+' | '+(c.ok?'通過':'未通過 `'+JSON.stringify(c.detail).slice(0,300)+'`')+' |');
 lines.push('','遊戲內是否生效不在此檢查範圍，需實際開啟遊戲確認。');
 return lines.join('\n')+'\n';
}

async function main(){
 const args=process.argv.slice(2),opt=name=>{const i=args.indexOf('--'+name);return i<0?undefined:args[i+1];};
 const url=opt('url'),branch=opt('branch'),commit=opt('commit');
 if(!url||!branch||!/^[a-f0-9]{40}$/.test(commit||'')){console.error('用法：node scripts/verify-deployment.cjs --url <網站> --branch <分支> --commit <40 位 SHA> [--source <該 commit 的 checkout>] [--attempts N] [--interval 秒] [--json]');process.exit(2);}
 const r=await verify({url,branch,commit,source:opt('source'),attempts:Number(opt('attempts'))||18,interval:Number(opt('interval')??10),log:m=>console.error(m)});
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary(r));
 console.log(args.includes('--json')?JSON.stringify(r,null,2):summary(r));
 process.exit(r.ok?0:1);
}
if(require.main===module)main().catch(e=>{console.error(e);process.exit(1);});
module.exports={verify,assets,gitBlob,summary};
