const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run(`JSON.stringify(${code})`));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}
function listIds(html){return [...html.matchAll(/onclick="chooseForge\('([^']+)'\)"/g)].map(m=>m[1]).sort();}

test('Workshop starts with an empty bench and its category pickers list the initial white set as SVG slots',()=>{
  const r=game(),out=json(r,`(()=>{
    const ids=state.equipped.filter(Boolean),empty=forgeView(),lists={};
    for(const c of ['weapon','armor','accessory','token']){setWorkshopCategory(c);toggleWorkshopPicker(true);lists[c]=forgeView();}
    chooseForge(ids[0]);const selected=forgeView(),g=findGear(ids[0]);state.ore=10000;state.dust=10000;
    return {ids,empty,lists,selected,canEnhance:canEnhance(g),category:__EMBERWILD_WORKSHOP.categoryOf(g),state:__EMBERWILD_WORKSHOP.state()};
  })()`);
  assert.equal(out.ids.length,5);
  assert.doesNotMatch(out.empty,/onclick="enhance/);assert.match(out.empty,/workshop-slot empty/);
  for(const c of ['weapon','armor','accessory','token'])assert.match(out.empty,new RegExp(`data-workshop-category="${c}"`));
  const listed=[...listIds(out.lists.weapon),...listIds(out.lists.armor),...listIds(out.lists.accessory)].sort();
  assert.deepEqual(listed,out.ids.sort());assert.deepEqual(listIds(out.lists.token),[]);
  assert.equal(listIds(out.lists.weapon).length,2,'weapon category holds weapon and off-hand');
  assert.match(out.lists.weapon,/<svg/);
  assert.match(out.selected,/目前能力/);assert.match(out.selected,/onclick="enhance/);assert.equal(out.canEnhance,true);
  assert.equal(out.state.category,out.category);assert.equal(out.state.pickerOpen,false);
  assert.deepEqual(r.errors,[]);
});

test('Workshop picker counts follow real shared ownership, including an unequipped starter',()=>{
  const r=game(),out=json(r,`(()=>{
    const starter=state.equipped[0],drop=gear(1,0,0,0);state.bag.push(drop);
    unequipSharedGear(starter);setWorkshopCategory('weapon');toggleWorkshopPicker(true);const all=forgeView();
    setForgeWearFilter('equipped');const equipped=forgeView();
    setForgeWearFilter('unequipped');const spare=forgeView();
    openForge(drop.id);const opened=forgeView();
    return {starter,drop:drop.id,offhand:state.equipped[2],all,equipped,spare,opened,selection:forgeSelection,tab};
  })()`);
  assert.match(out.all,/全部 3/);assert.match(out.all,/穿戴中 1/);assert.match(out.all,/未穿戴 2/);
  assert.deepEqual(listIds(out.equipped),[out.offhand]);
  assert.deepEqual(listIds(out.spare),[out.starter,out.drop].sort());
  assert.equal(out.selection,out.drop);assert.equal(out.tab,'forge');
  assert.match(out.opened,new RegExp(`workshop-slot filled[\\s\\S]*data-item-gear="${out.drop}"`));assert.match(out.opened,/未穿戴<\/small>/);
  assert.doesNotMatch(out.opened,/workshop-picker"/,'placing an item closes the picker');
  assert.deepEqual(r.errors,[]);
});

test('Ordinary equipped gear retains enhancement costs and random-affix reroll controls',()=>{
  const r=game(),out=json(r,`(()=>{
    const g=gear(1,0,0,0);state.bag.push(g);equipSharedGear(g.id,memberKey(playerHero()),0);
    state.gold=10000;state.ore=10000;state.dust=10000;state.materials['以太鍛鐵']=1000;
    openForge(g.id);const html=forgeView(),ore=state.ore,cost=upgradeMaterials(g),gold=state.gold,rerollCost=rerollCostFor(g);
    enhance(g.id);reroll(g.id);
    return {id:g.id,html,cost,ore,afterOre:state.ore,gold,afterGold:state.gold,rerollCost,plus:g.plus,draft:inlineAffixDrafts.has(affixDraftKey(g)),worn:state.equipped[0]};
  })()`);
  assert.match(out.html,new RegExp(`workshop-slot filled[\\s\\S]*data-item-gear="${out.id}"`));
  assert.match(out.html,/data-workshop-action="reroll"/);
  assert.match(out.html,new RegExp(`onclick="enhance\\('${out.id}'\\)"`));
  assert.match(out.html,new RegExp(`onclick="reroll\\('${out.id}'\\)"`));
  assert.equal(out.plus,1);assert.equal(out.worn,out.id);assert(out.draft);
  assert.equal(out.ore-out.afterOre,out.cost.ore);
  assert.equal(out.gold-out.afterGold,out.rerollCost.gold);
  assert.deepEqual(r.errors,[]);
});

test('Equipped tokens remain visible on non-enlisted roster companions with their own enhancement flow',()=>{
  const r=game(),out=json(r,`(()=>{
    recruitCompanion(10);closeModal();const g=__EMBERWILD_TOKEN_TEST.makeToken('arcane',2);state.bag.push(g);equipCompanionToken(g.id,10);
    party.active=[memberKey(playerHero())];setPartnerEnlisted(10,false);
    state.ore=10000;state.dust=10000;state.materials['以太鍛鐵']=1000;
    chooseForge(g.id);toggleWorkshopPicker(true);const html=forgeView();openForge(g.id);const modal=$('modal').open?$('modal').innerHTML:'';const opened=forgeView(),actions=__EMBERWILD_WORKSHOP.actions(g);
    const before={affix:structuredClone(g.affix),powerTier:g.powerTier,gold:state.gold,ore:state.ore};
    reroll(g.id);autoReroll(g.id,3);rerollEquipmentPowerTier(g.id);
    const afterBlocked={affix:g.affix,powerTier:g.powerTier,gold:state.gold,ore:state.ore};enhance(g.id);
    return {id:g.id,html,modal,opened,actions,tab,enlisted:isPartnerEnlisted(partyMember(10)),owner:gearWearer(g.id).companionId,plus:g.plus,before,afterBlocked};
  })()`);
  assert.equal(out.enlisted,false);assert.equal(out.owner,10);
  assert(listIds(out.html).includes(out.id));assert.match(out.html,/data-workshop-category="token" aria-selected="true"/);assert.match(out.html,/穿戴中 1/);
  assert.match(out.html,/通用 · 信物/);assert.match(out.html,/目前能力<\/summary><p>攻擊力/);
  assert.match(out.html,/無法洗鍊或重鑄基底/);assert.deepEqual(out.actions,['enhance','extract']);
  assert.doesNotMatch(out.html,/undefined|forge-power-reroll|onclick="(?:reroll|autoReroll|rerollEquipmentPowerTier)\(/);
  assert.equal(out.modal,'');assert.equal(out.tab,'forge');assert.match(out.opened,/信物強化/);assert.equal(out.plus,1);
  assert.deepEqual(out.afterBlocked,out.before);
  assert.deepEqual(r.errors,[]);
});

test('BOSS gear remains enhanceable while its exclusive affixes stay fixed',()=>{
  const r=game(),out=json(r,`(()=>{
    const g=bossGear(0,0,0);state.bag.push(g);equipSharedGear(g.id,memberKey(playerHero()),gearEquipPositions(g)[0]);
    state.ore=10000;state.dust=10000;state.materials['以太鍛鐵']=1000;openForge(g.id);
    return {id:g.id,boss:g.boss,html:forgeView(),canEnhance:canEnhance(g)};
  })()`);
  assert.notEqual(out.boss,undefined);assert(out.canEnhance);
  assert.match(out.html,/BOSS 專屬加成 1/,'the fixed boss bonuses are displayed');
  assert.match(out.html,/強化至 \+1/,'boss gear is available for enhancement');
  assert.match(out.html,/洗鍊隨機詞條/,'random affixes remain separate from fixed boss bonuses');
  const result=json(r,`(()=>{
    const g=findGear('${out.id}'),plus=g.plus;
    const fixed=()=>equipmentAttributeDetailsHTML(g).match(/<div class="equipment-attribute-line"><b>BOSS 專屬加成 \\d+<\\/b>[\\s\\S]*?<\\/div>/g)||[];
    const before=fixed();enhance(g.id);
    return {before,after:fixed(),plusBefore:plus,plusAfter:g.plus};
  })()`);
  assert(result.before.length>0,'at least one boss-exclusive bonus must be present');
  assert.equal(result.plusAfter,result.plusBefore+1,'enhancement increases the gear level');
  assert.deepEqual(result.after,result.before,'enhancement never changes fixed boss bonuses');
  assert.deepEqual(r.errors,[]);
});
