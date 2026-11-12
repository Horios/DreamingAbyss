#!/usr/bin/env node
'use strict';
/* 測試版（chatgpt-dev）與平衡器的完整測試流程。說明見 docs/FULL_TEST_FLOW.md。
   node scripts/full-test.cjs [--stage a,b] [--only <regex>] [--long] [--no-browser]
                              [--editor-root <path>] [--report <dir>] [--jobs <n>] [--list]
   每個項目各自一個行程；全部跑完才結束，任何失敗、逾時或「不該略過卻略過」都會讓結束碼為 1。 */
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn,execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),argv=process.argv.slice(2);
const flag=name=>argv.includes('--'+name),value=(name,fallback)=>{const i=argv.indexOf('--'+name);return i>=0&&argv[i+1]?argv[i+1]:fallback;};
const editorCandidates=[value('editor-root'),process.env.EMBERWILD_BALANCE_ROOT,path.join(root,'../Emberwild-Balance'),path.join(root,'../emberwild-balance'),path.join(root,'../DreamingAbyss-BalanceEditor'),path.join(root,'../dreamingabyss-balanceeditor')].filter(Boolean).map(p=>path.resolve(p));
const editor=editorCandidates.find(p=>fs.existsSync(path.join(p,'balance-editor.html')))||null;
const reportDir=path.resolve(value('report',path.join(root,'.audit-results/full-test')));
const cpus=os.cpus().length,jobs=Math.max(1,Number(value('jobs',Math.min(4,Math.max(1,cpus-1)))));
const only=value('only')?new RegExp(value('only')):null,stagesWanted=value('stage')?value('stage').split(','):null;
const MIN=60000;

/* 測試用相對路徑互相尋找：遊戲測試讀 ../Emberwild-Balance（平衡器）與 ../Emberwild-main（正式版 main 的 checkout），
   平衡器測試讀 ../DreamingAbyss。Node 會把符號連結解析成實際路徑，所以連結必須建在兩個倉庫實際所在的上層目錄。
   缺少時在這裡建立；已經存在的路徑不會被改動。 */
const provisioned=[],problems=[];
const gitOut=(dir,...args)=>{try{return execFileSync('git',['-C',dir,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();}catch{return null;}};
function sibling(parent,name,target,marker){
 const link=path.join(parent,name);
 if(fs.existsSync(link)){if(fs.existsSync(path.join(link,marker))&&(!target||fs.realpathSync(link)===fs.realpathSync(target)))return link;problems.push(link+' 已存在，但不是預期的'+(target?'目錄 '+target:'內容'));return null;}
 if(!target)return null;
 try{fs.symlinkSync(target,link,'dir');provisioned.push(link+' → '+target);return link;}catch(e){problems.push('無法建立 '+link+'：'+e.message);return null;}
}
function layout(){
 const game=fs.realpathSync(root),parent=path.dirname(game),out={game,editor:null,production:null};
 if(editor){
  const real=fs.realpathSync(editor);
  out.editor=sibling(parent,'Emberwild-Balance',real,'balance-editor.html')&&real;
  if(!(path.dirname(real)===parent&&path.basename(game)==='DreamingAbyss'))sibling(path.dirname(real),'DreamingAbyss',game,'index.html');
 }
 /* 正式版：兩個發布相容測試拿測試版資料去餵 main 的程式。沒有同層 checkout 時，從 origin/main 建立 git worktree。 */
 const main=path.join(parent,'Emberwild-main');
 if(fs.existsSync(path.join(main,'index.html')))out.production=main;
 else if(!fs.existsSync(main)){
  if(!gitOut(game,'rev-parse','--verify','-q','origin/main^{commit}'))gitOut(game,'fetch','--depth=1','origin','main:refs/remotes/origin/main');
  const ref=['origin/main','main'].find(r=>gitOut(game,'rev-parse','--verify','-q',r+'^{commit}'));
  if(ref&&gitOut(game,'worktree','add','--detach',main,ref)!==null){provisioned.push(main+'（git worktree，'+ref+'）');out.production=main;}
  else problems.push('無法建立正式版 checkout：'+main+'（需要 origin/main 或本機 main）');
 }else problems.push(main+' 已存在，但不是遊戲 checkout');
 return out;
}
const place=layout();
const chromium=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':'');
const modules=path.join(root,'node_modules'),hasPlaywright=fs.existsSync(path.join(modules,'playwright'));
const env={...process.env,EMBERWILD_BALANCE_ROOT:place.editor||'',EMBERWILD_EDITOR_ROOT:place.editor||'',EMBERWILD_GAME_ROOT:place.game,CODEX_PRIMARY_RUNTIME_NODE_MODULES:modules,NODE_PATH:modules,FORCE_COLOR:'0',NO_COLOR:'1'};
if(chromium&&!process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH&&fs.statSync(chromium).isFile())env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=chromium;

const list=(dir,test)=>fs.existsSync(dir)?fs.readdirSync(dir).filter(test).sort():[];
const nodeTest=(file,extra=[])=>['--test','--test-reporter=spec','--test-concurrency=1',...extra,file];
const steps=[];
const add=(stage,id,cwd,args,options={})=>steps.push({stage,id,cwd,cmd:options.cmd||process.execPath,args,timeout:options.timeout||10*MIN,nodeTest:args[0]==='--test',browser:!!options.browser,serial:!!options.serial,needsEditor:!!options.needsEditor,allowSkip:options.allowSkip||0,env:options.env||{}});

/* 1. 遊戲資料：模組來源、清單雜湊、產生檔與文件驗證 */
add('game-data','balance-modules check',place.game,['scripts/balance-modules.cjs','check','--allow-legacy-integrated']);
add('game-data','balance-modules validate --full',place.game,['scripts/balance-modules.cjs','validate','--full'],{timeout:20*MIN});
add('game-data','balance-modules affected --base HEAD^',place.game,['scripts/balance-modules.cjs','affected','--base','HEAD^','--head','HEAD']);
add('game-data','check-preview-version',place.game,['scripts/check-preview-version.cjs']);

/* 2. 遊戲 headless：tests/*.test.cjs（不含 .browser.） */
const gameTests=list(path.join(root,'tests'),f=>/\.test\.cjs$/.test(f));
const usesBrowser=file=>/\.browser\.test\.cjs$/.test(file)||/require\(['"]playwright['"]\)|require\(['"]\.\/runtime\.cjs['"]\)/.test(fs.readFileSync(path.join(root,'tests',file),'utf8'));
const usesEditor=file=>/Emberwild-Balance|EMBERWILD_(BALANCE|EDITOR)_ROOT|balance-editor\.html/.test(fs.readFileSync(path.join(root,'tests',file),'utf8'));
for(const file of gameTests){
 const browser=usesBrowser(file);
 add(browser?'game-browser':'game-headless','tests/'+file,place.game,nodeTest('tests/'+file),{browser,serial:browser,needsEditor:usesEditor(file),timeout:browser?15*MIN:20*MIN,env:browser?{EMBERWILD_PACE_REALTIME:'1'}:{}});
}

/* 3. 平衡器：與遊戲的契約、headless、瀏覽器工作台、部署產物 */
if(place.editor){
 /* --strict：平衡器記錄的遊戲 commit 必須等於這次受測的遊戲 commit，落後時先執行平衡器的 node scripts/sync-game.cjs */
 add('editor-contract','check-game-sync --strict',place.editor,['scripts/check-game-sync.cjs','--strict'],{needsEditor:true});
 add('editor-contract','tests/preview-compatibility.test.cjs',place.editor,nodeTest('tests/preview-compatibility.test.cjs'),{needsEditor:true});
 add('editor-build','build-online',place.editor,['scripts/build-online.cjs'],{needsEditor:true});
 for(const file of list(path.join(place.editor,'tests'),f=>/\.test\.(cjs|mjs)$/.test(f)&&f!=='preview-compatibility.test.cjs'))add('editor-headless','tests/'+file,place.editor,nodeTest('tests/'+file),{needsEditor:true});
 for(const file of list(path.join(place.editor,'tests'),f=>/\.browser\.cjs$/.test(f)))add('editor-browser','tests/'+file,place.editor,['tests/'+file],{browser:true,serial:true,needsEditor:true});
 add('editor-browser','scripts/audit-seconds-browser.cjs',place.editor,['scripts/audit-seconds-browser.cjs'],{browser:true,serial:true,needsEditor:true});
 add('editor-browser','scripts/bench-incremental.cjs',place.editor,['scripts/bench-incremental.cjs'],{browser:true,serial:true,needsEditor:true});
 /* 驗證讀取 build.sh 的輸出，兩步必須依序執行 */
 add('editor-artifact','build.sh + validate-artifact',place.editor,['-c','bash scripts/build.sh && node scripts/validate-artifact.mjs'],{cmd:'bash',needsEditor:true});
}

/* 4. 長時間模擬（--long）：正式戰鬥、裝備取得與離線結算 */
if(flag('long')){
 add('long','tests/progression-simulation.cjs',place.game,['tests/progression-simulation.cjs'],{timeout:60*MIN,browser:true,serial:true,needsEditor:true});
 add('long','tests/equipment-acquisition-simulation.cjs',place.game,['tests/equipment-acquisition-simulation.cjs'],{timeout:60*MIN});
 add('long','tests/offline-fast-validation.cjs',place.game,['tests/offline-fast-validation.cjs'],{timeout:60*MIN});
 add('long','tests/realtime-combat-validation.cjs',place.game,['tests/realtime-combat-validation.cjs'],{timeout:60*MIN});
}

const order=['game-data','game-headless','game-browser','editor-contract','editor-build','editor-headless','editor-browser','editor-artifact','long'];
const selected=steps.filter(s=>(!stagesWanted||stagesWanted.includes(s.stage))&&(!only||only.test(s.stage+' '+s.id))&&!(flag('no-browser')&&s.browser));
if(flag('list')){for(const s of selected)console.log(s.stage.padEnd(16)+s.id);console.log(selected.length+' 個項目');process.exit(0);}

const count=(text,label)=>{const all=[...text.matchAll(new RegExp('^(?:ℹ|#) '+label+' (\\d+)$','gm'))];return all.length?Number(all[all.length-1][1]):null;};
function run(step){return new Promise(resolve=>{
 const started=Date.now(),log=path.join(reportDir,'logs',(step.stage+'__'+step.id).replace(/[^\w.-]+/g,'_')+'.log');
 let output='',timedOut=false;
 const child=spawn(step.cmd,step.args,{cwd:step.cwd,env:{...env,...step.env},detached:true,stdio:['ignore','pipe','pipe']});
 const kill=()=>{try{process.kill(-child.pid,'SIGKILL');}catch{}};
 const timer=setTimeout(()=>{timedOut=true;kill();},step.timeout);
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
 child.on('error',e=>{output+='\n'+e.stack;});
 child.on('close',code=>{
  clearTimeout(timer);kill();fs.writeFileSync(log,output);
  const result={stage:step.stage,id:step.id,code,timedOut,seconds:Math.round((Date.now()-started)/100)/10,log:path.relative(reportDir,log)};
  if(step.nodeTest)Object.assign(result,{tests:count(output,'tests'),pass:count(output,'pass'),fail:count(output,'fail'),skipped:count(output,'skipped'),cancelled:count(output,'cancelled')});
  /* 有平衡器時，略過的測試代表沒有真的驗證到；允許的略過數寫在項目上 */
  result.status=timedOut?'timeout':code!==0?'fail':step.nodeTest&&result.tests===0?'empty':step.nodeTest&&(result.skipped||0)>step.allowSkip?'skipped':'pass';
  resolve(result);
 });
});}

async function main(){
 fs.rmSync(reportDir,{recursive:true,force:true});fs.mkdirSync(path.join(reportDir,'logs'),{recursive:true});
 const git=(dir,...args)=>{try{return execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim();}catch{return 'unknown';}};
 const version=JSON.parse(fs.readFileSync(path.join(root,'data/preview-version.json'),'utf8')).version;
 const meta={startedAt:new Date().toISOString(),node:process.version,game:{commit:git(root,'rev-parse','HEAD'),version,dirty:git(root,'status','--porcelain')!==''},editor:editor?{path:editor,commit:git(editor,'rev-parse','HEAD'),dirty:git(editor,'status','--porcelain')!==''}:null,production:place.production?{path:place.production,commit:git(place.production,'rev-parse','HEAD')}:null,chromium:env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'(playwright default)',jobs,provisioned};
 console.log('遊戲 '+meta.game.version+' @'+meta.game.commit.slice(0,7)+(meta.game.dirty?'（有未提交變更）':'')+'；平衡器 '+(editor?'@'+meta.editor.commit.slice(0,7)+(meta.editor.dirty?'（有未提交變更）':''):'找不到（需要平衡器的項目會失敗）')+'；正式版 '+(meta.production?'@'+meta.production.commit.slice(0,7):'找不到')+'；'+selected.length+' 個項目，平行 '+jobs);
 const blocked=[];
 if(!editor)blocked.push('找不到平衡器：設定 EMBERWILD_BALANCE_ROOT 或 --editor-root');
 if(!hasPlaywright&&selected.some(s=>s.browser))blocked.push('沒有 node_modules/playwright：先執行 npm ci');
 blocked.push(...problems);
 for(const line of provisioned)console.log('＋ 建立 '+line);
 for(const line of blocked)console.log('⚠ '+line);
 const status=dir=>dir?(gitOut(dir,'status','--porcelain')||'').split('\n').filter(Boolean):[],before={game:status(root),editor:status(editor)};
 const results=[];let done=0;
 const report=r=>{results.push(r);done++;const mark={pass:'✔',fail:'✖',timeout:'⏱',skipped:'⚠',empty:'⚠'}[r.status];if(r.status!=='pass'||flag('verbose'))console.log(mark+' ['+done+'/'+selected.length+'] '+r.stage+' · '+r.id+' → '+r.status+(r.tests!=null?' ('+r.pass+'/'+r.tests+(r.skipped?'，略過 '+r.skipped:'')+')':'')+' '+r.seconds+'s');else if(done%20===0)console.log('… '+done+'/'+selected.length);};
 for(const stage of order){
  const queue=selected.filter(s=>s.stage===stage);if(!queue.length)continue;
  console.log('── '+stage+'（'+queue.length+'）');
  const serial=queue.filter(s=>s.serial),parallel=queue.filter(s=>!s.serial);
  /* build-online 產生其他平衡器測試要讀的檔案；瀏覽器項目依序跑，避免互搶 CPU 造成逾時誤判 */
  await Promise.all(Array.from({length:Math.min(jobs,parallel.length)},async()=>{for(let s;(s=parallel.shift());)report(await run(s));}));
  const browserJobs=Math.max(1,Math.min(Number(value('browser-jobs',2)),jobs));
  await Promise.all(Array.from({length:Math.min(browserJobs,serial.length)},async()=>{for(let s;(s=serial.shift());)report(await run(s));}));
 }
 results.sort((a,b)=>order.indexOf(a.stage)-order.indexOf(b.stage)||a.id.localeCompare(b.id));
 const bad=results.filter(r=>r.status!=='pass'),sum=key=>results.reduce((n,r)=>n+(r[key]||0),0);
 const touched=[...status(root).filter(l=>!before.game.includes(l)).map(l=>'遊戲 '+l.trim()),...status(editor).filter(l=>!before.editor.includes(l)).map(l=>'平衡器 '+l.trim())];
 meta.finishedAt=new Date().toISOString();meta.changedByRun=touched;meta.totals={items:results.length,passed:results.length-bad.length,notPassed:bad.length,tests:sum('tests'),testPass:sum('pass'),testFail:sum('fail'),testSkipped:sum('skipped')};
 fs.writeFileSync(path.join(reportDir,'results.json'),JSON.stringify({meta,blocked,results},null,1)+'\n');
 const rows=list=>list.map(r=>'| '+r.stage+' | `'+r.id+'` | '+r.status+' | '+(r.tests!=null?r.pass+'/'+r.tests:'—')+' | '+(r.skipped||0)+' | '+r.seconds+' |').join('\n');
 const head='| 階段 | 項目 | 結果 | 通過/總數 | 略過 | 秒 |\n|---|---|---|---|---|---|\n';
 const byStage=order.map(stage=>{const rs=results.filter(r=>r.stage===stage);return rs.length?'| '+stage+' | '+rs.length+' | '+rs.filter(r=>r.status==='pass').length+' | '+rs.filter(r=>r.status!=='pass').length+' | '+rs.reduce((n,r)=>n+(r.tests||0),0)+' | '+Math.round(rs.reduce((n,r)=>n+r.seconds,0))+' |':null;}).filter(Boolean).join('\n');
 fs.writeFileSync(path.join(reportDir,'REPORT.md'),'# 完整測試結果\n\n- 遊戲：'+meta.game.version+' `'+meta.game.commit+'`'+(meta.game.dirty?'（有未提交變更）':'')+'\n- 平衡器：'+(editor?'`'+meta.editor.commit+'`'+(meta.editor.dirty?'（有未提交變更）':''):'找不到')+'\n- 正式版（Emberwild-main）：'+(meta.production?'`'+meta.production.commit+'`':'找不到')+'\n- Node '+meta.node+'；'+meta.startedAt+' → '+meta.finishedAt+'\n- 項目 '+meta.totals.items+'：通過 '+meta.totals.passed+'，未通過 '+meta.totals.notPassed+'；測試案例 '+meta.totals.tests+'（通過 '+meta.totals.testPass+'，失敗 '+meta.totals.testFail+'，略過 '+meta.totals.testSkipped+'）\n- 執行期間被改動的檔案：'+(touched.length?touched.map(x=>'`'+x+'`').join('、'):'無')+'\n\n## 各階段\n\n| 階段 | 項目 | 通過 | 未通過 | 測試案例 | 秒 |\n|---|---|---|---|---|---|\n'+byStage+'\n\n## 未通過\n\n'+(bad.length?head+rows(bad):'無')+'\n\n## 全部項目\n\n'+head+rows(results)+'\n');
 console.log('\n項目 '+results.length+'：通過 '+(results.length-bad.length)+'，未通過 '+bad.length+'；測試案例 '+meta.totals.tests+'，略過 '+meta.totals.testSkipped);
 for(const r of bad)console.log('  '+r.status.padEnd(8)+r.stage+' · '+r.id+'  → '+path.join(reportDir,r.log));
 if(touched.length)console.log('執行期間被改動的檔案（產生檔，提交前請確認）：'+touched.join('、'));
 console.log('報告：'+path.join(reportDir,'REPORT.md'));
 process.exit(bad.length||blocked.length?1:0);
}
main().catch(error=>{console.error(error);process.exit(2);});
