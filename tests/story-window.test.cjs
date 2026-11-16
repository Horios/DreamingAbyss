// v0.142: the shared story window. Headless checks of the views and of what skipping does to the story state.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..'),M=require('../js/story/story-model.js');
function game(){const r=loadRuntime(root);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer)');return r;}
const view=r=>r.json('__EMBERWILD_STORY.dialogueView()');

test('skippable is decided by the quest data: never the prologue, and any quest can opt out',()=>{
 assert.equal(M.skippable({id:'a'}),true);assert.equal(M.skippable({id:'a',skippable:false}),false);assert.equal(M.skippable({id:'prologue',prologue:{version:1}}),false);assert.equal(M.skippable(null),false);
});

test('quest dialogue is a window view: one line at a time, then the stage actions; the inline copy stays for the quest card',()=>{
 const r=game();assert.equal(view(r),null);r.run("readStory('skill_equipment_intro')");
 let v=view(r);assert.equal(v.head.eyebrow,'裝備技能與寶石入門');assert.equal(v.line.speaker,'女神');assert.match(v.line.text,/啟程護符/);assert.equal(v.advance,'nextStoryDialogue');assert.equal(v.skip,'skipStoryDialogue');
 assert.match(r.run("$('prologue-layer').innerHTML"),/data-story-skip/);assert.match(r.run("$('prologue-layer').innerHTML"),/class="story-window-mask"/);
 r.run('nextStoryDialogue()');v=view(r);assert.equal(v.line,null);assert.equal(v.advance,null);assert.equal(v.skip,null);assert.match(v.body,/完成階段／繼續劇情/);
 r.run('endStoryDialogue()');assert.equal(view(r),null);assert.equal(r.run("$('prologue-layer').hidden"),true);assert.deepEqual(r.errors,[]);
});

test('skipping a read-only stage completes it once, exactly like finishing it; unmet objectives and choices are not decided for the player',()=>{
 const r=game(),charms=()=>r.json('playerHero().bag.filter(g=>g.storyRewardKey==="initiation_charm").length');
 r.run("readStory('skill_equipment_intro')");const before=charms();
 assert.equal(r.run('skipStoryDialogue()'),true);assert.equal(charms(),before+1,'the stage reward is granted by the normal completion');
 assert.deepEqual(r.json('party.story.quests.skill_equipment_intro.completed'),['equipment_gift']);assert.equal(view(r),null,'the window closes');
 assert.equal(r.run('skipStoryDialogue()'),false,'nothing is left to skip');assert.equal(charms(),before+1,'and nothing is granted twice');
 // The next stage has objectives that are not met: skipping only stops the reading.
 r.run("readStory('skill_equipment_intro')");assert.equal(r.run('skipStoryDialogue()'),true);assert.equal(view(r),null);assert.deepEqual(r.json('party.story.quests.skill_equipment_intro.completed'),['equipment_gift']);
 // A stage that ends in a choice stops at the choice.
 r.run("globalThis.d=exportableBalance();globalThis.q=d.story.quests.find(q=>q.id==='two_regions');q.stages[0].conditions.conditions=[];q.stages[0].choices=[{id:'a',text:'選項甲',conditions:{mode:'all',conditions:[]},effects:[],next:q.stages[0].next,nextQuests:[]},{id:'b',text:'選項乙',conditions:{mode:'all',conditions:[]},effects:[],next:q.stages[0].next,nextQuests:[]}];applyBalanceConfig(d,{persist:false});readStory('two_regions')");
 assert.equal(r.run('skipStoryDialogue()'),true);const v=view(r);assert.equal(v.line,null);assert.match(v.body,/選項甲[\s\S]*選項乙/);assert.deepEqual(r.json('party.story.quests.two_regions.completed'),[],'no choice was made for the player');
 // A quest marked as not skippable refuses, by data.
 r.run("endStoryDialogue();d.story.quests.find(q=>q.id==='shop_rescue').skippable=false;applyBalanceConfig(d,{persist:false});readStory('shop_rescue')");
 assert.equal(view(r).skip,null);assert.equal(r.run('skipStoryDialogue()'),false);assert.equal(r.run('storyWindowSkip(true)'),false);assert.notEqual(view(r).line,null,'still on its first line');assert.deepEqual(r.errors,[]);
});

test('the prologue offers no skip and refuses every skip route',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1)');
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'creation');const html=r.run("$('prologue-layer').innerHTML");
 assert.doesNotMatch(html,/data-story-skip/);assert.match(html,/data-story-all/);assert.match(html,/data-story-fast/);assert.match(html,/data-story-speed/);
 assert.equal(r.run('storyWindowSkip()'),false);assert.equal(r.run('storyWindowSkip(true)'),false);assert.equal(r.run('skipStoryDialogue()'),false);
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()+"/"+__EMBERWILD_PROLOGUE.phase()'),'creation/before');assert.deepEqual(r.errors,[]);
});

test('text speed is a saved setting with four values',()=>{
 const r=game();assert.equal(r.run('EmberwildStoryWindow.speed'),'normal');assert.deepEqual(JSON.parse(r.run('JSON.stringify(EmberwildStoryWindow.speeds)')),{slow:60,normal:30,fast:15,instant:0});
 assert.equal(r.run("storyWindowSpeed('warp')"),false);assert.equal(r.run("storyWindowSpeed('fast')"),true);assert.equal(r.values.get('emberwild-story-text-speed'),'fast');
 const again=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.equal(again.run('EmberwildStoryWindow.speed'),'fast');assert.match(again.run('storyTextOptionsView()'),/value="fast" selected/);
 assert.match(r.run('optionsView()'),/劇情文字速度/);
});
