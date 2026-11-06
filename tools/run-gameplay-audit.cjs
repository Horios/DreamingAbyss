/* Bounded runtime audit. Browser/editor requirements remain visible in results. */
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'tests');
const out=path.resolve(process.env.EMBERWILD_AUDIT_OUTPUT||path.join(root,'.audit-results'));
const match=process.env.EMBERWILD_AUDIT_MATCH?new RegExp(process.env.EMBERWILD_AUDIT_MATCH):null;
const concurrency=Math.max(1,Math.min(4,Number(process.env.EMBERWILD_AUDIT_CONCURRENCY)||4));
const files=fs.readdirSync(dir).filter(f=>f.endsWith('.test.cjs')).sort(),browser=[],queue=[];
for(const file of files){const text=fs.readFileSync(path.join(dir,file),'utf8');if(file.includes('.browser.')||/require\(['"](?:\.\/runtime\.cjs|playwright)['"]\)/.test(text))browser.push(file);else if(!match||match.test(file))queue.push(file);}
fs.mkdirSync(out,{recursive:true});
const results=[],started=new Date().toISOString(),children=new Set();let index=0;
function stop(child,signal='SIGTERM'){try{process.kill(process.platform==='win32'?child.pid:-child.pid,signal);}catch{}}
for(const [signal,code] of [['SIGINT',130],['SIGTERM',143]])process.once(signal,()=>{for(const child of children)stop(child,'SIGKILL');process.exit(code);});
async function run(file){
 const start=Date.now(),chunks=[],log=fs.createWriteStream(path.join(out,file+'.tap'));
 return new Promise(resolve=>{
  const child=spawn(process.execPath,['--test','--test-reporter=tap','--test-timeout=600000',path.join(dir,file)],{cwd:root,detached:process.platform!=='win32',env:{...process.env,NODE_PATH:process.env.NODE_PATH||process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||''},stdio:['ignore','pipe','pipe']});
  children.add(child);
  let timedOut=false,spawnError=null,forceTimer;
  const timeout=setTimeout(()=>{timedOut=true;stop(child);forceTimer=setTimeout(()=>stop(child,'SIGKILL'),3000);},file==='offline-exploration.test.cjs'?600000:120000);
  for(const stream of [child.stdout,child.stderr])stream.on('data',data=>{chunks.push(data.toString());log.write(data);});
  child.on('error',error=>{spawnError=error.message;});
  child.on('close',(code,signal)=>{children.delete(child);clearTimeout(timeout);clearTimeout(forceTimer);log.end();const text=chunks.join(''),count=name=>Number(text.match(new RegExp('^# '+name+' (\\d+)$','m'))?.[1]||0);
   const result={file,status:timedOut?'timeout':code===0&&!spawnError?(count('pass')===0&&count('skipped')>0?'skipped':'passed'):'failed',code,signal,error:spawnError,ms:Date.now()-start,tests:count('tests'),passed:count('pass'),failed:count('fail'),skipped:count('skipped')};results.push(result);console.log(result.status.toUpperCase(),file,`${result.passed}/${result.tests}`,`${result.ms}ms`);resolve();
  });
 });
}
async function worker(){while(index<queue.length){const file=queue[index++];await run(file);}}
(async()=>{await Promise.all(Array.from({length:concurrency},worker));const summary={started,finished:new Date().toISOString(),scope:'runtime/model; browser suites require a separate browser run',results:results.sort((a,b)=>a.file.localeCompare(b.file)),browserNotRun:browser};fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(summary,null,2));console.log('Result:',path.join(out,'summary.json'));process.exitCode=results.some(r=>!['passed','skipped'].includes(r.status))?1:0;})().catch(error=>{console.error(error);process.exitCode=1;});
