'use strict';
/* v0.172 skill extraction and the forest gear skills. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
const json=(r,code)=>JSON.parse(r.run('JSON.stringify('+code+')'));
const KEY='emberwild-save-v1';
// Gives the player one of the exclusive items by its form id and returns its uid.
const setup=`globalThis.makeExclusive=formId=>{const doc=exportableBalance();let pos=null;doc.equipmentForms.forEach((jl,j)=>jl.forEach((sl,s)=>sl.forEach((f,i)=>{if(f.id===formId)pos={j,s,i};})));
 const g=gear(1,pos.s,0,pos.j);Object.assign(g,{formJob:pos.j,slot:pos.s,form:pos.i,job:0,skillId:doc.skillSystem.equipment.formRules.find(x=>x.formId===formId).skillId});addGear(g);return g.id;};
 globalThis.makeTokenItem=()=>{const t=createCompanionToken(exportableBalance().companionTokens.catalog[0].id);addGear(t);return t.id;};`;
function game(answers=[]){
 const r=loadRuntime(root);r.ctx.setTimeout=fn=>setImmediate(fn);r.prompts=[];
 r.ctx.confirm=m=>{r.prompts.push(m);return answers.length?answers.shift():true;};
 r.run(`selectSaveSlot(1);start(0);closeModal();globalThis.companionUnlocked=()=>true;recruitCompanion(10);closeModal();${setup}`);
 return r;
}

test('extraction warns that the gear disappears, moves the skill onto the token with a prefix and keeps nothing else',()=>{
 const r=game();
 const out=json(r,`(()=>{const g=makeExclusive('vine-staff'),t=makeTokenItem(),gold=state.gold,ore=state.ore;const ok=extractSkillToToken(g,t);const tok=findGear(t);
  return {ok,gone:!findGear(g),skill:tok.extractedSkillId,prefix:tok.extractedPrefix,name:equipmentDisplayName(tok),gold:state.gold-gold,ore:state.ore-ore};})()`);
 assert.deepEqual(out,{ok:true,gone:true,skill:'living-core-renewal',prefix:'纏藤',name:out.name,gold:0,ore:0});
 assert.match(out.name,/纏藤 /,'the token name carries the prefix');
 assert.equal(r.prompts.length,1);assert.match(r.prompts[0],/纏藤法杖」會消失/);
 assert.deepEqual(r.errors,[]);
});

test('cancelling either confirmation changes nothing; a second extraction asks before replacing and replaces',()=>{
 const r=game([false]);
 const first=json(r,`(()=>{globalThis.g1=makeExclusive('vine-staff');globalThis.t=makeTokenItem();return {ok:extractSkillToToken(g1,t),kept:!!findGear(g1),skill:findGear(t).extractedSkillId??null};})()`);
 assert.deepEqual(first,{ok:false,kept:true,skill:null});
 r.run('extractSkillToToken(g1,t)');
 r.prompts.length=0;r.ctx.confirm=m=>{r.prompts.push(m);return !/覆蓋/.test(m);};
 const cancelled=json(r,`(()=>{globalThis.g2=makeExclusive('gel-charm');return {ok:extractSkillToToken(g2,t),kept:!!findGear(g2),skill:findGear(t).extractedSkillId};})()`);
 assert.deepEqual(cancelled,{ok:false,kept:true,skill:'living-core-renewal'});
 assert.match(r.prompts[1],/已有技能「藤蔓纏繞」，萃取後會被「凝膠復原」覆蓋/);
 r.ctx.confirm=()=>true;
 const replaced=json(r,`(()=>({ok:extractSkillToToken(g2,t),gone:!findGear(g2),skill:findGear(t).extractedSkillId,prefix:findGear(t).extractedPrefix}))()`);
 assert.deepEqual(replaced,{ok:true,gone:true,skill:'gel-recovery',prefix:'凝膠'});
});

test('a failed save rolls the extraction back: the gear stays and the token keeps its old skill',()=>{
 const r=game();
 const out=json(r,`(()=>{const g=makeExclusive('wolf-fang-pendant'),t=makeTokenItem();const real=save;save=()=>false;const ok=extractSkillToToken(g,t);save=real;
  return {ok,kept:!!findGear(g),skill:findGear(t).extractedSkillId??null};})()`);
 assert.deepEqual(out,{ok:false,kept:true,skill:null});
});

test('a companion wearing the token uses the skill whatever its class, with the skill own cooldown and MP; the save keeps it',()=>{
 const r=game();
 const out=json(r,`(()=>{const c=partyMember(10),g=makeExclusive('vine-staff'),t=makeTokenItem();extractSkillToToken(g,t);equipCompanionToken(t,10);
  const sk=__EMBERWILD_SKILLS.byId('living-core-renewal');return {job:c.job,learned:__EMBERWILD_SKILLS.learned(c,sk),cooldown:sk.timing.cooldownSeconds,mp:sk.timing.mpCost,first:sk.timing.initialCooldownSeconds};})()`);
 assert.equal(out.learned,true);assert.deepEqual([out.cooldown,out.mp,out.first],[10,10,1]);
 r.run(`party.active=[memberKey(playerHero()),10];syncParty();globalThis.casts=[];const base=castPartySkill;castPartySkill=function(h,i,...a){const ok=base(h,i,...a);if(ok!==false&&h.companionId===10)casts.push(__EMBERWILD_SKILLS.byPosition(h.job,'core',i).id);return ok;};startSelectedExploration();for(const e of foes){e.hp=e.maxhp=100000;e.atk=0;}`);
 for(let i=0;i<80;i++){r.advance(50);r.run('tick()');}
 assert(json(r,'casts').includes('living-core-renewal'),'the companion casts 藤蔓纏繞');
 r.run('save()');const again=loadRuntime(root,'index.html',{[KEY]:r.values.get(KEY)});
 assert.equal(again.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
 assert.deepEqual(json(again,'(()=>{const c=partyMember(10);return [__EMBERWILD_TOKEN_SKILL(c),equipmentDisplayName(EmberwildTokens.isToken(findGear(c.tokenId))?findGear(c.tokenId):null)];})()')[0],'living-core-renewal');
 assert.deepEqual(r.errors,[]);assert.deepEqual(again.errors,[]);
});

test('凝膠復原 on a token heals its companion 1 HP per second without a healing effect',()=>{
 const r=game();
 r.run(`const g=makeExclusive('gel-charm'),t=makeTokenItem();extractSkillToToken(g,t);equipCompanionToken(t,10);party.active=[memberKey(playerHero()),10];syncParty();globalThis.fxCalls=0;const fx=EmberwildBattleEffects;if(fx?.heal){const h=fx.heal;fx.heal=function(...a){fxCalls++;return h.apply(this,a);};}`);
 const before=json(r,'(()=>{const c=partyMember(10);c.hp=1;return c.hp;})()');
 r.run('__EMBERWILD_GEAR_REGEN(3)');
 assert.equal(json(r,'partyMember(10).hp'),before+3);
 assert.equal(json(r,'fxCalls'),0);
});

test('two items with the same skill: the skill is slotted once and stays until the last item is removed',()=>{
 const r=game();
 const out=json(r,`(()=>{const a=makeExclusive('wolf-fang-pendant'),b=makeExclusive('wolf-fang-pendant');equipSharedGear(a,memberKey(state),3);equipSharedGear(b,memberKey(state),4);
  const first=configureSkill('active',1,'wolf-double-bite'),second=configureSkill('active',2,'wolf-double-bite');
  const slots=state.skillLoadout.active.filter(id=>id==='wolf-double-bite').length;unequipSharedGear?.(a);const kept=__EMBERWILD_SKILLS.learned(state,__EMBERWILD_SKILLS.byId('wolf-double-bite'));
  return {first,second,slots,kept};})()`);
 assert.equal(out.first,true);assert.equal(out.slots,1,'the same skill occupies one slot only');assert.equal(out.kept,true);
});

test('an old 凝膠護甲 carrying the retired 凝膠緩衝 now carries 凝膠復原 after loading',()=>{
 const r=game();
 r.run(`const g=gear(1,1,0,4);Object.assign(g,{formJob:4,slot:1,form:0,job:0,skillId:'gel-guard'});addGear(g);globalThis.oldGel=g.id;save();`);
 const again=loadRuntime(root,'index.html',{[KEY]:r.values.get(KEY)});
 assert.equal(again.ctx.__EMBERWILD_BOOT_SAVE_ERROR,null);
 assert.equal(json(again,`findGear(${JSON.stringify(json(r,'oldGel'))}).skillId`),'gel-recovery');
 assert.deepEqual(again.errors,[]);
});
