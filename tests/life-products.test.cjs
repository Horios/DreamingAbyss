const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..'),editor=path.resolve(root,'../Emberwild-Balance');
const json=(r,c)=>JSON.parse(r.run('JSON.stringify('+c+')'));
function game(){const r=loadRuntime(root);r.run('selectSaveSlot(1);start(0);closeModal();');return r;}
function apply(r,edit){const d=json(r,'exportableBalance()');edit(d.lifeSkills,d);r.ctx.candidate=d;r.run('applyBalanceConfig(candidate,{persist:true});');return d;}
function advance(r,ms){r.advance(ms);r.run('tickLifeSkills();');}

test('custom gathering duration, probability boundaries, quantities and independent bonus drops use shared stock',()=>{
 const r=game();apply(r,l=>{l.gathering=[{id:'ore',name:'採礦',output:'新礦石',outputType:'material',quantity:3,periodMs:2000,chance:.25,bonusDrops:[{output:'副產物',outputType:'material',quantity:2,chance:1}]}];});
 r.run('Math.random=()=>.25;setTab("lifeSkills");startLifeGathering("ore");');advance(r,1999);assert.equal(r.run('materialCount("新礦石")'),0);assert.equal(r.elements.get('life-gather-progress').max,2000);
 advance(r,1);assert.equal(r.run('materialCount("新礦石")'),0);assert.equal(r.run('materialCount("副產物")'),2);
 r.run('Math.random=()=>.24999;');advance(r,6000);assert.equal(r.run('materialCount("新礦石")'),9);assert.equal(r.run('materialCount("副產物")'),8);
 r.run('stopLifeGathering();');apply(r,l=>{l.gathering[0].chance=0;l.gathering[0].bonusDrops=[];});r.run('Math.random=()=>0;startLifeGathering();');advance(r,2000);assert.equal(r.run('materialCount("新礦石")'),9);
 apply(r,l=>l.gathering[0].chance=1);r.run('Math.random=()=>.999999;startLifeGathering();');advance(r,2000);assert.equal(r.run('materialCount("新礦石")'),12);assert.match(r.run('lifeSkillsView()'),/新礦石/);assert.deepEqual(r.errors,[]);
});

test('five-input alchemy charges exact amounts on completion, consumes on failure, and can output any existing item',()=>{
 const r=game();const d=apply(r,(l,d)=>{l.recipes.mix={name:'五種配方',periodMs:3000,chance:.5,quantity:4,output:'imbue_fire',outputType:'item',inputs:[['紅色草',2],['清水',3],['藥水瓶',4],['紅色草泥',5],['heal_small',2,'item']]};});
 r.run('state.materials={紅色草:8,清水:12,藥水瓶:16,紅色草泥:20};setHealPotionCount("heal_small",8);Math.random=()=>.5;setTab("lifeSkills");startLifeWork("mix");');advance(r,2999);assert.equal(r.run('healPotionCount("heal_small")'),8);assert.equal(r.elements.get('life-work-progress').max,3000);
 advance(r,1);assert.equal(r.run('healPotionCount("heal_small")'),6);assert.equal(r.run('state.consumables.imbue_fire||0'),0);
 r.run('Math.random=()=>.49999;');advance(r,6000);assert.equal(r.run('state.consumables.imbue_fire'),8);assert.equal(r.run('healPotionCount("heal_small")'),2);
 for(const [key,n] of d.lifeSkills.recipes.mix.inputs.slice(0,4))assert.equal(r.run('materialCount('+JSON.stringify(key)+')'),n);
 advance(r,3000);assert.equal(r.run('state.consumables.imbue_fire'),12);assert.equal(r.run('__EMBERWILD_LIFE_SKILLS.jobs.work'),null);assert.match(r.run('accountItemsView()'),/data-inventory-item="imbue_fire"/);assert.deepEqual(r.errors,[]);
});

test('a one-input recipe produces materials; stop, stock limits and failed saves preserve every inventory',()=>{
 const r=game();apply(r,l=>{l.recipes.mix={name:'加工新材料',periodMs:1000,chance:1,quantity:3,output:'新材料',outputType:'material',inputs:[['紅色草',2]]};l.gathering[0]={id:'herb',name:'取得藥水',periodMs:1000,chance:1,quantity:2,output:'imbue_fire',outputType:'item'};});
 r.run('state.materials["紅色草"]=10;startLifeWork("mix");');advance(r,999);r.run('stopLifeWork();');assert.equal(r.run('materialCount("紅色草")'),10);
 r.run('startLifeWork("mix");');advance(r,1000);assert.equal(r.run('materialCount("新材料")'),3);r.run('stopLifeWork();state.materials["新材料"]=1e9-2;');assert.equal(r.run('startLifeWork("mix")'),false);assert.equal(r.run('materialCount("紅色草")'),8);
 r.run('state.materials["新材料"]=0;startLifeWork("mix");startLifeGathering();globalThis.originalSave=save;save=()=>false;');const before=json(r,'({materials:state.materials,potions:healingInventory(),consumables:state.consumables})');advance(r,1000);assert.deepEqual(json(r,'({materials:state.materials,potions:healingInventory(),consumables:state.consumables})'),before);assert.deepEqual(json(r,'__EMBERWILD_LIFE_SKILLS.jobs'),{gather:null,work:null});r.run('save=originalSave;');assert.deepEqual(r.errors,[]);
});

test('recipe removal and empty gathering do not revive defaults; invalid imports preserve active jobs and current design',()=>{
 const r=game();apply(r,l=>{delete l.recipes.process;l.gathering=[];});assert.equal(r.run('startLifeGathering()'),false);assert.equal(r.run('startLifeWork("process")'),false);assert.doesNotMatch(r.run('lifeSkillsView()'),/undefined|NaN/);
 apply(r,l=>{l.gathering=[{id:'test',name:'測試',periodMs:1000,chance:1,quantity:1,output:'測試材料',outputType:'material'}];});r.run('startLifeGathering();');const before=json(r,'__EMBERWILD_LIFE_SKILLS.design'),job=json(r,'__EMBERWILD_LIFE_SKILLS.jobs');r.run('candidate.lifeSkills.gathering[0].quantity=-1;');assert.throws(()=>r.run('applyBalanceConfig(candidate)'));assert.deepEqual(json(r,'__EMBERWILD_LIFE_SKILLS.design'),before);assert.deepEqual(json(r,'__EMBERWILD_LIFE_SKILLS.jobs'),job);
});

test('all life design boundaries reject unsafe or unplayable definitions before import',()=>{
 const r=game(),d=json(r,'exportableBalance()');for(const mutation of [
  l=>l.gathering[0].periodMs=0,l=>l.gathering[0].chance=1.01,l=>l.gathering[0].chance='1',l=>l.gathering[0].quantity=1.5,l=>l.gathering[0].output='',l=>l.gathering[0].outputType='unknown',l=>l.gathering[0].output='__proto__',l=>l.gathering[0].id="x');alert(1)//",l=>l.gathering.push({...l.gathering[0]}),l=>l.recipes.alchemy.inputs=[],l=>l.recipes.alchemy.inputs=Array.from({length:6},(_,i)=>['材料'+i,1]),l=>l.recipes.alchemy.inputs[0][1]=0,l=>l.recipes.alchemy.inputs[0][1]=1.5,l=>l.recipes.alchemy.inputs.push([...l.recipes.alchemy.inputs[0]]),l=>l.recipes.alchemy.output='not-an-item',l=>l.recipes.alchemy.inputs[0]=['missing',1,'item'],l=>l.gathering[0].bonusDrops[0].quantity=0
 ]){const bad=structuredClone(d);mutation(bad.lifeSkills);r.ctx.bad=bad;assert.throws(()=>r.run('validateBalanceConfig(bad)'));}
 assert.deepEqual(r.errors,[]);
});

test('legacy life JSON migrates timings and bug drops without a second editable source; designer and game round-trip and reload agree',()=>{
 const r=game(),e=loadRuntime(editor,'balance-editor.html');const d=apply(r,l=>{delete l.gathering;l.periodMs=2700;l.bugChance=.18;for(const recipe of Object.values(l.recipes))for(const k of ['periodMs','chance','quantity','outputType'])delete recipe[k];});
 const exported=json(r,'exportableBalance()');assert.equal(exported.lifeSkills.gathering[0].periodMs,2700);assert.equal(exported.lifeSkills.gathering[0].bonusDrops[0].chance,.18);assert.equal(exported.lifeSkills.recipes.alchemy.periodMs,2700);assert(!('periodMs' in exported.lifeSkills));assert(!('bugChance' in exported.lifeSkills));
 e.ctx.doc=exported;e.run('data=__EMBERWILD_VALIDATE_DOCUMENT(doc);markDirty();');assert.deepEqual(json(e,'validateData()'),[]);assert.deepEqual(json(e,'__EMBERWILD_MASTERY_EDITOR.cleanExport().lifeSkills'),exported.lifeSkills);
 const reload=loadRuntime(root,'index.html',Object.fromEntries(r.values));assert.deepEqual(json(reload,'__EMBERWILD_LIFE_SKILLS.design'),exported.lifeSkills);assert.deepEqual(json(e,'__EMBERWILD_VALIDATE_DOCUMENT(__EMBERWILD_MASTERY_EDITOR.cleanExport()).lifeSkills'),exported.lifeSkills);assert.deepEqual(reload.errors,[]);assert.deepEqual(e.errors,[]);
});
