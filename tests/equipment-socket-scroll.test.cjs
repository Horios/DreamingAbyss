const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

test('inventory detail and list retain independent positions when full renders replace the DOM',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/core/core-game.js'),'utf8');
 const code=source.slice(source.indexOf('const stablePartyRender=render;'),source.indexOf('// Elemental equipment, parallel regions and expedition supplies.'));
 let regions=[];
 const selectors=['.layout>main .inventory-list-scroll','.layout>main .inventory-detail-wrap'];
 const ctx={state:{job:0},party:null,tab:'equipment',document:{querySelectorAll(selector){
  if(selector==='.layout main details')return [];
  return regions.filter(el=>selector.split(',').some(s=>el.matches(s)));
 }},render(){regions=selectors.map(type=>({scrollTop:0,scrollLeft:0,matches:s=>s===type,tagName:'SECTION'}));}};
 vm.createContext(ctx);vm.runInContext(code,ctx);ctx.render();
 regions[0].scrollTop=90;regions[1].scrollTop=360;
 for(let n=0;n<5;n++){
  const before=regions;ctx.render();assert.notEqual(regions[1],before[1],'real redraw replaces the detail element');
  assert.equal(regions[0].scrollTop,90);assert.equal(regions[1].scrollTop,360);
 }
 ctx.tab='skills';ctx.render();ctx.tab='equipment';ctx.render();
 assert.equal(regions[0].scrollTop,90);assert.equal(regions[1].scrollTop,360);
});
