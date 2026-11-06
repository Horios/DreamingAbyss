const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run(`JSON.stringify(${code})`));
function game(){
  const r=loadRuntime(root);
  r.run('selectSaveSlot(1);start(0);closeModal();globalThis.g=gear(1,0,0,0);state.bag.push(g);state.gold=10000;state.ore=0;state.dust=10;');
  return r;
}

test('manual reroll consumes ten shared dust, regardless of tier, with no ore requirement',()=>{
  const r=game();
  for(const tier of [1,4,10])assert.equal(r.run(`rerollCostFor({...g,tier:${tier}}).dust`),10);
  const before=json(r,'({gold:state.gold,ore:state.ore,dust:state.dust})');
  r.run('reroll(g.id)');
  assert.equal(r.run('state.dust'),0);assert.equal(r.run('state.ore'),before.ore);
  assert.equal(before.gold-r.run('state.gold'),r.run('rerollCostFor(g).gold'));
  assert.equal(r.run('inlineAffixDrafts.has(affixDraftKey(g))'),true);
  assert.match(r.run('forgeView()'),/data-item-key="粉塵"/);
  assert.deepEqual(r.errors,[]);
});

test('nine dust cannot pay for reroll even with abundant ore',()=>{
  const r=game();r.run('state.dust=9;state.ore=100000;');
  const before=r.run('JSON.stringify({gold:state.gold,ore:state.ore,dust:state.dust,affix:g.affix})');
  r.run('reroll(g.id);autoReroll(g.id,3)');
  assert.equal(r.run('JSON.stringify({gold:state.gold,ore:state.ore,dust:state.dust,affix:g.affix})'),before);
  assert.equal(r.run('inlineAffixDrafts.has(affixDraftKey(g))'),false);
});

test('manual save failure refunds dust and gold and restores locked affix materials',()=>{
  const r=game();r.run('g.affix=[{type:0,value:1,rank:0}];g.affixLock=0;state.materials["光輝碎塊"]=1;save=()=>false;');
  const before=r.run('JSON.stringify({gold:state.gold,dust:state.dust,ore:state.ore,shards:state.materials["光輝碎塊"],g})');
  r.run('reroll(g.id)');
  assert.equal(r.run('JSON.stringify({gold:state.gold,dust:state.dust,ore:state.ore,shards:state.materials["光輝碎塊"],g})'),before);
  assert.equal(r.run('inlineAffixDrafts.has(affixDraftKey(g))'),false);
});

async function flush(){await new Promise(resolve=>setImmediate(resolve));}
test('auto reroll charges ten dust per attempt and stops before a third attempt at five remaining',async()=>{
  const r=game(),queue=[];
  r.ctx.setTimeout=(callback,ms)=>{queue.push({callback,ms});return queue.length;};
  r.run('state.dust=25;rollAffixes=()=>[{type:0,value:1,rank:0}];autoReroll(g.id,3);');
  queue.shift().callback();await flush();
  assert.equal(r.run('state.dust'),15);
  queue.find(x=>x.ms===1000).callback();await flush();
  assert.equal(r.run('state.dust'),5);
  queue.filter(x=>x.ms===1000).at(-1).callback();await flush();
  assert.deepEqual(json(r,'autoRerollMeta.get(affixDraftKey(g))'),{attempts:2,target:3,reached:false,running:false,stopped:false,gold:160,dust:20});
  assert.equal(r.run('state.ore'),0);
  assert.match(r.run('inlineAffixComparison(g)'),/20 粉塵/);
  assert.deepEqual(r.errors,[]);
});

test('auto reroll refunds failed save without spending dust or leaving a draft',async()=>{
  const r=game(),queue=[];
  r.ctx.setTimeout=(callback,ms)=>{queue.push({callback,ms});return queue.length;};
  const gold=r.run('state.gold');r.run('save=()=>false;autoReroll(g.id,3)');
  queue.shift().callback();await flush();
  assert.equal(r.run('state.gold'),gold);assert.equal(r.run('state.dust'),10);assert.equal(r.run('state.ore'),0);
  assert.equal(r.run('inlineAffixDrafts.has(affixDraftKey(g))'),false);
  assert.equal(r.run('autoRerollMeta.get(affixDraftKey(g)).saveFailed'),true);
});

test('legacy imported ore costs migrate to ten dust without scaling by tier',()=>{
  const r=game();r.run('const cfg=exportableBalance();delete cfg.balance.affixes.rerollCost.dustPerRoll;cfg.balance.affixes.rerollCost.orePerTier=999;applyBalanceConfig(cfg);');
  assert.deepEqual(json(r,'rerollCostFor({...g,tier:10})'),{gold:800,dust:10});
  assert.equal(r.run('"orePerTier" in exportableBalance().balance.affixes.rerollCost'),false);
});
