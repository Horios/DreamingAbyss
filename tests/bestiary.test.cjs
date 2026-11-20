'use strict';
/* v0.185: 怪物圖鑑 page under 探索. Each region lists its monsters with their battle artwork and a short drop list grouped
   as 常見／少見／稀有 at the current difficulty; the exploration page no longer has a 地區圖鑑 button. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);');return r;}
test('the 探索 category has a 怪物圖鑑 page listing the region monsters with artwork and grouped drops',()=>{
 const r=game();
 assert.match(r.run('gameSubtabsHTML("battle")'),/怪物圖鑑/,'the 探索 tabs include 怪物圖鑑');
 r.run("setTab('bestiary')");assert.equal(r.run('tab'),'bestiary');
 const html=r.run('bestiaryView()');
 assert.match(html,/怪物圖鑑/);assert.match(html,/苔原史萊姆/);assert.match(html,/古木守望者/);assert.match(html,/<span class="tag">BOSS<\/span>/);
 assert.match(html,/<b>常見<\/b>黏稠凝膠/);assert.match(html,/古木之心護腕/,'the BOSS lists its new skill gear');assert.match(html,/<svg/,'monster artwork');
 // Each item appears once per monster.
 const slime=html.split('<article')[1];for(const item of ['黏稠凝膠','技能寶石'])assert.equal(slime.split(item).length-1,1,item);
 assert.deepEqual(r.errors,[]);
});
test('the old 地區圖鑑 entry opens the page on the current region; the exploration page has no bestiary button',()=>{
 const r=game();r.run('setTab("battle")');assert.doesNotMatch(r.run('battleView()'),/地區圖鑑<\/button>/);
 r.run('showRegionBestiary()');assert.equal(r.run('tab'),'bestiary');
 assert.equal(r.run('setBestiaryRegion(999)'),false);assert.deepEqual(r.errors,[]);
});
