const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
function library(){const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'js/ui/skill-icon-library.js'),'utf8'),ctx);return ctx.__EMBERWILD_SKILL_ICONS;}
test('curves and layer erasures normalize, remain bounded and render safely',()=>{
  const a=library(),curve=a.normalizeLayer({kind:'curve',x:0,y:0,cx:Infinity,cy:-99});assert.equal(curve.cx,0);assert.equal(curve.cy,-48);assert(a.layerMarkup(curve).includes(' Q '));
  const layer=a.normalizeLayer({kind:'rect',filled:true,eraseStrokes:[{width:3,points:[[0,0],[2,2]]}]});const svg=a.layerMarkup(layer);
  assert(svg.includes('<mask'));assert(svg.includes('stroke="black"'));assert(svg.includes('mask="url(#ew-erase-'));
  assert.deepEqual(JSON.parse(JSON.stringify(a.normalizeLayer(layer))),JSON.parse(JSON.stringify(layer)));
  for(const strokes of [[{width:3,points:[[NaN,0]]}],[{width:0,points:[[0,0]]}],[{width:3,points:[[0,0,'bad']]}],Array(33).fill({width:3,points:[[0,0]]}),[{width:3,points:Array(129).fill([0,0])}]]){
    assert.equal(a.validEditing({eraseStrokes:strokes}),false);assert(!a.layerMarkup({...layer,eraseStrokes:strokes}).includes('<mask'));
  }
  assert(a.layerMarkup(a.normalizeLayer({kind:'icon',icon:'fire',filled:true,fillTone:'ember'})).includes('fill="#'));
  assert(!a.layerMarkup({...layer,eraseStrokes:[{width:3,points:[['<script>',0]]}]}).includes('<script>'));
});
test('effective game import/export preserves editable geometry and rejects malformed editing data',()=>{
  const g=require('./headless-runtime.cjs').loadRuntime(root);const actual=g.run(`(()=>{const d=exportableBalance(),I=__EMBERWILD_SKILL_ICONS;d.skillIcons=[{id:'canvas',name:'畫布',layers:[I.normalizeLayer({kind:'curve',eraseStrokes:[{width:2,points:[[0,0]]}]}),I.normalizeLayer({kind:'icon',icon:'fire',filled:true,fillTone:'ember'})]},...d.skillIcons.filter(x=>x)];applyBalanceConfig(JSON.parse(JSON.stringify(d)));return JSON.stringify(exportableBalance().skillIcons);})()`);
  const icons=JSON.parse(actual);assert.equal(icons[0].layers[0].kind,'curve');assert.equal(icons[0].layers[0].eraseStrokes[0].points[0][0],0);assert.equal(icons[0].layers[1].filled,true);
  g.ctx.bad=icons;g.run('bad[0].layers[0].eraseStrokes[0].points[0][0]=999;');assert.throws(()=>g.run('const d=exportableBalance();d.skillIcons=bad;applyBalanceConfig(d);'),/圖示圖層/);
});
