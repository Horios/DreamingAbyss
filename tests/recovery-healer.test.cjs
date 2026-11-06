// v0.093: during post-battle recovery a hero with 戰鬥外治療 acts only to cast a ready heal/regen skill. Before, its basic
// attack was offered and refused every interval ("blocked"), which made the card flicker and logged a bogus fear message.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function priest(){const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run(`selectSaveSlot(1);start(3);closeModal();clearInterval(timer);const h=playerHero();h.lv=17;syncParty();
  state.acquiredSkillIds=[...(state.acquiredSkillIds||[]),'job3-support0'];const b=__EMBERWILD_TEAMS.build().permanent;b.unlocks??={};b.unlocks['3:support:0']=true;__EMBERWILD_SKILLS.refreshAll();
  globalThis.configured=configureSkill('support',0,'job3-support0');h.recoveryHealing=true;startSelectedExploration();globalThis.EV=[];`);
 assert.equal(r.run('configured'),true);
 for(let i=0;i<200&&r.run("EmberwildSecondsCombat.phase")!=='recovery';i++){r.advance(250);r.run('tick()');}
 assert.equal(r.run("EmberwildSecondsCombat.phase"),'recovery');
 r.run(`{const T=EmberwildSecondsCombat.timeline,base=T.handlers.onEvent;T.handlers.onEvent=function(e){const out=base.call(this,e);if(!foes.some(f=>f.hp>0))EV.push(e.type+':'+(e.skillId||''));return out;};}`);
 return r;}
test('no blocked actions or fear messages while the healer waits during recovery; the regen keeps healing',()=>{
 const r=priest(),log0=r.run('logs.length');for(let i=0;i<80;i++){r.advance(250);r.run('tick()');}
 const ev=JSON.parse(r.run('JSON.stringify(EV)'));
 assert.equal(ev.filter(e=>e.startsWith('blocked')).length,0,JSON.stringify(ev));
 assert(!JSON.parse(r.run('JSON.stringify(logs.slice(0,logs.length-'+log0+').map(e=>e.text||e))')).some(t=>/因畏懼延後行動/.test(t)),'no bogus fear message');
 assert(ev.some(e=>e.startsWith('statusTick')),'the regen still ticks during recovery');assert.deepEqual(r.errors,[]);
});
test('a ready regen skill is cast during recovery when the party is below the recovery target',()=>{
 const r=priest();r.run(`{const a=EmberwildSecondsCombat.timeline.actors.find(a=>a.definition.id===heroKey(playerHero()));a.ready['job3-support0']=0;playerHero().hp=Math.min(playerHero().hp,stats(playerHero()).hp*.5);}`);
 for(let i=0;i<20;i++){r.advance(250);r.run('tick()');}
 const ev=JSON.parse(r.run('JSON.stringify(EV)'));assert(ev.some(e=>e==='skill:job3-support0'),JSON.stringify(ev));
 assert.equal(ev.filter(e=>e.startsWith('blocked')).length,0);assert.deepEqual(r.errors,[]);
});
// v0.094: the per-second recovery regeneration runs inside EmberwildBattleEffects.quiet, so it plays no healing effect.
test('recovery regeneration updates HP inside EmberwildBattleEffects.quiet',()=>{
 const r=priest();r.run(`globalThis.QUIET=0;{const fx=EmberwildBattleEffects,base=fx.quiet;fx.quiet=function(fn){QUIET++;return base.call(this,fn);};}
  playerHero().hp=stats(playerHero()).hp*.5;globalThis.HP0=playerHero().hp;`);
 for(let i=0;i<8;i++){r.advance(250);r.run('tick()');}
 assert(r.run('playerHero().hp>HP0'),'HP regenerates during recovery');
 assert(r.run('QUIET')>0,'the regeneration ran inside quiet()');assert.deepEqual(r.errors,[]);
});
