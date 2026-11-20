'use strict';
/* v0.181: companion tokens follow the equipment enhancement table: costs, success rates, failure drops, +11/+12
   destruction after a confirmation, and the cumulative bonus replaces the former +5% per level on their attributes. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
function game(){
 const r=loadRuntime(root);r.prompts=[];r.ctx.confirm=m=>{r.prompts.push(m);return r.answer??true;};
 r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);state.dust=1e6;state.ore=1e6;state.materials['以太鍛鐵']=1e6;
  globalThis.roll=0;Math.random=()=>roll;
  globalThis.tok=__EMBERWILD_TOKEN_TEST.makeToken('berserk',1);tok.id='tok';state.bag.push(tok);`);
 return r;
}
test('a token costs, rolls and fails by the enhancement table; its attributes grow by the cumulative bonus',()=>{
 const r=game();const id='tok';
 const effects=p=>json(r,`(()=>{const g=findGear('${id}'),plus=g.plus;g.plus=${p};const v=EmberwildTokens.effectsFor(g).map(e=>e.value);g.plus=plus;return v;})()`);
 const base=effects(0),at9=effects(9),at12=effects(12),keys=json(r,`EmberwildTokens.effectsFor(findGear('${id}')).map(e=>e.key)`);
 const scaled=keys.map((k,i)=>base[i]!==at9[i]);assert(scaled.some(Boolean),'some token attributes scale');
 keys.forEach((k,i)=>{if(scaled[i]){assert(Math.abs(at9[i]-base[i]*2)<=Math.max(.011,Math.abs(base[i])*.02),k+' doubles at +9');assert(Math.abs(at12[i]-base[i]*2.9)<=Math.max(.011,Math.abs(base[i])*.02),k+' ×2.9 at +12');}});
 assert.deepEqual(json(r,`upgradeMaterials(findGear('${id}'))`),{ore:0,dust:2,ether:0});
 r.run(`roll=0;for(let i=0;i<3;i++)enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),3);
 const dust=r.run('state.dust');r.run(`roll=.95;enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),2,'+4 fails back to +2');assert.equal(r.run('state.dust'),dust-8);
 r.run(`roll=0;for(let i=0;i<8;i++)enhance('${id}')`);assert.equal(r.run(`findGear('${id}').plus`),10);
 r.answer=false;r.run(`roll=.99;enhance('${id}')`);assert.match(r.prompts.at(-1),/信物/);assert.equal(r.run(`findGear('${id}').plus`),10,'declined');
 r.answer=true;r.run(`roll=.99;enhance('${id}')`);assert.equal(r.run(`!!findGear('${id}')`),false,'destroyed');
 assert.deepEqual(r.errors,[]);
});
test('the token forge modal shows the table rules and refreshes after an attempt',()=>{
 const r=game();const id='tok';
 r.run(`openForge('${id}')`);const html=r.elements.get('modal').innerHTML;
 assert.match(html,/信物強化/);assert.match(html,/強化至 \+1/);assert.match(html,/成功率 100%/);assert.match(html,/信物屬性 \+0% → \+5%/);assert.match(html,/強化表/);
 assert.doesNotMatch(html,/每級屬性 \+5%/);
 r.run(`roll=0;enhance('${id}');openForge('${id}')`);assert.match(r.elements.get('modal').innerHTML,/強化至 \+2/);
 assert.deepEqual(r.errors,[]);
});
