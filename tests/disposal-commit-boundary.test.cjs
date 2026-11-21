'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function runtime({saveFails=false,renderFails=false}={}){
 const hero={bag:[{id:'gear'}],gold:0,ore:0,dust:0,gems:[],materials:{},potions:0,consumables:{},equipped:['gear'],hp:10,board:{}};
 const build={},inv={};let persisted;
 const ctx={state:hero,party:{members:[hero],selected:0},equipment:()=>[],inlineAffixDrafts:new Map(),affixDraftKey:g=>g.id,
  __EMBERWILD_TEAMS:{capture(){},build:()=>build,player:()=>hero,busy:()=>false},
  EmberwildTeams:{copy:structuredClone,references:()=>[],clearReferences(){}},
  ensureBoard(){},findGear:id=>hero.bag.find(g=>g.id===id),equipmentSellPrice:()=>10,healingInventory:()=>inv,
  partyMember:()=>hero,stats:()=>({hp:10}),toast(){},confirm:()=>true,pruneGearSelections(){},
  save(){if(saveFails)return false;persisted=structuredClone(hero);return true;},render(){if(renderFails)throw Error('render failed');}};
 const source=fs.readFileSync(path.join(__dirname,'../js/equipment/team-references.js'),'utf8');
 // Load the disposal transaction and its helpers, before unrelated UI wrappers.
 vm.createContext(ctx);vm.runInContext(source.slice(0,source.indexOf('  salvage=id=>'))+'})();',ctx);
 return {ctx,hero,get persisted(){return persisted;}};
}
test('failed persistence restores the sold item and its proceeds',()=>{
 const r=runtime({saveFails:true});assert.equal(r.ctx.__EMBERWILD_DISPOSE_GEAR(['gear'],'sell'),false);
 assert.equal(r.hero.bag.length,1);assert.equal(r.hero.gold,0);assert.equal(r.hero.equipped[0],'gear');
});
test('a post-save render failure cannot resurrect a sold item in memory',()=>{
 const r=runtime({renderFails:true});assert.throws(()=>r.ctx.__EMBERWILD_DISPOSE_GEAR(['gear'],'sell'),/render failed/);
 assert.equal(r.persisted.bag.length,0);assert.equal(r.hero.bag.length,0);assert.equal(r.hero.gold,r.persisted.gold);
 assert.equal(r.hero.equipped[0],null);
});
