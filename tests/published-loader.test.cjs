const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/balance/published-loader.js'),'utf8');
function harness({badSchema=false,stallMetadata=false,executionFailure=false,storage={},preview=false,bootSave=null,loadFailure=false,manifest=null,modules=null}={}){
  const nodes=[],links=[],scripts=[],listeners=new Map(),timers=new Map(),values=new Map(Object.entries(storage));let nextTimer=0;
  class Node{
    constructor(tag){this.tag=tag;this.style={};this.children=[];this.textContent='';this.removed=false;nodes.push(this);}
    setAttribute(){}querySelector(selector){return this.parts[selector];}
    set innerHTML(value){this.html=value;this.parts={'[data-boot-stage]':new Node('stage'),'[data-boot-count]':new Node('count'),'progress':new Node('progress')};}
    append(...children){this.children.push(...children);}remove(){this.removed=true;}
    appendChild(node){this.children.push(node);if(node.tag==='link')links.push(node);if(node.tag==='script'){
      scripts.push(node);queueMicrotask(()=>{ctx.order.push(new URL(node.src).pathname);if(executionFailure)emit('error',{filename:node.src,message:'fixture failed'});node.onload?.();});
    }return node;}
  }
  const app=new Node('app'),body=new Node('body'),head=new Node('head'),published={schema:'emberwild-balance-v1',schemaVersion:badSchema?99:1,items:[{cost:1}]};
  const document={getElementById:()=>app,createElement:tag=>new Node(tag),body,head,querySelectorAll:()=>['first.js','second.js','third.js'].map(file=>({getAttribute:()=>file}))};
  const emit=(type,event)=>{for(const fn of listeners.get(type)||[])fn(event);};
  const ctx=vm.createContext({state:null,party:null,BACKUP_KEY:'emberwild-save-v1-backup',VERIFIED_KEY:'emberwild-save-v1-verified',BATTLE_STATS_STORAGE_KEY:'emberwild-battle-statistics-v1',migrateWorldSave:data=>data,navigator:{locks:{request:(_name,callback)=>Promise.resolve().then(callback)}},document,URL,AbortController,Date,Promise,Error,Array,JSON,Map,Set,order:[],applied:[],loaded:[],toasts:[],__EMBERWILD_BOOT_SAVE_RAW:bootSave,
    location:{href:'https://emberwild.test/'+(preview?'preview/':''),pathname:preview?'/preview/':'/',reload(){}},
    localStorage:{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),clearInterval(){},
    fetch:async(url,{signal})=>{if(stallMetadata&&url.startsWith('data/build.json'))return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('aborted'))));if(url.startsWith('data/balance/manifest.json'))return manifest?{ok:true,status:200,json:async()=>manifest}:{ok:false,status:404,json:async()=>({})};const body=url.startsWith('data/build.json')?{commit:'a'.repeat(40)}:published;return {ok:true,status:200,json:async()=>body,text:async()=>JSON.stringify(body)};},
    EmberwildBalanceDocument:{inspect:()=>[]},EmberwildBalanceModules:modules,applyBalanceConfig(data){ctx.applied.push(data);},loadParty(data){ctx.loaded.push(data);if(loadFailure===true||typeof loadFailure==='function'&&loadFailure(data))throw Error('道具資料無效');ctx.party=data;ctx.state=data.members?.[0]||{};},
    importBalanceJSON:async()=>true,resetBalanceJSON:()=>true,exportableBalance:()=>ctx.__EMBERWILD_BALANCE_SOURCE,toast(message){ctx.toasts.push(message);},backToTitle(){ctx.returnedToTitle=true;},
    addEventListener:(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeEventListener:(type,fn)=>listeners.get(type)?.delete(fn),dispatchEvent(){},Event:class{}
  });ctx.window=ctx;
  const done=vm.runInContext(source,ctx);
  return {ctx,done,published,links,scripts,nodes,timers,values,app,async flush(){await new Promise(resolve=>setImmediate(resolve));},expire(){for(const {fn} of [...timers.values()])fn();}};
}

test('preloads overlap while execution stays ordered and balance applies exactly once',async()=>{
  const h=harness();await h.flush();assert.equal(h.links.length,3);assert.equal(h.scripts.length,0);
  h.links[2].onload();h.links[1].onload();await h.flush();assert.equal(h.scripts.length,0);
  h.links[0].onload();await h.done;
  assert.deepEqual([...h.ctx.order],['/first.js','/second.js','/third.js']);assert.equal(h.ctx.applied.length,1);
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);assert.equal(h.ctx.applied[0].schemaVersion,1);
  assert.equal(h.timers.size,0);assert(h.links.every(link=>link.removed));
});

test('download failure cancels pending waits and does not execute or modify stored player bytes',async()=>{
  const h=harness({storage:{'emberwild-save-probe':'original'}});await h.flush();h.links[0].onerror();await h.done;
  assert.match(h.ctx.__EMBERWILD_BALANCE_LOAD_ERROR,/下載失敗/);assert.equal(h.scripts.length,0);
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,undefined);assert.equal(h.values.get('emberwild-save-probe'),'original');
  assert.equal(h.timers.size,0);assert(h.nodes.some(node=>node.tag==='button'&&node.textContent==='重新載入'));
});

test('metadata and module timeouts show errors and release every timer',async()=>{
  for(const stallMetadata of [true,false]){
    const h=harness({stallMetadata});await h.flush();h.expire();await h.done;
    assert.match(h.ctx.__EMBERWILD_BALANCE_LOAD_ERROR,/逾時/);assert.equal(h.scripts.length,0);assert.equal(h.timers.size,0);
  }
});

test('module execution exceptions stop initialization before later code or balance application',async()=>{
  const h=harness({executionFailure:true});await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.match(h.ctx.__EMBERWILD_BALANCE_LOAD_ERROR,/模組執行失敗.*fixture failed/);
  assert.equal(h.scripts.length,1);assert.equal(h.ctx.applied.length,0);assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,undefined);
});

test('unsupported schemas stop before any module download',async()=>{
  const h=harness({badSchema:true});await h.done;assert.equal(h.links.length,0);assert.equal(h.scripts.length,0);
  assert.match(h.ctx.__EMBERWILD_BALANCE_LOAD_ERROR,/不支援/);
});

test('preview override keeps its published-base rule after parallel initialization',async()=>{
  const base={schema:'emberwild-balance-v1',schemaVersion:1,items:[{cost:1}]},custom={...base,items:[{cost:7}]};
  for(const matching of [true,false]){
    const h=harness({preview:true,storage:{'emberwild-preview-balance-test-v1':JSON.stringify(custom),'emberwild-preview-balance-test-v1-published-base':matching?JSON.stringify(base):'old'}});
    await h.flush();for(const link of h.links)link.onload();await h.done;
    assert.equal(h.ctx.applied[0].items[0].cost,matching?7:1);
  }
});


test('final save hydration alone reports a genuine failure and preserves stored bytes',async()=>{
  const raw=JSON.stringify({version:3,members:[]});
  for(const loadFailure of [false,true]){
    const h=harness({bootSave:raw,loadFailure,storage:{'emberwild-save-v1':raw}});
    await h.flush();for(const link of h.links)link.onload();await h.done;
    assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);
    assert.equal(h.values.get('emberwild-save-v1'),raw);
    assert.equal(h.ctx.loaded.length,1);
    assert.equal(h.ctx.returnedToTitle===true,loadFailure);
    assert.deepEqual([...h.ctx.toasts],loadFailure?['存檔未能載入：道具資料無效；可匯入備份。']:[]);
    assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_ERROR,loadFailure?'道具資料無效':null);
  }
});

test('a corrupt primary uses a valid backup only after full module loading and leaves both raw records intact',async()=>{
  const primary=JSON.stringify({broken:true}),backup=JSON.stringify({version:3,members:[{job:0,lv:2}]});
  const h=harness({bootSave:primary,loadFailure:row=>!!row.broken,storage:{
    'emberwild-save-v1':primary,'emberwild-save-v1-backup':backup
  }});
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
  assert.equal(h.ctx.loaded.length,2);
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_RAW,backup);
  assert.equal(h.ctx.__EMBERWILD_UNREADABLE_PRIMARY_RAW,primary);
  assert.equal(h.ctx.__EMBERWILD_RECOVERED_BACKUP_SESSION,true);
  assert.equal(h.values.get('emberwild-save-v1'),primary);
  assert.equal(h.values.get('emberwild-save-v1-backup'),backup);
  assert.deepEqual([...h.ctx.toasts],['主要存檔無法載入，已讀取上一份備份；原始資料保留']);
  assert.equal(h.ctx.returnedToTitle,undefined);
});

test('a missing primary can load the backup without treating it as corrupt',async()=>{
  const backup=JSON.stringify({version:3,members:[{job:1,lv:7}]});
  const h=harness({storage:{'emberwild-save-v1-backup':backup}});
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_RAW,backup);
  assert.equal(h.ctx.__EMBERWILD_UNREADABLE_PRIMARY_RAW,undefined);
  assert.equal(h.values.get('emberwild-save-v1-backup'),backup);
});

test('a missing custom equipment form does not silently substitute the backup',async()=>{
  const primary=JSON.stringify({custom:true}),backup=JSON.stringify({version:3,members:[{job:0,lv:5}]});
  const h=harness({bootSave:primary,loadFailure:row=>!!row.custom,storage:{
    'emberwild-save-v1':primary,'emberwild-save-v1-backup':backup
  }});
  // Use the exact preview-specific compatibility error.
  h.ctx.loadParty=(data)=>{h.ctx.loaded.push(data);if(data.custom)throw Error('裝備類型無效：custom');h.ctx.party=data;h.ctx.state=data.members?.[0]||{};};
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);
  assert.equal(h.ctx.loaded.length,1);
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_ERROR,'裝備類型無效：custom');
  assert.equal(h.values.get('emberwild-save-v1'),primary);
  assert.equal(h.values.get('emberwild-save-v1-backup'),backup);
});

test('a loaded save becomes the cold-boot verified generation without touching primary or backup',async()=>{
  const primary=JSON.stringify({version:3,members:[{job:2,lv:9}]}),backup=JSON.stringify({version:3,members:[{job:2,lv:8}]});
  const h=harness({bootSave:primary,storage:{'emberwild-save-v1':primary,'emberwild-save-v1-backup':backup}});
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
  assert.equal(h.ctx.loaded.length,1,'the verified copy is never loaded while the primary is readable');
  assert.equal(h.values.get('emberwild-save-v1-verified'),primary);
  assert.equal(h.values.get('emberwild-save-v1'),primary);
  assert.equal(h.values.get('emberwild-save-v1-backup'),backup);
  assert.deepEqual([...h.ctx.toasts],[]);
});

test('primary and backup both unreadable fall back to the verified generation and keep every raw record',async()=>{
  const primary=JSON.stringify({broken:'primary'}),backup=JSON.stringify({broken:'backup'}),verified=JSON.stringify({version:3,members:[{job:3,lv:12}]});
  const h=harness({bootSave:primary,loadFailure:row=>!!row.broken,storage:{
    'emberwild-save-v1':primary,'emberwild-save-v1-backup':backup,'emberwild-save-v1-verified':verified
  }});
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
  assert.deepEqual(h.ctx.loaded.map(x=>x.broken??'verified'),['primary','backup','verified'],'order: primary, backup, verified');
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_RAW,verified);
  assert.equal(h.ctx.__EMBERWILD_RECOVERED_BACKUP_SESSION,true,'autosave must not rotate unreadable bytes over the backup');
  assert.equal(h.ctx.__EMBERWILD_UNREADABLE_PRIMARY_RAW,primary);
  assert.equal(h.values.get('emberwild-save-v1'),primary);
  assert.equal(h.values.get('emberwild-save-v1-backup'),backup);
  assert.equal(h.values.get('emberwild-save-v1-verified'),verified);
  assert.deepEqual([...h.ctx.toasts],['主要存檔與備份都無法載入，已讀取上次成功開機時的存檔；原始資料保留']);
});

test('a valid backup still wins over the verified generation and becomes the new verified copy',async()=>{
  const primary=JSON.stringify({broken:'primary'}),backup=JSON.stringify({version:3,members:[{job:0,lv:4}]}),verified=JSON.stringify({version:3,members:[{job:0,lv:3}]});
  const h=harness({bootSave:primary,loadFailure:row=>!!row.broken,storage:{
    'emberwild-save-v1':primary,'emberwild-save-v1-backup':backup,'emberwild-save-v1-verified':verified
  }});
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.loaded.length,2);
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_RAW,backup);
  assert.equal(h.values.get('emberwild-save-v1-verified'),backup);
  assert.deepEqual([...h.ctx.toasts],['主要存檔無法載入，已讀取上一份備份；原始資料保留']);
});

test('a verified-copy write failure leaves the loaded save and both stored records untouched',async()=>{
  const primary=JSON.stringify({version:3,members:[{job:1,lv:5}]});
  const h=harness({bootSave:primary,storage:{'emberwild-save-v1':primary}});
  const write=h.ctx.localStorage.setItem;h.ctx.localStorage.setItem=(key,value)=>{if(key==='emberwild-save-v1-verified')throw Error('quota');return write(key,value);};
  await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);
  assert.equal(h.values.get('emberwild-save-v1'),primary);
  assert.equal(h.values.has('emberwild-save-v1-verified'),false);
});

test('a manifest whose modules are missing from data/balance.json stops boot before any module download',async()=>{
  const modules={checkManifest:()=>[],split:()=>({modules:{'world/monsters':undefined}})};
  const h=harness({manifest:{modules:[{id:'world/monsters',present:true,source:'balanceSettings.monsters'}],integrated:{sha256:'0'.repeat(64)}},modules});await h.done;
  assert.match(h.ctx.__EMBERWILD_BALANCE_LOAD_ERROR,/缺少必要模組：world\/monsters/);assert.equal(h.links.length,0);assert.equal(h.ctx.applied.length,0);
  const bad=harness({manifest:{modules:[]},modules:{checkManifest:()=>['manifest 缺少模組：world/maps'],split:()=>({modules:{}})}});await bad.done;
  assert.match(bad.ctx.__EMBERWILD_BALANCE_LOAD_ERROR,/模組清單無效/);assert.equal(bad.links.length,0);
});

test('a deployment without a manifest still loads the integrated document (pre-module builds)',async()=>{
  const h=harness();await h.flush();for(const link of h.links)link.onload();await h.done;
  assert.equal(h.ctx.__EMBERWILD_BALANCE_READY,true);assert.equal(h.ctx.__EMBERWILD_BALANCE_MODULES.state,'legacy');
});
