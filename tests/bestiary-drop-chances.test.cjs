'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function view({factor=.7,normal=.05,difficulty=0}={}){
 const ctx={party:{map:0,difficulty},MAPS:[{name:'森林',max:5}],MODES:[{name:'普通'},{name:'困難'}],GEMS:[],ITEM_FORMS:[],
  GAMEPLAY_SETTINGS:{rewards:{ore:{chanceFactor:factor,normalChanceByDifficulty:[normal,normal]}}},
  monsterCatalog:()=>[{id:'slime',name:'史萊姆',mapIndex:0,kind:'normal'},{id:'boss',name:'首領',mapIndex:0,kind:'boss'}],
  configuredDropRules:()=>[{type:'material',name:'限定素材',chanceByDifficulty:[0,.2]},{type:'material',name:'稀有素材',chanceByDifficulty:[.001,.001]}],
  effectiveDropChance:(r,e)=>r.chanceByDifficulty[e.difficulty],esc:String,heading:()=>'',render(){}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/ui/bestiary.js'),'utf8'),ctx);return ctx.bestiaryView();
}
test('bestiary excludes zero-chance drops at the selected difficulty',()=>{
 assert.doesNotMatch(view(),/限定素材/);assert.match(view({difficulty:1}),/限定素材/);assert.match(view(),/稀有素材/);
});
test('dust uses the normal base chance times factor; bosses also list their dust',()=>{
 const html=view(),normal=html.split('<article')[1],boss=html.split('<article')[2];
 assert.match(normal,/<b>少見<\/b>粉塵/);assert.match(boss,/<b>常見<\/b>粉塵/);
 assert.doesNotMatch(view({factor:0}),/粉塵/);
 assert.match(view({normal:.01}).split('<article')[1],/<b>稀有<\/b>粉塵/);
});
