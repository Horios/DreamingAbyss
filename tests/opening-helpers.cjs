const {loadRuntime}=require('./headless-runtime.cjs'),path=require('node:path');
function open(saved={}){const r=loadRuntime(path.resolve(__dirname,'..'),'index.html',saved);r.json=s=>JSON.parse(r.run('JSON.stringify('+s+')'));return r;}
function create(r,job=0){r.run(`selectSaveSlot(1);$('prologue-name').value='測試者';prologueConfirmName();prologuePickClass(${job});prologueConfirmClass()`);}
function weapon(r){r.run('withHero(playerHero(),()=>equipGear(playerHero().bag.find(g=>g.starterPack).id));render()');}
// v0.226: the onboarding teaches the charm (wear it, slot 追擊) and the gem right after the weapon.
function charm(r){r.run("{const h=playerHero(),g=h.bag.find(x=>x.storyRewardKey==='initiation_charm');withHero(h,()=>{equipGear(g.id);configureSkill('proc',0,'tutorial_echo');});render();}");}
function gem(r){r.run("{const h=playerHero(),g=h.bag.find(x=>x.storyRewardKey==='initiation_charm');withHero(h,()=>socketEquipmentGem(g.id,0,0));render();}");}
function equip(r){weapon(r);charm(r);gem(r);}
function fight(r){r.run('running=true;spawnGroup();for(const e of foes)e.atk=0');for(let i=0;i<500&&r.run("__EMBERWILD_PROLOGUE.stage()==='practice'");i++)r.run('{const it=pacedRound();for(let n=0;n<5000&&!it.next().done;n++){}}');r.run('stopTeamExploration();render()');}
module.exports={open,create,equip,weapon,charm,gem,fight};
