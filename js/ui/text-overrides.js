/* v0.119: editable on-screen text.
   Balance JSON `textOverrides` replaces fixed text the game shows, matched by its original wording.
   Digit runs in a source written as {#} are wildcards: "需求：LV{#}、{#} 金幣" matches every level and price,
   and {#} in the replacement inserts the numbers in order. The same original text changes everywhere.
   Overrides apply to the rendered DOM (text, placeholder, title and aria-label), so every page and dialog
   is covered without changing the modules that build them. Typed values (inputs, text areas) are never
   touched. With no overrides the observer is disconnected and costs nothing. */
(()=>{
'use strict';
const VERSION=1,MAX_ENTRIES=3000,MAX_SOURCE=400,MAX_TEXT=2000,ATTRS=['placeholder','title','aria-label'];
const NUM=/\d+(?:[.,]\d+)*/g,SKIP='script,style,textarea,input,select,[contenteditable="true"],[contenteditable=""],[data-text-override="off"]';
let entries=[],exact=new Map(),templates=new Map(),observer=null,applying=false;
// Original text per node / attribute, and the value this module last wrote (to detect game rewrites).
const originals=new WeakMap(),written=new WeakMap(),attrOriginals=new WeakMap();

const squash=s=>String(s).replace(/\s+/g,' ').trim();
const templateOf=s=>squash(s).replace(NUM,'{#}');
function normalize(input){
 if(input===undefined||input===null)return {version:VERSION,entries:[]};
 if(typeof input!=='object'||Array.isArray(input))throw Error('文字覆寫必須是物件');
 if(input.version!==VERSION)throw Error('不支援的文字覆寫版本');
 if(!Array.isArray(input.entries))throw Error('文字覆寫 entries 必須是陣列');
 if(input.entries.length>MAX_ENTRIES)throw Error('文字覆寫最多 '+MAX_ENTRIES+' 筆');
 const seen=new Set(),out=[];
 for(const [i,row] of input.entries.entries()){
  if(!row||typeof row!=='object'||Array.isArray(row))throw Error('文字覆寫第 '+(i+1)+' 筆格式錯誤');
  if(typeof row.source!=='string'||typeof row.text!=='string')throw Error('文字覆寫第 '+(i+1)+' 筆的原文與新文字必須是文字');
  const source=squash(row.source);
  if(!source)throw Error('文字覆寫第 '+(i+1)+' 筆缺少原文');
  if(source.length>MAX_SOURCE)throw Error('文字覆寫第 '+(i+1)+' 筆原文過長（最多 '+MAX_SOURCE+' 字元）');
  if(row.text.length>MAX_TEXT)throw Error('文字覆寫第 '+(i+1)+' 筆新文字過長（最多 '+MAX_TEXT+' 字元）');
  if(/\d/.test(source))throw Error('文字覆寫第 '+(i+1)+' 筆原文的數字請寫成 {#}');
  if(seen.has(source))throw Error('文字覆寫原文重複：'+source);
  seen.add(source);out.push({source,text:row.text});
 }
 return {version:VERSION,entries:out};
}
function lookup(original){
 const key=/^\S+$/.test(original)?original:squash(original);if(!key)return null;
 if(exact.has(key))return exact.get(key);
 if(!templates.size||!/\d/.test(key))return null;
 const replacement=templates.get(key.replace(NUM,'{#}'));if(replacement===undefined)return null;
 const numbers=key.match(NUM)||[];let i=0;
 return replacement.replace(/\{#\}/g,()=>numbers[i++]??'');
}
function rewrite(original){
 const replacement=lookup(original);if(replacement===null)return original;
 // Keep the surrounding whitespace so inline layout does not change.
 const lead=original.match(/^\s*/)[0],tail=original.match(/\s*$/)[0];
 return lead+replacement+(original.trim()?tail:'');
}
const skipped=el=>!!el?.closest?.(SKIP);
// `checked` is true inside a subtree walk, which already rejected skipped regions.
function textNode(node,checked){
 if(!checked&&skipped(node.parentElement))return;
 const current=node.nodeValue;
 // A different value than ours means the game wrote new text into this node.
 if(!originals.has(node)||written.get(node)!==current)originals.set(node,current);
 const next=rewrite(originals.get(node));
 if(next!==current){node.nodeValue=next;}
 written.set(node,next);
}
function attributes(el,checked){
 if(!el.hasAttribute('title')&&!el.hasAttribute('placeholder')&&!el.hasAttribute('aria-label'))return;
 if(!checked&&skipped(el))return;
 let saved=attrOriginals.get(el);
 for(const name of ATTRS){
  if(!el.hasAttribute(name))continue;
  const current=el.getAttribute(name);
  if(!saved)attrOriginals.set(el,saved={});
  const prior=saved[name];
  if(!prior||prior.written!==current)saved[name]={original:current};
  const next=rewrite(saved[name].original);
  if(next!==current)el.setAttribute(name,next);
  saved[name].written=next;
 }
}
function walk(root){
 if(!root||typeof document.createTreeWalker!=='function')return;
 if(root.nodeType===3){textNode(root);return;}
 if(root.nodeType!==1&&root.nodeType!==9)return;
 if(root.nodeType===1){if(skipped(root))return;attributes(root);}
 const walker=document.createTreeWalker(root,5/*SHOW_ELEMENT|SHOW_TEXT*/,{acceptNode:n=>n.nodeType===1&&n.matches(SKIP)?2/*REJECT*/:1});
 for(let n=walker.nextNode();n;n=walker.nextNode()){if(n.nodeType===3)textNode(n,true);else attributes(n,true);}
}
function onMutations(list){
 if(applying)return;applying=true;
 try{
  for(const m of list){
   if(m.type==='characterData')textNode(m.target);
   else if(m.type==='attributes')attributes(m.target);
   else for(const n of m.addedNodes)walk(n);
  }
 }finally{applying=false;}
 observer?.takeRecords();
}
function refresh(){
 applying=true;
 try{walk(document.documentElement);}finally{applying=false;}
 observer?.takeRecords();
}
function install(next){
 entries=next.entries.map(x=>({...x}));
 exact=new Map();templates=new Map();
 for(const {source,text} of entries)(source.includes('{#}')?templates:exact).set(source,text);
 if(entries.length&&!observer&&typeof MutationObserver==='function'){
  observer=new MutationObserver(onMutations);
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:ATTRS});
 }
 // Restores text whose override was removed, and applies new ones.
 if(document.documentElement)refresh();
 if(!entries.length&&observer){observer.disconnect();observer=null;}
}

const exportBase=exportableBalance;
exportableBalance=function(){const out=exportBase();if(entries.length)out.textOverrides={version:VERSION,entries:entries.map(x=>({...x}))};else delete out.textOverrides;return out;};
const validateBase=validateBalanceConfig;
validateBalanceConfig=function(input){
 const copy=JSON.parse(JSON.stringify(input)),overrides=normalize(copy.textOverrides);delete copy.textOverrides;
 const out=validateBase(copy);if(overrides.entries.length)out.textOverrides=overrides;return out;
};
const applyBase=applyBalanceConfig;
applyBalanceConfig=function(input,options){
 const copy=JSON.parse(JSON.stringify(input)),overrides=normalize(copy.textOverrides);delete copy.textOverrides;
 const result=applyBase(copy,options);
 install(overrides);
 return result;
};
const resetBase=resetBalanceJSON;
resetBalanceJSON=function(...args){const out=resetBase(...args);install({version:VERSION,entries:[]});return out;};

globalThis.EmberwildTextOverrides=Object.freeze({
 VERSION,MAX_ENTRIES,normalize,templateOf,refresh,
 get entries(){return entries.map(x=>({...x}));},
 // The original (game-written) text of a text node or element attribute, for click-to-edit tools.
 originalOf(node,attribute){if(attribute){return attrOriginals.get(node)?.[attribute]?.original??node.getAttribute?.(attribute)??null;}return node?.nodeType===3?(originals.get(node)??node.nodeValue):null;},
 preview(next){install(normalize(next));}
});
})();
