/* Data-driven desktop navigation. Page identities stay fixed so saved progress
   and direct links keep working; the balance document controls grouping
   and labels. */
(()=>{
  const VERSION=1,copy=value=>structuredClone(value);
  const PAGES={
    battle:'荒野探索',statistics:'戰鬥統計',shop:'商店',
    roster:'隊伍編成',partnerRoster:'夥伴名冊',character:'角色能力',skills:'技能',
    equipment:'背包',worn:'裝備與信物',forge:'裝備強化',bossCraft:'BOSS 製作',
    'story-main':'主線','story-side':'支線','story-npc':'NPC 任務',quests:'委託',
    gather:'採集',alchemy:'煉金'
  };
  const RETIRED=new Set(['guide']);
  const DEFAULTS={version:VERSION,groups:[
    {id:'map',label:'探索',expanded:false,pages:[['battle','荒野探索'],['statistics','戰鬥統計']]},
    {id:'adventure-config',label:'隊伍',expanded:false,pages:[['roster','隊伍編成']]},
    {id:'skills',label:'技能',expanded:false,pages:[['skills','技能']]},
    {id:'gear',label:'裝備',expanded:false,pages:[['worn','裝備與信物'],['forge','裝備強化'],['bossCraft','BOSS 製作']]},
    {id:'bag',label:'背包',expanded:false,pages:[['equipment','背包']]},
    {id:'partners',label:'夥伴',expanded:false,pages:[['partnerRoster','夥伴名冊']]},
    {id:'character',label:'角色',expanded:false,pages:[['character','角色能力']]},
    {id:'missions',label:'任務',expanded:false,pages:[['story-main','主線'],['story-side','支線'],['story-npc','NPC 任務'],['quests','委託']]},
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
      // The adventure guide moved to the header (utility dialog); older documents may still list it.
      return {id:group.id,label:group.label,expanded:group.expanded,pages:group.pages.filter(page=>!RETIRED.has(page?.id)).map((page,pageIndex)=>{
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
  // Top menu categories use the same Lucide line icons as the rest of the interface.
  const groupIcons={'adventure-config':'users',skills:'scroll-text',gear:'swords',bag:'backpack',partners:'handshake',character:'user-round',missions:'clipboard-list',map:'compass',shop:'store',life:'sprout',adventure:'compass',equipment:'backpack'};
  const groupIcon=group=>__EMBERWILD_SKILL_ICONS.svgFor('lucide:'+(groupIcons[group.id]||icons[group.pages[0]?.id]||'folder'),[],{size:18});
  const lastPage=new Map();
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
  function groupBadge(pages){
    const hasNew=pages.some(({reminder})=>reminder.isNew),count=pages.reduce((sum,{reminder})=>sum+reminder.count,0);
    return hasNew?'<span class="quest-new" aria-label="包含未開始任務">N</span>':count?`<span class="number-badge" aria-label="分類提醒 ${count}">${count}</span>`:'';
  }
  // One button per category. A category with several pages opens its current or
  // last visited page; the pages are listed as tabs at the top of the content.
  globalThis.gameNavigationHTML=function(current){
    rememberOpenState();
    const items=orderedGroups().map(group=>{
      const pages=group.pages.map(page=>({page,reminder:pageReminder(page)})),activePage=group.pages.find(page=>active(page,current));
      if(activePage)lastPage.set(group.id,activePage.id);
      const target=group.pages.find(page=>page.id===lastPage.get(group.id))||group.pages[0];
      return `<button type="button" class="game-menu-item ${activePage?'active':''}" data-nav-group="${esc(group.id)}" data-page="${esc(target.id)}" onclick="${action(target)}" ${activePage?'aria-current="page"':''}><span class="game-nav-label">${groupIcon(group)}${esc(group.label)}</span>${groupBadge(pages)}</button>`;
    }).join('');
    return `<span class="game-menu-title">遊戲選單</span>${items}<button type="button" class="game-menu-item ${current==='options'?'active':''}" data-nav-group="settings" data-page="options" onclick="setTab('options')" ${current==='options'?'aria-current="page"':''}><span class="game-nav-label">${__EMBERWILD_SKILL_ICONS.svgFor('lucide:settings',[],{size:18})}設定</span></button>`;
  };
  globalThis.gameSubtabsHTML=function(current){
    const group=orderedGroups().find(group=>group.pages.some(page=>active(page,current)));
    if(!group||group.pages.length<2)return '';
    return `<nav class="game-subtabs" aria-label="${esc(group.label)}分頁">${group.pages.map(page=>{const on=active(page,current),reminder=pageReminder(page);return `<button type="button" data-subpage="${esc(page.id)}" class="${on?'active':''}" onclick="${action(page)}" ${on?'aria-current="page"':''}><span class="game-nav-label">${navIcon(page.id)}${esc(page.label)}</span>${reminder.html}</button>`;}).join('')}</nav>`;
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
