/* Bag presentation uses immutable item identities and the existing stat ledger,
   sale transaction and salvage reward plan. No generated-stat cache is persisted. */
(()=>{
  const defaults=()=>({job:'all',slot:'all',quality:'all',tMin:'',tMax:'',levelMin:'',levelMax:'',locked:'all',worn:'all',stat:'',op:'gte',value:'',upper:'',affixType:'',affixSkill:'',affixElement:'',affixRace:'',affixRank:'',affixOp:'gte',affixValue:''});
  let filter=defaults(),sort='quality',direction='desc',multi=false,advanced=false,selected=new Set(),review=null;
  const folds={filters:false,sort:false},commonSortFields=['atk','def','hp','speed','crit'];
  const T=()=>globalThis.__EMBERWILD_TEAM_EQUIPMENT;
  const fields=()=>globalThis.equipmentNumericFields().filter(f=>!/^skill(?:EffectPct|CooldownReduction|ProcChance):/.test(f.key));
  const affixTypes=[[0,'攻擊'],[1,'生命'],[2,'防禦'],[3,'暴擊率'],[4,'技能效果'],[5,'技能冷卻／觸發率'],[6,'暴擊傷害'],[7,'防禦穿透'],[8,'生命竊取'],[9,'閃避率'],[12,'屬性增傷'],[13,'種族增傷'],[14,'屬性抗性'],[15,'攻擊加成'],[16,'全技能冷卻'],[17,'掉落率'],[18,'防禦無視']];
  function matchingAffixes(g){return (g.affix||[]).filter(a=>String(a.type)===filter.affixType&&(!filter.affixRank||String(a.rank??0)===filter.affixRank)&&(!filter.affixElement||a.element===filter.affixElement)&&(!filter.affixRace||a.race===filter.affixRace)&&(!filter.affixSkill||g.job+':'+(a.skill??0)===filter.affixSkill));}
  const compare=(n,v,op)=>({gt:n>v,gte:n>=v,eq:n===v,lte:n<=v,lt:n<v})[op]===true;
  const numeric=(g)=>globalThis.equipmentAbilitySummary(g).numeric;
  function inputLimits(key){
    if(key==='tMin'||key==='tMax')return {min:1,max:Math.max(1,globalThis.__EMBERWILD_EQUIPMENT_POWER?.strength?.multipliers?.length||10),step:1};
    if(key==='levelMin'||key==='levelMax')return {min:1,max:RULES.maxLevel,step:1};
    if(key==='affixValue')return {min:0,max:Math.max(0,...(state?.bag||[]).flatMap(g=>matchingAffixes(g).map(a=>Number(a.value)||0))),step:'any'};
    if(key==='value'||key==='upper'){
      // Actual owned-equipment totals bound numeric search; no arbitrary stat cap.
      const values=filter.stat?(state?.bag||[]).filter(g=>!EmberwildTokens.isToken(g)).map(g=>Number(numeric(g)[filter.stat])||0):[];
      return {min:0,max:Math.max(0,...values),step:'any'};
    }
    return null;
  }
  const owned=g=>!!gearWearer(g.id)||!!T()?.references(g.id).length;
  const actionable=(g,mode)=>!!g&&!g.locked&&!owned(g)&&!inlineAffixDrafts.has(affixDraftKey(g))&&(mode!=='sell'||globalThis.__EMBERWILD_CAN_SELL_GEAR?.(g)!==false);
  const bound=(value,limit,lower)=>limit===''||Number.isFinite(Number(limit))&&(lower?value>=Number(limit):value<=Number(limit));
  function acquiredTime(g){
    if(g.acquiredAt!==undefined)return g.acquiredAt;
    // Legacy rewards lack acquiredAt; uid() embeds their creation time in base 36.
    const match=/^([0-9a-z]+)-[0-9a-z]+-[0-9a-z]{0,6}$/.exec(g.id),time=match?parseInt(match[1],36):NaN;
    return Number.isSafeInteger(time)&&time>=0?time:null;
  }
  function rows(){
    if(!state)return [];
    const wearers=new Set(party.members.flatMap(h=>[...h.equipped,h.tokenId]).filter(Boolean));
    const keys=new Set(fields().map(f=>f.key));
    const result=[];
    state.bag.forEach((g,index)=>{
      if(EmberwildTokens.isToken(g))return;
      const t=Number.isInteger(g.powerTier)?g.powerTier:null,level=gearRequiredLevel(g),worn=wearers.has(g.id);
      if(filter.job!=='all'&&!gearWearableJobs(g).includes(Number(filter.job))||filter.slot!=='all'&&g.slot!==Number(filter.slot)||filter.quality!=='all'&&gearQualityRank(g)!==Number(filter.quality)||filter.locked!=='all'&&!!g.locked!==(filter.locked==='yes')||filter.worn!=='all'&&worn!==(filter.worn==='yes'))return;
      if((filter.tMin!==''||filter.tMax!=='')&&t===null||!bound(t,filter.tMin,true)||!bound(t,filter.tMax,false)||!bound(level,filter.levelMin,true)||!bound(level,filter.levelMax,false))return;
      if(filter.affixType){const affixes=matchingAffixes(g);if(!affixes.length||filter.affixValue!==''&&!affixes.some(a=>compare(Number(a.value),Number(filter.affixValue),filter.affixOp)))return;}
      const stats=numeric(g);
      if(filter.stat&&keys.has(filter.stat)&&filter.value!==''){
        const n=stats[filter.stat],v=Number(filter.value),u=Number(filter.upper);
        if(!Number.isFinite(n)||n===0||!Number.isFinite(v))return;
        const ok={gt:()=>n>v,gte:()=>n>=v,eq:()=>n===v,lte:()=>n<=v,lt:()=>n<v,range:()=>filter.upper!==''&&Number.isFinite(u)&&n>=v&&n<=u}[filter.op];
        if(!ok||!ok())return;
      }
      const value=sort==='acquired'?acquiredTime(g):sort==='level'?level:sort==='tier'?t:sort==='quality'?gearQualityRank(g):sort==='price'?equipmentSellPrice(g):stats[sort]===0?null:stats[sort];
      result.push({g,index,stats,value});
    });
    result.sort((a,b)=>{
      const am=a.value===null||a.value===undefined,bm=b.value===null||b.value===undefined;
      if(am!==bm)return am?1:-1;
      const d=am?0:a.value-b.value;
      const tierDiff=sort==='quality'?(Number.isInteger(b.g.powerTier)?b.g.powerTier:-1)-(Number.isInteger(a.g.powerTier)?a.g.powerTier:-1):0;
      return (d?(direction==='asc'?d:-d):0)||tierDiff||a.index-b.index||String(a.g.id).localeCompare(String(b.g.id));
    });
    return result;
  }
  function visibleSelection(mode){const ids=new Set(rows().map(r=>r.g.id));return state.bag.filter(g=>ids.has(g.id)&&selected.has(g.id)&&actionable(g,mode));}
  const redraw=()=>{review=null;render();if($('modal').dataset.gearFilters==='true'&&$('modal').open)openGearInventoryFilters();};
  globalThis.setGearInventoryFilter=function(key,value){
    if(!Object.hasOwn(filter,key))return false;
    const limit=inputLimits(key);
    if(limit){
      const raw=String(value).trim(),n=raw===''?null:Number(raw);
      filter[key]=n===null||!Number.isFinite(n)?'':String(Math.min(limit.max,Math.max(limit.min,limit.step===1?Math.round(n):n)));
    }else{
      filter[key]=String(value);
      if(key==='stat'){filter.value='';filter.upper='';}
      if(key==='affixType'){filter.affixSkill='';filter.affixElement='';filter.affixRace='';filter.affixRank='';filter.affixValue='';}
    }
    selected.clear();redraw();return true;
  };
  globalThis.clearGearInventoryFilters=function(){filter=defaults();selected.clear();redraw();};
  globalThis.setGearInventorySort=function(key){if(!['acquired','level','tier','quality','price',...commonSortFields].includes(key))return false;sort=key;redraw();return true;};
  globalThis.setGearInventoryFold=function(key,open){if(Object.hasOwn(folds,key))folds[key]=!!open;};
  globalThis.toggleGearInventoryDirection=function(){direction=direction==='asc'?'desc':'asc';redraw();};
  globalThis.toggleGearInventoryMulti=function(){multi=!multi;selected.clear();redraw();};
  globalThis.toggleGearInventorySelected=function(id,checked){const g=findGear(id);if(!multi||!g||!actionable(g)||!rows().some(r=>r.g.id===id))return false;if(checked)selected.add(id);else selected.delete(id);redraw();return true;};
  globalThis.selectVisibleGear=function(){if(!multi)return;selected=new Set(rows().map(r=>r.g).filter(g=>actionable(g)).map(g=>g.id));redraw();};
  globalThis.clearSelectedGear=function(){selected.clear();redraw();};
  const choose=(key,label,options)=>`<label>${label}<select aria-label="${label}" onchange="setGearInventoryFilter('${key}',this.value)">${options.map(([value,text])=>`<option value="${esc(String(value))}" ${String(value)===filter[key]?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`;
  const input=(key,label)=>{
    const limit=inputLimits(key),disabled=['value','upper'].includes(key)&&!filter.stat||key==='affixValue'&&!filter.affixType;
    return `<label>${label}<input type="number" aria-label="${label}" min="${limit.min}" max="${limit.max}" step="${limit.step}" value="${esc(filter[key])}" ${disabled?'disabled':''} onchange="setGearInventoryFilter('${key}',this.value)"></label>`;
  };
  function affixControls(){
    const type=Number(filter.affixType),all=[['','不限']];
    const skills=[...new Set((state?.bag||[]).flatMap(g=>(g.affix||[]).filter(a=>a.type===type&&[4,5].includes(a.type)).map(a=>g.job+':'+(a.skill??0))))].map(key=>{const [j,i]=key.split(':').map(Number);return [key,CLASSES[j].name+' · '+CLASSES[j].skills[i]?.[0]];});
    return `<h3>詞綴篩選</h3><p class="small">只檢查隨機詞綴；數值條件套用於同一條詞綴，不計基底、強化或寶石。</p><div class="gear-numeric-filters">${choose('affixType','詞綴效果',[['','不限制'],...affixTypes])}${filter.affixType?choose('affixRank','詞綴品質',[...all,...AFFIX_RANK.map((name,n)=>[n,name])]):''}${[4,5].includes(type)&&filter.affixType?choose('affixSkill','詞綴技能',[...all,...skills]):''}${[12,14].includes(type)?choose('affixElement','詞綴屬性',[...all,...Object.entries(ELEMENTS)]):''}${type===13?choose('affixRace','詞綴種族',[...all,...Object.entries(RACES)]):''}${choose('affixOp','詞綴比較',[['gt','大於'],['gte','大於等於'],['eq','等於'],['lte','小於等於'],['lt','小於']])}${input('affixValue','詞綴數值')}</div>`;
  }
  function filterControls(){
    const all=[['all','全部']],fs=fields();
    return `<h2>裝備篩選</h2><div class="gear-basic-filters">${choose('job','職業',[...all,...CLASSES.map((c,i)=>[i,c.name])])}${choose('slot','部位',[...all,...['武器','護甲','副手','飾品'].map((s,i)=>[i,s])])}${choose('quality','品質',[...all,...AFFIX_RANK.map((q,i)=>[i,q])])}${choose('locked','鎖定',[...all,['yes','已鎖定'],['no','未鎖定']])}${choose('worn','穿戴',[...all,['yes','已裝備'],['no','未裝備']])}${input('tMin','T 級下限')}${input('tMax','T 級上限')}${input('levelMin','等級下限')}${input('levelMax','等級上限')}</div>
      <details class="gear-numeric-fold" ${advanced?'open':''} ontoggle="setGearInventoryAdvanced(this.open)"><summary>進階屬性篩選</summary><p class="small">依裝備自身總值（含詞綴與強化），不含角色或隊伍能力。</p><div class="gear-numeric-filters">${choose('stat','屬性',[['','不限制'],...fs.map(f=>[f.key,f.label])])}${choose('op','比較',[['gt','大於'],['gte','大於等於'],['eq','等於'],['lte','小於等於'],['lt','小於'],['range','區間（含上下限）']])}${input('value','數值／下限')}${filter.op==='range'?input('upper','數值上限'):''}</div>${affixControls()}</details>
      <div class="actions"><button onclick="clearGearInventoryFilters()">清除篩選</button><button class="primary" onclick="finishGearInventoryFilters()">完成</button></div>`;
  }
  globalThis.openGearInventoryFilters=function(){const modal=$('modal'),scroll=modal.scrollTop;modal.dataset.gearFilters='true';modal.innerHTML='<div class="gear-filter-dialog gear-management-controls">'+filterControls()+'</div>';if(!modal.open)modal.showModal();modal.scrollTop=scroll;return true;};
  globalThis.finishGearInventoryFilters=function(){delete $('modal').dataset.gearFilters;closeModal();render();};
  $('modal').addEventListener('close',()=>{if($('modal').dataset.gearFilters==='true'){delete $('modal').dataset.gearFilters;render();}});
  function sortControls(){return `<div class="gear-sort-controls"><label>排序<select aria-label="裝備排序" onchange="setGearInventorySort(this.value)">${[['acquired','取得時間'],['level','裝備等級'],['tier','T 級'],['quality','稀有度 → T 級'],...fields().filter(f=>commonSortFields.includes(f.key)).map(f=>[f.key,f.label]),['price','出售價格']].map(([key,label])=>`<option value="${key}" ${sort===key?'selected':''}>${esc(label)}</option>`).join('')}</select></label><button type="button" onclick="toggleGearInventoryDirection()" aria-label="切換裝備排序方向">${direction==='desc'?'高 → 低':'低 → 高'}</button></div>`;}
  function controls(){const active=JSON.stringify(filter)!==JSON.stringify(defaults());return `<div class="gear-management-toolbar"><button onclick="toggleGearInventoryMulti()" aria-pressed="${multi}">${multi?'結束多選':'多選裝備'}</button><button type="button" class="gear-filter-button" onclick="openGearInventoryFilters()">裝備篩選${active?' · 已套用':''}</button></div>`;}
  globalThis.setGearInventoryAdvanced=value=>{advanced=!!value;};
  function item(row){
    const g=row.g,worn=gearWearer(g.id),can=actionable(g),stats=Object.entries(row.stats).filter(([key,n])=>['atk','def','hp','speed'].includes(key)&&n).map(([key,n])=>({atk:'攻',def:'防',hp:'生命',speed:'速度'}[key])+' '+n).join(' · ');
    return `<article class="gear-management-row" data-gear-id="${g.id}">${multi?`<label class="gear-selection"><input type="checkbox" aria-label="選取 ${esc(equipmentDisplayName(g))}" ${selected.has(g.id)?'checked':''} ${can?'':'disabled'} onchange="toggleGearInventorySelected('${g.id}',this.checked)"></label>`:''}<div class="gear-management-item">${gearSlotHTML(g,{selected:g.id===inventorySelectedGearId,className:'inventory-list-item',onclick:`selectInventoryGear('${g.id}')`})}<div class="gear-management-meta"><span class="effect-quality-${gearQualityRank(g)}">${esc(AFFIX_RANK[gearQualityRank(g)])}</span> · LV ${gearRequiredLevel(g)} · ${esc(gearWearableJobsText(g))}${worn?' · '+esc(characterName(worn))+'已裝備':''}<br>${esc(stats||'無面板屬性')}</div></div><button class="gear-lock" onclick="toggleGearLock('${g.id}')" aria-pressed="${!!g.locked}" aria-label="${g.locked?'解除鎖定':'鎖定'} ${esc(equipmentDisplayName(g))}">${g.locked?'已鎖定':'鎖定'}</button></article>`;
  }
  function quote(items,mode){
    if(mode==='sell'){const gold=items.reduce((n,g)=>n+equipmentSellPrice(g),0);return {count:items.length,gold,text:'保證獲得 '+gold.toLocaleString()+' 金幣'};}
    const totals=new Map();for(const g of items)for(const p of salvageRewardPlan(g,true)){const key=p.type+'/'+(p.key??'');if(!totals.has(key))totals.set(key,{...p,quantity:0});totals.get(key).quantity+=p.quantity;}
    const names={ore:'鍛鐵',dust:'粉塵',potion:'治療藥水'};
    const rewards=[...totals.values()].filter(p=>p.quantity>0),text=rewards.map(p=>{const name=names[p.type]||(p.type==='gem'?(p.key==='random'?'隨機種類寶石':GEMS[Number(p.key)]?.name||'寶石'):p.type==='item'?SHOP.find(i=>i.id===p.key)?.name||p.key:p.key);return name+' ×'+p.quantity+(p.type==='gem'&&p.key==='random'?'（總數保證，種類隨機）':'（保證）');}).join('、');
    return {count:items.length,rewards,text:text||'無材料產出'};
  }
  function makeReview(mode){const items=visibleSelection(mode),q=quote(items,mode);return {mode,ids:items.map(g=>g.id),quote:q,signature:JSON.stringify([items.map(g=>g.id),q])};}
  globalThis.requestGearInventoryBatch=function(mode){
    if(!['sell','salvage'].includes(mode)||!multi)return false;
    review=makeReview(mode);if(!review.ids.length){toast('沒有可操作的選取裝備');return false;}
    const verb=mode==='sell'?'出售':'分解';$('modal').innerHTML=`<h2>確認批次${verb}</h2><p>實際${verb} ${review.quote.count} 件裝備</p><p>${esc(review.quote.text)}</p><p class="small">鎖定、已裝備、隊伍配置使用中與待確認洗鍊的裝備會保留。</p><div class="actions"><button class="danger" onclick="confirmGearInventoryBatch()">確認${verb}</button><button onclick="closeModal()">取消</button></div>`;$('modal').showModal();return true;
  };
  globalThis.confirmGearInventoryBatch=function(){
    if(!review)return false;const old=review,next=makeReview(old.mode);
    if(next.signature!==old.signature){if(!next.ids.length){review=null;closeModal();render();toast('裝備狀態已變更，沒有可操作裝備');return false;}requestGearInventoryBatch(old.mode);toast('裝備或產出已變更，請確認更新後的明細');return false;}
    const ok=T().dispose(next.ids,next.mode,true,{batch:true,reviewed:true});
    if(ok){selected.clear();review=null;closeModal();render();}return ok;
  };
  sortedFilteredGear=()=>rows().map(r=>r.g);
  inlineInventoryView=function(){
    const list=rows(),visible=new Set(list.map(r=>r.g.id));selected=new Set([...selected].filter(id=>visible.has(id)&&actionable(findGear(id))));
    if(!visible.has(inventorySelectedGearId))inventorySelectedGearId=list[0]?.g.id??null;
    const current=list.find(r=>r.g.id===inventorySelectedGearId)?.g;
    return `<section class="panel compact-inventory-panel gear-management-panel"><div class="gear-management-top">${resourceLine()}${controls()}</div>${state.bag.length>=RULES.bagCapacity?'<p class="gear-overflow-note" role="status">背包已滿，後續掉落的裝備會自動分解。</p>':''}<div class="inventory-master-detail"><section class="inventory-master-pane"><div class="inventory-master-heading"><b>裝備列表</b>${sortControls()}<span>顯示 ${list.length} 件</span></div><div class="inline-equipment-list inventory-list-scroll">${list.map(item).join('')||'<p class="empty">沒有符合條件的裝備。</p>'}</div>${multi?`<div class="gear-batch-controls"><b>已選 ${selected.size} 件</b><button onclick="selectVisibleGear()">全選目前結果</button><button onclick="clearSelectedGear()">清除選取</button><button onclick="requestGearInventoryBatch('sell')" ${selected.size?'':'disabled'}>批次出售</button><button onclick="requestGearInventoryBatch('salvage')" ${selected.size?'':'disabled'}>批次分解</button></div>`:''}</section><section class="inventory-detail-wrap">${inventoryGearDetail(current)}</section></div></section>`;
  };
  let wearTarget=null;
  globalThis.openInventoryWear=function(id){
    const g=findGear(id),h=party?.members[0];if(!g||!h||EmberwildTokens.isToken(g))return false;
    wearTarget={owner:party,id};const positions=gearEquipPositions(g),position=positions.find(p=>h.equipped[p]===id)??positions.find(p=>!h.equipped[p])??positions[0];
    wornSlotSelection={key:memberKey(h),position};pageHeroSelection.set('worn',memberKey(h));closeModal();setTab('worn');return true;
  };
  globalThis.openWornWearHelp=function(){
    const modal=$('modal');
    modal.innerHTML=`<h2>穿戴流程說明</h2><ol class="inventory-wear-help-steps"><li>先點選要穿戴的部位，再從右側背包選擇裝備；也可以在背包詳情按「穿戴」直接帶入。</li><li>裝備必須符合角色職業與等級；飾品有兩個欄位，請選擇要使用的欄位。</li><li>換裝時先查看能力、詞綴比較，再按「確認穿戴」；原本是空欄位時會直接穿戴。</li><li>若裝備附帶技能，請前往「技能」頁啟用該裝備技能，並配置到對應的主動、觸發或輔助槽。</li><li>已穿戴裝備下方的「詳情」可查看完整能力，「鑲嵌」可管理寶石，「強化／洗鍊」可前往強化頁。</li></ol><div class="actions"><button type="button" onclick="closeModal()">關閉說明</button></div>`;
    if(!modal.open)modal.showModal();return true;
  };
  const wornBase=wornEquipmentView;
  wornEquipmentView=function(){
    const h=party.members[0],g=wearTarget?.owner===party?findGear(wearTarget.id):null,sk=g&&globalThis.__EMBERWILD_SKILLS?.byId(g.skillId),wearer=g&&gearWearer(g.id),valid=g&&eligibleWearers(g).includes(h)&&!inlineAffixDrafts.has(affixDraftKey(g));
    const selected=g?`<div class="inventory-wear-target"><b>準備穿戴：${equipmentNameHTML(g)}</b>${wearer?'<p>目前由 '+esc(characterName(wearer))+' 穿戴。</p>':!valid?'<p>此裝備不符合目前職業、等級或有待確認詞綴。</p>':gearEquipPositions(g).map(p=>`<button type="button" onclick="previewEquip('${g.id}',${memberKey(h)},${p})">穿戴至${esc(EQUIP_POSITION_NAMES[p])}</button>`).join('')}</div>`:'';
    const guide=`<div class="inventory-wear-toolbar"><button type="button" class="inventory-wear-help" aria-label="穿戴流程說明" title="穿戴流程說明" onclick="openWornWearHelp()">?</button></div>${selected}<div class="inventory-wear-skill-link"><button type="button" onclick="setTab('skills')">${sk?'啟用與配置「'+esc(sk.name)+'」':'前往技能配置'}</button></div>`;
    return guide+wornBase();
  };
  const reset=resetSession;resetSession=function(){const out=reset();wearTarget=null;filter=defaults();sort='quality';direction='desc';multi=false;folds.filters=false;folds.sort=false;advanced=false;selected.clear();review=null;return out;};
  const validate=validateParty;validateParty=data=>validate(EmberwildGearInventory.prepareSave(data));
  // The canonical addGear overflow path salvages excess drops; a full bag does not halt exploration.
  globalThis.__EMBERWILD_GEAR_INVENTORY={rows,filters:()=>({...filter}),sort:()=>({key:sort,direction}),selection:()=>[...selected],actionable,quote,review:()=>review,limits:inputLimits,folds:()=>({...folds})};
})();

