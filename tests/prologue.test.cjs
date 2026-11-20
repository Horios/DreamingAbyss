const test=require('node:test'),assert=require('node:assert/strict');
const {open,create,equip,fight}=require('./opening-helpers.cjs');
// v0.178: the priest joins by her ticket (夥伴招募券 - 艾琳), handed out at the start and used from the bag.
for(const job of [0,1,2,3])test('class '+job+': direct creation, equipment, real battle and the priest joins by her ticket',()=>{
 const r=open();create(r,job);
 assert.equal(r.run('playerHero().name'),'測試者');assert.equal(r.run('playerHero().job'),job);
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'gift');assert.equal(r.run("$('prologue-layer').hidden"),true);
 assert.equal(r.run('companionTicketCount(13)'),1,'the priest ticket comes with the starter gear');assert.equal(r.run('typeof showCompanionRecruitment'),'undefined','no recruiting page');
 equip(r);assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'practice');
 assert.equal(r.run('party.questChallenge'),undefined);fight(r);
 assert.equal(r.run('__EMBERWILD_PROLOGUE.stage()'),'helper');
 assert.equal(r.run("tab"),'equipment','the helper stage opens the bag');
 assert.equal(r.run('useCompanionRecruitmentTicket(13)'),true);r.run('render()');assert.equal(r.run('companionTicketCount(13)'),0);
 assert.equal(r.run('party.story.quests.prologue.done'),true);assert.equal(r.run('!!partyMember(13)'),true);
 assert.equal(r.run('party.active.includes(13)'),true);assert.equal(r.run('party.story.quests.chapter1.started'),false);
 assert.equal(r.run('__EMBERWILD_STORY.dialogueView()'),null);assert.equal(r.run('__EMBERWILD_CHAPTER.gated()'),false);
 r.run("setTab('shop');setTab('skills');setTab('battle');running=true;spawnGroup()");assert.equal(r.run('foes.length>0'),true);
 assert.deepEqual(r.errors,[]);assert.deepEqual(r.warnings,[]);
});
test('creation draft resumes class selection and invalid names do not create a character',()=>{
 const r=open();r.run("selectSaveSlot(1);$('prologue-name').value='';prologueConfirmName()");assert.equal(r.run('!!state'),false);
 r.run("$('prologue-name').value='保留名字';prologueConfirmName()");const n=open(Object.fromEntries(r.values));n.run('selectSaveSlot(1)');assert.equal(n.run('__EMBERWILD_PROLOGUE.stage()'),'calling');
 n.run('prologuePickClass(2);prologueConfirmClass()');assert.equal(n.run('playerHero().name'),'保留名字');
});
test('unfinished onboarding resumes without creating again or repeating starter gear',async()=>{
 const r=open();create(r);equip(r);r.run('save()');const n=open(Object.fromEntries(r.values));n.run('selectSaveSlot(1)');await n.run('EmberwildOffline.settle(undefined,false)');n.run('render()');
 assert.equal(n.run('__EMBERWILD_PROLOGUE.stage()'),'practice');assert.equal(n.run('playerHero().bag.filter(g=>g.starterPack).length'),1);
});
test('first priest recruitment rolls back on save failure and retries without duplicates',()=>{
 const r=open();create(r);equip(r);r.run('party.story.flags.onboarding_battle=true;render();globalThis.realSave=save;save=()=>false');
 r.run('recruitCompanion(13)');assert.equal(r.run('!!partyMember(13)'),false);assert.equal(r.run('party.story.quests.prologue.done'),false);
 r.run('save=realSave;recruitCompanion(13);render()');assert.equal(r.run('party.story.quests.prologue.done'),true);assert.equal(r.run('party.members.filter(h=>h.companionId===13).length'),1);
});
