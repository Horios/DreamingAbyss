// v0.078: the visual standard stylesheet is loaded last, and battle log rows carry their information kind.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('visual-standard.css is the last stylesheet and leaves the paper theme alone',()=>{
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),links=[...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m=>m[1]);
 assert.match(links.at(-1),/^css\/visual-standard\.css\?v=/);
 const css=fs.readFileSync(path.join(root,'css/visual-standard.css'),'utf8');
 for(const rule of css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(r=>r.trim()).filter(r=>r.includes('{')&&!r.startsWith('@')))assert.match(rule.split('{')[0],/:root:not\(\[data-ui-theme="paper"\]\)/,'scoped away from paper: '+rule.slice(0,80));
});
test('battle log rows are marked with their type and system rows with encounter, skill or kill',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);');
 r.run("logs.length=0;logs.push({text:'遭遇 1 隻敵人。',type:'system'},{text:'戰士・嘲諷・使敵人優先攻擊自己。',type:'system'},{text:'擊敗 苔原史萊姆（普通）· 2 金幣',type:'system'},{text:'本次遭遇勝利',type:'system'},{text:'戰士 普攻 → 野狼 14 傷害',type:'playerDamage'},{text:'戰士 獲得 9 EXP',type:'exp'});");
 const html=r.run('battleLogRowsHTML()');
 assert.match(html,/battle-log-line log-kind-encounter" data-event-type="system">遭遇/);
 assert.match(html,/battle-log-line log-kind-skill" data-event-type="system">戰士・嘲諷/);
 assert.match(html,/battle-log-line log-kind-kill" data-event-type="system">擊敗/);
 assert.match(html,/battle-log-line " data-event-type="system">本次遭遇勝利/);
 assert.match(html,/battle-log-line event-damage" data-event-type="playerDamage"/);assert.match(html,/battle-log-line event-loot" data-event-type="exp"/);
 assert.deepEqual(r.errors,[]);
});

// v0.079: battlefield, monster and class card colors come from the balance document and round-trip through export.
test('display colors are read on apply, exported only when set, validated, and drawn on the battlefield',()=>{
 const seed=JSON.parse(JSON.stringify(require('../data/balance.json')));
 seed.balanceSettings.maps.catalog[0].battlefieldColor='#123456';seed.balanceSettings.monsters.catalog.filter(m=>m.mapIndex===0).forEach(m=>m.cardColor='#654321');seed.classes[0].cardColor='#ABCDEF';
 const r=loadRuntime(root);r.ctx.seed=seed;r.run('applyBalanceConfig(seed,{persist:false})');
 const out=JSON.parse(r.run('JSON.stringify(exportableBalance())'));
 assert.equal(out.balanceSettings.maps.catalog[0].battlefieldColor,'#123456');assert.equal(out.balanceSettings.maps.catalog[1].battlefieldColor,undefined,'unset colors are not exported');
 assert.equal(out.classes[0].cardColor,'#abcdef');assert.equal(out.classes[1].cardColor,undefined);
 assert.equal(r.run('EmberwildVisualColors.battlefield(1)'),out.balanceSettings.maps.catalog[1].color.toLowerCase(),'default battlefield color is the map color');
 assert.equal(r.run('EmberwildVisualColors.cls(1)'),'#7d5fd0','default class color');
 r.run('selectSaveSlot(1);start(0);closeModal();startSelectedExploration();');for(let i=0;i<40;i++){r.advance(250);r.run('tick()');}
 const html=r.run("document.getElementById('app').innerHTML");
 assert.match(html,/class="squad-field seconds-battlefield" style="--vs-field:#123456"/);assert.match(html,/style="--vs-card:#abcdef"/,'the warrior card uses the class color');assert.match(html,/style="--vs-card:#654321"/,'map 0 monsters use their color');
 seed.classes[0].cardColor='red';assert.throws(()=>r.run('applyBalanceConfig(seed,{persist:false})'),/卡片顏色必須是 #RRGGBB/);
 assert.equal(JSON.parse(r.run('JSON.stringify(exportableBalance())')).classes[0].cardColor,'#abcdef','a rejected document keeps the previous colors');
 assert.deepEqual(r.errors,[]);
});

test('battlefield layout: centered side titles without 上方／下方, divider between sides, phase text and face switch under the allies',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();startSelectedExploration();');for(let i=0;i<20;i++){r.advance(250);r.run('tick()');}
 const app=r.run("document.getElementById('app').innerHTML"),html=app.slice(app.indexOf('<div class="squad-field seconds-battlefield"'));assert(html.length>0,'battlefield rendered');
 assert.doesNotMatch(html,/上方|下方|技能依配置順序/);
 assert.match(html,/<span class="seconds-side-title">敵方陣列<\/span>[\s\S]*<div class="seconds-divider" aria-hidden="true"><\/div><section class="seconds-side seconds-side-ally"[\s\S]*<span class="seconds-side-title">我方隊伍<\/span>/);
 assert.match(html,/<\/section><div class="seconds-field-foot"><p class="seconds-side-note" data-seconds-phase>[^<]+<\/p><div class="seconds-face-switch"/);
 assert.deepEqual(r.errors,[]);
});

test('v0.081: no 生效效果 panel on the battle page; status badges carry their details for the hover tooltip',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();startSelectedExploration();');for(let i=0;i<20;i++){r.advance(250);r.run('tick()');}
 const app=r.run("document.getElementById('app').innerHTML");assert.doesNotMatch(app,/battle-effects-bar|生效效果<\/b>/);assert.equal(r.run('battleBuffPanel()'),'');
 const src=require('node:fs').readFileSync(path.join(root,'js/ui/seconds-battle.js'),'utf8');
 assert.match(src,/data-state-tip data-tip-name="\$\{esc\(f\.name\)\}" data-tip-detail="\$\{esc\(f\.detail\|\|''\)\}"/);
 assert.deepEqual(r.errors,[]);
});
