/* Loads production scripts in Node with a minimal DOM and a controlled wall clock. This checks runtime behavior, not browser layout or events. */
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
class Element {
  constructor(id=''){this.id=id;this.style={};this.dataset={};this.innerHTML='';this.textContent='';this.open=false;this.value='';this.children=[];this.attributes={};this.classList={add(){},remove(){},toggle(){},contains(){return false;}};this.content={firstElementChild:new Proxy({innerHTML:''},{get:(target,key)=>target[key]})};}
  get lastElementChild(){return this.children.at(-1)||new Element();}
  querySelector(){return null;}querySelectorAll(){return [];}addEventListener(){}removeEventListener(){}appendChild(x){this.children.push(x);return x;}append(x){this.children.push(x);}remove(){}insertAdjacentHTML(_pos,html){this.innerHTML+=html;}setAttribute(k,v){this.attributes[k]=String(v);}getAttribute(k){return this.attributes[k]??null;}removeAttribute(k){delete this.attributes[k];}hasAttribute(k){return k in this.attributes;}showModal(){this.open=true;}close(){this.open=false;}focus(){}scrollIntoView(){}matches(){return false;}closest(){return null;}getBoundingClientRect(){return {width:1440,height:900,top:0,left:0,bottom:900,right:1440};}
}
function loadRuntime(root,entry='index.html',saved={},clockStart=Date.parse('2026-10-02T02:00:00Z'),options={}){
  const listeners={window:new Map(),document:new Map()};
  const on=(target,type,fn)=>{if(!listeners[target].has(type))listeners[target].set(type,[]);listeners[target].get(type).push(fn);};
  const elements=new Map(),values=new Map(Object.entries(saved)),errors=[],warnings=[];
  let now=clockStart,seq=0;
  const node=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const document={getElementById:node,querySelector:selector=>selector.startsWith('#')&&!/[ >]/.test(selector)?node(selector.slice(1)):null,querySelectorAll:()=>[],createElement:()=>new Element(),addEventListener:(type,fn)=>on('document',type,fn),removeEventListener(){},body:new Element('body'),head:new Element('head'),documentElement:new Element('html'),activeElement:null,readyState:'complete'};
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
  const context={console:{...console,warn:(...args)=>warnings.push(args.map(String).join(' ')),error:(...args)=>{errors.push(args.map(String).join(' '));console.error(...args);}},document,Date:ClockDate,structuredClone,URL,Blob,TextEncoder,TextDecoder,Buffer,atob,btoa,
    localStorage:{getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,String(value)),removeItem:key=>values.delete(key),clear:()=>values.clear()},
    sessionStorage:{getItem:()=>null,setItem(){},removeItem(){}},location:{href:'http://emberwild.test/',origin:'http://emberwild.test',pathname:'/',hash:'',search:'',reload(){}},navigator:{userAgent:'runtime-verification'},
    HTMLElement:Element,HTMLDialogElement:Element,HTMLInputElement:Element,HTMLSelectElement:Element,HTMLTextAreaElement:Element,
    MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},
    setTimeout:()=>++seq,clearTimeout(){},setInterval:()=>++seq,clearInterval(){},requestAnimationFrame:()=>++seq,cancelAnimationFrame(){},queueMicrotask(){},
    addEventListener:(type,fn)=>on('window',type,fn),removeEventListener(){},matchMedia:()=>({matches:false,addEventListener(){},removeEventListener(){}}),getComputedStyle:()=>({lineHeight:'20px',fontSize:'16px',getPropertyValue:()=>''}),
    performance:{now:()=>now},crypto:{randomUUID:()=>String(++seq)},innerWidth:1440,innerHeight:900,scrollX:0,scrollY:0,alert(){},confirm:()=>true,prompt:()=>null};
  context.window=context;context.self=context;context.globalThis=context;
  const ctx=vm.createContext(context),html=fs.readFileSync(path.join(root,entry),'utf8');
  // Eager src models execute during HTML parsing; the published loader runs
  // data-balance-src scripts afterwards. Match that order for cold-save checks.
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].sort((a,b)=>Number(a[1].includes('data-balance-src'))-Number(b[1].includes('data-balance-src')));
  for(let i=0;i<scripts.length;i++){
    const src=scripts[i][1].match(/(?:\bsrc|data-balance-src)="([^"]+)"/),filename=src?src[1]:entry+':script-'+i;
    if(filename.includes('startup-guard')||filename.includes('published-loader'))continue;
    let code=src?fs.readFileSync(path.join(root,src[1].split('?')[0]),'utf8'):scripts[i][2];
    if(options.transformSource)code=options.transformSource(filename.split('?')[0],code);
    // Guards against a module that never returns. 30s (as for the bootstrap below) tolerates parallel test load; a stuck script still fails.
    try{vm.runInContext(code,ctx,{filename,timeout:Number(process.env.EMBERWILD_MODULE_TIMEOUT_MS)||30000});}catch(e){throw new Error(filename+': '+e.stack);}
  }
  const published=path.join(root,'data/balance.json');
  ctx.__HEADLESS_PUBLISHED_BALANCE=fs.existsSync(published)?JSON.parse(fs.readFileSync(published,'utf8')):null;
  // Match the browser harness's 30s boot budget for the complete published document.
  // Individual module execution remains capped at 10s.
  // Mirror the loader's final domain apply and late-validator save restoration.
  vm.runInContext(`{const raw=typeof balanceSourceText==='function'?balanceSourceText():null;if(raw||globalThis.__HEADLESS_PUBLISHED_BALANCE)applyBalanceConfig(raw?JSON.parse(raw):globalThis.__HEADLESS_PUBLISHED_BALANCE,{persist:false});const boot=globalThis.__EMBERWILD_TEAM_BOOT_RAW||globalThis.__EMBERWILD_BOOT_SAVE_RAW;if(boot){try{loadParty(JSON.parse(boot));globalThis.__EMBERWILD_BOOT_SAVE_ERROR=null;}catch(error){party=null;state=null;running=false;globalThis.__EMBERWILD_BOOT_SAVE_ERROR=String(error.message||error);if(typeof backToTitle==='function')backToTitle();else render();}}}`,ctx,{filename:'headless-published-loader',timeout:options.bootstrapTimeoutMs||30000});
  // v0.206: the game no longer equips anything when a character is created. Most tests create their character with a direct
  // start(job) and were written for the former white starting set, so the harness equips that set on a direct start
  // (not on the prologue path). Tests of character creation pass {bareStart:true} to see the game's own behavior.
  if(entry==='index.html'&&!options.bareStart)vm.runInContext(`{const __start=start,SP=globalThis.__EMBERWILD_STARTER_PACK;let __prologue=false;
    if(SP?.asPrologue){const base=SP.asPrologue;SP.asPrologue=function(action){__prologue=true;try{return base.call(this,action);}finally{__prologue=false;}};}
    start=function(...args){const out=__start.apply(this,args);
      if(!__prologue&&state&&party&&party.members?.length===1&&!(state.equipped||[]).some(Boolean)){
        for(const [position,slot] of [0,1,2,3,3].entries()){const g=gear(1,slot,0,state.job);g.formJob=state.job;g.form=0;const f=typeof itemForm==='function'?itemForm(g):null;if(f?.weaponType)g.weaponType=f.weaponType;
          Object.assign(g,{rar:0,plus:0,affix:[],powerTier:1,prefixId:'',suffixId:''});globalThis.__EMBERWILD_EQUIPMENT_SKILLS?.generate?.(g,{source:'starter',force:true});g.name=gearName(g);
          state.bag.push(g);state.equipped[position]=g.id;}
        state.hp=stats(state).hp;save();}
      return out;};}`,ctx,{filename:'headless-starting-set'});
  return {ctx,elements,errors,warnings,values,dispatch:(type,target='window',event={})=>{for(const fn of listeners[target].get(type)||[])fn({...event,type});},run:code=>vm.runInContext(code,ctx),advance:ms=>{now+=ms;},get now(){return now;}};
}
module.exports={loadRuntime};
