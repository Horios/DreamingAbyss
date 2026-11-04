// A passive removed by a later balance update must not make old saves unloadable; malformed entries are still rejected.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('saves with passiveEnabled entries for removed passives still load and save',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();recruitCompanion(10);closeModal();playerHero().lv=8;syncParty();');
 // passiveEnabled is stored on the member and on each team plan.
 r.run('globalThis.setPE=(s,fn)=>{for(const o of [s.members[0],...(s.buildSystem?.plans||[])])o.passiveEnabled=fn(o.passiveEnabled||{});return s;};globalThis.saved=setPE(structuredClone(packParty()),pe=>({...pe,"removed-passive":true}));');
 assert.doesNotThrow(()=>r.run('loadParty(structuredClone(saved))'));
 // The leftover entry has no definition, so it has no effect; saving and loading again keeps working.
 assert.doesNotThrow(()=>r.run('save();loadParty(structuredClone(packParty()))'));
 r.run('globalThis.bad=setPE(structuredClone(saved),()=>({"removed-passive":"yes"}));');
 assert.throws(()=>r.run('loadParty(structuredClone(bad))'),/被動(技能)?啟用(資料|設定)無效/,'non-boolean values are still rejected');
 r.run('globalThis.wrong=setPE(structuredClone(saved),()=>({"job0-core0":true}));');
 assert.throws(()=>r.run('loadParty(structuredClone(wrong))'),/被動(技能)?啟用(資料|設定)無效/,'an id of a non-passive skill is still rejected');
 assert.deepEqual(r.errors,[]);
});
