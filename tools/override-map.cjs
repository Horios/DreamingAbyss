#!/usr/bin/env node
/* Static map of global function overrides in real load order.

   The game is built from classic scripts: core-game.js defines globals and later
   modules wrap or replace them (`render=function(){...}`). The final behaviour of
   a function is therefore the LAST assignment in index.html order, wrapping all
   earlier ones. This tool lists those chains so a change can be traced to every
   layer that runs. It only reads files.

   Usage:
     node tools/override-map.cjs                 summary of the most-wrapped globals
     node tools/override-map.cjs render save     full chain for the named globals
     node tools/override-map.cjs --json          machine-readable output
*/
'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');

function scriptOrder(){
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),files=[];
 for(const m of html.matchAll(/<script\b[^>]*?\b(?:data-balance-src|src)="([^"]+)"/g)){
  const file=m[1].split('?')[0];
  if(file.endsWith('.js')&&fs.existsSync(path.join(root,file))&&!files.includes(file))files.push(file);
 }
 return files;
}

// `name=function`, `name=async function`, `name=(...)=>`, `name=x=>` (not `==`, not `.name=`),
// plus `globalThis.name=` / `window.name=` assignments of functions.
const ASSIGN=/(?:^|[^.\w$])((?:globalThis|window)\.)?([A-Za-z_$][\w$]*)\s*=(?![=>])\s*(?:async\s+)?(?:function\b\s*\*?|\([^()]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;
const DECLARE=/(?:^|[^.\w$])function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g;
const DYNAMIC=/(?:globalThis|window)\[\s*[A-Za-z_$][\w$]*\s*\]\s*=\s*(?:async\s+)?function/g;

function lineOf(text,index){let n=1;for(let i=0;i<index;i++)if(text.charCodeAt(i)===10)n++;return n;}

function scan(){
 const files=scriptOrder(),map=new Map(),dynamic=[];
 const push=(name,entry)=>{if(!map.has(name))map.set(name,[]);map.get(name).push(entry);};
 files.forEach((file,order)=>{
  const text=fs.readFileSync(path.join(root,file),'utf8');
  if(file.endsWith('lucide-catalog.js'))return; // icon data only
  const declaredLocally=new Set();
  // Top-level function declarations in a classic script define globals.
  for(const m of text.matchAll(DECLARE)){
   const before=text.slice(0,m.index);
   const depth=(before.match(/\{/g)||[]).length-(before.match(/\}/g)||[]).length;
   if(depth===0)push(m[1],{file,order,line:lineOf(text,m.index),kind:'define'});
   else declaredLocally.add(m[1]);
  }
  for(const m of text.matchAll(ASSIGN)){
   const name=m[2],prefix=text.slice(Math.max(0,m.index-6),m.index+1);
   if(/(?:const|let|var)\s*$/.test(text.slice(Math.max(0,m.index-6),m.index+1+(m[0].length-m[0].trimStart().length))))continue;
   if(/\b(?:const|let|var)\s+$/.test(prefix))continue;
   push(name,{file,order,line:lineOf(text,m.index+m[0].indexOf(name)),kind:m[1]?'global':'assign'});
  }
  for(const m of text.matchAll(DYNAMIC))dynamic.push({file,line:lineOf(text,m.index)});
 });
 // Keep only names that are defined globally or overridden from another file.
 const chains=new Map();
 for(const [name,entries] of map){
  const overrides=entries.filter(e=>e.kind!=='define').length;
  // A real global has a top-level declaration or an explicit globalThis/window
  // assignment; same-named locals inside module IIFEs are not part of the chain.
  if(overrides&&entries.some(e=>e.kind==='define'||e.kind==='global'))chains.set(name,entries.sort((a,b)=>a.order-b.order||a.line-b.line));
 }
 return {files,chains,dynamic};
}

function overrideCount(entries){return entries.filter(e=>e.kind!=='define').length;}

if(require.main===module){
 const {files,chains,dynamic}=scan();
 const args=process.argv.slice(2),json=args.includes('--json'),names=args.filter(a=>!a.startsWith('--'));
 if(json){
  const out={scripts:files.length,chains:Object.fromEntries([...chains].map(([k,v])=>[k,v])),dynamicWrapperSites:dynamic};
  console.log(JSON.stringify(out,null,1));
 }else if(names.length){
  for(const name of names){
   const entries=chains.get(name);
   if(!entries){console.log(name+': no cross-file override found');continue;}
   console.log(`${name}: ${overrideCount(entries)} overrides; the last one runs first and wraps the earlier ones`);
   entries.forEach((e,i)=>console.log(`  ${String(i+1).padStart(2)}. [${e.kind}] ${e.file}:${e.line}`));
  }
 }else{
  const rows=[...chains].map(([name,entries])=>({name,overrides:overrideCount(entries),files:new Set(entries.map(e=>e.file)).size})).sort((a,b)=>b.overrides-a.overrides||a.name.localeCompare(b.name));
  console.log(`${files.length} scripts in load order; ${rows.length} globals overridden; ${rows.reduce((n,r)=>n+r.overrides,0)} override sites; ${dynamic.length} dynamic globalThis[name] wrapper sites`);
  for(const r of rows.slice(0,25))console.log(`${String(r.overrides).padStart(4)}  ${r.name}  (${r.files} files)`);
 }
}
module.exports={scan,overrideCount};
