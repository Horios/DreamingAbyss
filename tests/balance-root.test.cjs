const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {balanceRoot}=require('./runtime.cjs');
test('editor root resolves environment, renamed sibling and legacy sibling in order, or explains what is missing',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'balance-root-')),root=path.join(dir,'game'),old=process.env.EMBERWILD_BALANCE_ROOT;
 const editor=name=>{const p=path.join(dir,name);fs.mkdirSync(p,{recursive:true});fs.writeFileSync(path.join(p,'balance-editor.html'),'');return p;};
 try{
  delete process.env.EMBERWILD_BALANCE_ROOT;
  assert.throws(()=>balanceRoot(root),/^Error: 找不到平衡器 balance-editor.html；[^\n]+$/);
  const legacy=editor('Emberwild-Balance');assert.equal(balanceRoot(root),legacy);
  const current=editor('DreamingAbyss-BalanceEditor');assert.equal(balanceRoot(root),current);
  const custom=editor('custom');process.env.EMBERWILD_BALANCE_ROOT=custom;assert.equal(balanceRoot(root),custom);
  process.env.EMBERWILD_BALANCE_ROOT=path.join(dir,'missing');assert.equal(balanceRoot(root),current);
 }finally{if(old===undefined)delete process.env.EMBERWILD_BALANCE_ROOT;else process.env.EMBERWILD_BALANCE_ROOT=old;fs.rmSync(dir,{recursive:true,force:true});}
});
