// v0.089: during post-battle recovery the battle clock and HP advance at least once per second instead of jumping
// to the end of the wait; recovery still ends at the same time.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('recovery shows HP regeneration and clock progress every second',()=>{
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);
 r.run('selectSaveSlot(1);start(3);closeModal();clearInterval(timer);playerHero().lv=30;syncParty();startSelectedExploration();');
 const read=()=>JSON.parse(r.run('JSON.stringify({clock:partyClock,phase:EmberwildSecondsCombat.phase,hp:playerHero().hp,max:stats(playerHero()).hp})'));
 let s=read();for(let i=0;i<200&&s.phase!=='recovery';i++){r.advance(250);r.run('tick()');s=read();}
 assert.equal(s.phase,'recovery','a recovery phase starts after the first victory');assert(s.hp<s.max,'the hero needs healing');
 const samples=[];for(let n=0;n<8;n++){for(let i=0;i<8;i++){r.advance(250);r.run('tick()');}samples.push(read());}
 const during=samples.filter(x=>x.phase==='recovery');assert(during.length>=4,'recovery lasts several seconds in this setup');
 for(let i=1;i<during.length;i++){assert(during[i].clock>during[i-1].clock,'the clock advances during recovery');assert(during[i].hp>during[i-1].hp,'HP rises during recovery');}
 assert.deepEqual(r.errors,[]);
});
