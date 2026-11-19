'use strict';
/* v0.173: system page guides. An older save counts the guides of pages it already visited as done (once); pages it never
   opened still get theirs. New characters start with the marker, so every page plays its guide. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function open(){const r=loadRuntime(root);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));return r;}

test('an older save keeps using the pages it visited; unvisited system pages still get their guide',()=>{
 const r=open();r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);');
 const pack=r.json(`(()=>{const p=packParty();p.tutorials.auto=true;delete p.tutorials.records.system_tours_v173;p.tutorials.pages={battle:1,forge:1,shop:1};return p;})()`);
 const r2=open();r2.run('selectSaveSlot(1);loadParty('+JSON.stringify(pack)+');clearInterval(timer);render()');
 const rec=r2.json('party.tutorials.records');
 assert.equal(rec.forge_basics?.completed,true);assert.equal(rec.forge_basics.legacy,true);
 assert.equal(rec.alchemy_basics,undefined,'never opened: its guide stays available');
 assert.equal(rec.system_tours_v173?.completed,true);
 // The marker keeps it to one pass: a page visited later is not marked done by a reload.
 const again=r2.json(`(()=>{party.tutorials.pages.alchemy=1;return packParty();})()`);
 const r3=open();r3.run('selectSaveSlot(1);loadParty('+JSON.stringify(again)+');clearInterval(timer);render()');
 assert.equal(r3.json('party.tutorials.records.alchemy_basics??null'),null);
 assert.deepEqual(r.errors,[]);assert.deepEqual(r2.errors,[]);assert.deepEqual(r3.errors,[]);
});

test('a new character starts with every system guide pending; the onboarding stage condition holds only at that stage',()=>{
 const r=open();r.run(`selectSaveSlot(1);$('prologue-name').value='測試者';prologueConfirmName();prologuePickClass(0);prologueConfirmClass();clearInterval(timer);`);
 assert.equal(r.json('party.tutorials.records.system_tours_v173.completed'),true);
 assert.equal(r.json("Object.keys(party.tutorials.records).filter(id=>id.endsWith('_basics')).length"),0);
 assert.equal(r.json("__EMBERWILD_TUTORIAL.value({type:'prologueStage',key:'gift',count:1})"),1);
 assert.equal(r.json("__EMBERWILD_TUTORIAL.value({type:'prologueStage',key:'practice',count:1})"),0);
 assert.match(r.json("exportableBalance().story.quests.find(q=>q.id==='prologue').stages[0].dialogue.map(l=>l.text).join('')"),/艾斯蘭/);
 assert.deepEqual(r.errors,[]);
});
