const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
test('failed story transactions restore added and removed members and the selected hero',()=>{
 const r=loadRuntime(path.resolve(__dirname,'..'));
 r.run('selectSaveSlot(1);start(0);__EMBERWILD_PROLOGUE_HELPER.add(10,"助手");globalThis.helper=__EMBERWILD_PROLOGUE_HELPER.member();party.selected=memberKey(helper);state=helper;save();globalThis.originalMembers=[...party.members];globalThis.before=JSON.stringify(packParty());globalThis.realSave=save;save=()=>false');
 assert.equal(r.run('__EMBERWILD_STORY.transaction(()=>__EMBERWILD_PROLOGUE_HELPER.remove())'),false);
 assert.equal(r.run('JSON.stringify(packParty())===before'),true,'a removed helper and its roster entries must be restored');
 assert.equal(r.run('state===helper&&party.members.every((h,i)=>h===originalMembers[i])'),true,'existing hero references must survive rollback');
 r.run('save=realSave;__EMBERWILD_PROLOGUE_HELPER.remove();save();globalThis.before=JSON.stringify(packParty());save=()=>false');
 assert.equal(r.run('__EMBERWILD_STORY.transaction(()=>__EMBERWILD_PROLOGUE_HELPER.add(10,"助手"))'),false);
 assert.equal(r.run('JSON.stringify(packParty())===before'),true,'an unsaved added helper must not survive rollback');
});
test('chapter completion and companion recruitment commit together, including save failure and retry',()=>{
 const r=loadRuntime(path.resolve(__dirname,'..'));
 r.run("selectSaveSlot(1);start(0);__EMBERWILD_STORY.begin('chapter1','together');globalThis.originalSave=save;globalThis.writes=[];save=()=>{writes.push([party.story.quests.chapter1.done,!!partyMember(10)]);return false}");
 assert.equal(r.run("completeStoryStage('chapter1','','together')"),false);
 assert.deepEqual(JSON.parse(r.run('JSON.stringify(writes)')),[[true,true],[false,false]],'the stage and companion are saved together; the offline wrapper only retries the rolled-back state');
 assert.equal(r.run('!!partyMember(10)'),false);
 assert.equal(r.run('party.story.quests.chapter1.done'),false);
 r.run('save=originalSave');
 assert.equal(r.run("completeStoryStage('chapter1','','together')"),true);
 assert.equal(r.run('!!partyMember(10)'),true,'the committed final stage must include Lorne');
 assert.equal(r.run('JSON.parse(localStorage.getItem(KEY)).members.some(h=>h.companionId===10)'),true);
 assert.equal(r.run("completeStoryStage('chapter1','','together')"),false);
 assert.equal(r.run('party.members.filter(h=>h.companionId===10).length'),1);
});
