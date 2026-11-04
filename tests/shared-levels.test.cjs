const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime,installCompanionFixtures}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');

test('Player EXP drives all companion levels, growth, acquisition and progress displays',async t=>{
  const game=await openRuntime(root,'index.html',{}, {clockTime:new Date('2026-10-02T00:00:00Z')}),page=game.page;await installCompanionFixtures(page);
  try{
    await page.evaluate(()=>{
      selectSaveSlot(1);start(0);closeModal();
      globalThis.__levelDefaults=exportableBalance();
      globalThis.__levelReset=(lv=1,cleared=false,recruit=true)=>{
        closeModal();applyBalanceConfig(structuredClone(__levelDefaults),{persist:false});start(0);
        const h=playerHero();h.name='同步測試主角';h.lv=lv;h.xp=0;h.won=cleared&&lv>=30;party.cleared=cleared;h.hp=stats(h).hp;syncParty();
        if(recruit)for(const id of [10,11,12,13,14]){closeModal();recruitCompanion(id);}
        closeModal();setTab('battle');
      };
    });

    await t.test('Reserve and archived companions gain real stats, natural growth, advanced skills and class advancement',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset();setPartnerEnlisted(14,false);partyMember(13).hp=0;
        const before=party.members.slice(1).map(h=>stats(h));
        let amount=0;for(let lv=1;lv<20;lv++)amount+=need(lv);awardXP(amount);
        const result={player:playerHero().lv,playerAdvanced:playerHero().advanced,archived:!isPartnerEnlisted(partyMember(14)),members:party.members.slice(1).map((h,i)=>({lv:h.lv,xp:h.xp,legacyStats:Object.hasOwn(h,'stats'),advanced:h.advanced,hp:h.hp,attack:stats(h).atk,before:before[i].atk})),warrior:partyMember(10).skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(10)).core[0]],warriorSupport:partyMember(10).supportLevels.filter(Boolean).length,mageSlot:partyMember(12).active[0],mageExpected:__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(12)).active[0],archer:partyMember(14).skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(14)).core[0]]};
        save();return result;
      });
      assert.equal(r.player,20);assert.equal(r.playerAdvanced,false);assert(r.archived);
      for(const h of r.members){assert.equal(h.lv,20);assert.equal(h.xp,0);assert.equal(h.legacyStats,false);assert(h.advanced);assert(h.attack>h.before);}
      assert.equal(r.members[3].hp,0);assert.equal(r.warrior,1);assert.equal(r.warriorSupport,0);assert.equal(r.mageSlot,r.mageExpected);assert.equal(r.archer,1);
    });

    await t.test('Unacquired and dynamically added companions display the current level and recruit with complete growth and skill builds',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset(27,false,false);
        const doc=exportableBalance(),plan={...__testCloneCompanion(doc,1042,'晚加入的夥伴'),passives:[],initialStats:{hp:18,atk:9,def:2,crit:.07,critDamage:1.5,speed:100},growthPerLevel:{hp:2,atk:3,def:1,crit:0,critDamage:0,speed:2},growthSteps:[]};Object.assign(doc.companions.at(-1),plan);applyBalanceConfig(doc,{persist:false});
        showCompanionRecruitment();const levels=[...document.querySelectorAll('#modal .member-level')].map(x=>x.textContent);closeModal();
        const h=acquireCompanion(1042),build={lv:h.lv,legacyStats:Object.hasOwn(h,'stats'),skills:__EMBERWILD_COMPANION_TEST_API.companionPlan(h).core.map(i=>h.skills[i]),active:h.active.slice(),support:h.supportLevels.slice(),advanced:h.advanced};closeModal();
        const old={equipped:h.equipped,advanced:h.advanced};h.equipped=[null,null,null,null,null];h.advanced=false;const actual=stats(h);Object.assign(h,old);
        let amount=need(27)+need(28);awardXP(amount);showCompanionRecruitment();const updated=[...document.querySelectorAll('#modal .member-level')].map(x=>x.textContent);closeModal();
        return {levels,updated,build,actual,live:h.lv};
      });
      assert.deepEqual(r.levels,Array(6).fill('Lv.27'));assert.deepEqual(r.updated,Array(5).fill('Lv.29'));
      assert.equal(r.build.lv,27);assert.equal(r.build.legacyStats,false);assert(r.build.advanced);assert.deepEqual(r.build.skills,[1,1]);assert.notEqual(r.build.active[0],null);assert(r.build.support.every(v=>v===0));
      assert.equal(r.actual.hp,70);assert.equal(r.actual.atk,87);assert.equal(r.actual.def,28);assert.equal(r.actual.speed,152);assert.equal(r.live,29);
    });

    await t.test('EXP settles exactly once to an inactive player, preserves the existing rate, and applies boosts and logs once',async()=>{
      for(const count of [1,2,3]){
        const r=await page.evaluate(count=>{
          __levelReset(20);party.active=[10,11,12].slice(0,count);selectHero(10);
          state.consumables.exp_100_30m=1;useSupply('exp_100_30m');
          const e=makeEnemy(0,state,()=>.9);e.id='shared-xp-test';e.lv=20;e.kind='normal';e.hp=0;e.rewarded=false;foes=[e];enemy=e;
          const want=EmberwildProgression.xpShare(EmberwildProgression.enemyXp(GAMEPLAY_SETTINGS,20,'normal',0),count)*2;
          rewardGroupKill(e);const once=playerHero().xp;rewardGroupKill(e);render();
          return {want,once,twice:playerHero().xp,xp:party.members.slice(1).map(h=>h.xp),selected:memberKey(state),logs:logs.filter(x=>x.type==='exp').map(x=>x.text),kills:expeditionLoot.kills};
        },count);
        assert.equal(r.once,r.want);assert.equal(r.twice,r.want);assert.deepEqual(r.xp,Array(5).fill(0));assert.equal(r.selected,10);assert.equal(r.logs.length,1);assert.match(r.logs[0],/同步測試主角/);assert.equal(r.kills,1);
      }
    });

    await t.test('Level 30 lock, post-clear progression and level 60 stay identical for every companion',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset(29);playerHero().xp=need(29)-1;awardXP(1);awardXP(99999999);
        const locked=party.members.map(h=>({lv:h.lv,xp:h.xp,won:h.won}));
        party.cleared=true;syncParty();awardXP(need(30));const unlocked=party.members.map(h=>h.lv);
        let amount=0;for(let lv=31;lv<60;lv++)amount+=need(lv);awardXP(amount);
        return {locked,unlocked,final:party.members.map(h=>({lv:h.lv,xp:h.xp,won:h.won})),bar:playerProgressView('exploration')};
      });
      assert.deepEqual(r.locked,Array(6).fill({lv:30,xp:0,won:false}));assert.deepEqual(r.unlocked,Array(6).fill(31));assert.deepEqual(r.final,Array(6).fill({lv:60,xp:0,won:true}));assert.match(r.bar,/等級已達上限/);assert.match(r.bar,/width:100%/);
    });

    await t.test('Unequal legacy levels migrate to the player; high-level gear and socketed gems remain recoverable and saves reload twice',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset(10);playerHero().xp=321;setPartnerEnlisted(14,false);const raw=structuredClone(packParty()),high=raw.members.find(h=>h.companionId===10),low=raw.members.find(h=>h.companionId===14);
        high.lv=20;high.xp=99;low.lv=3;low.xp=17;for(const h of [high,low])__EMBERWILD_COMPANION_TEST_API.applyPlan(h,{fullHealth:true});high.name='洛恩';high.sockets[raw.companionProfiles[10].core[0]]=2;
        const g=gear(4,0,0,0);high.bag.push(g);high.equipped[0]=g.id;raw.progressionXpRequirements=raw.members.map(h=>need(h.lv));
        loadParty(raw);const migrated={levels:party.members.map(h=>h.lv),xp:party.members.map(h=>h.xp),name:partyMember(10).name,advanced:partyMember(10).advanced,slot:partyMember(10).equipped[0],inBag:!!findGear(g.id),socket:partyMember(10).sockets[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(10)).core[0]],gems:playerHero().gems[2],skills:partyMember(10).skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(10)).core[0]]};
        const normalized=structuredClone(packParty());loadParty(normalized);loadParty(structuredClone(packParty()));
        return {migrated,after:{levels:party.members.map(h=>h.lv),xp:party.members.map(h=>h.xp),name:partyMember(10).name,gems:playerHero().gems[2],inBag:!!findGear(g.id)},saved:save()};
      });
      assert.deepEqual(r.migrated.levels,Array(6).fill(10));assert.deepEqual(r.migrated.xp,[321,0,0,0,0,0]);assert.equal(r.migrated.name,'洛恩');assert.equal(r.migrated.advanced,false);assert.equal(r.migrated.skills,1);assert.equal(r.migrated.slot,null);assert(r.migrated.inBag);assert.equal(r.migrated.socket,2);assert.equal(r.migrated.gems,0);
      assert.deepEqual(r.after.levels,r.migrated.levels);assert.deepEqual(r.after.xp,r.migrated.xp);assert.equal(r.after.name,r.migrated.name);assert.equal(r.after.gems,0);assert(r.after.inBag);assert(r.saved);
    });

    await t.test('Both progress bars always show the player, update after EXP gains and remain visible when a companion is selected',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset(20);selectHero(10);awardXP(123);setTab('battle');
        /* the battle toolbar carries the player's EXP bar (the sidebar summary is hidden by the top menu) */const xp=document.querySelector('.seconds-battle-xp'),bars=[{title:xp?.getAttribute('title'),name:xp?.querySelector('b')?.textContent,visible:!!xp&&xp.getBoundingClientRect().height>0}],name=document.querySelector('.adventurer-summary h2').textContent;
        setTab('character');const character=document.querySelector('.player-progress-character .player-exp-bar')?.textContent;
        setTab('roster');const team=document.querySelector('main').textContent;setTab('partnerRoster');const roster=document.querySelector('main').textContent;
        return {bars,name,character,team,roster,need:need(20)};
      });
      for(const bar of r.bars){assert.equal(bar.title,`經驗 123 / ${r.need.toLocaleString()}`);assert.match(bar.name,/同步測試主角 · LV 20/,'the bar names the player even with a companion selected');assert(bar.visible);}assert.equal(r.name,'同步測試主角');assert.equal(r.character,`123 / ${r.need} EXP`);assert.match(r.team,/不獨立獲得經驗/);assert.match(r.roster,/同步主角等級/);
    });

    await t.test('A scroll selected through a companion uses the player remaining EXP and updates archived growth too',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset(14);setPartnerEnlisted(14,false);selectHero(10);playerHero().xp=need(14)-10;state.materials['升級卷軸']=1;useLevelScroll(10);
        return {members:party.members.map(h=>({lv:h.lv,xp:h.xp})),count:state.materials['升級卷軸'],advanced:partyMember(14).advanced,legacyStats:Object.hasOwn(partyMember(14),'stats'),saved:save()};
      });
      assert.deepEqual(r.members,Array(6).fill({lv:15,xp:0}));assert.equal(r.count,0);assert(r.advanced);assert.equal(r.legacyStats,false);assert(r.saved);
    });

    await t.test('A failed scroll save rolls back player and all companion level, growth and skill changes',async()=>{
      const r=await page.evaluate(()=>{
        __levelReset(14);state.materials['升級卷軸']=1;
        const snapshot=()=>packParty().members.map(h=>Object.fromEntries(['lv','xp','ap','sp','hp','advanced','stats','skills','active','procSlots','supportLevels','supportSlots'].map(k=>[k,h[k]])));
        const before=structuredClone(snapshot()),originalSave=save;save=()=>false;try{useLevelScroll();}finally{save=originalSave;}
        return {before,after:snapshot(),count:state.materials['升級卷軸']};
      });
      assert.deepEqual(r.after,r.before);assert.equal(r.count,1);
    });

    // The in-page 測試版開發工具 left the skills page (V2 developer mode edits saves now); the shared progression rule stays.
    await t.test('Setting the player level and EXP while a companion page is selected drives every member',async()=>{
      const r=await page.evaluate(()=>{__levelReset(5);selectHero(10);setTab('skills');selectPageHero('skills',10);const tools=document.querySelectorAll('.mastery-dev-tools').length;const h=playerHero();h.lv=25;h.xp=500;syncParty();save();render();
        return {tools,levels:party.members.map(h=>h.lv),xp:party.members.map(h=>h.xp),advanced:partyMember(14).advanced,skills:partyMember(14).skills[__EMBERWILD_COMPANION_TEST_API.companionPlan(partyMember(14)).core[0]]};});
      assert.equal(r.tools,0,'no in-page test tools');assert.deepEqual(r.levels,Array(6).fill(25));assert.deepEqual(r.xp,[500,0,0,0,0,0]);assert(r.advanced);assert.equal(r.skills,1);
    });

    assert.deepEqual(game.errors,[]);
  }finally{await game.browser.close();}
});
