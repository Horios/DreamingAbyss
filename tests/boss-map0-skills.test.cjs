// v0.226: 古木守望者 (map0 boss) casts 召喚樹精 (two elite 迷路樹精 at 10 s, then every 60 s, never while its summons live)
// and 纏藤 (every 10 s one random hero's basic attack charge starts over).
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function fight(){
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run('selectSaveSlot(1);start(0);closeModal();clearInterval(timer);bossProgressEntry(0).charges=1;startBossChallenge()');
 r.ctx.step=()=>{r.advance(250);r.run('for(const h of heroes())h.hp=Math.max(h.hp,1e6);for(const f of foes){f.atk=1;if(f.kind==="boss")f.hp=Math.max(f.hp,1e6);}tick()');};
 return r;
}
const summons=r=>r.run('foes.filter(f=>f.hp>0&&f.summonedBy).length');
test('the boss carries both skills; 召喚樹精 at 10 s, not while its treants live, again 60 s later',()=>{
 const r=fight();assert.deepEqual(JSON.parse(r.run('JSON.stringify(GAMEPLAY_SETTINGS.monsters.catalog.find(m=>m.id==="map0_boss").skillAssignments.map(a=>a.skillId))')),['boss-summon-treants','boss-entangle']);
 const at=[];for(let i=0;i<400;i++){r.ctx.step();const n=summons(r);if(n&&!at.length)at.push(i*.25+.25);if(i===159)r.run('for(const f of foes)if(f.summonedBy)f.hp=0');if(i>159&&n&&at.length===1)at.push(i*.25+.25);}
 assert(at[0]>=10&&at[0]<=10.5,'first summon at 10 s: '+at[0]);
 assert(at[1]>=70&&at[1]<=70.5,'next summon once the 60 s cooldown is over: '+at[1]);
 const rows=JSON.parse(r.run('JSON.stringify(foes.filter(f=>f.summonedBy).map(f=>[f.name,f.kind,f.monsterId,f.rewarded]))'));
 assert.deepEqual(rows,[['菁英・迷路樹精','elite','map0_mob2',true],['菁英・迷路樹精','elite','map0_mob2',true]],'two elite treants, no rewards; the fallen pair left the field');
 assert.deepEqual(r.errors,[]);
});
test('纏藤 every 10 s restarts one hero basic attack charge',()=>{
 const r=fight();const charges=[];
 for(let i=0;i<40;i++){r.ctx.step();}
 r.run(`{const T=EmberwildSecondsCombat.timeline,base=T.handlers.onEvent;globalThis.after=[];T.handlers.onEvent=function(e){const out=base.call(this,e);if(e.type==='skill'&&e.skillId==='boss-entangle')after.push(T.actor(heroKey(playerHero())).basicReadyInSeconds);return out;};}`);
 for(let i=0;i<80;i++)r.ctx.step();
 const after=JSON.parse(r.run('JSON.stringify(after)')),interval=r.run('EmberwildSecondsCombat.timeline.interval(EmberwildSecondsCombat.timeline.find(heroKey(playerHero())))/1e6');
 assert.equal(after.length,2,'two casts in 20 s');for(const s of after)assert(Math.abs(s-interval)<1e-6,'basic charge restarted: '+s+' / '+interval);
 assert.deepEqual(r.errors,[]);
});
