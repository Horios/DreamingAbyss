const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {loadRuntime}=require('./headless-runtime.cjs');
const root=path.resolve(__dirname,'..');
const json=(runtime,code)=>JSON.parse(runtime.run('JSON.stringify('+code+')'));

test('navigation defaults group every page once in the top menu categories',()=>{
  const runtime=loadRuntime(root),design=json(runtime,'EmberwildNavigation.design');
  assert.deepEqual(design.groups.map(group=>group.label),['探索','隊伍','技能','裝備','背包','夥伴','角色','任務','商店','生活']);
  assert(design.groups.every(group=>group.expanded===false));
  assert.deepEqual(design.groups.find(group=>group.id==='missions').pages.map(page=>page.label),['主線','支線','NPC 任務','委託','許願湖']);
  assert.deepEqual(design.groups.find(group=>group.id==='life').pages.map(page=>page.label),['採集','煉金']);
  const pageIds=design.groups.flatMap(group=>group.pages.map(page=>page.id));
  assert.equal(new Set(pageIds).size,pageIds.length);
  assert.deepEqual(pageIds.sort(),Object.keys(json(runtime,'EmberwildNavigation.PAGES')).sort());
  assert.deepEqual(runtime.errors,[]);
});

test('tree navigation renders virtual story categories and independent gathering and alchemy pages',()=>{
  const runtime=loadRuntime(root);runtime.run('selectSaveSlot(1);start(0);closeModal()');
  const html=runtime.elements.get('app').innerHTML;
  assert.match(html,/data-nav-group="map" data-page="battle"/);
  assert.match(html,/class="game-subtabs"[^]*data-subpage="battle" class="active"[^]*data-subpage="statistics"/);
  runtime.run("openStory('','side')");
  assert.equal(runtime.run('tab'),'story');
  const story=runtime.elements.get('app').innerHTML;
  assert.match(story,/class="game-menu-item active" data-nav-group="missions" data-page="story-side"/);
  assert.match(story,/data-subpage="story-main"[^]*data-subpage="story-side" class="active"[^]*data-subpage="story-npc"[^]*data-subpage="quests"/);
  runtime.run("setTab('gather')");assert.match(runtime.elements.get('app').innerHTML,/<h1>採集<\/h1>/);assert.doesNotMatch(runtime.elements.get('app').innerHTML,/id="life-alchemy"/);
  runtime.run("setTab('alchemy')");assert.match(runtime.elements.get('app').innerHTML,/<h1>煉金<\/h1>/);assert.doesNotMatch(runtime.elements.get('app').innerHTML,/id="life-gather"/);
  assert.deepEqual(runtime.errors,[]);
});


test('top menu has one button per category, is not draggable, and uses designer-defined order',()=>{
  const runtime=loadRuntime(root);
  runtime.run('selectSaveSlot(1);start(0);closeModal()');
  const html=runtime.elements.get('app').innerHTML;
  const groups=[...html.matchAll(/<button type="button" class="game-menu-item[^"]*" data-nav-group="([^"]+)"/g)];
  assert.deepEqual(groups.map(match=>match[1]),['map','adventure-config','skills','gear','bag','partners','character','missions','shop','life']);
  assert(!html.includes('<details class="game-nav-group'));
  assert(!html.includes('game-nav-drag')&&!html.includes('data-nav-drag')&&!html.includes('draggable="true"'));
  const order=['map','adventure-config','skills','gear','bag','partners','character','missions','shop','life'];assert.deepEqual(json(runtime,'EmberwildNavigation.order'),order);
  runtime.values.set('emberwild-navigation-group-order-v1',JSON.stringify(['life','missions','map','shop']));
  const reloaded=loadRuntime(root,'index.html',Object.fromEntries(runtime.values));
  assert.deepEqual(json(reloaded,'EmberwildNavigation.order'),order);
  assert.equal(reloaded.run('typeof EmberwildNavigation.moveGroup'),'undefined');
  assert.deepEqual(reloaded.errors,[]);
});

test('collapsed parent reminders show N before numbers and aggregate counts',()=>{
  const runtime=loadRuntime(root);
  runtime.run('selectSaveSlot(1);start(0);closeModal()');
  runtime.run(`storyCategoryReminder=type=>type==='main'?{ready:4,new:1}:type==='side'?{ready:3,new:0}:{ready:0,new:0};
    dailyQuestReminder=()=>({ready:5,new:0});
    numberReminderCount=id=>id==='equipment'?7:0;
    numberBadgeHTML=id=>id==='equipment'?'<span class="number-badge">7</span>':'';`);
  const summary=group=>{
    const html=runtime.run("gameNavigationHTML('battle')");
    return html.split('data-nav-group="'+group+'"')[1]?.split('</button>')[0]||'';
  };
  const missions=summary('missions');
  assert(missions.includes('class="quest-new"')&&missions.includes('>N</span>'));
  assert(!missions.includes('class="number-badge"'));
  assert(summary('bag').includes('class="number-badge"')&&summary('bag').includes('>7</span>'));
  runtime.run("storyCategoryReminder=type=>type==='main'?{ready:4,new:0}:type==='side'?{ready:3,new:0}:{ready:0,new:0};");
  const numeric=summary('missions');
  assert(numeric.includes('class="number-badge"')&&numeric.includes('>12</span>'));
  assert(!numeric.includes('class="quest-new"'));
  assert.deepEqual(runtime.errors,[]);
});

test('quest details show NEW! text rather than N',()=>{
  const runtime=loadRuntime(root);
  runtime.run('selectSaveSlot(1);start(0);closeModal()');
  assert(runtime.run('storyView()').includes('class="quest-new quest-new-detail" aria-label="有未開始任務">NEW!</span>'));
  assert(runtime.run('questView()').includes('class="quest-new quest-new-detail" aria-label="有未開始任務">NEW!</span>'));
  assert.deepEqual(runtime.errors,[]);
});

test('adventure guide describes current systems without migration or development wording',()=>{
  const runtime=loadRuntime(root);
  runtime.run('selectSaveSlot(1);start(0);closeModal()');
  const guide=String(runtime.run('guideView()')).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ');
  for(const title of ['角色成長與精通','BOSS 挑戰進度','終局地圖','經驗與戰利品','存檔與離線探索'])
    assert(guide.includes(title),'missing guide section: '+title);
  assert.doesNotMatch(guide,/改為|不再|新增|舊版|版本更新|平衡設定|索引\s*6|後續可新增|原本/);
  assert.deepEqual(runtime.errors,[]);
});

test('balance navigation changes round-trip and malformed page lists are rejected atomically',()=>{
  const runtime=loadRuntime(root),before=json(runtime,'exportableBalance()'),custom=structuredClone(before);
  custom.navigation.groups[0].label='冒險總覽';
  const life=custom.navigation.groups.find(group=>group.id==='life');
  life.pages.reverse();
  runtime.ctx.custom=custom;runtime.run('applyBalanceConfig(custom,{persist:true})');
  assert.equal(json(runtime,'exportableBalance().navigation').groups[0].label,'冒險總覽');
  assert.match(runtime.run("gameNavigationHTML('alchemy')"),/冒險總覽/);
  const tabs=runtime.run("gameSubtabsHTML('alchemy')");assert(tabs.indexOf('data-subpage="alchemy"')>=0&&tabs.indexOf('data-subpage="alchemy"')<tabs.indexOf('data-subpage="gather"'));
  const bad=structuredClone(custom);bad.navigation.groups.find(group=>group.id==='life').pages.pop();runtime.ctx.bad=bad;
  assert.throws(()=>runtime.run('applyBalanceConfig(bad)'),/導覽列表缺少頁籤/);
  assert.deepEqual(json(runtime,'exportableBalance().navigation'),custom.navigation);
  assert.deepEqual(runtime.errors,[]);
});

test('the adventure guide opens from the header beside Save; older navigation documents listing it still load',()=>{
  const runtime=loadRuntime(root);runtime.run('selectSaveSlot(1);start(0);closeModal()');
  const design=json(runtime,'EmberwildNavigation.design');
  assert(!design.groups.some(g=>g.pages.some(p=>p.id==='guide')),'the guide is no longer a menu page');
  assert.deepEqual(design.groups.find(g=>g.id==='adventure-config').pages.map(p=>p.id),['roster']);
  const legacy=json(runtime,`EmberwildNavigation.normalize({version:1,groups:EmberwildNavigation.design.groups.map(g=>g.id==='adventure-config'?{...g,pages:[...g.pages,{id:'guide',label:'冒險指南'}]}:g)})`);
  assert.deepEqual(legacy.groups.find(g=>g.id==='adventure-config').pages.map(p=>p.id),['roster']);
  assert.equal(runtime.run("openUtilityPanel('guide')"),true);assert.match(runtime.run("$('modal').innerHTML"),/關閉[\s\S]*冒險指南|冒險指南[\s\S]*關閉/);
  runtime.run('closeModal()');assert.equal(runtime.run("setTab('guide')"),true,'existing guide links open the same dialog');
  assert.deepEqual(runtime.errors,[]);
});
