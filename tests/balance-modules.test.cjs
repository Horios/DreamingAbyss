'use strict';
// Modular balance sources: exact round trip, manifest integrity, reference index and incremental validation scope.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),M=require('../js/balance/balance-modules.js'),tool=require('../scripts/balance-modules.cjs');
for(const f of ['js/combat/seconds-schema.js','js/skills/skill-system-model.js','js/world/wishing-lake-model.js','js/story/story-model.js','js/ui/inventory-icon-model.js'])require(path.join(root,f));
const D=require('../js/balance/balance-document.js');
const text=fs.readFileSync(path.join(root,'data/balance.json'),'utf8'),doc=JSON.parse(text),sha=s=>crypto.createHash('sha256').update(s).digest('hex');

test('split and assemble are exact inverses of data/balance.json (bytes, key order, values)',()=>{
 const a=M.split(doc),b=M.split(JSON.parse(text));
 assert.equal(M.serialize(M.assemble(structuredClone(a.modules),a.layout)),text);
 for(const m of M.MODULES)assert.equal(M.serialize(a.modules[m.id]??null),M.serialize(b.modules[m.id]??null),'deterministic '+m.id);
 assert.equal(M.serialize(M.assemble(a.modules,{})).length,text.length,'missing layout keeps every value');
});

test('every top-level and nested setting has exactly one owning module',()=>{
 const {modules}=M.split(doc),seen=new Map();
 for(const m of M.MODULES){const v=modules[m.id];if(v===undefined)continue;const keys=m.key?[m.key]:Object.keys(v);for(const k of keys){const p=(m.container?m.container+'.':'')+k;assert(!seen.has(p),p+' owned by '+seen.get(p)+' and '+m.id);seen.set(p,m.id);}}
 for(const k of Object.keys(doc))if(!M.CONTAINERS.includes(k))assert(seen.has(k),'root key '+k);
 for(const c of M.CONTAINERS.slice(1))for(const k of Object.keys(doc[c]))assert(seen.has(c+'.'+k),c+'.'+k);
 assert.throws(()=>M.assemble({...modules,'meta/document':{...modules['meta/document'],items:[]}},{}),/應由其他模組維護/);
});

test('committed module sources, manifest hashes and the generated data/balance.json agree',()=>{
 const r=tool.check();assert.equal(r.modules,M.MODULES.length);assert.equal(r.legacy,false);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/balance/manifest.json'),'utf8'));
 assert.deepEqual(M.checkManifest(manifest),[]);assert.equal(manifest.integrated.sha256,sha(text));
 for(const row of manifest.modules){const file=path.join(root,'data/balance',row.file);assert.equal(fs.existsSync(file),row.present,row.id);if(row.present)assert.equal(sha(fs.readFileSync(file,'utf8')),row.sha256,row.id);}
});

test('manifest versions advance only for modules whose content changed',()=>{
 const {layout,modules}=M.split(doc),hash=v=>({sha256:sha(M.serialize(v)),bytes:1}),hashes=Object.fromEntries(Object.entries(modules).filter(([,v])=>v!==undefined).map(([k,v])=>[k,hash(v)]));
 const first=M.createManifest({layout,hashes,integrated:{sha256:'0'.repeat(64),bytes:1}});
 const edited=structuredClone(modules['world/monsters']);edited.catalog[0].hpMultiplier+=0.5;
 const second=M.createManifest({layout,hashes:{...hashes,'world/monsters':hash(edited)},integrated:{sha256:'1'.repeat(64),bytes:1},previous:first});
 assert.equal(second.dataRevision,first.dataRevision+1);
 for(const row of second.modules)assert.equal(row.version,first.modules.find(x=>x.id===row.id).version+(row.id==='world/monsters'?1:0),row.id);
 assert.equal(M.createManifest({layout,hashes:{...hashes,'world/monsters':hash(edited)},integrated:{sha256:'1'.repeat(64),bytes:1},previous:second}).dataRevision,second.dataRevision);
});

test('change paths separate record values, key fields and structural changes',()=>{
 const after=structuredClone(doc),i=after.balanceSettings.monsters.catalog.findIndex(m=>m.kind==='normal');
 after.balanceSettings.monsters.catalog[i].hpMultiplier=2;
 let p=M.changes(doc.balanceSettings.monsters,after.balanceSettings.monsters,'balanceSettings.monsters'),c=M.classify(p,{before:doc,after});
 assert.deepEqual(c.map(x=>[x.path,x.kind,x.module,x.record.id]),[['balanceSettings.monsters.catalog.'+i+'.hpMultiplier','value','world/monsters',after.balanceSettings.monsters.catalog[i].id]]);
 after.balanceSettings.monsters.catalog[i].mapIndex=1;
 c=M.classify(M.changes(doc.balanceSettings.monsters,after.balanceSettings.monsters,'balanceSettings.monsters'),{before:doc,after});
 assert.deepEqual(c.map(x=>x.kind).sort(),['key','value']);
 const removed=structuredClone(doc);removed.balanceSettings.monsters.catalog.splice(i,1);
 c=M.classify(M.changes(doc.balanceSettings.monsters,removed.balanceSettings.monsters,'balanceSettings.monsters'));
 assert.deepEqual(c.map(x=>[x.path,x.kind]),[['balanceSettings.monsters.catalog','structure']]);
});

test('reference index finds every record that uses an id and reports deletions with locations',()=>{
 const id=doc.balanceSettings.monsters.catalog[1].id,index=M.referenceIndex(doc),rows=index.referencesTo('monster',id);
 assert(rows.length>0);assert(rows.every(r=>r.module==='world/drops'&&r.path.startsWith('balanceSettings.drops.entries.')));
 assert.deepEqual(index.broken(),[],'published data has no broken references');
 const removed=structuredClone(doc);removed.balanceSettings.monsters.catalog=removed.balanceSettings.monsters.catalog.filter(m=>m.id!==id);
 const broken=M.referenceIndex(removed).broken(['world/monsters']);
 assert.deepEqual(broken.map(r=>r.path).sort(),rows.map(r=>r.path).sort());
 assert(M.dependents('world/monsters').includes('world/drops'));assert(M.dependencies().get('world/drops').includes('world/monsters'));
});

// Every problem the full shared check finds after a mutation must also be found by the scoped check.
const mutations={
 'monster value (no rule)':d=>{d.balanceSettings.monsters.catalog[0].hpMultiplier=3;},
 'negative item cost':d=>{d.items[0].cost=-5;},
 'drop chance out of range':d=>{d.balanceSettings.drops.entries[0].chanceByDifficulty=[2,0,0];},
 'duplicate skill id':d=>{d.skillSystem.definitions[1].id=d.skillSystem.definitions[0].id;},
 'deleted monster':d=>{d.balanceSettings.monsters.catalog.splice(1,1);},
 'deleted item':d=>{const id=d.balanceSettings.drops.entries.find(r=>r.type==='item')?.key||d.items[0].id;d.items=d.items.filter(x=>x.id!==id);},
 'drop source renamed':d=>{d.balanceSettings.drops.entries[0].sources=['missing_monster'];},
 'invalid skill timing':d=>{d.skillSystem.definitions[0].timing.mpCost=-1;},
 'invalid monster timing':d=>{d.balanceSettings.monsters.catalog[0].timing.baseIntervalSeconds=0;},
 'removed map':d=>{d.balanceSettings.maps.catalog.pop();},
 'life recipe item':d=>{const r=Object.values(d.lifeSkills.recipes)[0];r.output='missing_item';r.outputType='item';},
 'story quest broken':d=>{d.story.quests[0].stages[0].id='';},
 'quest removed':d=>{const side=d.balanceSettings.quests.design.side;if(side?.length)side.shift();},
 'unknown availability':d=>{d.companions[0].availability='nope';}
};
const key=e=>e.field+'|'+e.reason;
for(const [name,mutate] of Object.entries(mutations))test('scoped validation equals the full check for: '+name,()=>{
 const base=new Set(D.inspect(doc).map(key)),after=structuredClone(doc);mutate(after);
 const paths=[];for(const m of M.MODULES)for(const p of new Set(M.modulePaths(m.id,after).concat(M.modulePaths(m.id,doc))))paths.push(...M.changes(M.get(doc,p),M.get(after,p),p));
 const full=D.inspect(after).map(key).filter(k=>!base.has(k)),report={},scoped=new Set(D.inspect(after,{scope:M.scope(paths),report}).map(key));
 for(const k of full)assert(scoped.has(k),name+': scoped check missed '+k+' (ran '+report.blocks+')');
});

test('one monster HP edit runs only the field rules of that record, not other modules',()=>{
 const after=structuredClone(doc);after.balanceSettings.monsters.catalog[0].hpMultiplier=1.5;
 const report={},p=M.changes(doc.balanceSettings.monsters,after.balanceSettings.monsters,'balanceSettings.monsters');
 assert.deepEqual(D.inspect(after,{scope:M.scope(p),report}),[]);
 assert.deepEqual(report.blocks,['field-rules(1)']);
 const full={};D.inspect(after,{report:full});assert(full.blocks.length>10);
 const removed=structuredClone(doc);removed.balanceSettings.monsters.catalog.splice(1,1);
 const r2={};D.inspect(removed,{scope:M.scope(M.changes(doc.balanceSettings.monsters,removed.balanceSettings.monsters,'balanceSettings.monsters')),report:r2});
 for(const b of ['drops','story','catalogue','wishingLake'])assert(r2.blocks.includes(b),'deleting a monster checks '+b);
});

test('test selection follows the data a test reads and widens for key changes',()=>{
 const value=[...tool.testsFor(['world/monsters']).keys()],widened=[...tool.testsFor(['world/monsters',...M.dependents('world/monsters')]).keys()];
 assert(value.length>0&&value.length<tool.gateTests().length/3,'a monster value change selects a small subset ('+value.length+')');
 assert(widened.length>value.length);assert(value.every(f=>widened.includes(f)));
 assert(!value.includes('tests/wishing-lake.test.cjs'));
});
