'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');

test('character page: 人物能力 without its old note; 二轉 panel holds mastery rule and 怨念碎片 regions; no separate mastery panel',()=>{
 const r=loadRuntime(root);
 const html=r.run(`selectSaveSlot(1);start(3);closeModal();clearInterval(timer);running=false;playerHero().lv=9;syncParty();setTab('character');render();characterView()`);
 assert.match(html,/<h2>人物能力<\/h2>/);
 assert.doesNotMatch(html,/自然成長與裝備能力|不再使用自由能力配點/);
 assert.doesNotMatch(html,/二轉精通條件/);
 const advance=html.match(/<section class="panel"><div class="icon"><\/div><h2>LV\d+ · [^<]+<\/h2>[\s\S]*?<\/section>/)?.[0];
 assert(advance,'二轉 panel present');
 assert.match(advance,/另需本職任一主要精通達 Lv\d+（目前最高 Lv\d+）/);
 assert.match(advance,/怨念碎片取得地區：暮色沼澤（LV11～15・沼地亡魂）/);
 assert(advance.indexOf('advance-material-hint')<advance.indexOf('完成二轉'),'hints sit above the button');
});

test('material hint follows the balance-driven monster catalog',()=>{
 const r=loadRuntime(root);
 const hint=r.run(`selectSaveSlot(1);start(0);closeModal();const cat=monsterCatalog();const original=cat.find(m=>m.material==='怨念碎片');const moved=cat.find(m=>m.mapIndex===1&&m.kind==='normal');moved.material='怨念碎片';original.material='x';playerHero().lv=9;syncParty();setTab('character');characterView()`);
 assert.match(hint,/怨念碎片取得地區：風蝕礦坑/);
 assert.doesNotMatch(hint,/暮色沼澤/);
});
