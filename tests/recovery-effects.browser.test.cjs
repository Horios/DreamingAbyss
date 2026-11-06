'use strict';
// v0.094: HP changes inside EmberwildBattleEffects.quiet (per-second recovery regeneration) play no effect; a regen tick
// shows its amount; a change made before quiet() still plays.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {openRuntime}=require('./runtime.cjs');const root=path.resolve(__dirname,'..');
test('quiet HP changes enqueue no effect and regen ticks carry a +HP label',async()=>{
 const g=await openRuntime(root,'index.html',{},{clockTime:new Date('2026-11-05T02:00:00Z')}),p=g.page;
 try{
  const out=await p.evaluate(()=>{selectSaveSlot(1);start(3);closeModal();clearInterval(timer);setTab('battle');render();
   const h=playerHero(),fx=EmberwildBattleEffects;h.hp=Math.floor(stats(h).hp/2);
   fx.begin();fx.quiet(()=>{h.hp+=2;});fx.end();const quiet=fx.pendingEvents;
   fx.begin();h.hp+=4;fx.quiet(()=>{h.hp+=2;});fx.end();const mixed=fx.pendingEvents;
   fx.begin();h.hp+=3;fx.end();const regen=fx.pendingEvents;return {quiet,regen,mixed};});
  assert.deepEqual(out.quiet.filter(e=>e.type==='regen'||e.type==='heal'),[]);
  const tick=out.regen.find(e=>e.type==='regen');assert(tick,JSON.stringify(out.regen));assert.equal(tick.label,'+3 HP');
  assert.equal(out.mixed.find(e=>e.type==='regen')?.label,'+4 HP',JSON.stringify(out.mixed));
  assert.deepEqual(g.errors,[]);
 }finally{await g.browser.close();}
});
