// Heroes from saves older than the companion system cannot use class skills; the roster lists them as 等待解鎖.
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs'),root=path.resolve(__dirname,'..');
test('legacy non-companion members learn and equip no class skills, while the protagonist and companions are unchanged',()=>{
 const r=loadRuntime(root);r.run('selectSaveSlot(1);start(1);closeModal();recruitCompanion(11);closeModal();');
 r.run("globalThis.legacy=initial(1);legacy.name='舊存檔法師';legacy.lv=playerHero().lv;legacy.skills[0]=1;legacy.active=[0,null];legacy.equipped=Array(5).fill(null);party.members.push(legacy);party.enlisted.push(memberKey(legacy));ensureSharedGear();syncParty();__EMBERWILD_SKILLS.refreshHero(legacy);");
 const learned=h=>JSON.parse(r.run(`JSON.stringify(__EMBERWILD_SKILLS.system().definitions.filter(sk=>__EMBERWILD_SKILLS.learned(${h},sk)).map(sk=>sk.id))`));
 assert.deepEqual(learned('legacy'),[]);assert.equal(r.run('legacy.skillLoadout.active.every(x=>x===null)&&legacy.skillLoadout.proc.every(x=>x===null)&&legacy.skillLoadout.support.every(x=>x===null)'),true);
 assert.equal(r.run('legacy.skills.every(x=>x===0)'),true);assert.equal(r.run('coreSkillAvailableToHero(1,0,legacy)'),false);
 assert(learned('playerHero()').length>0,'the protagonist keeps class skills');assert(learned('partyMember(11)').length>0,'companions keep their own skills');
 r.run("setTab('partnerRoster');render()");const html=r.elements.get('app').innerHTML;
 assert.match(html,/原有隊員目前不能使用職業技能，等待解鎖/);assert.match(html,/data-companion-skill-waiting="[^"]+"[^]*?等待解鎖/);
 assert.deepEqual(r.errors,[]);
});
