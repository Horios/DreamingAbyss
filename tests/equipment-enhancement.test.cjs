const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const curve=require('../js/balance/progression-model.js');
const root=path.resolve(__dirname,'..'),flat={atk:1,hp:1,def:.35},growth={atk:.02,hp:.08,def:.015};
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}

const bonus=[0,.05,.10,.15,.22,.30,.40,.55,.75,1,1.3,1.6,1.9];
test('shared enhancement formula takes the greater gain over +0..+12 and item levels 1/5/10/30/60',()=>{
  for(const L of [1,5,10,30,60])for(const B of [0,1,3,8,30,100]){
    let previous;
    for(let n=0;n<=12;n++){
      const out=curve.enhancedGearStats({atk:B,hp:B,def:B},n,L,flat,growth,bonus[n]);
      for(const k of ['atk','hp','def']){
        assert.equal(out[k],B===0?0:B+Math.max(Math.round(B*bonus[n]),Math.round(n*(flat[k]+growth[k]*(L-1)))));
        assert(Number.isSafeInteger(out[k]));if(previous)assert(out[k]>=previous[k]);
        if(k==='atk'&&B>0&&previous)assert(out[k]>previous[k]);
      }
      previous=out;
    }
  }
  assert.deepEqual([0,1,3,5,8,10,12].map(n=>curve.enhancedGearStats({atk:3},n,1,flat,growth,bonus[n]).atk),[3,4,6,8,11,13,15]);
  assert.equal(curve.enhancedGearStats({atk:30},10,60,flat,growth,bonus[10]).atk,69);
  assert.deepEqual(curve.enhancedGearStats({atk:0,hp:8,def:2},10,1,flat,growth,bonus[10]),{hp:18,atk:0,def:6});
});

const sure="Math.random=()=>0;";
test('actual enhancement, preview, combat stats and an existing +10 save use the same growth without changing base/T',()=>{
  const r=game(),out=json(r,`(()=>{${sure}
    const g=gear(3,0,0,0);Object.assign(g,{formJob:0,form:0,prefixId:'',suffixId:'',affix:[],powerTier:7,plus:0});
    state.bag.push(g);const zero0=gearBaseStats(g);equipSharedGear(g.id,memberKey(playerHero()),0);state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=100;
    const before=stats(playerHero()).atk,ledgerBefore=equipmentStatContributions(g).total.atk,base=JSON.stringify(g.baseSnapshot),id=g.id,cost=upgradeMaterials(g),dust=state.dust;
    const preview=equipmentTotalSummaryText({...g,plus:1});enhance(id);const first={plus:g.plus,spent:dust-state.dust,attack:gearBaseStats(g).atk};
    for(let i=1;i<10;i++)enhance(id);
    const after=stats(playerHero()).atk,ledger=equipmentStatContributions(g);
    const saved=packParty();loadParty(saved);const restored=findGear(id);
    return {before,after,zero0,ledgerBefore,base,preview,cost,first,total:gearBaseStats(restored),zero:gearBaseStats({...restored,plus:0}),plus:restored.plus,t:restored.powerTier,reloadedBase:JSON.stringify(restored.baseSnapshot),ledger,html:(openForge(id),forgeView())};
  })()`);
  assert.equal(out.first.plus,1);assert.equal(out.first.spent,out.cost.dust);assert(out.zero0.atk>=10,'a weapon whose +1 already adds attack: '+out.zero0.atk);assert.equal(out.first.attack,Math.round(out.zero0.atk*1.05));assert.match(out.preview,new RegExp('攻擊 \\+'+out.first.attack));
  assert.equal(out.plus,10);assert.equal(out.t,7);assert.equal(out.total.atk,Math.round(out.zero.atk*2.3),'base × 2.3 at +10');
  assert.equal(out.ledger.total.atk-out.ledgerBefore,out.total.atk-out.zero.atk);assert.deepEqual(out.zero,out.zero0);assert.ok(out.after-out.before>=out.total.atk-out.zero.atk);assert.equal(out.base,out.reloadedBase);
  assert.equal(out.ledger.rows.find(x=>x.label==='強化加成（+10）').stats.atk,out.total.atk-out.zero.atk);assert.match(out.html,/成功率/);assert.match(out.html,/強化表/);
  for(const k of ['atk','hp','def','speed'])assert.equal(out.ledger.rows.reduce((n,row)=>n+row.stats[k],0),out.ledger.total[k]);
  assert.deepEqual(r.errors,[]);
});

test('forge shows the next level gains of the base attributes only, excluding affixes; accessories cannot be enhanced',()=>{
  const r=game(),out=json(r,`(()=>{${sure}
    const rows=[];state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=10000;
    for(const level of [1,10,30])for(let slot=0;slot<4;slot++)for(const plus of [0,1,2,9]){
      const g=createEquipmentShopGear('equipment_lv1','job0-slot'+slot+'-form0');
      Object.assign(g,{equipmentLevel:level,plus,affix:[]});state.bag.push(g);openForge(g.id);
      // v0.194: the workshop offers no 強化 action for accessories; their text comes from the shared rules.
      const section=()=>g.slot===3?(__EMBERWILD_WORKSHOP.actions(g).includes('enhance')?'offered':__EMBERWILD_ENHANCE.controlsHTML(g)):forgeView().split('<section class="forge-action"><h3>強化基礎能力</h3>')[1].split('</section>')[0];
      const clean=section();
      g.affix=[{type:0,value:999,rank:3},{type:12,element:'fire',value:15,rank:2}];
      const decorated=section(),before=gearBaseStats(g),total=equipmentTotalSummaryText(g);
      enhance(g.id);const after=gearBaseStats(g);
      rows.push({level,slot,plus,clean,decorated,total,before,after,actualPlus:g.plus});
    }
    const g=state.bag.find(x=>x.slot===0);g.plus=RULES.enhanceMax;openForge(g.id);
    return {rows,max:forgeView()};
  })()`);
  assert.equal(out.rows.length,48);
  for(const row of out.rows){
    const label=JSON.stringify({level:row.level,slot:row.slot,plus:row.plus});
    assert.equal(row.decorated,row.clean,label);
    if(row.slot===3){assert.match(row.decorated,/飾品無法強化/,label);assert.equal(row.actualPlus,row.plus,label);continue;}
    assert.equal(row.actualPlus,row.plus+1,label);
    const line=row.decorated.match(/<p class="green">([^<]+)<\/p>/)[1],shown={atk:0,hp:0,def:0};
    for(const [,name,value] of line.matchAll(/(攻擊|生命|防禦) \+(\d+)/g))shown[{攻擊:'atk',生命:'hp',防禦:'def'}[name]]=Number(value);
    for(const key of ['atk','hp','def'])assert.equal(shown[key],row.after[key]-row.before[key],label+' '+key);
    assert.match(line,new RegExp('基礎能力 \\+'+Math.round(bonus[row.plus]*100)+'% → \\+'+Math.round(bonus[row.plus+1]*100)+'%'),label);
    assert.doesNotMatch(row.decorated,/999|火屬性|詞綴/,label);assert.match(row.total,/火 屬性傷害 \+15%/,label);
    if(row.slot===1)assert.equal(shown.atk,0,label);
  }
  assert.match(out.max,/已達 \+12 強化上限/);
  assert.deepEqual(r.errors,[]);
});

test('every published equipment form, starter weapon and BOSS slot has matching actual and described gains up to +12',()=>{
  const r=game(),out=json(r,`(()=>{${sure}
    const rows=[],fixtures=[];
    for(let job=0;job<4;job++){
      start(job);closeModal();claimMailboxAttachments(1);Math.random=()=>0;
      fixtures.push(...state.bag.map(g=>structuredClone(g)));
      for(let slot=0;slot<3;slot++)for(let form=0;form<ITEM_FORMS[job][slot].length;form++){
        const g=gear(2,slot,0,job);Object.assign(g,{formJob:job,form,prefixId:'',suffixId:'',affix:[]});delete g.baseSnapshot;fixtures.push(g);
      }
      for(let region=0;region<6;region++)fixtures.push(bossGear(region,job,region%3));
    }
    const enhanceable=fixtures.filter(g=>g.slot!==3&&!EmberwildTokens.isToken(g)),originalBag=state.bag.slice();setForgeWearFilter('unequipped');
    globalThis.confirm=()=>true;
    for(const fixture of enhanceable){
      const g=structuredClone(fixture);g.id='refinement-fixture';g.plus=0;
      state.bag.splice(0,state.bag.length,...originalBag,g);forgeSelection=g.id;
      state.ore=100000;state.dust=100000;state.materials['以太鍛鐵']=10000;
      const fixed=JSON.stringify({affix:g.affix,prefix:g.prefixId,suffix:g.suffixId}),base=gearStatBreakdown(g).total;
      for(let plus=0;plus<RULES.enhanceMax;plus++){
        const before=equipmentStatContributions(g).total;
        const html=forgeView().split('<section class="forge-action"><h3>強化基礎能力</h3>')[1].split('</section>')[0];
        enhance(g.id);
        rows.push({name:gearName(g),slot:g.slot,plus,html,before,after:equipmentStatContributions(g).total,actualPlus:g.plus,base:gearBaseStats(g),zero:base,fixed:fixed===JSON.stringify({affix:g.affix,prefix:g.prefixId,suffix:g.suffixId})});
      }
    }
    return {rows,fixtures:enhanceable.length};
  })()`);
  assert(out.fixtures>=40);assert.equal(out.rows.length,out.fixtures*12);
  for(const row of out.rows){
    const label=row.name+' +'+row.plus,shown={atk:0,hp:0,def:0};
    const line=row.html.match(/<p class="green">([^<]+)<\/p>/)[1];
    for(const [,name,value] of line.matchAll(/(攻擊|生命|防禦) \+(\d+)/g))shown[{攻擊:'atk',生命:'hp',防禦:'def'}[name]]=Number(value);
    assert.equal(row.actualPlus,row.plus+1,label);assert.equal(row.fixed,true,label);
    for(const key of ['atk','hp','def']){assert.equal(shown[key],row.after[key]-row.before[key],label+' '+key);if(row.zero[key]===0)assert.equal(row.base[key],0,label+' no new '+key);}
    assert.equal(row.after.speed,row.before.speed,label+' speed');
  }
  assert.deepEqual(r.errors,[]);
});

test('all slots and T grades stay monotonic and additive; BOSS percentages apply to the unrefined base',()=>{
  const r=game(),out=json(r,`(()=>{
    const issues=[];let checked=0;
    for(let job=0;job<4;job++)for(let slot=0;slot<4;slot++)for(const tier of [1,2,6,12]){
      let previousT;for(let t=1;t<=10;t++){
        const g=gear(tier,slot,0,job);Object.assign(g,{powerTier:t,formJob:job,form:0,prefixId:'',suffixId:'',affix:[]});delete g.baseSnapshot;
        let previous;for(let plus=0;plus<=12;plus++){
          g.plus=plus;const b=gearStatBreakdown(g),ledger=equipmentStatContributions(g);checked++;
          for(const k of ['atk','hp','def']){
            const B=b.body[k]+b.grade[k],rate=[0,.05,.10,.15,.22,.30,.40,.55,.75,1,1.3,1.6,1.9][plus],cfg=GAMEPLAY_SETTINGS.equipment.enhance;
            const expected=B>0?B+Math.max(Math.round(B*rate),Math.round(plus*(cfg.flatStatsPerLevel[k]+cfg.flatStatsPerEquipmentLevel[k]*(gearRequiredLevel(g)-1)))):0;
            if(!Number.isSafeInteger(b.total[k])||b.total[k]!==b.body[k]+b.grade[k]+b.enhance[k]||(previous&&b.total[k]<previous[k])||b.total[k]!==expected)issues.push('growth '+[job,slot,tier,t,plus,k]);
          }
          for(const k of ['atk','hp','def','speed'])if(ledger.total[k]!==ledger.rows.reduce((n,row)=>n+row.stats[k],0))issues.push('ledger');
          previous=b.total;
        }
        if(previousT&&['atk','hp','def'].some(k=>previous[k]<previousT[k]))issues.push('T');previousT=previous;
      }
    }
    const b=bossGear(0,0,0);b.plus=10;const base=b.baseSnapshot.base,ledger=equipmentStatContributions(b),profile=exportableBalance().equipmentPowerSystem.bossAffixes.find(x=>x.id==='legacy_low_0'),pct=profile.effects.find(e=>e.key==='gearAtkPct').value;
    return {issues:issues.slice(0,5),count:issues.length,checked,boss:{base,ledger,pct}};
  })()`);
  assert.equal(out.count,0,JSON.stringify(out.issues));assert.equal(out.checked,8320);
  const effect=out.boss.ledger.rows.find(x=>x.effect?.ruleEffect?.key==='gearAtkPct');
  assert.equal(effect.stats.atk,Math.round(out.boss.base.atk*out.boss.pct/100));assert.deepEqual(r.errors,[]);
});

test('the enhancement table roundtrips, older JSON without it receives the defaults and invalid rows are rejected',()=>{
  const r=game(),out=json(r,`(()=>{
    const doc=exportableBalance(),oldDoc=structuredClone(doc);delete oldDoc.balanceSettings.equipment.enhance.levels;delete oldDoc.balanceSettings.equipment.enhance.costLevelStep;
    applyBalanceConfig(oldDoc,{persist:false});const old=structuredClone(GAMEPLAY_SETTINGS.equipment.enhance);
    doc.balanceSettings.equipment.enhance.levels[0].baseBonus=.5;doc.balanceSettings.equipment.enhance.costLevelStep=10;applyBalanceConfig(doc,{persist:false});
    const g=createEquipmentShopGear('equipment_lv1','job0-slot0-form0');const base=gearBaseStats(g).atk;g.plus=1;const attack=gearBaseStats(g).atk,exported=exportableBalance().balanceSettings.equipment.enhance;
    doc.balanceSettings.equipment.enhance.levels[2].level=7;let error='';try{applyBalanceConfig(doc,{persist:false})}catch(e){error=e.message}
    return {old,exported,base,attack,error};
  })()`);
  assert.equal(out.old.levels.length,12);assert.equal(out.old.costLevelStep,5);assert.equal(out.old.levels[3].successRate,.9);
  assert.equal(out.exported.levels[0].baseBonus,.5);assert.equal(out.exported.costLevelStep,10);
  assert.equal(out.attack,Math.round(out.base*1.5));assert.match(out.error,/依序/);assert.deepEqual(r.errors,[]);
});


test('runtime floors follow item levels, survive old enhanced saves, and ignore tokens, affixes and absent base stats',()=>{
 const r=game(),out=json(r,`(()=>{
  const rows=[];
  for(const L of [1,5,10,30,60])for(const slot of [0,1,2]){
   const g=gear(1,slot,0,0);Object.assign(g,{equipmentLevel:L,plus:0,powerTier:1,formJob:0,form:0,affix:[],prefixId:'',suffixId:''});delete g.baseSnapshot;state.bag.push(g);
   const B=gearBaseStats(g),snapshot=JSON.stringify(g.baseSnapshot);
   for(let n=0;n<=12;n++){
    g.plus=n;const total=gearBaseStats(g);globalThis.__EMBERWILD_OFFLINE_RULE_CACHE={};const cached=gearBaseStats(g);delete globalThis.__EMBERWILD_OFFLINE_RULE_CACHE;
    rows.push({L,n,B,total,cached,stable:snapshot===JSON.stringify(g.baseSnapshot)});
   }
  }
  const g=state.bag.find(x=>x.slot===0&&!EmberwildTokens.isToken(x));g.plus=10;const id=g.id,B=gearBaseStats({...g,plus:0}),snapshot=JSON.stringify(g.baseSnapshot);
  loadParty(JSON.parse(JSON.stringify(packParty())));const restored=findGear(id),afterLoad=gearBaseStats(restored),preserved=snapshot===JSON.stringify(restored.baseSnapshot);
  const token=__EMBERWILD_TOKEN_TEST.makeToken('arcane');token.plus=10;const tokenBefore=JSON.stringify(EmberwildTokens.effectsFor(token));
  const doc=exportableBalance();doc.balanceSettings.equipment.enhance.flatStatsPerLevel.atk=2.25;doc.balanceSettings.equipment.enhance.flatStatsPerEquipmentLevel.atk=.1;applyBalanceConfig(doc,{persist:false});
  const edited=gearBaseStats(restored),exported=exportableBalance().balanceSettings.equipment.enhance,tokenAfter=JSON.stringify(EmberwildTokens.effectsFor(token));
  const invalid=structuredClone(doc);invalid.balanceSettings.equipment.enhance.flatStatsPerLevel.def=-1;let rejected=false;try{applyBalanceConfig(invalid,{persist:false});}catch{rejected=true;}
  return {rows,B,afterLoad,preserved,edited,exported,tokenBefore,tokenAfter,rejected};
 })()`);
 assert.equal(out.rows.length,195);
 for(const row of out.rows){for(const k of ['atk','hp','def'])assert.equal(row.total[k],row.B[k]>0?row.B[k]+Math.max(Math.round(row.B[k]*bonus[row.n]),Math.round(row.n*(flat[k]+growth[k]*(row.L-1)))):0,JSON.stringify(row));assert.deepEqual(row.cached,row.total);assert(row.stable);}
 assert.equal(out.afterLoad.atk,out.B.atk+Math.max(Math.round(out.B.atk*1.3),10));assert(out.preserved);
 assert.equal(out.edited.atk,out.B.atk+Math.max(Math.round(out.B.atk*1.3),23));assert.equal(out.exported.flatStatsPerLevel.atk,2.25);assert.equal(out.exported.flatStatsPerEquipmentLevel.atk,.1);
 assert.equal(out.tokenAfter,out.tokenBefore);assert(out.rejected);assert.deepEqual(r.errors,[]);
});
