const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {openRuntime}=require('./runtime.cjs');
const {simulateStarters}=require('./progression-simulation.cjs');
const legacy=require('./fixtures/legacy-progression.json');
const root=path.resolve(__dirname,'..');
const balanceRoot=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');

test('Real game, editor, EXP rewards, stages and old-save round trips',async t=>{
  const game=await openRuntime(root,'index.html',{}, {pathname:'/preview/'}),editor=await openRuntime(balanceRoot,'balance-editor.html');
  try{
    const defaults=await game.page.evaluate(()=>exportableBalance());
    const editable=await editor.page.evaluate(()=>({doc:__EMBERWILD_MASTERY_EDITOR.cleanExport(),issues:validateData()}));
    await t.test('Editor and game ship identical effective curve defaults',()=>{
      assert.deepEqual(editable.issues,[]);
      for(const key of ['progression','equipment','monsters','difficulty','rewards'])assert.deepEqual(editable.doc.balanceSettings[key],defaults.balanceSettings[key]);
      for(let j=0;j<4;j++)for(const k of ['initialStats','growthPerLevel','growthSteps'])assert.deepEqual(editable.doc.classes[j][k],defaults.classes[j][k]);
      // Version markers must not suppress existing, unrelated default migrations.
      assert.deepEqual(editable.doc.balance,defaults.balance);
      assert.deepEqual(editable.doc.balanceSettings.skills.gems,defaults.balanceSettings.skills.gems);
      assert.deepEqual(editable.doc.supportSkills.map(row=>row.map(sk=>sk.level)),defaults.supportSkills.map(row=>row.map(sk=>sk.level)));
      assert.deepEqual(editable.doc.equipmentPowerSystem.strength.multipliers,defaults.equipmentPowerSystem.strength.multipliers);
      const embedded=fs.readFileSync(path.join(balanceRoot,'balance-editor.html'),'utf8').split('<script id="progression-model-v2">\n')[1].split('\n</script>')[0];
      assert.equal(embedded,fs.readFileSync(path.join(root,'js/balance/progression-model.js'),'utf8'));
    });
    await t.test('All sixty levels, four classes and actual normal/elite difficulty generators stay finite and continuous',async()=>{
      const result=await game.page.evaluate(()=>{
        const issues=[];let checks=0;const curve=EmberwildProgression,ints=v=>['hp','atk','def'].every(k=>Number.isSafeInteger(v[k])&&v[k]>=0);
        for(let lv=1;lv<=60;lv++)for(let job=0;job<4;job++){
          const h=initial(job);h.lv=lv;h.bag=[];h.equipped=[];h.advanced=false;
          const natural=stats(h),expected=curve.naturalStats(CLASSES[job],lv);checks++;
          if(!ints(natural)||['hp','atk','def'].some(k=>natural[k]!==expected[k]))issues.push('character '+job+'/'+lv);
          const mi=MAPS.findIndex((m,i)=>i!==6&&m.min<=lv&&m.max>=lv),range={min:MAPS[mi].min,max:MAPS[mi].max};MAPS[mi].min=MAPS[mi].max=lv;
          for(const mode of [0,1,2])for(const kind of ['normal','elite']){
            h.difficulty=mode;const e=makeEnemy(mi,h,()=>kind==='elite'?.01:.9),row=monsterCatalog().find(r=>r.id===e.monsterId),want=curve.monsterStats(GAMEPLAY_SETTINGS,lv,kind,mode,row);checks++;
            if(!ints(e)||['hp','atk','def'].some(k=>e[k]!==want[k])||e.kind!==kind)issues.push('monster '+job+'/'+lv+'/'+kind+'/'+mode);
            if(natural.atk-e.def*GS('combat.damageFormula.defenseCoefficient',.55)<=1)issues.push('damage floor '+job+'/'+lv);
          }
          Object.assign(MAPS[mi],range);
        }
        const pointHero=initial(0);pointHero.equipped=[];pointHero.bag=[];const before=stats(pointHero);pointHero.stats=[400,400,400];pointHero.ap=999;const after=stats(pointHero);
        if(['hp','atk','def'].some(k=>after[k]!==before[k]))issues.push('legacy ability ignored');
        return {issues,checks};
      });
      assert.deepEqual(result.issues,[]);assert.equal(result.checks,1680);
    });
    await t.test('Real BOSS and final-stage stats use the shared formula on all required levels and difficulties',async()=>{
      const errors=await game.page.evaluate(()=>{
        const errors=[];const oldSave=save,oldRender=render;save=()=>true;render=()=>{};
        try{for(const lv of [1,10,15,30,31,45,60])for(const mode of [0,1,2]){
          const h=initial(0);h.lv=lv;h.won=true;state=h;party=createParty(h);party.cleared=true;party.difficulty=mode;party.map=MAPS.findIndex((m,i)=>i!==6&&m.min<=lv&&m.max>=lv);syncParty();
          const mi=party.map,range={min:MAPS[mi].min,max:MAPS[mi].max};MAPS[mi].min=MAPS[mi].max=lv;
          party.bossChallenge={active:true,mapIndex:mi,mapId:worldMapConfig(mi).id,stagePaid:true};spawnGroup();
          for(const e of foes){const row=monsterCatalog().find(r=>r.id===e.monsterId),want=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,e.lv,e.kind,mode,row);if(['hp','atk','def'].some(k=>e[k]!==want[k]))errors.push('boss '+lv+'/'+mode);}
          Object.assign(MAPS[mi],range);party.bossChallenge=null;
          party.map=worldProgressionGateIndex();syncParty();spawnGroup();
          for(const e of foes){const row=monsterCatalog().find(r=>r.id===e.monsterId),want=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,e.lv,e.kind,mode,row);if(['hp','atk','def'].some(k=>e[k]!==want[k]))errors.push('final '+lv+'/'+mode);}
        }}finally{save=oldSave;render=oldRender;running=false;resetEncounter();}
        return errors;
      });assert.deepEqual(errors,[]);
    });
    await t.test('Actual starting gifts and first-map random encounters support every representative trio',async()=>{
      const starters=await simulateStarters(game.page,{samples:128});
      for(const result of starters){assert.equal(result.winRate,1,result.team);assert.equal(result.maxEnemyLevel,1);// Continuous exploration spawns one enemy at a time on the first map.
        assert.equal(result.minEnemies,1);assert.equal(result.maxEnemies,1);assert(result.rounds<5&&result.pressure<.3);}
      const levels=await game.page.evaluate(()=>{
        const lead=EmberwildProgression.encounterLevelLead;return [1,5,6,11,26,60].map(l=>lead(GAMEPLAY_SETTINGS,l));
      });assert.deepEqual(levels,[0,0,1,2,5,5]);
    });
    await t.test('Equipment totals and visible body/T/enhance rows are integer, additive and monotonic',async()=>{
      const issues=await game.page.evaluate(()=>{
        const issues=[];for(let job=0;job<4;job++)for(let tier=1;tier<=12;tier++)for(const slot of [0,1,2,3]){
          const g=gear(tier,slot,0,job);g.prefixId='';g.suffixId='';g.affix=[];
          for(const plus of [0,5,10]){let before;for(let powerTier=1;powerTier<=10;powerTier++){g.plus=plus;g.powerTier=powerTier;const v=gearStatBreakdown(g);
            for(const k of ['hp','atk','def']){if(['raw','body','grade','enhance','total'].some(row=>!Number.isSafeInteger(v[row][k]))||v.body[k]+v.grade[k]+v.enhance[k]!==v.total[k]||before&&v.total[k]<before[k])issues.push(job+'/'+tier+'/'+slot+'/'+plus+'/'+powerTier+'/'+k);}before=v.total;
          }}
        }return issues;
      });assert.deepEqual(issues,[]);
    });
    await t.test('One/two/three active members award EXP once to the player and all companions reach LV60',async()=>{
      const issues=await game.page.evaluate(()=>{
        const issues=[],oldSave=save,oldRender=render;save=()=>true;render=()=>{};
        try{for(const count of [1,2,3])for(const kind of ['normal','elite','boss'])for(const mode of [0,1,2]){
          state=initial(1);state.lv=59;state.won=true;party=createParty(state);party.cleared=true;party.difficulty=mode;syncParty();recruitCompanion(11);recruitCompanion(13);recruitCompanion(14);closeModal();party.active=[1,11,13].slice(0,count);syncParty();
          for(const h of party.members){h.lv=59;h.won=true;h.xp=0;h.hp=stats(h).hp;}
          const e=makeEnemy(0,state,()=>.9);e.kind=kind;e.lv=59;e.hp=0;e.rewarded=false;foes=[e];enemy=e;
          // Granted EXP is floored; current difficulty multipliers give fractional model values.
          const want=Math.floor(EmberwildProgression.xpShare(EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,59,kind,mode),count));rewardGroupKill(e);
          for(const h of party.members)if(h.xp!==(h===party.members[0]?want:0))issues.push('xp '+count+'/'+kind+'/'+mode+'/'+memberKey(h));
          const before=party.members.map(h=>h.xp);rewardGroupKill(e);if(party.members.some((h,i)=>h.xp!==before[i]))issues.push('duplicate reward');
        }
        const h=party.members[0];h.lv=59;h.xp=need(59)-1;withHero(h,()=>awardXP(1));if(party.members.some(member=>member.lv!==60||member.xp!==0)||Object.hasOwn(h,'ap')||Object.hasOwn(h,'stats'))issues.push('level 60');
        }finally{save=oldSave;render=oldRender;running=false;resetEncounter();}return issues;
      });assert.deepEqual(issues,[]);
    });
    await t.test('Editor stair control changes actual game results and survives JSON round trip',async()=>{
      await editor.page.evaluate(()=>{currentSection='classes';selected.class=2;render();});
      const field=editor.page.locator('[data-growth-step="0"][data-growth-key="atk"]');assert.equal(await field.count(),1);
      await field.fill('2');await field.dispatchEvent('change');
      const modified=await editor.page.evaluate(()=>__EMBERWILD_MASTERY_EDITOR.cleanExport());
      assert.equal(modified.classes[2].growthSteps[0].atk,2);
      const roundTrip=await game.page.evaluate(doc=>{applyBalanceConfig(doc,{persist:false});const h=initial(2);h.lv=60;h.equipped=[];h.bag=[];h.advanced=false;return {attack:stats(h).atk,doc:exportableBalance()};},modified);
      assert.equal(roundTrip.attack,128);assert.deepEqual(roundTrip.doc.classes[2].growthSteps,modified.classes[2].growthSteps);
      await editor.page.evaluate(doc=>{data=__EMBERWILD_VALIDATE_DOCUMENT(doc);ensureArrays();currentSection='balanceSettings:progression';render();},roundTrip.doc);
      await editor.page.waitForFunction(()=>document.querySelector('#balanceUxPreview')?.textContent.includes('三人隊每人／怪'),{timeout:10000});
      assert.equal((await editor.page.evaluate(()=>validateData())).length,0);
    });
    await t.test('Legacy shared EXP controls remain usable on import without changing gold defaults',async()=>{
      const legacyDoc=structuredClone(defaults);delete legacyDoc.balanceSettings.rewards.xp.kindMultiplier;
      legacyDoc.balanceSettings.rewards.kindMultiplier.boss=4;
      for(const d of legacyDoc.balanceSettings.difficulty.modes)delete d.xpMultiplier;
      legacyDoc.balanceSettings.difficulty.modes[1].reward=1.6;
      const editorLegacy=await editor.page.evaluate(doc=>{data=__EMBERWILD_VALIDATE_DOCUMENT(doc);ensureArrays();return __EMBERWILD_MASTERY_EDITOR.cleanExport();},legacyDoc);
      assert.equal(editorLegacy.balanceSettings.rewards.xp.kindMultiplier.boss,4);
      assert.equal(editorLegacy.balanceSettings.difficulty.modes[1].xpMultiplier,1.6);
      const result=await game.page.evaluate(doc=>{applyBalanceConfig(doc,{persist:false});const out=exportableBalance();return {boss:out.balanceSettings.rewards.xp.kindMultiplier.boss,hard:out.balanceSettings.difficulty.modes[1].xpMultiplier,xp:EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,30,'boss',1)};},legacyDoc);
      // EXP formula: (base + level × perLevel) × kind multiplier × difficulty multiplier, from the current defaults.
      const x=defaults.balanceSettings.rewards.xp;assert.deepEqual({...result,xp:Math.round(result.xp*1000)/1000},{boss:4,hard:1.6,xp:Math.round((x.base+30*x.perLevel)*4*1.6*1000)/1000});
      await game.page.evaluate(doc=>applyBalanceConfig(doc,{persist:false}),defaults);
      assert.deepEqual(defaults.balanceSettings.difficulty.modes.map(d=>d.reward),[1,1.3,1.65]);
    });
    await t.test('Editing natural growth, advancement, difficulty, monster/XP and equipment settings changes final runtime formulas',async()=>{
      const issues=await game.page.evaluate(base=>{
        const doc=structuredClone(base);doc.classes[0].initialStats.hp=40;doc.classes[0].growthPerLevel.hp=6;doc.classes[0].growthSteps=[{every:5,hp:1,atk:2,def:1}];
        doc.balanceSettings.progression.advance.attackMultiplier=1.3;
        doc.balanceSettings.progression.xpCurve.quadratic=5;doc.balanceSettings.skills.mastery.characterXpMultiplier=1.1;
        doc.balanceSettings.monsters.normal.hpPerLevel=10;doc.balanceSettings.monsters.awakened.hpPerLevel=.004;doc.balanceSettings.difficulty.modes[2].hp=2.1;
        doc.balanceSettings.rewards.xp.kindMultiplier.elite=2.8;doc.balanceSettings.rewards.xp.perLevel=10;
        doc.balanceSettings.equipment.baseStats.weaponAttackPerTier=4;doc.balanceSettings.equipment.enhance.statPerLevel=.06;doc.equipmentPowerSystem.strength.multipliers[9]=1.8;
        applyBalanceConfig(doc,{persist:false});const issues=[],h=initial(0);h.lv=60;h.advanced=true;h.bag=[];h.equipped=[];
        if(stats(h).hp!==Math.round((40+59*6+11)*GAMEPLAY_SETTINGS.progression.advance.hpMultiplier))issues.push('natural hp without AP');
        if(stats(h).atk!==Math.round((10+59+11*2)*1.3))issues.push('natural atk/advance');
        if(need(59)!==EmberwildProgression.requiredXp(doc.balanceSettings,59))issues.push('xp formula');
        const e=makeEnemy(12,h,()=>.01),row=monsterCatalog().find(m=>m.id===e.monsterId),want=EmberwildProgression.monsterStats(GAMEPLAY_SETTINGS,e.lv,'elite',h.difficulty||0,row);
        if(e.hp!==want.hp)issues.push('monster formula');
        // Additive rule: total = body + strength bonus + enhancement; enhancement is a fixed gain per level.
        const g=gear(12,0,0,0);g.powerTier=10;g.plus=10;const b=gearStatBreakdown(g),en=GAMEPLAY_SETTINGS.equipment.enhance,graded=b.body.atk+b.grade.atk;
        const enhanced=EmberwildProgression.enhancedGearStats({atk:graded},10,gearRequiredLevel(g),en.flatStatsPerLevel,en.flatStatsPerEquipmentLevel).atk;
        if(b.grade.atk!==Math.round(b.body.atk*(1.8-1))||b.enhance.atk!==enhanced-graded||b.total.atk!==b.body.atk+b.grade.atk+b.enhance.atk||b.enhance.atk<=0)issues.push('equipment formula');
        const out=exportableBalance();for(const k of ['initialStats','growthPerLevel','growthSteps'])if(JSON.stringify(out.classes[0][k])!==JSON.stringify(doc.classes[0][k]))issues.push('class export '+k);
        applyBalanceConfig(base,{persist:false});return issues;
      },defaults);assert.deepEqual(issues,[]);
    });
    await t.test('Malformed growth is rejected and the actual damage formula cannot lock ordinary attacks at zero',async()=>{
      const result=await game.page.evaluate(base=>{
        const bad=structuredClone(base);bad.classes[1].growthSteps=[{every:0,hp:0,atk:1,def:0}];let rejected=false;try{validateBalanceConfig(bad);}catch{rejected=true;}
        const h=initial(0);h.equipped=[];h.bag=[];party=createParty(h);state=h;effects=[];const e={id:'zero-floor-test',hp:100,maxhp:100,atk:1,def:1000,lv:1,kind:'normal',element:'physical',race:'beast',shield:0};foes=[e];const hit=resolveHit(e,0,h,'physical',false);return {rejected,hit};
      },defaults);assert.equal(result.rejected,true);assert.equal(result.hit,1);
    });
    await t.test('Six saves made by the old version load all five fixed companions and preserve level progress',async()=>{
      const issues=await game.page.evaluate(fixtures=>{
        localStorage.removeItem(BALANCE_KEY);const issues=[];
        for(const raw of fixtures){loadParty(raw);if(party.members.length!==6||party.active.length!==3)issues.push('roster '+raw.members[0].lv);
          for(let i=0;i<party.members.length;i++){const h=party.members[i],old=raw.members[i],oldNeed=Math.round(Math.round((45+old.lv*18+old.lv*old.lv*2)*(2.2+old.lv*.16))*1.35),want=i===0?Math.floor(old.xp/oldNeed*need(old.lv)):0;if(Math.abs(h.xp-want)>1||h.lv!==raw.members[0].lv)issues.push('legacy xp '+old.lv+'/'+i);if(['hp','atk','def'].some(k=>!Number.isSafeInteger(stats(h)[k])))issues.push('legacy stats');}
          if(party.members.some(h=>h.hp!==stats(h).hp))issues.push('legacy health scale');
          party.members[0].hp=Math.floor(stats(party.members[0]).hp/2);
          const once=structuredClone(packParty());loadParty(once);if(party.members.some((h,i)=>h.xp!==once.members[i].xp||h.hp!==once.members[i].hp))issues.push('double migration');
        }continueFromTitle();saveReady=true;if(save()!==true)issues.push('save failed');return issues;
      },legacy);assert.deepEqual(issues,[]);
      const before=await game.page.evaluate(()=>({xp:party.members.map(h=>h.xp),snapshot:packParty().progressionXpRequirements}));
      await game.page.reload({waitUntil:'load'});
      const after=await game.page.evaluate(()=>({xp:party.members.map(h=>h.xp),snapshot:packParty().progressionXpRequirements}));assert.deepEqual(after,before);
    });
    await t.test('Changed custom balance persists on reload and restoring defaults preserves distinct stairs',async()=>{
      const custom=structuredClone(defaults);custom.classes[1].growthPerLevel.atk=3;custom.classes[1].growthSteps=[{every:4,hp:1,atk:1,def:1}];custom.balanceSettings.rewards.xp.kindMultiplier.boss=12;custom.balanceSettings.monsters.awakened.hpPerLevel=.005;
      // The Preview keeps a custom balance across reloads when it comes through the JSON import, the path players use.
      assert.equal(await game.page.evaluate(async doc=>{const text=JSON.stringify(doc);return importBalanceJSON({target:{files:[{size:text.length,text:async()=>text}],value:'test'}});},custom),true);await game.page.reload({waitUntil:'load'});
      const stored=await game.page.evaluate(()=>exportableBalance());assert.deepEqual(stored.classes[1].growthSteps,custom.classes[1].growthSteps);assert.equal(stored.classes[1].growthPerLevel.atk,3);assert.equal(stored.balanceSettings.rewards.xp.kindMultiplier.boss,12);assert.equal(stored.balanceSettings.monsters.awakened.hpPerLevel,.005);
      await game.page.evaluate(()=>resetBalanceJSON());const restored=await game.page.evaluate(()=>exportableBalance());
      for(let j=0;j<4;j++)for(const key of ['initialStats','growthPerLevel','growthSteps'])assert.deepEqual(restored.classes[j][key],defaults.classes[j][key]);
    });
    assert.deepEqual(game.errors,[]);assert.deepEqual(editor.errors,[]);
  }finally{await game.browser.close();await editor.browser.close();}
});
