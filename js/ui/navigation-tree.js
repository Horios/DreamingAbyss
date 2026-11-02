/* Data-driven desktop navigation. Page identities stay fixed so saved progress
   and direct links keep working; the balance document controls grouping
   and labels. */
(()=>{
  const VERSION=1,copy=value=>structuredClone(value);
  const PAGES={
    battle:'荒野探索',statistics:'戰鬥統計',shop:'商店',guide:'冒險指南',
    roster:'隊伍編成',partnerRoster:'夥伴名冊',character:'角色能力',skills:'技能',
    equipment:'背包',worn:'裝備與信物',forge:'裝備強化',bossCraft:'BOSS 製作',
    'story-main':'主線','story-side':'支線','story-npc':'NPC 任務',quests:'委託',
    gather:'採集',alchemy:'煉金'
  };
  const DEFAULTS={version:VERSION,groups:[
    {id:'missions',label:'主線',expanded:false,pages:[['story-main','主線'],['story-side','支線'],['story-npc','NPC 任務'],['quests','委託']]},
    {id:'adventure',label:'冒險',expanded:false,pages:[['battle','荒野探索'],['statistics','戰鬥統計'],['guide','冒險指南'],['roster','隊伍編成'],['partnerRoster','夥伴名冊'],['character','角色能力'],['skills','技能']]},
    {id:'equipment',label:'背包',expanded:false,pages:[['equipment','背包'],['worn','裝備與信物'],['forge','裝備強化'],['bossCraft','BOSS 製作']]},
    {id:'shop',label:'商店',expanded:false,pages:[['shop','商品列表']]},
    {id:'life',label:'生活',expanded:false,pages:[['gather','採集'],['alchemy','煉金']]}
  ].map(group=>({...group,pages:group.pages.map(([id,label])=>({id,label}))}))};
  const validText=(value,max)=>typeof value==='string'&&value.trim()===value&&value.length>0&&value.length<=max;
  function normalize(raw){
    if(raw===undefined||raw===null)return copy(DEFAULTS);
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||raw.version!==VERSION||!Array.isArray(raw.groups)||raw.groups.length<1||raw.groups.length>12)throw Error('導覽列表格式或版本無效');
    const groupIds=new Set(),pageIds=new Set(),groups=raw.groups.map((group,index)=>{
      if(!group||typeof group!=='object'||Array.isArray(group)||!validText(group.id,48)||groupIds.has(group.id)||!validText(group.label,24)||typeof group.expanded!=='boolean'||!Array.isArray(group.pages)||group.pages.length>24)throw Error('導覽群組無效：'+index);
      groupIds.add(group.id);
      return {id:group.id,label:group.label,expanded:group.expanded,pages:group.pages.map((page,pageIndex)=>{
        if(!page||typeof page!=='object'||Array.isArray(page)||!Object.hasOwn(PAGES,page.id)||pageIds.has(page.id)||!validText(page.label,24))throw Error('導覽頁籤無效：'+index+'-'+pageIndex);
        pageIds.add(page.id);return {id:page.id,label:page.label};
      })};
    });
    const missing=Object.keys(PAGES).filter(id=>!pageIds.has(id));
    if(missing.length)throw Error('導覽列表缺少頁籤：'+missing.join('、'));
    return {version:VERSION,groups};
  }
  let design=normalize(JSON.parse(balanceSourceText()||'null')?.navigation),openState=new Map();
  function orderedGroups(){return design.groups;}
  function storyType(){return globalThis.currentStoryCategory?.()||'main';}
  function active(page,current){
    if(page.id.startsWith('story-'))return current==='story'&&storyType()===page.id.slice(6);
    return current===page.id||current==='lifeSkills'&&page.id==='gather';
  }
  function action(page){
    if(page.id.startsWith('story-'))return `openStory('','${page.id.slice(6)}')`;
    return `setTab('${page.id}')`;
  }
  function rememberOpenState(){
    document.querySelectorAll?.('#app>.layout>aside nav details[data-nav-group]').forEach(group=>openState.set(group.dataset.navGroup,group.open));
  }

  const icons={battle:'swords',statistics:'chart-no-axes-combined',shop:'store',guide:'book-open',roster:'users',partnerRoster:'contact',character:'user-round',skills:'sparkles',equipment:'backpack',worn:'shield',forge:'hammer',bossCraft:'anvil','story-main':'scroll-text','story-side':'scroll','story-npc':'message-circle',quests:'clipboard-list',gather:'pickaxe',alchemy:'flask-conical'};
  const navIcon=id=>__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+(icons[id]||'folder'),[],{size:18});
  const taskPages=new Set(['story-main','story-side','story-npc','quests']);
  function taskStatus(id){return id.startsWith('story-')?globalThis.storyCategoryReminder?.(id.slice(6)):id==='quests'?globalThis.dailyQuestReminder?.():null;}
  function taskBadge(status){
    if(!status)return '';
    if(status.new)return '<span class="quest-new" aria-label="有未開始任務">N</span>';
    const count=Math.max(0,Number(status.ready)||0);
    return count?`<span class="number-badge" aria-label="可完成任務 ${count}">${count}</span>`:'';
  }
  globalThis.taskReminderHTML=id=>taskBadge(taskStatus(id));
  function pageReminder(page){
    if(taskPages.has(page.id)){
      const status=taskStatus(page.id);
      return {isNew:!!status?.new,count:status?.new?0:Math.max(0,Number(status?.ready)||0),html:taskBadge(status)};
    }
    return {isNew:false,count:globalThis.numberReminderCount?.(page.id)||0,html:globalThis.numberBadgeHTML?.(page.id)||''};
  }
  globalThis.gameNavigationHTML=function(current){
    rememberOpenState();

    return orderedGroups().map(group=>{
      const groupActive=group.pages.some(page=>active(page,current));
      const open=openState.has(group.id)?openState.get(group.id):group.expanded;
      const pages=group.pages.map(page=>({page,reminder:pageReminder(page)}));
      const hasNew=pages.some(({reminder})=>reminder.isNew);
      const count=pages.reduce((sum,{reminder})=>sum+reminder.count,0);
      const groupBadge=hasNew?'<span class="quest-new" aria-label="包含未開始任務">N</span>':count?`<span class="number-badge" aria-label="分類提醒 ${count}">${count}</span>`:'';
      return `<details class="game-nav-group ${groupActive?'has-active':''}" data-nav-group="${esc(group.id)}" ${open?'open':''}><summary><span class="game-nav-label">${navIcon(group.pages[0]?.id)}${esc(group.label)}</span>${groupBadge}<span class="game-nav-chevron" aria-hidden="true">${__EMBERWILD_SKILL_ICONS.svgFor('lucide:chevron-right',[],{size:14})}</span></summary><div class="game-nav-items">${pages.map(({page,reminder})=>`<button type="button" data-page="${esc(page.id)}" class="${active(page,current)?'active':''}" onclick="${action(page)}" ${active(page,current)?'aria-current="page"':''}><span class="game-nav-label">${navIcon(page.id)}${esc(page.label)}</span>${reminder.html}</button>`).join('')}</div></details>`;
    }).join('');
  };
  globalThis.EmberwildNavigation=Object.freeze({VERSION,PAGES:Object.freeze({...PAGES}),defaults:()=>copy(DEFAULTS),normalize,get design(){return copy(design);},get order(){return orderedGroups().map(g=>g.id);}});

  const exportBase=exportableBalance;
  exportableBalance=function(){return {...exportBase(),navigation:copy(design)};};
  const validateBase=validateBalanceConfig;
  validateBalanceConfig=function(input){const doc=validateBase(input);doc.navigation=normalize(input?.navigation);return doc;};
  const applyBase=applyBalanceConfig;
  applyBalanceConfig=function(input,options={}){
    const doc=validateBalanceConfig(input),result=applyBase(doc,options);design=copy(doc.navigation);openState=new Map();
    if(options.persist!==false)localStorage.setItem(BALANCE_KEY,JSON.stringify(exportableBalance()));
    if(state)render();return result;
  };
  if(state)render();
})();
