'use strict';
/* v0.214: the skill page has 技能配置 (default), 技能圖鑑 and 職業成長. Slots are icon cells; a slot opens a compact
   candidate list with a detail pane and one-tap equip; passives have a manager; the catalog filters by state, type
   and source with acquired skills first; growth shows the existing class mastery list. Slot rules are unchanged. */
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
function ready(){const r=loadRuntime(root);r.run(`selectSaveSlot(1);start(0);closeModal();clearInterval(timer);running=false;setClassMasteryLevel?.(8);syncParty?.();setTab('skills');`);return r;}
const app=r=>r.run('skillsView()');
test('the loadout page is the default and shows icon slot cells without long descriptions',()=>{
 const r=ready(),html=app(r);
 assert.match(html,/data-skill-page-view="loadout"/);
 for(const p of ['技能配置','技能圖鑑','職業成長'])assert.match(html,new RegExp('>'+p+'</button>'));
 assert.match(html,/onclick="openSkillCatalog\(\)"/,'the catalog tab keeps the tutorial target');
 const n=r.run('playerHero().skillLoadout.active.length');for(let i=0;i<n;i++)assert.match(html,new RegExp(`data-skill-slot="active:${i}"[^>]*onclick="openSkillSlot\\('active',${i}\\)"`));
 assert.doesNotMatch(html,/data-skill-slot="support:/);assert.doesNotMatch(html,/class-mastery-tree/,'the class list lives on 職業成長');
 assert.doesNotMatch(html,/skill-detail-section/,'no full skill details on the loadout page');
 assert.deepEqual(r.errors,[]);
});
test('a slot opens candidates with source, one line and status; one tap equips through configureSkill',()=>{
 const r=ready();const id=r.run(`(()=>{const h=playerHero();return __EMBERWILD_SKILL_SYSTEM_UI.catalog(h).find(sk=>sk.type==='active'&&__EMBERWILD_SKILLS.learned(h,sk)&&!h.skillLoadout.active.includes(sk.id))?.id||''})()`);
 assert(id,'the fixture has a learned unequipped active skill');
 r.run(`openSkillSlot('active',1)`);const modal=r.elements.get('modal').innerHTML;
 assert.match(modal,/skill-slot-detail/);assert.match(modal,new RegExp(`chooseSkillSlot\\('active',1,'${id}'\\)`));assert.doesNotMatch(modal,/skill-locked/,'only learned skills by default');
 assert.equal(r.run(`chooseSkillSlot('active',1,'${id}')`),true);assert.equal(r.run('playerHero().skillLoadout.active[1]'),id);
 assert.equal(r.run(`openSkillSlot('support',0)`),false);assert.deepEqual(r.errors,[]);
});
test('passive manager toggles through the existing switch; catalog filters and growth page render',()=>{
 const r=ready();const passive=r.run(`(()=>{const h=playerHero();return __EMBERWILD_SKILLS.system().definitions.find(sk=>sk.type==='passive'&&__EMBERWILD_SKILLS.learned(h,sk))?.id||''})()`);
 if(passive){r.run('openPassiveManager()');assert.match(r.elements.get('modal').innerHTML,new RegExp(`data-passive-id="${passive}"`));r.run(`togglePassiveFromManager('${passive}',false)`);assert.equal(r.run(`__EMBERWILD_SKILLS.passiveEnabled(playerHero(),'${passive}')`),false);r.run(`togglePassiveFromManager('${passive}',true)`);}
 r.run(`openSkillCatalog()`);let html=app(r);assert.match(html,/data-skill-page-view="catalog"/);assert.match(html,/aria-label="取得狀態"/);
 r.run(`setSkillCatalogFilter('state','no')`);html=app(r);assert.doesNotMatch(html,/skill-catalog-item is-acquired/);
 r.run(`setSkillCatalogFilter('state','all');setSkillCatalogFilter('type','passive')`);html=app(r);assert.doesNotMatch(html,/<small>主動 ·|<small>觸發 ·/);
 r.run(`setSkillPage('growth')`);html=app(r);assert.match(html,/class-mastery-tree/);assert.deepEqual(r.errors,[]);
});
