// v0.150: chapter 1 (初臨艾斯蘭) is the `chapter1` story quest. These tests play it after the prologue through the real
// systems (story window, quest encounter with temporary allies, companion recruitment) and check the feature gate.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),M=require('../js/story/story-model.js');
const published=JSON.parse(fs.readFileSync(path.join(root,'data/balance.json'),'utf8'));
function open(saved={}){const r=loadRuntime(root,'index.html',saved);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));
 r.pro=()=>r.json('{stage:__EMBERWILD_PROLOGUE.stage(),phase:__EMBERWILD_PROLOGUE.phase()}');
 r.until=(stage,phase)=>{for(let i=0;i<80;i++){const s=r.pro();if(s.stage===stage&&s.phase===phase)return;r.run('prologueNext()');}assert.fail('prologue did not reach '+stage+'/'+phase);};
 r.fight=()=>{for(let i=0;i<600&&r.run('running');i++)r.run('{const it=pacedRound();for(let n=0;n<4000&&!it.next().done;n++){}}');return r.json('globalThis.expeditionChallengeResult');};
 r.at=()=>r.json('__EMBERWILD_CHAPTER.current()');
 // Read the current stage's lines to the end.
 r.read=()=>{const s=r.at();for(let i=0;i<60&&r.at()?.stage===s.stage&&!r.at().read;i++)r.run('chapterNext()');};
 r.reload=()=>open(Object.fromEntries(r.values));
 r.resume=async()=>{const n=r.reload();n.run('selectSaveSlot(1)');await n.run('EmberwildOffline.settle(undefined,false)');n.run('render()');return n;};return r;}
function prologue(r,job=3){
 r.run('selectSaveSlot(1)');r.until('creation','action');r.run(`$('prologue-name').value='測試者';prologueConfirmName()`);
 r.until('calling','action');r.run(`prologuePickClass(${job});prologueConfirmClass()`);
 r.until('gift','action');r.run('prologueOpenTask()');for(const g of r.json('playerHero().bag.filter(g=>g.starterPack||!playerHero().equipped.includes(g.id)).map(g=>g.id)'))r.run(`withHero(playerHero(),()=>equipGear(${JSON.stringify(g)}))`);r.run('prologueReturn()');
 r.until('skills','action');r.run('prologueOpenTask()');const sk=r.json("__EMBERWILD_SKILLS.system().definitions.filter(s=>s.type==='active'&&s.jobs?.includes(playerHero().job)&&__EMBERWILD_SKILLS.learned(playerHero(),s)).map(s=>s.id)")[0];r.run(`chooseSkillSlot('active',0,${JSON.stringify(sk)})`);r.run('prologueReturn()');
 r.until('practice','action');r.run('prologueOpenTask()');r.run('prologueStartBattle()');r.fight();r.run('prologueReturn()');
 r.until('helper','action');r.run('prologueAcceptHelper()');r.run('toggleMember('+r.run('__EMBERWILD_PROLOGUE_HELPER.id')+')');r.run('prologueReturn()');
 r.until('trial','action');r.run('prologueOpenTask()');r.run('prologueStartBattle()');r.fight();r.run('prologueReturn()');
 r.until('departure','chapter');r.run('prologueEnter()');
}
// Kill monsters in the first map until the stage moves on (the exploration objective is stage-relative).
function explore(r,stage){r.run("setTab('battle')");for(let i=0;i<40&&r.at()?.stage===stage;i++){r.run('if(!running){running=true;spawnGroup();}');for(let k=0;k<50&&r.run('running')&&r.at()?.stage===stage;k++)r.run('{const it=pacedRound();for(let n=0;n<4000&&!it.next().done;n++){}}');r.run('render()');}}

const ctx={maps:published.balanceSettings.maps.catalog,monsters:published.balanceSettings.monsters.catalog,items:published.items,skills:published.skillSystem.definitions,forms:published.equipmentForms,companions:published.companions,classes:published.classes};

test('published chapter 1: five scenes, the script text, the first map renamed',()=>{
 assert.deepEqual(M.issues(published.story,ctx),[]);
 assert.equal(published.balanceSettings.maps.catalog[0].name,'無名密林');
 const q=published.story.quests.find(x=>x.id==='chapter1');assert(q&&q.chapter);
 assert.deepEqual(q.chapter.scenes.map(s=>s.name),['林間小道','突如其來的襲擊','戰鬥結束','同行','抵達村莊']);
 assert.equal(q.stages[0].dialogue[0].text,'你走入了發光的門扉。');
 assert.deepEqual(q.stages.find(s=>s.id==='ambush').choices.map(c=>c.text),['「我來幫忙！」','「發生什麼事了？」','「需要我做什麼？」']);
 assert.equal(q.stages.find(s=>s.id==='ambush_fight').encounter.enemies.reduce((n,e)=>n+e.count,0),3);
 assert(q.stages.find(s=>s.id==='travel').dialogue.some(l=>l.text==='我是艾琳，一名旅行中的牧師。'));
 const pro=published.story.quests.find(x=>x.id==='prologue');assert.equal(pro.prologue.chapter.title,'第一章：初臨艾斯蘭');
 assert.deepEqual(pro.stages.at(-1).effects.map(e=>e.key),['chapter1_start','chapter_gate']);
 assert.deepEqual(published.tutorials.modules.map(m=>m.id).slice(-2),['shop_basics','quest_basics']);
});

test('chapter 1 plays after the prologue: exploration, the ambush with temporary allies, the caravan, the village',async()=>{
 const r=open();prologue(r);
 assert.deepEqual(r.at(),{quest:'chapter1',stage:'arrival',read:false,line:0});
 assert.equal(r.run("document.getElementById('prologue-layer').innerHTML.includes('data-chapter=\"chapter1\"')"),true,'the story window shows the chapter');
 // Gate: only the taught pages; no hunting-mode switch, no other maps, no mailbox.
 for(const id of ['shop','quests','partnerRoster','forge','gather','alchemy','bossCraft'])assert.equal(r.run(`setTab('${id}')`),false,id+' is locked');
 assert.equal(r.run("setStoryCategory('side')"),false);assert.equal(r.run("openUtilityPanel('mailbox')"),false);
 assert.equal(r.run("setHuntingMode('group')"),false);assert.equal(r.run('chooseMap(13)'),false);assert.equal(r.run('party.map'),0);
 r.read();assert.equal(r.at().read,true);assert.equal(r.run('tab'),'battle');
 assert.equal(r.run("__EMBERWILD_CHAPTER.banner().includes('chapter-task')"),true,'the exploration task is on the banner');
 explore(r,'arrival');assert.equal(r.at().stage,'ambush');
 r.read();assert.equal(r.run("document.getElementById('prologue-layer').innerHTML.split('data-chapter-choice=').length-1"),3);
 assert.equal(r.run("chapterChoose('ask')"),true);assert.equal(r.at().stage,'ambush_ask');r.read();
 assert.equal(r.at().stage,'ambush_fight');r.read();
 const allies=r.json('{lineup:party.active.length,names:heroes().slice(1).map(characterName)}');assert.deepEqual(allies,{lineup:3,names:['商隊護衛','旅行牧師']});
 assert.equal(r.run('chapterStartBattle()'),true);assert.equal(r.json('foes.length'),3);
 let result=r.fight();for(let i=0;i<5&&!result?.success;i++){r.run('for(const h of heroes())h.hp=stats(h).hp;render()');r.run('chapterStartBattle()');result=r.fight();}
 assert.equal(result.success,true);r.run('render()');
 assert.equal(r.at().stage,'aftermath');assert.deepEqual(r.json('{m:party.members.map(memberKey),a:party.active,e:party.enlisted}'),{m:[3],a:[3],e:[3]},'the temporary allies left the roster and the lineup');
 r.read();r.run("chapterChoose('new')");r.read();r.read();r.run("chapterChoose('later')");r.read();
 assert.equal(r.at().stage,'caravan');assert.equal(r.run("__EMBERWILD_CHAPTER.banner().includes('data-chapter-action')"),true);
 assert.equal(r.run("setHuntingMode('group')"),false,'scene 3 free exploration is single-monster only');
 const gold=r.run('playerHero().gold');r.run('chapterAction()');
 assert.equal(r.at().stage,'travel');r.read();assert.equal(r.run("document.getElementById('prologue-layer').innerHTML.includes('data-chapter-choice=')"),true,'a choice view');
 r.run("chapterChoose('heal')");r.read();r.read();
 assert.equal(r.at().stage,'village');r.read();assert.equal(r.run('playerHero().gold')-gold,100,'the caravan reward');
 r.read();r.run("chapterChoose('travel')");r.read();r.read();r.run("chapterChoose('why')");r.read();
 assert.equal(r.at()?.stage,'together');r.read();
 assert.equal(r.at(),null,'chapter 1 is finished');assert.equal(r.json('party.story.quests.chapter1.done'),true);
 assert.deepEqual(r.json('{members:party.members.map(memberKey),name:characterName(partyMember(13))}'),{members:[3,13],name:'艾琳'},'Eileen joins');
 // Shop and commissions open; the rest stays locked until later chapters.
 assert.notEqual(r.run("setTab('shop')"),false);assert.notEqual(r.run("setTab('quests')"),false);
 for(const id of ['partnerRoster','forge','gather','alchemy'])assert.equal(r.run(`setTab('${id}')`),false,id+' stays locked');
 assert.equal(r.run("setHuntingMode('group')"),true,'hunting mode opens with the village');
 assert.deepEqual(r.errors,[]);
 const again=await r.resume();assert.equal(again.at(),null);assert.equal(again.run("setTab('forge')"),false);assert.deepEqual(again.errors,[]);
});

test('reading progress survives a reload; a lost ambush can be retried',async()=>{
 const r=open();prologue(r,0);r.read();
 const a=await r.resume();assert.deepEqual(a.at(),{quest:'chapter1',stage:'arrival',read:true,line:0},'lines already read are not replayed');
 explore(a,'arrival');a.read();a.run("chapterChoose('help')");a.read();a.read();
 assert.equal(a.at().stage,'ambush_fight');a.run('chapterStartBattle()');a.run('for(const h of heroes())h.hp=0');a.fight();a.run('render()');
 assert.equal(a.at().stage,'ambush_fight','a lost fight keeps the stage');assert.equal(a.run("__EMBERWILD_CHAPTER.banner().includes('再試一次')"),true);
 assert.deepEqual(a.errors,[]);
});

test('characters made outside the prologue and saves that finished it earlier are never gated',()=>{
 const r=open();r.run('selectSaveSlot(1);start(0)');assert.equal(r.run('__EMBERWILD_CHAPTER.gated()'),false);assert.notEqual(r.run("setTab('forge')"),false);assert.equal(r.at(),null);
});
