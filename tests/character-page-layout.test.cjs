'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

// v0.168: the second class was removed, so the character page shows only 人物能力 (no class advancement panel or button).
test('character page: 人物能力 without its old note; no second-class panel, button or text',()=>{
 const r=loadRuntime(root);
 const html=r.run(`selectSaveSlot(1);start(3);closeModal();clearInterval(timer);running=false;setTab('character');render();characterView()`);
 assert.match(html,/<h2>人物能力<\/h2>/);
 assert.doesNotMatch(html,/自然成長與裝備能力|不再使用自由能力配點/);
 assert.doesNotMatch(html,/二轉|職業進階|advance\(\)/);
 assert.equal(r.run('typeof advance'),'undefined');
 assert.deepEqual(r.errors,[]);
});
