const test=require('node:test'),assert=require('node:assert/strict');const {open}=require('./opening-helpers.cjs');
function old(r,current='together',done=false,completed=['village']){r.run(`selectSaveSlot(1);start(0);party.story.quests.prologue={current:'departure',started:true,done:true,completed:['creation','calling','gift','practice','helper','departure'],baseline:{},choices:{}};party.story.quests.chapter1={current:${JSON.stringify(current)},done:${done},started:true,completed:${JSON.stringify(completed)},baseline:{},choices:{}};party.story.flags.chapter_gate=true;delete party.story.flags.opening_v2;save()`);}
// v0.178: finishing the caravan story hands out 夥伴招募券 - 洛恩; 洛恩 joins when the ticket is used from the bag.
test('caravan is opt-in, retains encounter choices and rewards once, its ticket brings the warrior without replacing a full party',()=>{
 const r=open();old(r,'ambush',false,[]);r.run('__EMBERWILD_PROLOGUE.migrate();render()');
 assert.equal(r.run('__EMBERWILD_STORY.dialogueView()'),null);assert.equal(r.run('__EMBERWILD_CHAPTER.gated()'),false);
 r.run("readStory('chapter1')");assert.equal(r.run('__EMBERWILD_STORY.dialogueView().head.eyebrow'),'商隊事件');
 assert.deepEqual(r.json("__EMBERWILD_STORY.design.quests.find(q=>q.id==='chapter1').stages.find(s=>s.id==='ambush').choices.map(c=>c.id)"),['help','ask','what']);
 r.run("completeStoryStage('chapter1','ask','ambush');completeStoryStage('chapter1','','ambush_ask');party.progressStats.encounters['chapter1/ambush_fight']=1;completeStoryStage('chapter1','','ambush_fight');recruitCompanion(11);recruitCompanion(12);globalThis.lineup=JSON.stringify(party.active);globalThis.gold=playerHero().gold");
 assert.equal(r.run("completeStoryStage('chapter1','','village')"),true);assert.equal(r.run('playerHero().gold-gold'),100);
 assert.equal(r.run("completeStoryStage('chapter1','','village')"),false);
 assert.equal(r.run("completeStoryStage('chapter1','','together')"),true);
 assert.equal(r.run('!!partyMember(10)'),false,'not before the ticket is used');assert.equal(r.run('companionTicketCount(10)'),1);
 assert.equal(r.run("completeStoryStage('chapter1','','together')"),false);assert.equal(r.run('companionTicketCount(10)'),1,'one ticket');
 assert.equal(r.run('useCompanionRecruitmentTicket(10)'),true);assert.equal(r.run('!!partyMember(10)'),true);assert.equal(r.run('JSON.stringify(party.active)===lineup'),true);
 assert.equal(r.run('party.members.filter(h=>h.companionId===10).length'),1);assert.equal(r.run('companionTicketCount(10)'),0);assert.deepEqual(r.errors,[]);
});
for(const current of ['arrival','travel','plans','offer','join_yes','forest_edge'])test('removed legacy stage '+current+' migrates preserving its reward receipt',()=>{
 const r=open();old(r,current);r.run('globalThis.gold=playerHero().gold;__EMBERWILD_PROLOGUE.migrate();render()');assert.equal(r.run('party.story.quests.chapter1.current'),'together');
 r.run("completeStoryStage('chapter1','','together')");assert.equal(r.run('playerHero().gold'),r.run('gold'));assert.equal(r.run('companionTicketCount(10)'),1);
});
test('completed old caravan receives the missing warrior ticket once and preserves priest, resources and gear',async()=>{
 const r=open();old(r,'together',true,['village','together']);r.run('recruitCompanion(13);globalThis.gold=playerHero().gold;globalThis.gearIds=playerHero().bag.map(g=>g.id);__EMBERWILD_PROLOGUE.migrate();save()');
 assert.equal(r.run('companionTicketCount(10)===1&&!!partyMember(13)'),true);r.run('useCompanionRecruitmentTicket(10)');assert.equal(r.run('playerHero().gold===gold'),true);assert.deepEqual(r.json('playerHero().bag.map(g=>g.id)'),r.json('gearIds'));
 const n=open(Object.fromEntries(r.values));n.run('selectSaveSlot(1)');await n.run('EmberwildOffline.settle(undefined,false)');n.run('render()');assert.equal(n.run('party.members.filter(h=>h.companionId===10).length'),1);assert.equal(n.run('__EMBERWILD_PROLOGUE.active()'),false);
});
test('migration save failure rolls back and can retry',()=>{
 const r=open();old(r,'together',true,['village','together']);r.run('globalThis.originalSave=save;save=()=>false');assert.equal(r.run('__EMBERWILD_PROLOGUE.migrate()'),false);assert.equal(r.run('companionTicketCount(10)'),0);
 r.run('save=originalSave');assert.equal(r.run('__EMBERWILD_PROLOGUE.migrate()'),true);assert.equal(r.run('companionTicketCount(10)'),1);
});
test('an unfinished old prologue resumes inline and its temporary priest does not replace the permanent recruit',()=>{
 const r=open();r.run("selectSaveSlot(1);start(0);__EMBERWILD_PROLOGUE_HELPER.add(13,'助手');party.story.quests.prologue={current:'trial',started:true,done:false,completed:['creation','commission','calling','gift','skills','practice','helper'],baseline:{},choices:{}};delete party.story.flags.opening_v2;__EMBERWILD_PROLOGUE.migrate();render()");
 assert.equal(r.run('!!state'),true);assert.equal(r.run('!!__EMBERWILD_PROLOGUE_HELPER.member()'),false);assert.equal(r.run("$('prologue-layer').hidden"),true);
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'gift');r.run('withHero(playerHero(),()=>equipGear(playerHero().bag.find(g=>g.starterPack).id));render()');
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'helper');r.run('recruitCompanion(13);render()');assert.equal(r.run('party.story.quests.prologue.done'),true);assert.equal(r.run('!!partyMember(13)'),true);
});
