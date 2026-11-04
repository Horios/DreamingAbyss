// Out-of-combat healing (戰鬥外使用治療技能回血): during recovery a hero with the option on casts equipped heal skills.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),{performance}=require('node:perf_hooks');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function recovery(on){
 const r=loadRuntime(root);r.ctx.performance.now=performance.now.bind(performance);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(3);closeModal();state.lv=10;syncParty();configureSkill('active',1,'class3-initial1');startSelectedExploration();setHeroRecoveryHealing(memberKey(state),${on});state.autoPotion=false;`);
 const drive=ms=>{for(let i=0;i<ms;i+=50){r.advance(50);r.run('tick()');}};
 for(let i=0;i<200&&r.run('EmberwildSecondsCombat.phase')!=='recovery';i++){r.run('for(const e of foes)e.hp=Math.min(e.hp,1);');drive(500);}
 assert.equal(r.run('EmberwildSecondsCombat.phase'),'recovery');
 r.run('state.hp=Math.round(stats(state).hp*.3);globalThis.mp0=EmberwildSecondsCombat.timeline.actor(heroKey(state)).mp;logs=[];');drive(2000);
 return {r,gain:r.run('state.hp')-r.run('Math.round(stats(state).hp*.3)'),healed:r.run('logs.some(l=>/治療 → .*恢復/.test(String(l.text||l.message||l)))'),spent:r.run('mp0-EmberwildSecondsCombat.timeline.actor(heroKey(state)).mp')};
}
test('with the option on, recovery casts equipped heal skills, spending MP; with it off it relies on natural recovery only',()=>{
 const on=recovery(true),off=recovery(false);
 assert.equal(on.healed,true,'the heal skill is cast between encounters');assert.equal(off.healed,false);
 assert(on.gain>off.gain,JSON.stringify({on:on.gain,off:off.gain}));assert(on.spent>0,'healing spends MP');
 assert.deepEqual(on.r.errors,[]);assert.deepEqual(off.r.errors,[]);
});
test('the option persists through save and reload and appears in the potion settings',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(3);closeModal();setHeroRecoveryHealing(memberKey(playerHero()),true);globalThis.saved=JSON.parse(JSON.stringify(packParty()));loadParty(saved);');
 assert.equal(r.run('playerHero().recoveryHealing'),true);
 r.run('openHealingSettings()');assert.match(r.elements.get('modal').innerHTML,/戰鬥外使用治療技能回血/);assert.deepEqual(r.errors,[]);
});
