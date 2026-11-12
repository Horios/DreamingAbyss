// v0.125: the prologue is the `prologue` quest of the story design. These tests play it through the real systems
// (naming, class, skill slot, seconds combat, roster, mail claim, equipment) in the headless runtime.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),M=require('../js/story/story-model.js');
const published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
function open(saved={}){const r=loadRuntime(root,'index.html',saved);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));r.at=()=>r.json('{stage:__EMBERWILD_PROLOGUE.stage(),phase:__EMBERWILD_PROLOGUE.phase(),ok:__EMBERWILD_PROLOGUE.satisfied(),active:__EMBERWILD_PROLOGUE.active()}');
 r.until=(stage,phase)=>{for(let i=0;i<80;i++){const s=r.at();if(s.stage===stage&&s.phase===phase)return s;r.run('prologueNext()');}assert.fail('did not reach '+stage+'/'+phase+': '+JSON.stringify(r.at()));};
 r.fight=()=>{for(let i=0;i<600&&r.run('running');i++)r.run('{const it=pacedRound();for(let n=0;n<4000&&!it.next().done;n++){}}');return r.json('globalThis.expeditionChallengeResult');};
 r.reload=()=>open(Object.fromEntries(r.values));
 // After a page load the title screen is shown; a slot with a save continues, an empty one opens character creation.
 // The reload settles offline time before quest actions are accepted; the headless runtime has no timers, so settle here.
 r.resume=async()=>{const n=r.reload();assert.equal(n.at().active,false,'the title screen comes first');n.run('selectSaveSlot(1)');if(n.run('!!party'))await n.run('EmberwildOffline.settle(undefined,false)');return n;};return r;}
const economy=r=>r.json('{gold:playerHero().gold,xp:playerHero().xp,lv:playerHero().lv,ore:playerHero().ore,dust:playerHero().dust,kills:playerHero().totalKills,byKind:playerHero().kills,materials:playerHero().materials,gems:playerHero().gems,achievements:party.achievements.completed,tickets:party.achievements.tickets,unlocked:party.companionUnlocks.unlocked.filter(id=>id!==__EMBERWILD_PROLOGUE_HELPER.id),explore:party.progressStats.explore,consumables:playerHero().consumables}');
const learnedActive=r=>r.json("__EMBERWILD_SKILLS.system().definitions.filter(s=>s.type==='active'&&s.jobs?.includes(playerHero().job)&&__EMBERWILD_SKILLS.learned(playerHero(),s)).map(s=>({id:s.id,name:s.name}))");
function create(r,job,name='測試者'){
 r.run('selectSaveSlot(1)');assert.deepEqual(r.at(),{stage:'creation',phase:'before',ok:false,active:true});
 r.until('creation','action');r.run(`$('prologue-name').value=${JSON.stringify(name)};prologueConfirmName()`);
 r.until('calling','action');r.run(`prologuePickClass(${job});prologueConfirmClass()`);
}

test('published prologue: eight scenes, every system action once and in order, original text marked',()=>{
 const q=M.prologueQuest(published.story);assert(q);assert.deepEqual(q.prologue.scenes.map(s=>s.id),[1,2,3,4,5,6,7,8]);
 assert.deepEqual(q.stages.map(s=>s.prologue.action).filter(Boolean),M.PROLOGUE_ORDER);
 assert.deepEqual([...new Set(q.stages.map(s=>s.prologue.scene))],[1,2,3,4,5,6,7,8]);
 const lines=q.stages.flatMap(s=>[...s.dialogue,...s.prologue.after]).concat(q.prologue.chapter.lines);assert(lines.every(l=>['original','draft'].includes(l.source)),'every line records its source');
 const original=q.stages[0].dialogue.filter(l=>l.source==='original').map(l=>l.text);
 assert.deepEqual(original,['一間神祕的房間內，無源之光亮起。身材矮小、身披寬大長袍的女神走入房間。','她將「知識、認知、天賦」等光點匯聚成光團，最終創造出主角。','主角首次獲得意識，女神確認創造結果。']);
 assert.equal(lines.filter(l=>l.source==='original').length,3,'only the developer text is marked original');
 assert.equal(q.prologue.chapter.title,'第一章：斷絕的商路');
});

test('removing or reordering a system stage is rejected; editing text is not',()=>{
 const ctx={maps:published.balanceSettings.maps.catalog,monsters:published.balanceSettings.monsters.catalog,items:published.items,skills:published.skillSystem.definitions,forms:published.equipmentForms,companions:published.companions,classes:published.classes};
 const edit=f=>{const d=structuredClone(published.story),q=M.prologueQuest(d);f(q,d);return M.issues(d,ctx);};
 assert.deepEqual(edit(()=>{}),[]);
 assert.deepEqual(edit(q=>{q.stages[0].dialogue[3].text='改寫的對白';q.stages[0].dialogue.splice(4,1);q.stages[1].dialogue.reverse();q.stages[1].dialogue.push({speaker:'女神',kind:'npc',text:'新增一句',source:'draft'});q.prologue.chapter.title='第一章：新名稱';q.prologue.helper.name='光之助手';q.stages[2].prologue.options[0].text='劍士';}),[]);
 assert.match(edit(q=>{const i=q.stages.findIndex(s=>s.id==='skills');q.stages[i-1].next=q.stages[i].next;q.stages.splice(i,1);}).join('\n'),/系統事件必須各出現一次並依序排列/);
 assert.match(edit(q=>{q.stages.find(s=>s.id==='skills').prologue.action='';}).join('\n'),/系統事件必須各出現一次/);
 assert.match(edit(q=>{q.stages.find(s=>s.id==='gift').prologue.action='runScript';}).join('\n'),/系統事件、提示或後續對話無效/);
 assert.match(edit(q=>{q.stages.find(s=>s.id==='practice').encounter.training=false;}).join('\n'),/必須是不可重複的訓練戰/);
 assert.match(edit(q=>{q.stages.find(s=>s.id==='practice').encounter.enabled=false;}).join('\n'),/需要一場單人訓練戰/);
 assert.match(edit(q=>{q.stages.find(s=>s.id==='calling').prologue.options.pop();}).join('\n'),/職業選項必須依序對應全部初始職業/);
 assert.match(edit(q=>{q.stages[1].rewards.gold=5;}).join('\n'),/選擇職業之前的階段不可設定/);
 assert.match(edit(q=>{q.stages[0].dialogue[0].source='ai';}).join('\n'),/對話來源標記無效/);
 assert.match(edit((q,d)=>{d.quests.push({...structuredClone(q),id:'prologue2'});}).join('\n'),/只能有一個序章任務/);
});

for(const job of [0,1,2,3])test('class '+job+' plays all eight scenes with the real systems',async()=>{
 const r=open();create(r,job);
 let s=r.json('{name:playerHero().name,job:playerHero().job,active:playerHero().skillLoadout.active,worn:playerHero().equipped.map(x=>!!x),mail:party.mailbox.messages.length,quests:Object.keys(party.story.quests),draft:localStorage.getItem(__EMBERWILD_PROLOGUE.draftKey)}');
 assert.deepEqual(s,{name:'測試者',job,active:[null,null,null],worn:[true,true,true,true,false],mail:0,quests:['prologue'],draft:null},'name and class are the real character fields; no starter mail, no other quest yet');
 const before=economy(r);

 r.until('skills','action');r.run('prologueOpenTask()');assert.equal(r.run('tab'),'skills');
 assert.equal(r.run("setTab('shop')"),false,'pages outside the lesson stay closed');assert.equal(r.run('tab'),'skills');
 r.run('prologueReturn()');assert.equal(r.at().phase,'action','cannot return before a skill is installed');
 const skills=learnedActive(r);assert(skills.length>=1,'the class starts with a learned active skill');
 assert.equal(r.run(`chooseSkillSlot('active',0,${JSON.stringify(skills[0].id)})`),true);assert.equal(r.at().ok,true);
 r.run('prologueReturn()');

 r.until('practice','action');r.run('prologueOpenTask()');assert.equal(r.run('tab'),'battle');
 r.run('running=true');assert.equal(r.run('spawnGroup()'),false,'ordinary exploration is closed');assert.equal(r.run('running'),false);
 assert.equal(r.run('prologueStartBattle()'),true);
 assert(r.json('foes').every(e=>e.name==='訓練對象'&&e.training&&e.rewarded&&e.lv===1),'training targets are pre-marked as rewarded');
 const cast=r.json('playerHero().skillLoadout.active[0]');assert.deepEqual(r.fight(),{name:'戰鬥練習',success:true,key:'prologue/practice'});
 assert(r.json('logs').some(l=>JSON.stringify(l).includes(skills.find(k=>k.id===cast).name)),'the installed skill was used in the practice fight');
 assert.equal(r.at().ok,true);r.run('prologueReturn()');

 r.until('helper','action');assert.equal(r.json('party.members.length'),1);r.run('prologueAcceptHelper()');
 const id=r.run('__EMBERWILD_PROLOGUE_HELPER.id');s=r.json('{members:party.members.map(memberKey),active:party.active,enlisted:party.enlisted,job:partyMember('+id+').job,name:characterName(partyMember('+id+')),tab}');
 assert.deepEqual(s,{members:[job,id],active:[job],enlisted:[job,id],job:job===3?0:3,name:'造物助手',tab:'roster'},'the helper joins the roster but the player puts it in the lineup');
 assert.equal(r.at().ok,false);r.run('toggleMember('+id+')');assert.equal(r.at().ok,true);
 assert.equal(r.json('__EMBERWILD_COMPANION_TEST_API.plans.some(p=>p.id==='+id+')'),false,'the helper is not a catalogue companion');
 r.run('prologueReturn()');

 r.until('trial','action');r.run('prologueOpenTask()');assert.equal(r.run('prologueStartBattle()'),true);assert.equal(r.run('heroes().length'),2);
 assert.deepEqual(r.fight(),{name:'隊伍試煉',success:true,key:'prologue/trial'});
 assert.deepEqual(economy(r),before,'training fights and the helper give no experience, loot, kills, achievements, tickets or unlocks');
 r.run('prologueReturn()');

 r.until('gift','action');r.run('prologueOpenTask()');assert.equal(r.run('tab'),'equipment');
 const gift=()=>r.json('{bag:playerHero().bag.map(g=>g.name),starter:playerHero().bag.filter(g=>g.starterPack).length,mail:party.mailbox.messages.map(m=>[m.rewardKey,m.subject,m.claimed])}');
 s=gift();assert.equal(s.bag.length,6);assert.equal(s.starter,1);assert.equal(s.bag.filter(n=>n==='啟程護符').length,1);assert.deepEqual(s.mail,[['starter-'+job+'-1','女神的贈禮',true]]);
 r.run('prologueOpenTask();prologueOpenTask()');assert.deepEqual(gift(),s,'asking again does not hand out a second set');
 assert.equal(r.at().ok,false);
 for(const g of r.json('playerHero().bag.filter(g=>g.starterPack||!playerHero().equipped.includes(g.id)).map(g=>g.id)'))r.run(`withHero(playerHero(),()=>equipGear(${JSON.stringify(g)}))`);
 assert.equal(r.at().ok,true);r.run('prologueReturn()');

 r.until('departure','chapter');for(let i=0;i<4;i++)r.run('prologueNext()');r.run('prologueEnter()');
 s=r.json('{active:__EMBERWILD_PROLOGUE.active(),done:party.story.quests.prologue.done,quests:Object.keys(party.story.quests),members:party.members.map(memberKey),lineup:party.active,enlisted:party.enlisted,profiles:Object.keys(party.companionProfiles),unlocked:party.companionUnlocks.unlocked.includes(__EMBERWILD_PROLOGUE_HELPER.id),map:party.map,tab,name:characterName(playerHero()),job:playerHero().job,loadout:playerHero().skillLoadout.active[0]}');
 assert.deepEqual(s,{active:false,done:true,quests:['prologue','goddess_intro','two_regions','shop_rescue'],members:[job],lineup:[job],enlisted:[job],profiles:[],unlocked:false,map:0,tab:'battle',name:'測試者',job,loadout:skills[0].id});
 assert.equal(r.run("setTab('shop')")===false,false,'navigation opens after arrival');
 r.run("setTab('battle');running=true");assert.notEqual(r.run('spawnGroup()'),false,'ordinary exploration opens after arrival');r.run('stopTeamExploration()');
 assert.equal(r.run('sendStarterPackMail('+job+',__EMBERWILD_STARTER_PACK.rows('+job+'))'),false,'the starter mail cannot be sent again');
 assert.deepEqual(r.errors,[]);
 const again=await r.resume();s=again.json('{active:__EMBERWILD_PROLOGUE.active(),bag:playerHero().bag.length,members:party.members.length,name:characterName(playerHero()),error:globalThis.__EMBERWILD_BOOT_SAVE_ERROR||null}');
 assert.deepEqual(s,{active:false,bag:6,members:1,name:'測試者',error:null});assert.deepEqual(again.errors,[]);
});

test('progress survives a reload at every stage; nothing is asked or granted twice',async()=>{
 let r=open();r.run('selectSaveSlot(1)');r.until('creation','action');r.run("$('prologue-name').value='露娜';prologueConfirmName()");
 r=await r.resume();assert.deepEqual(r.at(),{stage:'creation',phase:'after',ok:true,active:true},'the name is kept before the character exists');
 r.until('calling','action');r=await r.resume();assert.equal(r.at().stage,'calling');
 r.until('calling','action');r.run('prologuePickClass(1);prologueConfirmClass()');
 r=await r.resume();assert.deepEqual(r.at(),{stage:'calling',phase:'after',ok:true,active:true});assert.equal(r.run('characterName(playerHero())'),'露娜');assert.equal(r.run('playerHero().job'),1);
 r.until('skills','action');r.run('prologueOpenTask()');r.run(`chooseSkillSlot('active',0,${JSON.stringify(learnedActive(r)[0].id)})`);
 r=await r.resume();assert.deepEqual(r.at(),{stage:'skills',phase:'after',ok:true,active:true});
 r.until('practice','action');r.run('prologueOpenTask();prologueStartBattle()');assert.equal(r.run('foes.length'),2);
 r=await r.resume();assert.equal(r.at().stage,'practice');assert.equal(r.at().ok,false,'an interrupted fight is simply not won yet');
 r.until('practice','action');r.run('prologueOpenTask();prologueStartBattle()');assert.equal(r.fight().success,true);
 r=await r.resume();assert.deepEqual(r.at(),{stage:'practice',phase:'after',ok:true,active:true});
 r.until('helper','action');r.run('prologueAcceptHelper()');r=await r.resume();assert.equal(r.json('party.members.length'),2);assert.equal(r.at().stage,'helper');
 r.until('helper','action');r.run('prologueOpenTask()');assert.equal(r.json('party.members.length'),2,'the helper is not created twice');r.run('toggleMember(__EMBERWILD_PROLOGUE_HELPER.id)');
 r=await r.resume();assert.deepEqual(r.at(),{stage:'helper',phase:'after',ok:true,active:true});
 r.until('trial','action');r.run('prologueOpenTask();prologueStartBattle()');assert.equal(r.fight().success,true);r.run('prologueReturn()');
 r.until('gift','action');r.run('prologueOpenTask()');assert.equal(r.json('playerHero().bag.length'),6);
 r=await r.resume();assert.equal(r.at().stage,'gift');r.until('gift','action');r.run('prologueOpenTask()');assert.equal(r.json('playerHero().bag.length'),6,'reloading does not grant the gear again');assert.equal(r.json('party.mailbox.messages.length'),1);
 for(const g of r.json('playerHero().bag.filter(g=>g.starterPack||!playerHero().equipped.includes(g.id)).map(g=>g.id)'))r.run(`withHero(playerHero(),()=>equipGear(${JSON.stringify(g)}))`);
 r=await r.resume();assert.deepEqual(r.at(),{stage:'gift',phase:'after',ok:true,active:true});
 r.until('departure','chapter');r=await r.resume();assert.equal(r.at().stage,'departure');assert.equal(r.json('party.members.length'),2);
 r.until('departure','chapter');for(let i=0;i<4;i++)r.run('prologueNext()');r.run('prologueEnter()');
 r=await r.resume();assert.equal(r.at().active,false);assert.equal(r.json('party.members.length'),1);assert.equal(r.json('playerHero().bag.length'),6);assert.deepEqual(r.errors,[]);
});

test('a lost training fight can be retried and is not counted',()=>{
 const r=open();create(r,3);r.until('skills','action');r.run('prologueOpenTask()');r.run(`chooseSkillSlot('active',0,${JSON.stringify(learnedActive(r)[0].id)})`);r.run('prologueReturn()');
 r.until('practice','action');r.run('prologueOpenTask();prologueStartBattle()');
 r.run('{const it=pacedRound();it.next();for(const h of heroes())h.hp=0;for(let i=0;i<200&&!it.next().done;i++){}}');
 assert.equal(r.run('running'),false);assert.equal(r.json('expeditionChallengeResult.success'),false);assert.equal(r.at().ok,false);
 assert.match(r.run("$('app').innerHTML"),/再試一次/);
 assert.equal(r.run('prologueStartBattle()'),true);assert.equal(r.fight().success,true);assert.equal(r.at().ok,true);
});

test('characters made outside the prologue and existing saves never enter it',async()=>{
 const r=open();r.run('selectSaveSlot(1);start(2);closeModal();');
 let s=r.json('{active:__EMBERWILD_PROLOGUE.active(),record:party.story.quests.prologue||null,mail:party.mailbox.messages.map(m=>m.rewardKey),worn:playerHero().equipped.map(x=>!!x),slot:playerHero().skillLoadout.active[0]!==null,quests:Object.keys(party.story.quests)}');
 assert.deepEqual(s,{active:false,record:null,mail:['starter-2-1'],worn:[true,true,true,true,true],slot:true,quests:['goddess_intro','two_regions','shop_rescue']},'direct creation keeps the previous kit and starter mail');
 r.run('playerHero().lv=12;playerHero().gold=4321;recruitCompanion(10);closeModal();save()');
 const facts=x=>x.json('{story:party.story,mailbox:party.mailbox,members:party.members.map(h=>[memberKey(h),h.lv,h.name,h.bag.map(g=>g.id),h.equipped,h.skillLoadout]),gold:playerHero().gold,active:party.active,enlisted:party.enlisted,unlocked:party.companionUnlocks.unlocked,tickets:party.achievements.tickets}'),packed=facts(r);
 const again=await r.resume();assert.equal(again.at().active,false);assert.equal(again.json('party.story.quests.prologue||null'),null,'no prologue record is written into an existing save');
 assert.deepEqual(facts(again),packed,'name, class, level, gear, skills, companions, quests and mail are unchanged');again.run('save()');assert.deepEqual(facts(await again.resume()),packed);assert.doesNotMatch(again.run('storyView()'),/序章：造物室/);assert.deepEqual(again.errors,[]);
});

test('text edited in the balance document is what the game shows; a broken prologue is refused',()=>{
 const r=open();r.run('selectSaveSlot(1)');assert.match(r.run("$('prologue-layer').innerHTML"),/無源之光亮起/);
 r.run("globalThis.d=exportableBalance();globalThis.q=d.story.quests.find(q=>q.prologue);q.stages[0].dialogue[0].text='改寫後的開場旁白。';q.prologue.scenes[0].name='造物之初';q.prologue.ui.continue='往下';applyBalanceConfig(d,{persist:false});render()");
 const html=r.run("$('prologue-layer').innerHTML");assert.match(html,/改寫後的開場旁白。/);assert.match(html,/造物之初/);assert.match(html,/>往下</);assert.doesNotMatch(html,/無源之光亮起/);
 assert.throws(()=>r.run("globalThis.bad=exportableBalance();bad.story.quests.find(q=>q.prologue).stages.splice(3,1);applyBalanceConfig(bad,{persist:false})"),/序章/);
 assert.match(r.run("render();$('prologue-layer').innerHTML"),/改寫後的開場旁白。/,'the rejected document did not replace the running one');
 assert.deepEqual(M.issues(r.json('exportableBalance().story'),{}).filter(x=>x.startsWith('序章')),[],'the export round-trips');
});

test('a script changed under a running prologue keeps moving; an update that cannot be applied is reported',async()=>{
 const r=open();r.run('selectSaveSlot(1)');for(let i=0;i<6;i++)r.run('prologueNext()');
 r.run("globalThis.d=exportableBalance();globalThis.q=d.story.quests.find(q=>q.prologue);q.stages[0].dialogue=q.stages[0].dialogue.slice(0,2);q.stages[1].dialogue=[];applyBalanceConfig(d,{persist:false});render()");
 assert.match(r.run("$('prologue-layer').innerHTML"),/光點匯聚成光團/,'the cursor moves back inside the shortened scene');
 r.run('prologueNext()');assert.deepEqual([r.at().stage,r.at().phase],['creation','action']);
 r.run("$('prologue-name').value='露娜';prologueConfirmName();prologueNext()");assert.deepEqual([r.at().stage,r.at().phase],['commission','before']);
 assert.match(r.run("$('prologue-layer').innerHTML"),/prologueNext\(\)/,'a stage left without lines still offers a way forward');
 r.run('prologueNext()');assert.equal(r.at().stage,'calling');
 // Import while a fight is running: the game refuses the document and says so instead of reporting success.
 r.until('calling','action');r.run('prologuePickClass(0);prologueConfirmClass()');r.until('skills','action');r.run('prologueOpenTask()');r.run(`chooseSkillSlot('active',0,${JSON.stringify(learnedActive(r)[0].id)})`);r.run('prologueReturn()');
 r.until('practice','action');r.run('prologueOpenTask();prologueStartBattle()');assert.equal(r.run('running'),true);
 r.run("globalThis.next=exportableBalance();next.story.quests.find(q=>q.prologue).prologue.training.name='改名的對象';");
 const file=text=>`({target:{files:[{size:${'text'}.length,text:async()=>${'text'}}],value:''}})`;
 r.run('globalThis.text=JSON.stringify(next)');assert.equal(await r.run('importBalanceJSON('+file()+')'),false);
 assert.match(r.run("$('toast').textContent"),/未套用/);assert.equal(r.json('exportableBalance().story.quests.find(q=>q.prologue).prologue.training.name'),'訓練對象','the running document is unchanged');
 assert.equal(r.fight().success,true);assert.equal(await r.run('importBalanceJSON('+file()+')'),true);assert.match(r.run("$('toast').textContent"),/已套用/);
 assert.equal(r.json('exportableBalance().story.quests.find(q=>q.prologue).prologue.training.name'),'改名的對象');assert.equal(r.at().stage,'practice');assert.equal(r.at().ok,true,'progress is kept across the update');
});
