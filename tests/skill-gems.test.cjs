const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const game=job=>{
 const r=loadRuntime(root);
 r.run('selectSaveSlot(1);start('+job+');closeModal();');
 return r;
};

test('five identities, three tiers, color mappings and reduced first-tier drop tables',()=>{
 const r=game(0);
 const gems=JSON.parse(r.run('JSON.stringify(GEMS)'));
 assert.equal(gems.length,15);
 assert.deepEqual(gems.slice(0,5).map(g=>g.name.split('・')[0]),['赤焰石','疾風石','靈巧石','生息石','守護石']);
 for(let tier=0;tier<3;tier++)for(let type=0;type<5;type++){
  const id=tier*5+type;
  assert.equal(gems[id].tier,tier+1);
  assert.equal(gems[id].kind,type);
 }
 const doc=JSON.parse(r.run('JSON.stringify(exportableBalance())'));
 const colors=['#EF5D5D','#49B976','#AE83EC','#E8EDF7','#64AAF0'];
 for(let id=0;id<15;id++)assert.equal(doc.inventoryIcons.find(x=>x.kind==='gem'&&x.key===String(id)).color,colors[id%5]);
 const drops=doc.balanceSettings.drops.entries.filter(x=>x.type==='gemPool');
 // v0.181: gem drops +10%.
 assert.deepEqual(drops.find(x=>x.id==='gem_map0_normal').chanceByDifficulty,[.033,.066,.11]);
 assert.deepEqual(drops.find(x=>x.id==='gem_map0_elite').chanceByDifficulty,[.099,.187,.297]);
 assert.deepEqual(drops.find(x=>x.id==='gem_map0_boss').chanceByDifficulty,[.297,.44,.605]);
 assert.deepEqual(r.errors,[]);
});

test('alchemy spends five tier-one gems and ten tier-two gems in the existing five-second work lane',async()=>{
 const r=game(0);
 // Resolve the offline manager's asynchronous persistence in this headless clock.
 r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run('playerHero().gems[0]=5;setTab("alchemy");');
 assert.match(r.elements.get('app').innerHTML,/赤焰石・1階 ×5/);
 assert.equal(r.run("startLifeWork('gem_0')"),true);
 // The combat tick performs asynchronous offline catch-up after a simulated
 // five-second clock jump. Exercise the life-work heartbeat directly here.
 r.advance(4999);r.run('tickLifeSkills()');
 assert.equal(r.run('playerHero().gems[0]'),5);
 assert.equal(r.run('__EMBERWILD_LIFE_SKILLS.jobs.work.elapsed'),4999);
 r.advance(1);r.run('tickLifeSkills()');
 await r.run('EmberwildOffline.settle()');
 assert.equal(r.run('playerHero().gems[0]'),0);
 assert.equal(r.run('playerHero().gems[5]'),1);
 assert.equal(r.run('__EMBERWILD_LIFE_SKILLS.jobs.work'),null);
 r.run('playerHero().gems[5]=10;');
 assert.equal(r.run("startLifeWork('gem_5')"),true);
 r.advance(5000);r.run('tickLifeSkills()');
 await r.run('EmberwildOffline.settle()');
 assert.equal(r.run('playerHero().gems[5]'),0);
 assert.equal(r.run('playerHero().gems[10]'),1);
 assert.equal(r.run("startLifeWork('gem_10')"),false,'no fourth tier recipe');
 const persisted=loadRuntime(root,'index.html',Object.fromEntries(r.values),r.now);
 persisted.run('continueFromTitle();closeModal()');
 assert.equal(persisted.run('playerHero().gems[0]'),0);
 assert.equal(persisted.run('playerHero().gems[10]'),1);
 assert.deepEqual(r.errors,[]);
 assert.deepEqual(persisted.errors,[]);
});

test('legacy three-kind gems refund from shared skill instances once and survive validated reloads',()=>{
 const r=game(0);
 r.ctx.legacy=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/legacy-skills-job0.json'),'utf8'));
 const out=json(r,`(()=>{
  const raw=structuredClone(legacy),h=raw.members[0],b=raw.buildSystem;
  h.gems=[4,8,12];h.sockets[0]=2;
  b.permanent.gemInstances={'old-red':0,'old-green':1,'old-resonance':2};
  const plan=b.plans[0];plan.sockets[0]='old-resonance';plan.sockets[2]='old-green';plan.sockets[4]='old-red';
  const converted=migrateLegacyGemSave(raw),valid=validateParty(raw);
  loadParty(raw);const first=[...state.gems];save();loadParty(structuredClone(packParty()));
  return {converted:converted.buildSystem.permanent.gemInstances,valid:valid.members[0].gems,first,again:state.gems,sockets:state.sockets,instances:party.buildSystem.permanent.gemInstances,rawStock:raw.members[0].gems,rawInstances:raw.buildSystem.permanent.gemInstances};
 })()`);
 assert.deepEqual(out.converted,{'old-red':0,'old-green':2,'old-resonance':3});
 assert.deepEqual(out.valid,[5,8,13,1,...Array(11).fill(0)]);assert.deepEqual(out.first,out.valid);assert.deepEqual(out.again,out.valid);
 assert(out.sockets.every(id=>id===null));assert.deepEqual(out.instances,{});assert.deepEqual(out.rawStock,[4,8,12]);assert.deepEqual(out.rawInstances,{'old-red':0,'old-green':1,'old-resonance':2});assert.deepEqual(r.errors,[]);
});

test('socket picker opens on click, lists only owned stock and removes depleted choices without selecting another gem',()=>{
 const r=game(0);
 const out=json(r,`(()=>{
  const h=playerHero(),g=findGear(h.equipped[0]),other=findGear(h.equipped[1]);delete g.skillId;
  g.skillSockets={version:1,count:2,gems:[0,null]};h.gems=Array(15).fill(0);
  const before=__EMBERWILD_SKILL_SYSTEM_UI.sockets(g);
  selectEquipmentSocket(g.id,1);const empty=__EMBERWILD_SKILL_SYSTEM_UI.sockets(g);
  const denied=socketEquipmentGem(g.id,1,0),afterDenied=[...g.skillSockets.gems];
  h.gems[5]=1;render();const owned=__EMBERWILD_SKILL_SYSTEM_UI.sockets(g),notAutoSelected=g.skillSockets.gems[1];
  const inserted=socketEquipmentGem(g.id,1,5),depleted=__EMBERWILD_SKILL_SYSTEM_UI.sockets(g);
  const removed=socketEquipmentGem(g.id,1,-1),refunded=__EMBERWILD_SKILL_SYSTEM_UI.sockets(g);
  __EMBERWILD_SKILL_SYSTEM_UI.sockets(other);const returned=__EMBERWILD_SKILL_SYSTEM_UI.sockets(g);
  return {before,empty,denied,afterDenied,owned,notAutoSelected,inserted,depleted,removed,refunded,returned,stock:h.gems[5]};
 })()`);
 assert.doesNotMatch(out.before,/equipment-socket-choices/);
 assert.match(out.empty,/目前沒有可鑲嵌的已持有寶石/);assert.doesNotMatch(out.empty,/data-equipment-gem=/);
 assert.equal(out.denied,false);assert.deepEqual(out.afterDenied,[0,null]);assert.equal(out.notAutoSelected,null);
 assert.equal((out.owned.match(/data-equipment-gem=/g)||[]).length,1);assert.match(out.owned,/data-equipment-gem="5"/);assert.doesNotMatch(out.owned,/data-equipment-gem="0"/);
 assert.equal(out.inserted,true);assert.doesNotMatch(out.depleted,/data-equipment-gem=/);assert.match(out.depleted,/第 2 孔 · 赤焰石/);
 assert.equal(out.removed,true);assert.equal(out.stock,1);assert.match(out.refunded,/data-equipment-gem="5"/);
 assert.doesNotMatch(out.returned,/equipment-socket-choices/);assert.deepEqual(r.errors,[]);
});

test('inventory badge renders only real sockets, with filled colors and accessible names',()=>{
 const r=game(0),rows=json(r,`Array.from({length:4},(_,count)=>{
  const g=gear(1,3,0,state.job),gems=Array(count).fill(null);
  if(count>=2)gems[1]=0;
  g.skillSockets={version:1,count,gems};
  return gearSlotHTML(g,{context:'inventory'});
 })`);
 for(let n=0;n<=3;n++){
  const badge=rows[n].split('class="equipment-socket-badge"')[1]||'';
  assert.equal((badge.match(/<circle/g)||[]).length,n);
  if(n>=2){assert.match(badge,/第 2 孔：赤焰石/);assert.match(badge,/fill="#ec5555"/);}
 }
});
