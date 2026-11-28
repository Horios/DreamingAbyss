'use strict';
/* v0.184: quest battles start from the quest page. The battle page has no 任務地圖 button since v0.182, so the current
   stage card on the quest page shows its battle (map, enemies, state) and 前往任務關卡 starts it and opens the battle page. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('the chapter 1 ambush stage offers its quest battle on the quest page and starts it',()=>{
 const r=loadRuntime(root);
 r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);
  const q=party.story.quests;q.chapter1={current:'ambush_fight',started:true,done:false,completed:['ambush','ambush_help'],baseline:{},choices:{}};
  openStory('chapter1','main');`);
 const html=r.run('storyView()');
 assert.match(html,/data-quest-encounter="chapter1\/ambush_fight"/);assert.match(html,/任務關卡：商隊遇襲/);assert.match(html,/前往任務關卡/);assert.match(html,/任務關卡通關 · 商隊遇襲/,'the objective names the battle');assert.doesNotMatch(html,/任務關卡通關 · chapter1\/ambush_fight/);
 assert.equal(r.run("goQuestEncounter('chapter1/ambush_fight')"),true);
 assert.equal(r.run('tab'),'battle');assert.equal(r.run('party.questChallenge?.key'),'chapter1/ambush_fight');assert(r.run('foes.length')>0);
 assert.deepEqual(r.errors,[]);
});
test('a stage that has not reached its battle shows it as not open, without a start button',()=>{
 const r=loadRuntime(root);
 r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);
  const q=party.story.quests;q.chapter1={current:'ambush',started:true,done:false,completed:[],baseline:{},choices:{}};`);
 const row=JSON.parse(r.run("JSON.stringify(questEncounterRows().find(x=>x.key==='chapter1/ambush_fight'))"));assert.equal(row.unlocked,false);
 assert.equal(r.run("goQuestEncounter('chapter1/ambush_fight')"),false);assert(!r.run('party.questChallenge'));
 assert.deepEqual(r.errors,[]);
});
// v0.211: the bag always hides worn equipment; the 穿戴 filter no longer exists (worn gear is managed on the worn page).
test('the bag always hides worn equipment; there is no worn filter',()=>{
 const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);globalThis.spare=gear(1,0,0,0);state.bag.push(spare);setTab('equipment');setInventoryCategory('equipment');`);
 const ids=()=>JSON.parse(r.run('JSON.stringify(__EMBERWILD_GEAR_INVENTORY.rows().map(x=>x.g.id))')),worn=JSON.parse(r.run('JSON.stringify(state.equipped.filter(Boolean))'));
 assert(worn.length>0);assert(ids().includes(r.run('spare.id')));assert(!ids().some(id=>worn.includes(id)),'worn items are hidden');
 assert.equal(r.run("setGearInventoryFilter('worn','all')"),false,'no worn filter');assert(!ids().some(id=>worn.includes(id)),'worn items stay hidden');
 assert.deepEqual(r.errors,[]);
});
test('v0.185: the exploration area shows the map difficulty with its monster and drop changes and switches it',()=>{
 const r=loadRuntime(root);r.prompts=[];r.ctx.confirm=m=>{r.prompts.push(m);return true;};
 r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);setTab('battle');`);
 let html=r.run('battleView()');
 assert.match(html,/aria-label="地圖難度"/);assert.match(html,/data-difficulty="0" aria-pressed="true"/);
 assert.match(html,/怪物<\/span>生命 ×1 · 攻擊 ×1 · 防禦 ×1/);assert.match(html,/掉落<\/span>金幣 ×1 · 素材 ×1 · 裝備 一般 /);
 assert.equal(r.run('setMapDifficulty(2)'),true);assert.equal(r.run('party.difficulty'),2);
 html=r.run('battleView()');assert.match(html,/data-difficulty="2" aria-pressed="true"/);
 const m=JSON.parse(r.run('JSON.stringify(MODES[2])'));assert.match(html,new RegExp('生命 ×'+Math.round(m.hp*100)/100+' · 攻擊 ×'+Math.round(m.atk*100)/100));
 // While exploring, switching asks first; declining keeps the difficulty.
 r.run('startSelectedExploration();');r.ctx.confirm=m=>{r.prompts.push(m);return false;};
 assert.equal(r.run('setMapDifficulty(0)'),false);assert.equal(r.run('party.difficulty'),2);assert.match(r.prompts.at(-1),/停止探索/);
 assert.deepEqual(r.errors,[]);
});
