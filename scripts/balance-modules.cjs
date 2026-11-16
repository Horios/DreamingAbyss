#!/usr/bin/env node
/* Modular balance sources: split, build, check, resync, affected, validate, refs, bench.
   data/balance/<module>.json are the edited sources; data/balance.json is generated from them.

   node scripts/balance-modules.cjs check                 sources, manifest and data/balance.json agree
   node scripts/balance-modules.cjs build                 regenerate manifest + data/balance.json from the modules
   node scripts/balance-modules.cjs split                 first split of data/balance.json (refuses to overwrite modules)
   node scripts/balance-modules.cjs resync                re-split after a legacy publisher wrote data/balance.json only
   node scripts/balance-modules.cjs affected --base REF   changed modules, change kinds and the tests they need
   node scripts/balance-modules.cjs validate --base REF   incremental validation of the changes (or --full)
   node scripts/balance-modules.cjs refs monster map0_mob0 which records reference an id
   node scripts/balance-modules.cjs bench                 incremental vs full timings for one monster HP edit */
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),M=require('../js/balance/balance-modules.js');
const sourceDir=path.join(root,M.SOURCE_DIR),manifestFile=path.join(root,M.MANIFEST_FILE),integratedFile=path.join(root,M.INTEGRATED_FILE);
const sha256=text=>crypto.createHash('sha256').update(text).digest('hex'),bytes=text=>Buffer.byteLength(text);
const args=process.argv.slice(2),command=args[0],flag=name=>args.includes(name),option=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const git=(...a)=>cp.execFileSync('git',['-C',root,...a],{encoding:'utf8',maxBuffer:1<<28,stdio:['ignore','pipe','pipe']});
const show=(ref,file)=>{try{return git('show',ref+':'+file);}catch{return null;}};
class Failure extends Error{constructor(lines){super(lines.join('\n'));this.lines=lines;}}

function readSources(read=file=>fs.existsSync(path.join(root,file))?fs.readFileSync(path.join(root,file),'utf8'):null){
 const manifestText=read(M.MANIFEST_FILE),errors=[];
 if(manifestText===null)return {missing:true};
 let manifest;try{manifest=JSON.parse(manifestText);}catch(e){throw new Failure([M.MANIFEST_FILE+' 無法解析：'+e.message]);}
 errors.push(...M.checkManifest(manifest).map(x=>M.MANIFEST_FILE+'：'+x));
 const modules={},texts={};
 for(const row of manifest.modules||[]){
  const m=M.module(row.id);if(!m)continue;
  const file=M.SOURCE_DIR+'/'+m.file,text=read(file);
  if(row.present===false){if(text!==null)errors.push(file+'：manifest 記錄為不存在，但檔案存在');continue;}
  if(text===null){errors.push(file+'：必要模組遺失（'+m.title+'）');continue;}
  texts[m.id]=text;
  try{modules[m.id]=JSON.parse(text);}catch(e){errors.push(file+'：JSON 無法解析：'+e.message);continue;}
  if(M.serialize(modules[m.id])!==text)errors.push(file+'：格式不是標準輸出（請執行 build）');
  if(row.sha256!==sha256(text))errors.push(file+'：內容雜湊與 manifest 不符（模組 '+m.id+' 版本 '+row.version+'）');
 }
 return {manifest,modules,texts,errors};
}
function writeSources(doc,previous){
 const {layout,modules}=M.split(doc),hashes={},written=[];
 for(const m of M.MODULES){
  const file=path.join(sourceDir,m.file),value=modules[m.id];
  if(value===undefined){if(fs.existsSync(file)){fs.rmSync(file);written.push(m.file+'（移除）');}continue;}
  const text=M.serialize(value);hashes[m.id]={sha256:sha256(text),bytes:bytes(text)};
  if(!fs.existsSync(file)||fs.readFileSync(file,'utf8')!==text){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);written.push(m.file);}
 }
 const integrated=M.serialize(M.assemble(modules,layout));
 if(integrated!==M.serialize(doc))throw new Failure(['重新整合結果與來源文件不一致，已停止寫入整合檔']);
 if(!fs.existsSync(integratedFile)||fs.readFileSync(integratedFile,'utf8')!==integrated){fs.writeFileSync(integratedFile,integrated);written.push(M.INTEGRATED_FILE);}
 const manifest=M.createManifest({layout,hashes,integrated:{sha256:sha256(integrated),bytes:bytes(integrated)},previous});
 const text=M.serialize(manifest);if(!fs.existsSync(manifestFile)||fs.readFileSync(manifestFile,'utf8')!==text){fs.writeFileSync(manifestFile,text);written.push('manifest.json');}
 return {written,manifest};
}
function assembleSources(src){
 if(src.missing)throw new Failure(['找不到 '+M.MANIFEST_FILE+'；請先執行 split']);
 if(src.errors.length)throw new Failure(src.errors);
 try{return M.assemble(src.modules,src.manifest.layout);}catch(e){throw new Failure([(e.module?M.SOURCE_DIR+'/'+e.module+'.json：':'')+e.message]);}
}
function check({allowLegacyIntegrated=false}={}){
 const src=readSources(),doc=assembleSources(src),text=M.serialize(doc),lines=[];
 const integrated=fs.readFileSync(integratedFile,'utf8');
 const listed=new Set(M.MODULES.map(m=>m.file));
 for(const file of walkFiles(sourceDir))if(file!=='manifest.json'&&!listed.has(file))lines.push(M.SOURCE_DIR+'/'+file+'：不屬於任何模組的檔案（同一資料不得在多處維護）');
 if(src.manifest.integrated.sha256!==sha256(text))lines.push('manifest 記錄的整合檔雜湊與模組重新整合結果不符（請執行 build）');
 let legacy=false;
 if(integrated!==text){
  let d;try{d=JSON.parse(integrated);}catch{}
  const diff=d?M.changes(doc,d).map(p=>p.join('.')||'(root)'):['(無法解析)'];
  const message=M.INTEGRATED_FILE+' 與來源模組不一致：'+diff.slice(0,8).join('、')+(diff.length>8?' 等 '+diff.length+' 處':'')+'。整合檔只能由 build 產生；若是舊版發布器直接寫入，請執行 resync 將變更拆回模組。';
  // Tolerated only for a commit shaped like the legacy publisher's (it writes data/balance.json and nothing else),
  // so the game keeps deploying until resync; any other commit editing the generated file fails.
  let legacyShape=false;try{legacyShape=git('diff','--name-only','HEAD^','HEAD').split('\n').filter(Boolean).every(f=>f===M.INTEGRATED_FILE||f==='data/preview-version.json');}catch{}
  if(allowLegacyIntegrated&&legacyShape&&d&&sha256(integrated)!==src.manifest.integrated.sha256&&!lines.length){legacy=true;warn(message);}
  else lines.push(message);
 }
 if(lines.length)throw new Failure(lines);
 return {modules:Object.keys(src.modules).length,dataRevision:src.manifest.dataRevision,legacy};
}
function walkFiles(dir,base=''){if(!fs.existsSync(dir))return [];const out=[];for(const e of fs.readdirSync(dir,{withFileTypes:true})){const rel=base?base+'/'+e.name:e.name;if(e.isDirectory())out.push(...walkFiles(path.join(dir,e.name),rel));else out.push(rel);}return out.sort();}
function warn(message){if(process.env.GITHUB_ACTIONS)console.log('::warning title=平衡模組::'+message.replace(/\n/g,'%0A'));else console.warn('警告：'+message);}

// ---- change analysis -------------------------------------------------------------------------------
const ALWAYS=['tests/balance-modules.test.cjs','tests/balance-document.test.cjs'];
// Test files that read a module's data, found by the data paths they mention. Patterns follow the data, not file names.
const PATTERNS={
 'meta/document':/schemaVersion|timeUnits|masteryTypes|teamSettings/,'meta/reference':null,'meta/notes':null,'meta/balance-settings':/balanceSettings\.meta|TimingVersion|ExplorationVersion/,
 'interface/presentation':/uiText|textStyles|skillIcons|iconColorTemplates/,'interface/navigation':/navigation\b/,
 'world/maps':/maps\.catalog|levelRanges/,'world/monsters':/monsters\.catalog|monsterDesign|bossMeter/,'world/drops':/drops\.entries|dropRule/,'world/difficulty':/difficulty\.modes|materialChance/,
 'combat/rules':/balanceSettings\.combat|combat\.seconds/,'combat/skill-settings':/balanceSettings\.skills/,'combat/skills':/skillSystem\.definitions/,'combat/skill-system':/skillSystem\.(?:classRules|equipment|gems)|gemSlotRule/,'combat/statuses':/statusDefinitions/,
 'characters/classes':/[.\b]classes\[|\.classes\b|growthPerLevel/,'characters/support-skills':/supportSkills/,'characters/progression':/balanceSettings\.progression|xpCurve|levelCaps/,'characters/companions':/\.companions\b|recruitCompanion/,'characters/passives':/passiveDefinitions/,'characters/companion-settings':/companionTokens|companionSettings/,
 'equipment/forms':/equipmentForms/,'equipment/affix-pools':/balance\.affixes|poolBySlotRank/,'equipment/power-system':/equipmentPowerSystem/,'equipment/settings':/balanceSettings\.equipment/,
 'items/items':/\.items\b|healPotion/,'items/inventory-icons':/inventoryIcons/,'items/starter-packs':/starterPack/,
 'systems/economy':/balanceSettings\.economy|materialPrices/,'systems/rewards':/balanceSettings\.rewards|regionVouchers/,'systems/quests':/balanceSettings\.quests|quests\.design/,'systems/story':/\.story\b|EmberwildStory/,'systems/shop':/shopSettings/,'systems/life-skills':/lifeSkills/,'systems/wishing-lake':/wishingLake/
};
// Tests the regression gate runs (headless vs browser), parsed from the workflow so the two lists cannot drift.
function gateTests(){
 const yml=['test-skill-gems.yml','regression-nightly.yml'].map(f=>fs.readFileSync(path.join(root,'.github/workflows',f),'utf8')).join('\n'),all=new Set(yml.match(/tests\/[\w.-]+\.test\.cjs/g)||[]);
 return [...all].filter(f=>fs.existsSync(path.join(root,f))).sort();
}
const isBrowser=file=>/\.browser\.test\.cjs$/.test(file)||/require\(['"]\.\/runtime\.cjs['"]\)|openRuntime\(/.test(fs.readFileSync(path.join(root,file),'utf8'));
function testsFor(modules){
 const pool=gateTests(),out=new Map();
 for(const id of modules){const re=PATTERNS[id];if(!re)continue;for(const f of pool){if(out.has(f))continue;if(re.test(fs.readFileSync(path.join(root,f),'utf8')))out.set(f,id);}}
 return out;
}
function changedFiles(base,head){
 const list=head?git('diff','--name-only',base,head):git('diff','--name-only',base);
 const untracked=head?'':git('ls-files','--others','--exclude-standard');
 return [...new Set((list+'\n'+untracked).split('\n').filter(Boolean))].sort();
}
function readAt(ref){return ref?readSources(file=>show(ref,file)):readSources();}
function analyse({base='HEAD',head=null}={}){
 const files=changedFiles(base,head),reasons=[],dataOnly=files.every(f=>f.startsWith(M.SOURCE_DIR+'/')||f===M.INTEGRATED_FILE||f==='data/preview-version.json');
 const report={base,head:head||'(working tree)',files,scope:'none',modules:[],changes:[],tests:{headless:[],browser:[]},selection:[],reasons};
 if(!files.length){reasons.push('沒有任何檔案變更');return report;}
 if(!dataOnly){report.scope='full';reasons.push('程式、測試或流程檔案有變更：'+files.filter(f=>!f.startsWith('data/')).slice(0,6).join('、')+'；執行完整回歸');return report;}
 let before,after;
 try{after=readAt(head);before=readAt(base);}catch(e){report.scope='full';reasons.push('無法讀取模組：'+e.message+'；擴大為完整驗證');return report;}
 if(after.missing||before.missing){report.scope='full';reasons.push('基準或目前版本缺少 manifest（首次拆分或舊版資料）；執行完整驗證');return report;}
 if(after.errors.length){report.scope='full';reasons.push('模組來源未通過一致性檢查：'+after.errors[0]+'；擴大為完整驗證');return report;}
 if(JSON.stringify(before.manifest.layout)!==JSON.stringify(after.manifest.layout)||before.manifest.formatVersion!==after.manifest.formatVersion||before.manifest.modules.map(m=>m.id+m.file).join()!==after.manifest.modules.map(m=>m.id+m.file).join()){report.scope='full';reasons.push('manifest 結構（模組清單、檔案或頂層順序）改變；執行完整驗證');return report;}
 const b=assembleSources(before),a=assembleSources(after),changed=[];
 const integratedText=head?show(head,M.INTEGRATED_FILE):fs.readFileSync(integratedFile,'utf8');
 if(integratedText!==M.serialize(a)){report.scope='full';reasons.push('data/balance.json 與模組來源不一致（舊版發布器只寫入整合檔），無法由模組判定影響範圍；執行完整回歸');return report;}
 for(const m of M.MODULES){if(before.texts[m.id]===after.texts[m.id])continue;changed.push(m.id);}
 const paths=[];for(const id of changed)for(const p of M.modulePaths(id,a).concat(M.modulePaths(id,b)).filter((x,i,l)=>l.indexOf(x)===i))paths.push(...M.changes(M.get(b,p),M.get(a,p),p));
 const classified=M.classify(paths,{before:b,after:a});
 report.modules=changed;report.changes=classified;report.scope=changed.length?'data':'none';
 if(!changed.length){reasons.push(files.includes(M.INTEGRATED_FILE)?'只有整合檔變更（需由 check 驗證一致性）':'模組內容沒有變更');}
 const keyModules=new Set(classified.filter(c=>c.kind!=='value').flatMap(c=>c.modules));
 const widened=new Set(changed);for(const id of keyModules)for(const dep of M.dependents(id))widened.add(dep);
 for(const id of changed)reasons.push(id+'：'+(keyModules.has(id)?'修改了被其他模組讀取的欄位或記錄結構，加入依賴它的模組：'+(M.dependents(id).join('、')||'無'):'只修改一般欄位，不影響其他模組'));
 const selected=testsFor([...widened]);
 for(const f of ALWAYS)if(!selected.has(f))selected.set(f,'(必要)');
 for(const [f,id] of [...selected].sort()){report.selection.push({test:f,because:id});(isBrowser(f)?report.tests.browser:report.tests.headless).push(f);}
 report.widened=[...widened].sort();report.keyChanges=[...keyModules].sort();
 return report;
}
// ---- incremental validation -------------------------------------------------------------------------
function loadValidators(){
 for(const f of ['js/combat/seconds-schema.js','js/skills/skill-system-model.js','js/world/wishing-lake-model.js','js/story/story-model.js','js/ui/inventory-icon-model.js'])try{require(path.join(root,f));}catch{}
 return require('../js/balance/balance-document.js');
}
function validate({base='HEAD',full=false}={}){
 const D=loadValidators(),src=readAt(null),after=assembleSources(src);
 let t0=process.hrtime.bigint(),issues,scopeInfo={};
 if(full){const report={};issues=D.inspect(after,{report});scopeInfo={blocks:report.blocks,changes:'全部'};}
 else{
  const prev=readAt(base);
  if(prev.missing){const r=validate({full:true});return {...r,note:'基準版本沒有模組清單，改為完整驗證'};}
  // A module added after the base (new top-level setting): the base cannot be split the new way, so check everything.
  if(prev.errors.some(e=>/manifest 缺少模組/.test(e))){const r=validate({full:true});return {...r,note:'基準版本之後新增了模組，改為完整驗證'};}
  const before=assembleSources(prev);t0=process.hrtime.bigint();
  const changed=M.MODULES.filter(m=>prev.texts[m.id]!==src.texts[m.id]).map(m=>m.id);
  const paths=[];for(const id of changed)for(const p of new Set(M.modulePaths(id,after).concat(M.modulePaths(id,before))))paths.push(...M.changes(M.get(before,p),M.get(after,p),p));
  const report={},classified=M.classify(paths,{before,after});issues=paths.length?D.inspect(after,{scope:M.scope(paths),report}):[];
  // References: a value-only change checks the references its own module holds; a key or structural change also
  // checks every module that references it.
  const keyed=new Set(classified.filter(c=>c.kind!=='value').flatMap(c=>c.modules)),ruleModules=new Set();
  for(const id of changed){ruleModules.add(id);if(keyed.has(id))M.dependents(id).forEach(x=>ruleModules.add(x));}
  const rules=M.REFERENCES.filter(r=>changed.includes(r.from)||keyed.has(r.to)&&ruleModules.has(r.from));
  const located=new Set(issues.map(x=>x.field));
  for(const r of M.referenceIndex(after,{rules}).broken())if(!located.has(r.path.replace(/\.\d+$/,''))&&!located.has(r.path))issues.push({system:M.module(r.module).title,object:r.owner||'',field:r.path,reason:r.label+'引用不存在的'+r.kind+'：'+r.id,module:r.module});
  scopeInfo={modules:changed,changes:paths.length,blocks:[...(report.blocks||[]),'references('+rules.map(r=>r.id).join(',')+')'],kinds:classified.map(c=>c.kind)};
 }
 const ms=Number(process.hrtime.bigint()-t0)/1e6;
 return {issues:issues.map(x=>({...x,module:x.module||moduleOfField(x.field)})),ms,...scopeInfo};
}
function moduleOfField(field){try{const m=M.moduleForPath(field);return Array.isArray(m)?m[0]:m;}catch{return null;}}
// ---- benchmark --------------------------------------------------------------------------------------
function bench(){
 const D=loadValidators(),Diff=require('../js/balance/balance-diff.js'),text=fs.readFileSync(integratedFile,'utf8'),runs=Number(option('--runs',5));
 const time=fn=>{const xs=[];let out;for(let i=0;i<runs;i++){const t=process.hrtime.bigint();out=fn();xs.push(Number(process.hrtime.bigint()-t)/1e6);}xs.sort((a,b)=>a-b);return {ms:+xs[Math.floor(xs.length/2)].toFixed(2),out};};
 const base=JSON.parse(text),index=base.balanceSettings.monsters.catalog.findIndex(m=>m.kind==='normal'),edited=structuredClone(base);
 const field=Object.keys(edited.balanceSettings.monsters.catalog[index]).find(k=>/hpMultiplier/.test(k));
 edited.balanceSettings.monsters.catalog[index][field]=Number((edited.balanceSettings.monsters.catalog[index][field]*1.1).toFixed(4));
 const moduleText=fs.readFileSync(path.join(sourceDir,'world/monsters.json'),'utf8');
 const results={edit:'balanceSettings.monsters.catalog.'+index+'.'+field,modulesTotal:M.MODULES.length,
  full:{
   open:time(()=>JSON.parse(text)).ms,
   validate:time(()=>{const r={};D.inspect(edited,{report:r});return r.blocks;}),
   diff:time(()=>Diff.diff(base,edited).total),
   save:time(()=>JSON.stringify(edited,null,2).length).ms,
   prepare:time(()=>{const c=structuredClone(edited);return JSON.stringify(c).length;}).ms,
   modulesProcessed:M.MODULES.length
  },
  incremental:{
   open:time(()=>JSON.parse(moduleText)).ms,
   validate:time(()=>{const p=M.changes(base.balanceSettings.monsters,edited.balanceSettings.monsters,'balanceSettings.monsters');const r={};D.inspect(edited,{scope:M.scope(p),report:r});return {paths:p.map(x=>x.join('.')),blocks:r.blocks,kind:M.classify(p,{before:base,after:edited}).map(c=>c.kind)};}),
   diff:time(()=>Diff.diff(base.balanceSettings.monsters.catalog[index],edited.balanceSettings.monsters.catalog[index]).total),
   save:time(()=>M.serialize(edited.balanceSettings.monsters).length).ms,
   prepare:time(()=>{const s=M.serialize(edited.balanceSettings.monsters);return sha256(s);}).ms,
   modulesProcessed:1
  }};
 results.full.validate={ms:results.full.validate.ms,blocks:results.full.validate.out};results.full.diff={ms:results.full.diff.ms,rows:results.full.diff.out};
 results.incremental.validate={ms:results.incremental.validate.ms,...results.incremental.validate.out};results.incremental.diff={ms:results.incremental.diff.ms,rows:results.incremental.diff.out};
 return results;
}
// ---- commands ---------------------------------------------------------------------------------------
function main(){
 if(command==='split'){
  if(fs.existsSync(manifestFile)&&!flag('--force'))throw new Failure(['模組來源已存在；要以整合檔重新拆分請使用 resync']);
  const from=path.resolve(root,option('--from',M.INTEGRATED_FILE)),text=fs.readFileSync(from,'utf8'),doc=JSON.parse(text);
  if(M.serialize(doc)!==text)warn(from+' 不是標準格式；整合檔將以標準格式重新輸出（資料不變）');
  const {written,manifest}=writeSources(doc,null);
  console.log('已拆分為 '+manifest.modules.filter(m=>m.present).length+' 個模組；寫入 '+written.length+' 個檔案');return;
 }
 if(command==='build'){
  const src=readSources(),prev=src.manifest;if(src.missing)throw new Failure(['找不到 manifest；請先 split']);
  const hard=src.errors.filter(e=>!/內容雜湊與 manifest 不符|格式不是標準輸出/.test(e));if(hard.length)throw new Failure(hard);
  const doc=M.assemble(src.modules,prev.layout),{written,manifest}=writeSources(doc,prev);
  console.log('已重建：'+(written.length?written.join('、'):'無變更')+'；dataRevision '+manifest.dataRevision);return;
 }
 if(command==='resync'){
  const src=readSources();if(src.missing)throw new Failure(['找不到 manifest；請先 split']);
  const doc=JSON.parse(fs.readFileSync(integratedFile,'utf8')),{written,manifest}=writeSources(doc,src.manifest);
  console.log('已由整合檔重新拆分：'+(written.length?written.join('、'):'無變更')+'；dataRevision '+manifest.dataRevision);return;
 }
 if(command==='check'){
  const r=check({allowLegacyIntegrated:flag('--allow-legacy-integrated')});
  console.log((r.legacy?'模組來源一致，但整合檔由舊版發布器寫入（見警告）':'平衡模組一致')+'：'+r.modules+' 個模組，dataRevision '+r.dataRevision);return;
 }
 if(command==='affected'){
  const report=analyse({base:option('--base','HEAD'),head:option('--head',null)});
  if(flag('--json')){console.log(JSON.stringify(report,null,2));}
  else{
   console.log('範圍：'+report.scope);for(const r of report.reasons)console.log('  · '+r);
   if(report.changes.length){console.log('變更（'+report.changes.length+'）：');for(const c of report.changes.slice(0,40))console.log('  '+c.kind.padEnd(10)+c.path+(c.record?.id!=null?'  ['+c.record.label+' '+c.record.id+']':''));}
   if(report.selection.length){console.log('選擇的測試（'+report.selection.length+'／'+gateTests().length+'）：');for(const s of report.selection)console.log('  '+s.test+'  ← '+s.because);}
  }
  if(option('--github-output')){const out=option('--github-output');fs.appendFileSync(out,'scope='+report.scope+'\nheadless='+report.tests.headless.join(' ')+'\nbrowser='+report.tests.browser.join(' ')+'\n');}
  if(process.env.GITHUB_STEP_SUMMARY){fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,'### 平衡資料影響範圍：'+report.scope+'\n'+report.reasons.map(r=>'- '+r).join('\n')+'\n\n'+(report.selection.length?'| 測試 | 選擇原因 |\n|---|---|\n'+report.selection.map(s=>'| '+s.test+' | '+s.because+' |').join('\n')+'\n':''));}
  return;
 }
 if(command==='validate'){
  const r=validate({base:option('--base','HEAD'),full:flag('--full')});
  if(r.note)console.log(r.note);
  console.log((flag('--full')||r.note?'完整':'增量')+'驗證：'+r.issues.length+' 個問題，'+r.ms.toFixed(1)+' ms；模組 '+(r.modules?r.modules.join('、')||'無':'全部')+'；規則區塊 '+(r.blocks||[]).join('、'));
  for(const x of r.issues.slice(0,50))console.log('  ['+(x.module||'?')+'] '+(x.object?x.object+' ':'')+x.field+'：'+x.reason);
  if(r.issues.length)process.exitCode=1;return;
 }
 if(command==='refs'){
  const doc=assembleSources(readSources()),[,kind,id]=args,value=['map','class'].includes(kind)?Number(id):id,rows=M.referenceIndex(doc).referencesTo(kind,value);
  console.log(kind+' '+id+' 被引用 '+rows.length+' 次');for(const r of rows)console.log('  ['+r.module+'] '+r.path+(r.owner?'（'+r.owner+'）':'')+'  '+r.label);return;
 }
 if(command==='bench'){console.log(JSON.stringify(bench(),null,2));return;}
 console.log(fs.readFileSync(__filename,'utf8').split('\n').slice(1,13).join('\n'));process.exitCode=command?1:0;
}
if(require.main===module){try{main();}catch(e){if(e instanceof Failure){console.error('平衡模組檢查失敗：');for(const l of e.lines)console.error('  ✗ '+l);process.exit(1);}throw e;}}
module.exports={readSources,check,analyse,validate,bench,assembleSources,writeSources,testsFor,gateTests};
