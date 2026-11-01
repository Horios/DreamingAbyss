'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const version=JSON.parse(fs.readFileSync(require.resolve('../data/preview-version.json'),'utf8')).version;
const source=fs.readFileSync(require.resolve('../js/ui/preview-version.js'),'utf8');
test('preview badge displays the separately versioned source and never changes production UI',async()=>{
 assert.match(version,/^v\\d+\\.\\d{3}$/);
 const badge={textContent:'測試版本 · chatgpt-dev'},document={title:'測試版｜餘燼荒野',getElementById:id=>id==='preview-build-banner'?badge:null};
 const ctx=vm.createContext({document,Date,fetch:async()=>({ok:true,json:async()=>({version})}),console});
 vm.runInContext(source,ctx);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(badge.textContent,'測試版本 '+version);
 assert.match(document.title,new RegExp(version.replace('.','\\\\.')));
 let requested=false;
 const production=vm.createContext({document:{getElementById:()=>null},Date,fetch:()=>{requested=true;},console});
 vm.runInContext(source,production);assert.equal(requested,false);
});
test('preview HTML includes the badge updater without changing regular game metadata',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');
 assert.match(html,/src="js\\/ui\\/preview-version\\.js"/);
});
