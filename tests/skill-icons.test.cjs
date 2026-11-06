const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),editor=process.env.EMBERWILD_BALANCE_ROOT||path.resolve(root,'../Emberwild-Balance');
const {loadRuntime}=require('./headless-runtime.cjs');
function icons(){const c=vm.createContext({});for(const f of ['lucide-catalog.js','skill-icon-library.js'])vm.runInContext(fs.readFileSync(path.join(root,'js/ui',f),'utf8'),c);return c;}
test('local Lucide catalog contains 1869 original names, safe SVG nodes and useful categories',()=>{
  const c=icons(),lib=c.__EMBERWILD_SKILL_ICONS,cat=c.__EMBERWILD_LUCIDE;assert.equal(cat.version,'1.53.0');assert.equal(cat.names.length,1869);
  for(const name of ['flame','zap','shield','swords','heart','skull','sparkles','gem','target','book-open'])assert(lib.hasIcon('lucide:'+name),name);
  for(const name of cat.names){const svg=lib.svgFor('lucide:'+name);assert(svg.includes('scale(2)'));assert(!/<(?:script|foreignObject|image|use)\b|on\w+=|href=/i.test(svg),name);}
  assert(cat.categories.combat.includes('swords'));assert(cat.categories.defense.includes('shield'));assert(cat.categories.magic.includes('flame'));assert(cat.categories.healing.includes('heart'));assert(cat.categories.equipment.includes('gem'));
});
test('all original icons and every legacy shape keep byte-identical SVG output',()=>{
  const a=icons().__EMBERWILD_SKILL_ICONS,layers=['icon','line','rect','ellipse','arc','polygon'].map(kind=>a.normalizeLayer({kind,icon:'sword',tone:'ember',filled:true}));
  const output=a.keys.map(k=>a.svgFor(k)).concat(a.svgFor('custom:legacy',[{id:'legacy',name:'Legacy',layers}])).join('\n');
  assert.equal(crypto.createHash('sha256').update(output).digest('hex'),'57aed764b7d7d16e55c2c01f49a7eb772f32bb8cfdc10ae29c1dac3ff47a1b33');
});
test('unknown names, unsafe appearance values and raw markup never become executable SVG/HTML',()=>{
  const a=icons().__EMBERWILD_SKILL_ICONS;
  assert(a.svgFor('lucide:unknown-icon').includes(a.paths.magic));assert(a.svgFor('custom:missing',null).includes(a.paths.magic));
  const icon={id:'safe',layers:[{kind:'icon',icon:'lucide:flame',x:0,y:0,scale:1}],appearance:{color:'red;animation:url(https://evil)',size:Infinity,opacity:-4,rotation:NaN,effect:'"><script>1</script>',effectDuration:NaN,glowColor:'url(javascript:1)',glowStrength:Infinity}};
  const svg=a.svgFor('custom:safe',[icon]);assert(!/evil|javascript|<script>|NaN|Infinity/.test(svg));assert(a.validAppearance(a.normalizeAppearance(icon.appearance)));assert(!a.validAppearance(icon.appearance));
  const blank=a.svgFor('custom:blank',[{id:'blank',layers:[{kind:'icon',icon:'none',x:0,y:0,scale:1}]}]);assert(!/<(?:path|circle|rect)\b/.test(blank));
  for(const malicious of ['lucide:flame" onclick="alert(1)','<svg onload=alert(1)>','__proto__'])assert(!a.svgFor(malicious).includes('alert(1)'));
});
test('standalone designer embeds the exact deployed catalog, renderer and shared CSS; old text CSS is still shared',()=>{
  const html=fs.readFileSync(path.join(editor,'balance-editor.html'),'utf8');
  for(const [tag,id,file] of [['script','lucide-catalog-v1','js/ui/lucide-catalog.js'],['script','skill-icon-library-v1','js/ui/skill-icon-library.js'],['style','skill-icons-shared-style','css/skill-icons.css'],['style','text-rarity-shared-style','css/text-rarity.css']]){
    const embedded=html.split(`<${tag} id="${id}">\n`)[1].split(`\n</${tag}>`)[0],original=fs.readFileSync(path.join(root,file),'utf8');// Embedding drops only the file's final newline; everything else must match byte for byte.
    assert.equal(embedded.trimEnd(),original.trimEnd(),id);
  }
});
test('effective game validation/export/save-load preserve appearance and identifiers without changing balance or combat',()=>{
  const g=loadRuntime(root);g.run('selectSaveSlot(1);start(0);closeModal();applyBalanceConfig(exportableBalance());');
  const before=g.run('JSON.stringify(exportableBalance())');
  const out=g.run(`(()=>{const doc=exportableBalance();doc.skillIcons=[{id:'lucide-test',name:'火焰',layers:[{kind:'icon',icon:'lucide:flame',x:0,y:0,scale:1,rotation:0}],appearance:__EMBERWILD_SKILL_ICONS.normalizeAppearance({color:'#fa7312',size:42,strokeWidth:3.2,rotation:35,opacity:.7,glowColor:'#33bbff',glowStrength:6,effect:'float',effectDuration:2.4,effectTiming:'ease-in-out'})},...doc.skillIcons.filter(x=>x)];doc.classes[0].skills[0].iconType='custom:lucide-test';applyBalanceConfig(doc);save();return JSON.stringify({json:exportableBalance(),save:packParty()});})()`);
  const expected=JSON.parse(out),baseline=JSON.parse(before),newDoc=expected.json;assert.equal(newDoc.skillIcons[0].layers[0].icon,'lucide:flame');assert.equal(newDoc.skillIcons[0].appearance.glowStrength,6);
  const normalized=structuredClone(newDoc);normalized.skillIcons=baseline.skillIcons;normalized.classes[0].skills[0].iconType=baseline.classes[0].skills[0].iconType;assert.deepEqual(normalized,baseline);
  const reloaded=loadRuntime(root,'index.html',Object.fromEntries(g.values));assert.deepEqual(JSON.parse(reloaded.run('JSON.stringify(exportableBalance().skillIcons)')),newDoc.skillIcons);assert.deepEqual(reloaded.errors,[]);
  const old=structuredClone(baseline);delete old.skillIcons;for(const r of old.inventoryIcons||[])if(String(r.iconType).startsWith('custom:'))r.iconType='auto';g.ctx.old=old;g.run('applyBalanceConfig(old)');assert.deepEqual(JSON.parse(g.run('JSON.stringify(exportableBalance().skillIcons)')),[]);
  const unknown=structuredClone(newDoc);unknown.skillIcons[0].layers[0].icon='lucide:future-icon';g.ctx.unknown=unknown;assert.doesNotThrow(()=>g.run('applyBalanceConfig(unknown)'));
  const unsafe=structuredClone(newDoc);unsafe.skillIcons[0].appearance.glowColor='url(javascript:alert(1))';g.ctx.unsafe=unsafe;assert.throws(()=>g.run('applyBalanceConfig(unsafe)'),/圖示外觀/);
  assert.deepEqual(g.errors,[]);
});
