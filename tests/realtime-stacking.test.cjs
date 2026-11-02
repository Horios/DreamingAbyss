const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),plain=x=>JSON.parse(JSON.stringify(x));
async function game(){const g=loadRuntime(root);g.ctx.setTimeout=fn=>setImmediate(fn);g.run('selectSaveSlot(1);start(0);closeModal();running=false;');await g.run('EmberwildOffline.settle()');return g;}

test('All five real-time consumables extend remaining time without duplicating strength',async()=>{
  const g=await game();
  for(const id of ['exp_100_30m','drop_50_30m','ward_fire','elementTonic_fire']){
    g.ctx.itemId=id;
    const result=plain(g.run(`(()=>{const api=EmberwildTimedBoosts,item=SHOP.find(x=>x.id===itemId),rows=()=>item.type==='timedBoost'?party.timedBoosts.filter(b=>b.itemId===itemId):api.buffRows(state[item.type]);state.consumables[itemId]=2;useSupply(itemId);const first=rows()[0].remainingMs;useSupply(itemId);return {count:rows().length,first,remaining:rows()[0].remainingMs,minutes:item.durationMinutes,inventory:state.consumables[itemId]};})()`));
    assert.equal(result.remaining,result.first+result.minutes*60000);
    assert.equal(result.count,1);assert.equal(result.inventory,0);
  }
  assert.equal(g.run("EmberwildTimedBoosts.bonus(party,'exp')"),100);
  assert.equal(g.run("supplyEffect(state,'ward','fire')"),.25);
  assert.deepEqual(g.errors,[]);
});

test('Different strengths and elements keep independent states, stats, timers and combat effects',async()=>{
  const g=await game();g.ctx.setTimeout=fn=>setImmediate(fn);
  g.run(`{const cfg=exportableBalance(),source=cfg.items.find(x=>x.id==='ward_fire');
    cfg.items.push({...source,id:'ward_strong',effectPercent:40,durationMinutes:1,statEffects:{hp:50,attack:7}});
    cfg.items.push({...cfg.items.find(x=>x.id==='elementTonic_fire'),id:'tonic_strong',effectPercent:55,durationMinutes:1});
    cfg.items.push({...cfg.items.find(x=>x.id==='exp_100_30m'),id:'exp_strong',bonusPercent:35,durationMinutes:1});
    applyBalanceConfig(cfg,{persist:false});
    for(const id of ['ward_fire','ward_ice','ward_strong','elementTonic_fire','tonic_strong','exp_100_30m','exp_strong']){state.consumables[id]=1;useSupply(id);}}
  `);
  assert.equal(g.run("activeSupplies(state,'ward').length"),3);
  assert.equal(g.run("supplyEffect(state,'ward','fire')"),.65);
  assert.equal(g.run("supplyEffect(state,'ward','ice')"),.25);
  assert.equal(g.run("supplyEffect(state,'elementTonic','fire')"),.75);
  assert.equal(g.run("EmberwildTimedBoosts.bonus(party,'exp')"),135);
  const hp=g.run('stats().hp');
  assert(g.run('battleBuffRows()').includes('40%'));
  assert(g.run('battleBuffRows()').includes('55%'));
  g.run('save();loadParty(packParty());');
  assert.equal(g.run("activeSupplies(state,'ward').length"),3);
  g.advance(60000);await g.run('EmberwildOffline.settle()');
  assert.equal(g.run("supplyEffect(state,'ward','fire')"),.25);
  assert.equal(g.run("supplyEffect(state,'ward','ice')"),.25);
  assert.equal(g.run("supplyEffect(state,'elementTonic','fire')"),.2);
  assert.equal(g.run("EmberwildTimedBoosts.bonus(party,'exp')"),100);
  assert.equal(g.run('stats().hp'),hp-50);
  assert(!g.run('battleBuffRows()').includes('40%'));
  const restarted=loadRuntime(root,'index.html',{...Object.fromEntries(g.values),[g.run('BALANCE_KEY')]:g.run('JSON.stringify(exportableBalance())')},g.now+6*60000);
  restarted.ctx.setTimeout=fn=>setImmediate(fn);
  restarted.run('continueFromTitle();closeModal();');await restarted.run('EmberwildOffline.settle()');
  assert.equal(restarted.run("activeSupplies(state,'ward').length"),0);
  assert.equal(restarted.run("activeSupplies(state,'elementTonic').length"),0);
  assert.equal(restarted.run("EmberwildTimedBoosts.buffRows(state.ward).every(b=>b.remainingMs===0&&b.enabled===false)"),true);
  assert.equal(restarted.run("EmberwildTimedBoosts.active(party).filter(b=>b.boostType==='exp').length"),1);
  assert.equal(restarted.run("party.timedBoosts.some(b=>b.boostType==='exp'&&b.remainingMs===0&&b.enabled===false)"),true);
  assert.deepEqual(g.errors,[]);assert.deepEqual(restarted.errors,[]);
});

test('24 hour boundary accepts an exact fit and rejects excess without consuming any kind of item',async()=>{
  const g=await game();
  for(const id of ['exp_100_30m','drop_50_30m','ward_fire','elementTonic_fire']){
    g.ctx.itemId=id;
    g.run(`{const item=SHOP.find(x=>x.id===itemId);state.consumables[itemId]=3;useSupply(itemId);const rows=item.type==='timedBoost'?party.timedBoosts:EmberwildTimedBoosts.buffRows(state[item.type]);rows.find(b=>b.itemId===itemId).remainingMs=86400000-item.durationMinutes*60000;useSupply(itemId);}`);
    assert.equal(g.run(`(()=>{const item=SHOP.find(x=>x.id===itemId),rows=item.type==='timedBoost'?party.timedBoosts:EmberwildTimedBoosts.buffRows(state[item.type]);return rows.find(b=>b.itemId===itemId).remainingMs;})()`),86400000);
    const before=g.run('JSON.stringify(packParty())');
    g.run('useSupply(itemId);');
    assert.equal(g.run('JSON.stringify(packParty())'),before);
    assert.equal(g.run('state.consumables[itemId]'),1);
    assert.match(g.elements.get('toast').textContent,/24 小時.*未消耗道具/);
    assert.match(g.run('supplyDetail(SHOP.find(x=>x.id===itemId))'),/24 小時/);
  }
  // A different source still has its own 24 hour allowance.
  g.run("state.consumables.ward_ice=1;useSupply('ward_ice');");
  assert.equal(g.run("activeSupplies(state,'ward').length"),2);
  // One millisecond over the boundary must also be refused, without clipping time.
  g.run("EmberwildTimedBoosts.buffRows(state.ward)[0].remainingMs=86400000-300000+1;useSupply('ward_fire');");
  assert.equal(g.run('state.consumables.ward_fire'),1);
});

test('Failed saves roll back both stacked and new states and preserve inventory',async()=>{
  const g=await game();
  for(const id of ['exp_100_30m','ward_fire']){
    g.ctx.itemId=id;
    for(const existing of [false,true]){
      g.run('state.consumables[itemId]=2;');
      if(existing)g.run('useSupply(itemId);');
      const before=g.run('JSON.stringify(packParty())');
      g.run('(()=>{const original=save;save=()=>false;try{useSupply(itemId);}finally{save=original;}})();');
      assert.equal(g.run('JSON.stringify(packParty())'),before);
    }
  }
});

test('Legacy singleton saves retain deadlines and merge the next dose, while malformed sources reject',async()=>{
  const g=await game();
  g.run("state.consumables.ward_fire=2;useSupply('ward_fire');delete state.ward.name;delete state.ward.itemId;save();loadParty(packParty());");
  const deadline=g.run('state.ward.remainingMs');
  g.advance(10000);await g.run("EmberwildOffline.settle()");
  assert.equal(g.run('state.ward.remainingMs'),deadline-10000);
  g.run("useSupply('ward_fire');");
  assert.equal(g.run('state.ward.remainingMs'),deadline-10000+300000);
  assert.equal(g.run('state.ward.itemId'),'ward_fire');
  assert.equal(g.run('EmberwildTimedBoosts.buffRows(state.ward).length'),1);
  for(const mutation of ["p.members[0].ward=[p.members[0].ward,p.members[0].ward]","p.members[0].ward.remainingMs=Infinity","p.members[0].ward=[{...p.members[0].ward,element:'bad'}]"]){
    assert(g.run(`(()=>{const p=structuredClone(packParty());${mutation};try{validateParty(p);return false;}catch{return true;}})()`));
  }
});
