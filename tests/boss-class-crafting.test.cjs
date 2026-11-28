const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.run("start(0);state.tutorial=3;recruitCompanion(13);save();");return r;}
function json(r,code){return JSON.parse(r.run('JSON.stringify('+code+')'));}

test('BOSS recipes browse every class without selecting companions or changing the team class',()=>{
  const r=game();
  const out=json(r,`(()=>{
    const before=JSON.stringify(packParty().buildSystem),player=playerHero();
    selectPageHero('crafting',13);selectHero(13);
    const pages=CLASSES.map((c,j)=>{setBossCraftClass(j);return bossCraftView();});
    return {pages,before,after:JSON.stringify(packParty().buildSystem),job:player.job,selected:party.selected};
  })()`);
  for(const [j,html] of out.pages.entries()){
    assert.match(html,/boss-class-tabs/);
    assert.match(html,new RegExp('craftBoss\\(0,'+j+'\\)'));
    assert.doesNotMatch(html,/page-hero-tabs|selectPageHero|heroMenuAction/);
  }
  assert.equal(out.before,out.after);assert.equal(out.job,0);assert.equal(out.selected,13);
  assert.deepEqual(r.errors,[]);
});

test('BOSS crafting uses the selected class and shared resources even when a companion is selected',()=>{
  const r=game();
  const out=json(r,`(()=>{
    selectHero(13);const player=playerHero(),job=player.job,planJob=__EMBERWILD_TEAMS.plan().job;
    player.gold=100000;player.materials[bossMaterial(0,0)]=40;
    const beforeGold=player.gold,beforeMat=player.materials[bossMaterial(0,0)],before=player.bag.length;
    const made=CLASSES.map((c,j)=>{setBossCraftClass(j);craftBoss(0);return {...player.bag.at(-1)};});
    return {made,job,afterJob:player.job,planJob,afterPlan:__EMBERWILD_TEAMS.plan().job,
      goldSpent:beforeGold-player.gold,materialSpent:beforeMat-player.materials[bossMaterial(0,0)],added:player.bag.length-before,
      cost:Math.round(regionTier(0)*GS('equipment.boss.craftGoldPerTier',250)),need:Math.round(GS('equipment.boss.craftMaterialCount',5))};
  })()`);
  assert.deepEqual(out.made.map(g=>g.job),[0,1,2,3]);
  assert(out.made.every(g=>g.boss===0&&g.region===0));
  assert.equal(out.added,4);assert.equal(out.goldSpent,out.cost*4);assert.equal(out.materialSpent,out.need*4);
  assert.equal(out.job,out.afterJob);assert.equal(out.planJob,out.afterPlan);
});

test('invalid classes and forbidden final-map recipes cannot spend resources or create gear',()=>{
  const r=game();
  const out=json(r,`(()=>{
    const h=playerHero();h.gold=100000;h.lv=30;save();
    h.materials[bossMaterial(0,0)]=40;const before={gold:h.gold,materials:JSON.stringify(h.materials),gear:h.bag.length};
    for(const j of [-1,99,1.5,'1'])craftBoss(0,j);
    craftBoss(6,1);setBossCraftClass(99);
    return {before,after:{gold:h.gold,materials:JSON.stringify(h.materials),gear:h.bag.length}};
  })()`);
  assert.deepEqual(out.after,out.before);
});
