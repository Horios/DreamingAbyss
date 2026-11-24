const {loadRuntime}=require('./headless-runtime.cjs'),path=require('node:path');
function open(saved={}){const r=loadRuntime(path.resolve(__dirname,'..'),'index.html',saved);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));return r;}
function create(r,job=0){r.run(`selectSaveSlot(1);$('prologue-name').value='測試者';prologueConfirmName();prologuePickClass(${job});prologueConfirmClass()`);}
function equip(r){r.run('withHero(playerHero(),()=>equipGear(playerHero().bag.find(g=>g.starterPack).id));render()');}
function fight(r){r.run('running=true;spawnGroup();for(const e of foes)e.atk=0');for(let i=0;i<500&&r.run("__EMBERWILD_PROLOGUE.stage()==='practice'");i++)r.run('{const it=pacedRound();for(let n=0;n<5000&&!it.next().done;n++){}}');r.run('stopTeamExploration();render()');}
module.exports={open,create,equip,fight};
