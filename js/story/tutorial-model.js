/* Tutorial contract shared by the game and the balance editor (embedded there by scripts/sync-tutorials.cjs).
   Content (text, steps, triggers) is balance data in `tutorials`; behaviour is limited to the fixed condition, event,
   target and trigger types declared here. No free JavaScript is ever read from the data. */
(function(root){
 'use strict';
 const VERSION=1,copy=x=>structuredClone(x);
 const TYPES={guide:'操作引導',intro:'功能介紹',tip:'簡短提示'};
 const CATEGORIES={battle:'探索',equipment:'裝備',skills:'技能',companions:'夥伴',life:'生活技能',alchemy:'煉金',wishingLake:'許願湖',shop:'商店',catalog:'圖鑑',quests:'任務',character:'角色',other:'其他'};
 // Page identities are the game's fixed navigation ids (js/ui/navigation-tree.js); 'story' is the quest page.
 const PAGES={battle:'荒野探索',statistics:'戰鬥統計',shop:'商店',roster:'隊伍編成',partnerRoster:'夥伴名冊',character:'角色能力',skills:'技能',equipment:'背包',worn:'裝備與信物',forge:'裝備強化',bossCraft:'BOSS 製作',story:'任務',quests:'委託',wishingLake:'許願湖',gather:'採集',alchemy:'煉金'};
 // Condition types the game can evaluate. key: what `key` names; count: whether `count` is used.
 const CONDITIONS={
  prologueDone:{label:'序幕已完成'},
  tutorialDone:{label:'前置教學已完成',key:'tutorial'},
  pageVisited:{label:'曾進入頁面',key:'page'},
  featureUnlocked:{label:'劇情解鎖鍵已開啟',key:'text'},
  questDone:{label:'任務已完成',key:'quest'},
  level:{label:'主角等級達到',count:true},
  companions:{label:'擁有的夥伴數',count:true},
  gearOwned:{label:'持有的一般裝備數（不含新手與任務裝備）',count:true},
  gearAcquired:{label:'取得一般裝備的件數（教學系統記錄，不含新手與任務裝備）',count:true},
  itemAcquired:{label:'曾取得道具／材料數量',key:'item',count:true},
  exploring:{label:'目前正在探索'},
  explorationStarted:{label:'開始探索次數（教學系統記錄）',count:true},
  gearEquipped:{label:'穿戴裝備次數（教學系統記錄）',count:true},
  learnedActiveSkills:{label:'已取得的主動技能數（目前職業）',count:true},
  activeSkillSlotted:{label:'已裝入主動槽的技能數',count:true},
  skillSlots:{label:'技能槽數量（主動／觸發／輔助）',key:'slotType',count:true},
  prologueLesson:{label:'序幕已教過的操作',key:'lesson'}
 };
 const SLOT_TYPES={active:'主動',proc:'觸發',support:'輔助'};
 // Lessons the prologue already teaches (its fixed system actions). A step can be left out for players who did them.
 const LESSONS={equipLesson:'穿戴裝備',skillLesson:'裝入技能',recruitHelper:'加入隊友'};
 // Events the game reports to a waiting step. They come from the game's own handlers, after they succeed.
 const EVENTS={explorationStarted:'開始探索',gearSelected:'在背包點選裝備',wearOpened:'按下背包的「穿戴」',gearEquipped:'完成穿戴',skillSlotOpened:'開啟技能槽',skillSlotted:'裝入技能',catalogOpened:'開啟技能圖鑑'};
 const ADVANCE={next:'按「下一步」',click:'點擊高亮目標',event:'等待遊戲事件',condition:'等待狀態成立',page:'進入指定頁面'};
 const TRIGGERS={pageEnter:'首次進入頁面時開始',unlock:'條件成立時立即提示',manual:'只能從教學回顧開始'};
 const PLACEMENTS={auto:'自動',top:'目標上方',bottom:'目標下方',left:'目標左側',right:'目標右側',center:'畫面中央'};
 // Semantic target ids. The game resolves each to a control (js/story/tutorial-runtime.js); data never holds selectors.
 const TARGETS={
  'battle.destination':{label:'探索目的地列',page:'battle'},
  'battle.categories':{label:'關卡分類按鈕',page:'battle'},
  'battle.mapSelect':{label:'探索地圖選單',page:'battle'},
  'battle.start':{label:'開始／停止探索按鈕',page:'battle'},
  'battle.huntMode':{label:'單怪／群怪切換',page:'battle'},
  'battle.allies':{label:'我方戰鬥卡片',page:'battle'},
  'battle.enemies':{label:'敵方戰鬥卡片',page:'battle'},
  'bag.categories':{label:'背包分類按鈕',page:'equipment'},
  'bag.list':{label:'背包裝備清單',page:'equipment'},
  'bag.newGear':{label:'最新取得的一般裝備',page:'equipment'},
  'bag.wearButton':{label:'裝備詳情的「穿戴」',page:'equipment'},
  'worn.slots':{label:'已穿戴欄位',page:'worn'},
  'worn.candidate':{label:'穿戴候選裝備',page:'worn'},
  'worn.confirm':{label:'換裝比較的「確認穿戴」',page:'worn'},
  'skills.catalog':{label:'技能圖鑑按鈕',page:'skills'},
  'skills.activeSlots':{label:'主動技能槽',page:'skills'},
  'skills.firstActiveSlot':{label:'第一個主動槽',page:'skills'},
  'skills.procSlots':{label:'觸發技能槽',page:'skills'},
  'skills.supportSlots':{label:'輔助技能槽',page:'skills'},
  'skills.slotChoice':{label:'技能槽視窗的「裝入技能」',page:'skills'},
  'header.options':{label:'頁首「設定」',page:''}
 };
 const ID=/^[a-z][a-z0-9_]{1,47}$/,STEP_ID=/^[a-z][a-z0-9_]{0,31}$/;
 const text=(v,max)=>typeof v==='string'&&v.length<=max,filled=(v,max)=>text(v,max)&&v.trim().length>0;
 const condition=(type,key='',count=1,itemType)=>{const c={type,key,count};if(itemType)c.itemType=itemType;return c;};
 const group=(conditions=[],mode='all')=>({mode,conditions});
 const step=(id,title,body,o={})=>({id,title,text:body,page:o.page??'',target:o.target??'',placement:o.placement||'auto',advance:o.advance||{type:'next'},optional:!!o.optional,requires:o.requires||group(),onReplay:o.onReplay||'same',skipIf:o.skipIf||group()});
 function makeModule(o){return {id:o.id,title:o.title,category:o.category,type:o.type||'guide',enabled:o.enabled!==false,implemented:o.implemented!==false,description:o.description||'',trigger:{type:'pageEnter',page:'',notify:false,notifyText:'',...o.trigger},prerequisites:o.prerequisites||group(),steps:o.steps||[],completion:o.completion||{type:'steps'},replayable:o.replayable!==false,skippable:o.skippable!==false,interrupt:o.interrupt||'pause',revision:o.revision||1,reprompt:!!o.reprompt};}

 function defaults(){return {version:VERSION,modules:[
  makeModule({id:'explore_basics',title:'探索',category:'battle',description:'選擇探索地圖、開始自動探索，以及看懂自動戰鬥的狀態。序幕的訓練戰之後，第一次進入荒野探索時開始。',
   trigger:{type:'pageEnter',page:'battle'},prerequisites:group([condition('prologueDone')]),steps:[
   step('intro','探索介面','這裡是荒野探索。上方選擇要前往的地圖，下方是隊伍與敵人的戰鬥卡片。',{page:'battle',target:'battle.destination'}),
   step('map','選擇探索地圖','從清單選擇要探索的地圖。地圖名稱後面是建議等級，先從等級相近的地圖開始。',{page:'battle',target:'battle.mapSelect'}),
   step('start','開始探索','按下「開始探索」，隊伍就會自動尋找怪物並開始戰鬥。',{page:'battle',target:'battle.start',advance:{type:'condition',condition:condition('exploring')}}),
   step('auto','自動戰鬥','戰鬥會自動進行。普攻與已裝入的技能依冷卻與 MP 自動施放，卡片上的讀秒條是下一次行動的時間。打完一場後隊伍會先恢復，再自動尋找下一場戰鬥。',{page:'battle',target:'battle.allies'})
  ]}),
  makeModule({id:'equipment_basics',title:'裝備',category:'equipment',description:'在背包查看新裝備的資訊，並從背包進入穿戴頁面換上裝備。第一次取得一般裝備後提示。',
   trigger:{type:'pageEnter',page:'equipment',notify:true,notifyText:'取得了新的裝備。到「背包」看看裝備資訊與穿戴方式。'},prerequisites:group([condition('prologueDone'),condition('gearAcquired','',1)]),steps:[
   step('bag','背包','背包的「裝備」分類列出持有的裝備，可以用排序與篩選整理清單。',{page:'equipment',target:'bag.categories'}),
   step('info','查看裝備','點選這件裝備，查看它的等級、數值與孔位。',{page:'equipment',target:'bag.newGear',advance:{type:'event',key:'gearSelected'},requires:group([condition('gearOwned','',1)]),skipIf:group([condition('prologueLesson','equipLesson')])}),
   step('wear','前往穿戴','按「穿戴」會前往裝備頁，並比較穿上前後的數值。',{page:'equipment',target:'bag.wearButton',advance:{type:'event',key:'wearOpened'},requires:group([condition('gearOwned','',1)]),skipIf:group([condition('prologueLesson','equipLesson')])}),
   step('equip','完成穿戴','選擇候選裝備並確認穿戴。數值比目前的差時可以不換，按「略過此步」繼續。',{page:'worn',target:'worn.candidate',advance:{type:'event',key:'gearEquipped'},optional:true,onReplay:'explain',requires:group([condition('gearOwned','',1)]),skipIf:group([condition('prologueLesson','equipLesson')])}),
   step('slots','已穿戴欄位','已穿戴的裝備顯示在這裡，可以卸下、強化、鑲嵌或查看詳情。',{page:'worn',target:'worn.slots'})
  ]}),
  makeModule({id:'skill_basics',title:'技能',category:'skills',description:'看懂技能頁的技能槽、技能圖鑑，以及戰鬥中技能的自動施放規則。第一次進入技能頁時開始。',
   trigger:{type:'pageEnter',page:'skills'},prerequisites:group([condition('prologueDone')]),steps:[
   step('slots','技能槽','技能頁分成主動、觸發與輔助三種技能槽。技能要裝進技能槽才會在戰鬥中使用。',{page:'skills',target:'skills.activeSlots'}),
   step('catalog','技能圖鑑','「技能圖鑑」列出目前職業可以取得的技能、已取得的技能，以及取得的方式。',{page:'skills',target:'skills.catalog'}),
   step('active','主動技能','點選主動槽可以選擇或替換技能。',{page:'skills',target:'skills.firstActiveSlot',advance:{type:'event',key:'skillSlotOpened'},requires:group([condition('learnedActiveSkills','',1),condition('skillSlots','active',1)]),skipIf:group([condition('prologueLesson','skillLesson')])}),
   step('auto','自動施放','戰鬥中，主動槽的技能在冷卻結束且 MP 足夠時自動施放；有施放條件的技能要等條件成立。沒有可用的技能時角色會普攻。',{page:'skills',target:'skills.activeSlots'}),
   step('others','觸發與輔助','觸發技能在普攻時依觸發率發動；輔助技能在戰鬥中同樣自動施放。各技能的效果以技能說明為準。',{page:'skills',target:'skills.procSlots',requires:group([condition('skillSlots','proc',1)])})
  ]})
 ]};}

 function conditionIssues(c,where,ctx,ids,add){
  if(!c||typeof c!=='object'||Array.isArray(c)||!Object.hasOwn(CONDITIONS,c.type)){add(where+'：未知的條件類型 '+(c?.type??''));return;}
  const def=CONDITIONS[c.type];
  if(!Number.isSafeInteger(c.count)||c.count<0||c.count>1e9)add(where+'：數量必須為 0～1000000000 的整數');
  if(!text(c.key,80))add(where+'：鍵值必須為 80 字以內的文字');
  if(def.key==='tutorial'&&!ids.has(c.key))add(where+'：前置教學不存在：'+c.key);
  if(def.key==='page'&&!Object.hasOwn(PAGES,c.key))add(where+'：頁面不存在：'+c.key);
  if(def.key==='lesson'&&!Object.hasOwn(LESSONS,c.key))add(where+'：序幕操作必須為 equipLesson、skillLesson 或 recruitHelper');
  if(def.key==='slotType'&&!Object.hasOwn(SLOT_TYPES,c.key))add(where+'：技能槽類型必須為 active、proc 或 support');
  if(def.key==='text'&&!filled(c.key,80))add(where+'：必須填寫解鎖鍵');
  if(def.key==='quest'&&(!filled(c.key,80)||Array.isArray(ctx.quests)&&!ctx.quests.some(q=>q?.id===c.key)))add(where+'：任務不存在：'+c.key);
  if(def.key==='item'){if(!['item','material'].includes(c.itemType))add(where+'：物品類型必須為 item 或 material');if(!filled(c.key,80))add(where+'：必須指定物品');else if(c.itemType==='item'&&Array.isArray(ctx.items)&&!ctx.items.some(i=>i?.id===c.key))add(where+'：道具不存在：'+c.key);}
 }
 function groupIssues(g,where,ctx,ids,add){
  if(!g||typeof g!=='object'||Array.isArray(g)||!['all','any'].includes(g.mode)||!Array.isArray(g.conditions)||g.conditions.length>12){add(where+'：條件群組格式無效（mode 為 all／any，最多 12 項）');return;}
  g.conditions.forEach((c,i)=>conditionIssues(c,where+' 第 '+(i+1)+' 項',ctx,ids,add));
 }
 const refs=g=>Array.isArray(g?.conditions)?g.conditions.filter(c=>c?.type==='tutorialDone').map(c=>c.key):[];
 // Rules shared by the editor (before saving or publishing) and the game (before applying). Empty means valid.
 function issues(raw,ctx={}){
  const out=[],add=m=>out.push(m);
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){add('教學資料必須為物件');return out;}
  if(raw.version!==VERSION)add('教學資料版本必須為 '+VERSION);
  if(!Array.isArray(raw.modules)||raw.modules.length>80){add('modules 必須為陣列，最多 80 個教學');return out;}
  const ids=new Set(),seen=new Set();
  for(const m of raw.modules)if(m&&typeof m.id==='string')ids.add(m.id);
  raw.modules.forEach((m,mi)=>{
   const label='教學 '+(m?.id||'#'+(mi+1));
   if(!m||typeof m!=='object'||Array.isArray(m)){add(label+'：必須為物件');return;}
   if(typeof m.id!=='string'||!ID.test(m.id))add(label+'：ID 只能使用小寫英文、數字與底線，2～48 字，英文開頭');
   else if(seen.has(m.id))add(label+'：ID 重複');seen.add(m.id);
   if(!filled(m.title,40))add(label+'：名稱不可空白，最多 40 字');
   if(!text(m.description,600))add(label+'：說明最多 600 字');
   if(!Object.hasOwn(CATEGORIES,m.category))add(label+'：未知的所屬系統 '+m.category);
   if(!Object.hasOwn(TYPES,m.type))add(label+'：未知的教學類型 '+m.type);
   for(const k of ['enabled','implemented','replayable','skippable','reprompt'])if(typeof m[k]!=='boolean')add(label+'：'+k+' 必須為 true／false');
   if(!['pause','end'].includes(m.interrupt))add(label+'：中斷處理必須為 pause 或 end');
   if(!Number.isSafeInteger(m.revision)||m.revision<1||m.revision>9999)add(label+'：修訂版本必須為 1～9999 的整數');
   const t=m.trigger;
   if(!t||typeof t!=='object'||!Object.hasOwn(TRIGGERS,t.type))add(label+'：未知的觸發方式');
   else{
    if(t.type==='pageEnter'&&!Object.hasOwn(PAGES,t.page))add(label+'：觸發頁面不存在：'+t.page);
    if(t.type!=='pageEnter'&&t.page!==''&&t.page!==undefined)add(label+'：只有「首次進入頁面」需要指定頁面');
    if(typeof t.notify!=='boolean'||!text(t.notifyText,120))add(label+'：解鎖通知設定無效（notifyText 最多 120 字）');
    if(t.notify&&!filled(t.notifyText,120))add(label+'：開啟解鎖通知時必須填寫通知文字');
   }
   groupIssues(m.prerequisites,label+' 前置條件',ctx,ids,add);
   if(refs(m.prerequisites).includes(m.id))add(label+'：前置條件不能是自己');
   const c=m.completion;
   if(!c||!['steps','condition'].includes(c.type))add(label+'：完成條件必須為 steps 或 condition');
   else if(c.type==='condition'){groupIssues(c.condition,label+' 完成條件',ctx,ids,add);if(!c.condition?.conditions?.length)add(label+'：完成條件為「狀態成立」時至少要有一項條件');if(refs(c.condition).includes(m.id))add(label+'：完成條件不能等待自己完成，教學將無法結束');}
   if(!Array.isArray(m.steps)||m.steps.length>20){add(label+'：steps 必須為陣列，最多 20 步');return;}
   if(m.implemented&&!m.steps.length)add(label+'：標記為已實裝的教學至少要有一個步驟');
   if(m.type==='tip'&&m.steps.length>1)add(label+'：簡短提示只能有一個步驟');
   const stepIds=new Set();
   m.steps.forEach((s,si)=>{
    const where=label+' 第 '+(si+1)+' 步';
    if(!s||typeof s!=='object'||Array.isArray(s)){add(where+'：必須為物件');return;}
    if(typeof s.id!=='string'||!STEP_ID.test(s.id))add(where+'：步驟 ID 只能使用小寫英文、數字與底線，最多 32 字');
    else if(stepIds.has(s.id))add(where+'：步驟 ID 重複');stepIds.add(s.id);
    if(!filled(s.title,40))add(where+'：標題不可空白，最多 40 字');
    if(!filled(s.text,400))add(where+'：說明文字不可空白，最多 400 字');
    if(s.page!==''&&!Object.hasOwn(PAGES,s.page))add(where+'：頁面不存在：'+s.page);
    if(s.target!==''&&!Object.hasOwn(TARGETS,s.target))add(where+'：引導目標不存在：'+s.target);
    else if(s.target&&TARGETS[s.target].page&&s.page&&TARGETS[s.target].page!==s.page)add(where+'：引導目標屬於「'+PAGES[TARGETS[s.target].page]+'」頁，與步驟頁面不同');
    if(!Object.hasOwn(PLACEMENTS,s.placement))add(where+'：提示位置無效');
    if(typeof s.optional!=='boolean')add(where+'：optional 必須為 true／false');
    if(!['same','explain'].includes(s.onReplay))add(where+'：重播方式必須為 same 或 explain');
    groupIssues(s.requires,where+' 可執行條件',ctx,ids,add);
    groupIssues(s.skipIf,where+' 略過條件',ctx,ids,add);
    const a=s.advance;
    if(!a||typeof a!=='object'||!Object.hasOwn(ADVANCE,a.type)){add(where+'：未知的下一步條件');return;}
    if(m.type==='tip'&&a.type!=='next')add(where+'：簡短提示只能用「下一步」結束');
    if(a.type==='click'&&!s.target)add(where+'：「點擊高亮目標」必須指定引導目標');
    if(a.type==='event'&&!Object.hasOwn(EVENTS,a.key))add(where+'：遊戲不支援這個事件：'+a.key);
    if(a.type==='page'&&!Object.hasOwn(PAGES,a.key))add(where+'：等待的頁面不存在：'+a.key);
    if(a.type==='condition'){conditionIssues(a.condition,where+' 等待狀態',ctx,ids,add);if(a.condition?.type==='tutorialDone'&&a.condition.key===m.id)add(where+'：等待自己的完成，教學將無法結束');}
   });
  });
  // Prerequisite chains (through tutorialDone) must not loop: a loop means none of them can ever start.
  const byId=new Map(raw.modules.filter(m=>m&&typeof m.id==='string').map(m=>[m.id,m])),state=new Map();
  function visit(id,path){
   if(state.get(id)===2)return;if(state.get(id)===1){add('前置教學形成循環：'+[...path.slice(path.indexOf(id)),id].join(' → '));return;}
   state.set(id,1);for(const r of refs(byId.get(id)?.prerequisites))if(byId.has(r))visit(r,[...path,id]);state.set(id,2);
  }
  for(const id of byId.keys())visit(id,[]);
  return [...new Set(out)];
 }
 // Fill optional fields older or hand-written documents may leave out, then check. Missing keys are appended, so a
 // complete document keeps its exact key order (the published modules compare as text).
 const fill=(o,base)=>{if(o&&typeof o==='object'&&!Array.isArray(o))for(const [k,v] of Object.entries(base))if(o[k]===undefined)o[k]=copy(v);return o;};
 function normalize(raw){
  if(raw===undefined||raw===null)return defaults();
  const d=copy(raw);
  if(d&&Array.isArray(d.modules))for(const m of d.modules){
   if(!m||typeof m!=='object'||Array.isArray(m))continue;
   fill(m,{type:'guide',enabled:true,implemented:true,description:'',trigger:{type:'pageEnter',page:''},prerequisites:group(),steps:[],completion:{type:'steps'},replayable:true,skippable:true,interrupt:'pause',revision:1,reprompt:false});
   fill(m.trigger,{page:'',notify:false,notifyText:''});
   const conditions=[...(m.prerequisites?.conditions||[]),...(m.completion?.condition?.conditions||[])];
   if(Array.isArray(m.steps))for(const s of m.steps){fill(s,{page:'',target:'',placement:'auto',advance:{type:'next'},optional:false,requires:group(),onReplay:'same',skipIf:group()});if(s&&typeof s==='object')conditions.push(...(s.requires?.conditions||[]),...(s.skipIf?.conditions||[]),...(s.advance?.condition?[s.advance.condition]:[]));}
   for(const c of conditions)fill(c,{key:'',count:1});
  }
  return d;
 }
 function validate(raw,ctx={}){const d=normalize(raw),errors=issues(d,ctx);if(errors.length)throw Object.assign(Error('教學資料無效：\n'+errors.join('\n')),{issues:errors});return d;}
 const api={VERSION,TYPES,CATEGORIES,PAGES,CONDITIONS,SLOT_TYPES,LESSONS,EVENTS,ADVANCE,TRIGGERS,PLACEMENTS,TARGETS,copy,condition,group,step,module:makeModule,defaults,issues,normalize,validate};
 root.EmberwildTutorial=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
