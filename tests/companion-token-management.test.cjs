const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),M=require('../js/items/companion-token-model.js');
const root=path.resolve(__dirname,'..');
test('token management closes without replacement; owner and class labels share validated settings',()=>{
 const r=loadRuntime(root);r.run(`start(0);closeModal();for(const id of [10,12,13,14])recruitCompanion(id);closeModal();`);
 const out=JSON.parse(r.run(`JSON.stringify((()=>{
  const cfg=exportableBalance(),h=partyMember(10),g=__EMBERWILD_TOKEN_TEST.makeToken('berserk');state.bag.push(g);equipCompanionToken(g.id,10);
  const before=h.tokenId;showCompanionTokens(10);const markup=$('modal').innerHTML;
  const header=markup.split('</div>')[0],close=header.match(/onclick="([^"]+)"/)[1];eval(close);
  const closed=!$('modal').open&&h.tokenId===before,slot=gearSlotHTML(g),owner=characterName(h);
  copyTeamPlan();const eligibility=[];for(let job=0;job<4;job++){cfg.companionTokens.catalog[0].job=String(job);applyBalanceConfig(cfg);eligibility.push(party.members.filter(x=>x.companionId!==undefined).map(x=>({job:x.job,allowed:EmberwildTokens.canEquip(g,x)})));}
  const clearedPlans=party.buildSystem.plans.every(p=>p.tokens[10]===null);
  const wrong=equipCompanionToken(g.id,10),right=equipCompanionToken(g.id,13);save();const raw=packParty();loadParty(raw);const reloaded=partyMember(13).tokenId===g.id;
  const exported=exportableBalance().companionTokens.catalog[0].job,label=companionTokenJobLabel(g);
  cfg.companionTokens.catalog[0].job='all';applyBalanceConfig(cfg);const common=EmberwildTokens.canEquip(findGear(g.id),partyMember(10));
  return {closed,header,slot,owner,eligibility,wrong,right,reloaded,exported,label,common,clearedPlans,allCommon:cfg.companionTokens.catalog.slice(1).every(x=>x.job==='all')};
 })())`));
 assert(out.closed);assert.match(out.header,/關閉/);assert.match(out.slot,/通用/);assert(out.slot.includes(out.owner));assert.match(out.slot,/已裝備/);
 for(const [job,rows]of out.eligibility.entries())for(const row of rows)assert.equal(row.allowed,row.job===job);
 assert.equal(out.wrong,false);assert(out.right);assert(out.reloaded);assert.equal(out.exported,'3');assert.equal(out.label,'牧師');assert(out.common);assert(out.clearedPlans);assert(out.allCommon);assert.deepEqual(r.errors,[]);
 const old=M.copy(M.defaults);for(const d of old.catalog)delete d.job;assert(M.normalize(old).catalog.every(d=>d.job==='all'));
 for(const job of [-1,4,0,'mage',null]){const cfg=M.copy(M.defaults);cfg.catalog[0].job=job;assert.throws(()=>M.normalize(cfg),/信物職業/);}
});

const json=(r,s)=>JSON.parse(r.run('JSON.stringify('+s+')'));
function inventory(){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();recruitCompanion(10);closeModal();setInventoryCategory('tokens');globalThis.fixture=(id,type='berserk',quality=1,plus=0)=>{const g=__EMBERWILD_TOKEN_TEST.makeToken(type,quality);g.id=id;g.plus=plus;state.bag.push(g);return g;};`);return r;}
test('token filters combine name, job, quality, enhancement, lock, worn and live numeric values; sorting is stable',()=>{
 const r=inventory();r.run(`globalThis.a=fixture('token-a','berserk',2,3),b=fixture('token-b','guardian',1,0),c=fixture('token-c','berserk',2,5);const cfg=exportableBalance();cfg.companionTokens.catalog.find(t=>t.id==='guardian').job='0';applyBalanceConfig(cfg,{persist:false});setTokenFilter('name','狂戰');setTokenFilter('quality','2');setTokenFilter('plusMin','3');setTokenFilter('plusMax','4');`);
 assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-a']);
 r.run(`clearTokenFilters();setTokenFilter('job','common');`);assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-c','token-a']);
 r.run(`setTokenFilter('job','0');`);assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-b']);
 r.run(`clearTokenFilters();equipCompanionToken(b.id,10);setTokenFilter('worn','yes');`);assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-b']);
 r.run(`clearTokenFilters();toggleGearLock(a.id);setTokenFilter('locked','yes');`);assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-a']);
 r.run(`clearTokenFilters();setTokenSort('enhance');`);assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-c','token-a','token-b']);r.run('toggleTokenDirection()');assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.rows().map(r=>r.g.id)'),['token-b','token-a','token-c']);
 r.run(`setTokenFilter('stat','atk');setTokenFilter('op','range');setTokenFilter('value','1');setTokenFilter('upper','100');`);assert(r.run('__EMBERWILD_TOKEN_INVENTORY.rows().length')>0);assert(r.run('__EMBERWILD_TOKEN_INVENTORY.rows().every(r=>r.stats.atk>=1&&r.stats.atk<=100)'));
 assert.match(r.run('equipmentView()'),/屬性數值篩選/);assert.deepEqual(r.errors,[]);
});
test('token select-all keeps gear, locks, wearer and saved plans; sale revalidates and grants once',()=>{
 const r=inventory();r.run(`globalThis.a=fixture('sell-a'),b=fixture('sell-b'),locked=fixture('locked'),worn=fixture('worn'),plan=fixture('plan');locked.locked=true;equipCompanionToken(worn.id,10);copyTeamPlan();party.buildSystem.plans[1].tokens[10]=plan.id;toggleTokenMulti();selectVisibleTokens();`);
 assert.deepEqual(json(r,'__EMBERWILD_TOKEN_INVENTORY.selection()').sort(),['sell-a','sell-b']);assert.equal(r.run("toggleTokenSelected(state.bag.find(g=>!EmberwildTokens.isToken(g)).id,true)"),false);
 r.run(`globalThis.before=state.gold;requestTokenBatch('sell');b.locked=true;`);assert.equal(r.run('confirmTokenBatch()'),false);assert.match(r.elements.get('modal').innerHTML,/實際出售 1 件信物/);assert.equal(r.run('confirmTokenBatch()'),true);assert.equal(r.run('state.gold-before'),r.run('equipmentSellPrice(a)'));assert.equal(r.run('confirmTokenBatch()'),false);
 for(const id of ['sell-b','locked','worn','plan'])assert(r.run(`!!findGear('${id}')`));assert.equal(r.run("!!findGear('sell-a')"),false);assert(r.run('state.bag.some(g=>!EmberwildTokens.isToken(g))'));
 r.run('loadParty(packParty())');assert.equal(r.run("!!findGear('sell-a')"),false);assert.deepEqual(r.errors,[]);
});
test('token batch salvage uses existing quality/enhance rewards and rolls back failed save',()=>{
 const r=inventory();r.run(`globalThis.a=fixture('salvage-a','berserk',2,3),b=fixture('salvage-b','guardian',1,1);setTokenFilter('name','狂戰');toggleTokenMulti();selectVisibleTokens();setTokenFilter('quality','1');`);assert.equal(r.run('__EMBERWILD_TOKEN_INVENTORY.selection().length'),0);
 r.run(`clearTokenFilters();selectVisibleTokens();requestTokenBatch('salvage');globalThis.before={ore:state.ore,dust:state.dust,ids:state.bag.map(g=>g.id)},expected=[a,b].map(g=>update12SalvageRewards(g,true));globalThis.realSave=save;save=()=>false;`);
 assert.match(r.elements.get('modal').innerHTML,/實際分解 2 件信物/);assert.equal(r.run('confirmTokenBatch()'),false);assert.deepEqual(json(r,'({ore:state.ore,dust:state.dust,ids:state.bag.map(g=>g.id)})'),json(r,'before'));
 r.run('save=realSave');assert.equal(r.run('confirmTokenBatch()'),true);assert.equal(r.run('state.ore-before.ore'),r.run('expected.reduce((n,v)=>n+v.ore,0)'));assert.equal(r.run('state.dust-before.dust'),r.run('expected.reduce((n,v)=>n+v.dust,0)'));assert.deepEqual(r.errors,[]);
});
test('token chance tracks ordinary equipment for normal/elite/boss in all difficulties, boosts and level gaps',()=>{
 const r=inventory();const out=json(r,`(()=>{const rows=[];for(const kind of ['normal','elite','boss','final'])for(let difficulty=0;difficulty<3;difficulty++){const e={monsterId:kind==='boss'?'map0_boss':kind==='final'?'map6_boss':'map0_mob0',kind,difficulty,region:kind==='final'?6:0,lv:1};const rules=configuredDropRules(e).filter(r=>['gear','equipment'].includes(r.type));rows.push({actual:__EMBERWILD_TOKEN_TEST.tokenDropChance(e),expected:1-rules.reduce((n,r)=>n*(1-effectiveDropChance(r,e)),1)});}const e={monsterId:'map0_mob0',kind:'normal',difficulty:0,region:0,lv:1},normal=__EMBERWILD_TOKEN_TEST.tokenDropChance(e);party.timedBoosts=[{itemId:'drop_50_30m',name:'測試',boostType:'drop',bonusPercent:50,remainingMs:60000,enabled:true}];const boosted=__EMBERWILD_TOKEN_TEST.tokenDropChance(e);state.lv=60;syncParty();const attenuated=__EMBERWILD_TOKEN_TEST.tokenDropChance(e);const cfg=exportableBalance();cfg.companionTokens.drop.chanceByDifficulty=[1,1,1];applyBalanceConfig(cfg,{persist:false});const boundary=__EMBERWILD_TOKEN_TEST.rollTokens({...e},()=>.02).length;GAMEPLAY_SETTINGS.drops.entries=GAMEPLAY_SETTINGS.drops.entries.filter(r=>r.type!=='gear'&&r.type!=='equipment');const disabled=__EMBERWILD_TOKEN_TEST.tokenDropChance(e);return {rows,normal,boosted,attenuated,boundary,disabled};})()`);
 for(const row of out.rows)assert.equal(row.actual,row.expected);// Derived from the configured equipment drop rate (rebalanced since 0.24%), not a fixed number.
 assert(out.normal>0);assert(Math.abs(out.normal-out.rows[0].expected)<1e-10);assert(Math.abs(out.boosted/out.normal-1.5)<1e-8);assert(out.attenuated<out.boosted);assert.equal(out.boundary,0);assert.equal(out.disabled,0);assert.deepEqual(r.errors,[]);
});
test('token backpack uses three columns and selects persistent details without opening an item dialog',()=>{
 const r=inventory();r.run(`globalThis.a=fixture('detail-a','berserk'),b=fixture('detail-b','guardian');selectInventoryToken(b.id);`);const html=r.run('equipmentView()');
 assert.match(html,/token-inventory-layout/);assert.match(html,/aria-label="信物詳細說明"/);assert.match(html,/token-inventory-detail[^]*?守護信物/);assert.match(html,/onclick="selectInventoryToken\('detail-b'\)"/);assert.doesNotMatch(html,/openItemSlotDetails/);assert.notEqual(r.elements.get('item-detail-dialog')?.open,true);
 const fs=require('node:fs'),css=fs.readFileSync(path.join(root,'css/companion-tokens.css'),'utf8');assert.match(css,/\.token-management-panel \.token-inventory-list\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);assert.match(css,/@media\(max-width:1000px\)/);assert.deepEqual(r.errors,[]);
});
