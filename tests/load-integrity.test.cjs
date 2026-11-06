'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('all HTML game modules and styles exist and no module is loaded twice',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const scripts=[...html.matchAll(/<script\b([^>]*)>/g)].map(match=>match[1].match(/(?:data-balance-src|\bsrc)="([^"]+)"/)?.[1]).filter(Boolean).map(src=>src.split('?')[0]);
 const styles=[...html.matchAll(/<link\b([^>]*)>/g)].map(match=>match[1].match(/\bhref="([^"]+)"/)?.[1]).filter(Boolean).filter(src=>src.startsWith('css/')).map(src=>src.split('?')[0]);
 assert(scripts.length>0&&styles.length>0);
 assert.equal(new Set(scripts).size,scripts.length,'game scripts must not be loaded twice');
 assert.equal(new Set(styles).size,styles.length,'styles must not be loaded twice');
 for(const name of [...scripts,...styles])assert(fs.existsSync(path.join(root,name)),'missing linked asset '+name);
 const published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
 const build=JSON.parse(fs.readFileSync(path.join(root,'data/build.json'),'utf8'));
 assert.equal(published.schema,'emberwild-balance-v1');
 assert.equal(build.branch,'chatgpt-dev');
});
