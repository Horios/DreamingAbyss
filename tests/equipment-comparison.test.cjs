const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run(`JSON.stringify((()=>{${code}})())`));

test('Equipment previews match actual swaps for every class and position, including an active encounter',()=>{
  const r=loadRuntime(root);
  const results=json(r,`
    const results=[];
    for(let job=0;job<4;job++){
      start(job);closeModal();const h=playerHero();h.lv=30;save();
      for(let position=0;position<5;position++){
        const g=gear(1,Math.min(position,3),0,job);
        g.prefixId='';g.suffixId='';g.affix=[{type:0,rank:1,value:7},{type:2,rank:1,value:8},{type:9,rank:1,value:5}];
        h.bag.push(g);
        const idle=equipmentComparison(h,g,position),equipped=JSON.stringify(h.equipped),plan=JSON.stringify(__EMBERWILD_TEAMS.plan());
        spawnGroup();
        const frozen=JSON.stringify(equipment(h)),combat=equipmentComparison(h,g,position);
        previewEquip(g.id,memberKey(h),position);closeModal();
        const unchanged=equipped===JSON.stringify(h.equipped)&&plan===JSON.stringify(__EMBERWILD_TEAMS.plan())&&frozen===JSON.stringify(equipment(h));
        let threw=false;try{__EMBERWILD_TEAM_EQUIPMENT.withLiveEquipment(()=>{throw Error('test');});}catch{threw=true;}
        const restored=threw&&frozen===JSON.stringify(equipment(h));
        stopTeamExploration();
        equipSharedGear(g.id,memberKey(h),position);
        const actual=stats(h),keys={'生命上限':'hp','攻擊力':'atk','防禦力':'def','暴擊率':'crit','暴擊傷害':'critDamage','防禦穿透':'pierce','防禦無視':'defenseIgnore','生命竊取':'lifesteal','閃避率':'evasion','全屬性增傷':'elementBonus','BOSS 增傷':'bossDamage','速度':'speed'};
        results.push({job,position,idle,combat,unchanged,restored,worn:h.equipped[position]===g.id,expected:idle.map(row=>Number((actual[keys[row.label]]*(row.percent?100:1)).toFixed(2)))});
      }
    }
    return results;
  `);
  assert.equal(results.length,20);
  for(const result of results){
    const context=`class ${result.job}, position ${result.position}`;
    assert.ok(result.idle.length,context);
    assert.deepEqual(result.combat,result.idle,context);
    assert.ok(result.unchanged&&result.restored&&result.worn,context);
    assert.deepEqual(result.idle.map(row=>row.after),result.expected,context);
  }
  assert.deepEqual(r.errors,[]);
});

test('Affix deltas sum duplicates, retain lost bonuses, separate targets and include unlearned skills',()=>{
  const r=loadRuntime(root);
  const result=json(r,`
    start(1);closeModal();const h=playerHero(),current=h.bag.find(g=>g.id===h.equipped[1]),next=gear(1,1,0,1);
    current.affix=[{type:2,rank:1,value:8},{type:0,rank:1,value:3},{type:0,rank:1,value:3},{type:12,rank:1,value:9,element:'fire'},{type:5,rank:1,value:2,skill:0}];
    next.affix=[{type:0,rank:1,value:5},{type:4,rank:1,value:18,skill:3},{type:12,rank:1,value:6,element:'ice'},{type:5,rank:1,value:1,skill:0}];
    const proc=CLASSES[1].skills.findIndex(sk=>sk[1]==='proc');
    const rows=equipmentAffixComparison(current,next),procRows=equipmentAffixComparison({...current,affix:[]},{...next,affix:[{type:5,rank:1,value:2,skill:proc}]}),pierce=equipmentAffixComparison({...current,affix:[]},{...next,affix:[{type:7,rank:1,value:8}]});
    return {rows,unlearned:!h.skills[3],same:equipmentAffixComparison(next,{...next,affix:[...next.affix].reverse()}),procRows,procExpected:2*GAME_BALANCE.affixes.procChancePerPointPercent,pierce};
  `);
  const row=label=>result.rows.find(x=>x.label===label);
  assert.equal(row('防禦').delta,-8);
  assert.equal(row('攻擊').before,6);assert.equal(row('攻擊').after,5);assert.equal(row('攻擊').delta,-1);
  assert.equal(result.rows.find(x=>x.label.includes('火')).delta,-9);
  assert.equal(result.rows.find(x=>x.label.includes('冰')).delta,6);
  assert.ok(result.unlearned);assert.equal(result.rows.find(x=>x.label.includes('效果')).delta,18);
  assert.equal(result.rows.find(x=>x.label.includes('冷卻縮短')).delta,-1);
  assert.deepEqual(result.same,[]);
  assert.match(result.procRows[0].label,/觸發率/);assert.equal(result.procRows[0].delta,result.procExpected);assert.ok(result.procRows[0].percent);
  assert.equal(result.pierce[0].delta,8);assert.equal(result.pierce[0].percent,false);
});

test('An enhanced equipped item uses live values in previews while combat retains the original snapshot',()=>{
  const r=loadRuntime(root);
  const result=json(r,`
    start(0);closeModal();const h=playerHero(),worn=h.bag.find(g=>g.id===h.equipped[0]),next=gear(1,0,0,0);next.affix=[{type:0,rank:1,value:20}];h.bag.push(next);
    spawnGroup();running=true;EmberwildSecondsCombat.step();const frozen=EmberwildBattleConfiguration.combat(()=>stats(h));worn.plus=10;
    const idle=__EMBERWILD_TEAM_EQUIPMENT.withLiveEquipment(()=>equipmentComparison(h,next,0)),preview=equipmentComparison(h,next,0),battle=EmberwildBattleConfiguration.combat(()=>stats(h)),live=stats(h);
    return {idle,preview,frozen,battle,live,pending:EmberwildBattleConfiguration.pending()};
  `);
  // Since live configuration edits (969a3ab), only the encounter's combat calculations keep the snapshot;
  // menus and previews show the edited equipment immediately.
  assert.equal(result.pending,true);
  assert.deepEqual(result.preview,result.idle);
  assert.deepEqual(result.battle,result.frozen);
  assert.ok(result.live.atk>result.frozen.atk);
});

test('Moving an already worn accessory to the other position counts its physical item only once',()=>{
  const r=loadRuntime(root);
  const result=json(r,`
    start(0);closeModal();const h=playerHero(),g=h.bag.find(g=>g.id===h.equipped[3]);g.affix=[{type:0,rank:1,value:10}];
    const rows=equipmentComparison(h,g,4);equipSharedGear(g.id,memberKey(h),4);
    return {rows,actual:stats(h),equipped:h.equipped,id:g.id};
  `);
  assert.equal(result.equipped[3],null);assert.equal(result.equipped[4],result.id);
  assert.equal(result.rows.find(row=>row.label==='攻擊力').after,result.actual.atk);
  assert.equal(result.rows.find(row=>row.label==='生命上限').after,result.actual.hp);
});
