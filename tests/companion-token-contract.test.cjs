const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
test('game and standalone editor share exact companion/token contracts',()=>{
 const file=path.join(require('./runtime.cjs').balanceRoot(root),'balance-editor.html');
const html=fs.readFileSync(path.join(require('./runtime.cjs').balanceRoot(root),'balance-editor.html'),'utf8');for(const [id,file] of [['companion-model-v1','js/character/companion-model.js'],['companion-token-model-v1','js/items/companion-token-model.js']]){const embedded=html.match(new RegExp('<script id="'+id+'">\\s*([\\s\\S]*?)</script>'))?.[1];assert.equal(embedded.trim(),fs.readFileSync(path.join(root,file),'utf8').trim());}});
