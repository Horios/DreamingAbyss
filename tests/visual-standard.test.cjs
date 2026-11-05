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
