/* Save slots are selected before boot; switching slots reloads the complete hydration chain. */
(function(){
  let titleOpen=true,choosingCharacter=false,pendingCreation=null,approvedCreation=null,pendingDelete=null;
  globalThis.isEmberwildTitleOpen=()=>titleOpen;
  let lastPlayTick=Date.now(),wasVisible=document.visibilityState!=='hidden',allowTitleSave=false;
  const gameRender=render,gameStart=start,gameSave=save,gameNewGame=newGame,gameAcceptImport=acceptImport;

  const playTimeKey=slot=>environmentStorageKey('emberwild-play-time-v1-slot-'+slot);
  function cachedPlayTime(slot){
    try{const value=Number(localStorage.getItem(playTimeKey(slot)));return Number.isSafeInteger(value)&&value>=0?value:0;}
    catch{return 0;}
  }

  function slotSnapshot(slot){
    try{return {primary:localStorage.getItem(saveKeyForSlot(slot)),backup:localStorage.getItem(backupKeyForSlot(slot))};}
    catch(e){console.warn('無法檢查本地存檔',e);return null;}
  }
  function tryLateHydrateActiveSave(){
    if(state&&party)return true;
    const raw=globalThis.__EMBERWILD_BOOT_SAVE_RAW;
    if(!raw)return false;
    try{
      loadParty(JSON.parse(raw));
      globalThis.__EMBERWILD_BOOT_SAVE_ERROR=null;
      delete globalThis.__EMBERWILD_DEFERRED_CUSTOM_FORM_SAVE;
      if(state&&party)party.playTimeMs=Math.max(party.playTimeMs||0,cachedPlayTime(ACTIVE_SAVE_SLOT));
      return !!(state&&party);
    }catch(e){
      globalThis.__EMBERWILD_BOOT_SAVE_ERROR=String(e?.message||e);
      console.warn('完整模組載入後仍無法讀取存檔',e);
      state=null;party=null;
      return false;
    }
  }
  window.importTestJSONFromTitle=async function(ev){
    if(!await importBalanceJSON(ev))return;
    if(!state&&globalThis.__EMBERWILD_BOOT_SAVE_RAW){
      if(tryLateHydrateActiveSave()){
        render();toast('測試設定已套用，存檔可點選繼續遊玩');
      }else toast('測試設定已套用，但存檔仍無法載入：'+globalThis.__EMBERWILD_BOOT_SAVE_ERROR);
    }
  };
  function hasSave(snapshot){return snapshot.primary!==null||snapshot.backup!==null;}
  function slotInfo(snapshot,slot){
    if(!snapshot||!hasSave(snapshot))return null;
    if(slot===ACTIVE_SAVE_SLOT&&state&&party)return party;
    for(const raw of [snapshot.primary,snapshot.backup]){
      if(raw===null)continue;
      try{
        const data=JSON.parse(raw),members=data?.version===3?data.members:[1,2].includes(data?.version)?[data]:null;
        if(Array.isArray(members)&&members.length>=1&&members.length<=65&&members.every(h=>Number.isInteger(h?.job)&&CLASSES[h.job]&&Number.isInteger(h.lv)&&h.lv>=1))return {members,playTimeMs:Math.max(Number.isSafeInteger(data.playTimeMs)?data.playTimeMs:0,cachedPlayTime(slot))};
      }catch{}
    }
    return null;
  }
  function playTimeText(ms){
    const minutes=Math.floor((Number.isSafeInteger(ms)&&ms>0?ms:0)/60000);
    return minutes<1?'未滿 1 分鐘':minutes<60?minutes+' 分鐘':Math.floor(minutes/60)+' 小時 '+minutes%60+' 分鐘';
  }
  function slotRow(slot){
    const snapshot=slotSnapshot(slot),info=slotInfo(snapshot,slot),occupied=snapshot&&hasSave(snapshot);
    const members=info?.members?.map(h=>esc((typeof h.name==='string'&&h.name.trim()?h.name.trim():CLASSES[h.job].name).slice(0,20))+' LV'+h.lv).join('、');
    const details=!snapshot?'無法檢查本地存檔':!occupied?'空欄位 · 點選建立角色':info?`隊伍等級：${members}<br>遊玩總時間：${playTimeText(info.playTimeMs)}`:'存檔資料無法判讀 · 點選查看備份方式';
    return `<div class="save-slot"><button class="save-slot-select" onclick="selectSaveSlot(${slot})" ${snapshot?'':'disabled'}><strong>存檔欄位 ${slot}</strong><span>${details}</span></button><button class="danger save-slot-delete" onclick="requestDeleteSlot(${slot})" ${occupied?'':'disabled'} aria-label="刪除存檔欄位 ${slot}">刪除存檔</button></div>`;
  }
  function titleView(){
    const previewBuild=/(?:^|\/)preview(?:\/|$)/.test(location.pathname)||!!document.getElementById('preview-build-banner');
    const missingTestForm=previewBuild&&!state&&String(globalThis.__EMBERWILD_BOOT_SAVE_ERROR||'').startsWith('裝備類型無效：');
    const testImport=missingTestForm?`<div class="title-actions"><button type="button" onclick="document.getElementById('title-test-json-import')?.click()">匯入測試 JSON</button><input id="title-test-json-import" type="file" accept=".json,application/json" onchange="importTestJSONFromTitle(event)" hidden></div><p class="small">只套用測試設定，不會匯入角色存檔。</p>${missingTestForm?'<p class="small">目前存檔使用測試 JSON 中的自訂裝備類型。請先匯入建立該存檔時使用的測試 JSON；原存檔仍保留，不會被覆寫。</p>':''}`:'';
    $('wallet').textContent='';
    $('app').innerHTML=`<section class="title-screen"><div class="title-screen-card"><span class="eyebrow">${esc(resolveUIText(UI_TEXT.gameSubtitle))}</span><h1>${esc(resolveUIText(UI_TEXT.gameTitle))}</h1><div class="save-slots">${[1,2,3].map(slotRow).join('')}</div><p class="small">${IS_PREVIEW?'預覽版首次複製既有存檔，之後獨立保存；正式版進度保留。':'舊存檔保留在欄位 1。遊玩時間從本次更新後開始累計。'}</p>${testImport}</div></section>`;
    applyUITextDOM();
  }
  render=function(){
    if(titleOpen)return titleView();
    if(state)choosingCharacter=false;
    gameRender();
    if(choosingCharacter&&!state){
      const start=$('app').querySelector('.start');
      if(start)start.insertAdjacentHTML('afterbegin','<button class="title-back" onclick="backToTitle()">返回標題</button>');
    }
  };
  function tallyPlayTime(){
    const now=Date.now();
    if(wasVisible&&!titleOpen&&!choosingCharacter&&state&&party){
      const old=Number.isSafeInteger(party.playTimeMs)&&party.playTimeMs>=0?party.playTimeMs:0;
      party.playTimeMs=Math.min(Number.MAX_SAFE_INTEGER,old+Math.max(0,now-lastPlayTick));
    }
    lastPlayTick=now;
  }
  save=function(show=false){
    if(globalThis.__EMBERWILD_BALANCE_SOURCE&&!globalThis.__EMBERWILD_BALANCE_READY)return true;
    if(titleOpen&&!allowTitleSave){if(show)toast('請先選擇存檔欄位');return;}
    tallyPlayTime();
    const result=gameSave(show);
    if(result===true&&party){try{localStorage.setItem(playTimeKey(ACTIVE_SAVE_SLOT),String(party.playTimeMs||0));}catch{}}
    return result;
  };
  newGame=function(){try{localStorage.removeItem(playTimeKey(ACTIVE_SAVE_SLOT));}catch{}return gameNewGame();};
  acceptImport=function(){allowTitleSave=true;try{return gameAcceptImport();}finally{allowTitleSave=false;}};
  document.addEventListener('visibilitychange',()=>{
    tallyPlayTime();wasVisible=document.visibilityState!=='hidden';
    if(!wasVisible&&!titleOpen&&state&&party)save();
  });
  function showCharacterSelection(snapshot){
    pendingCreation=null;closeModal();titleOpen=false;choosingCharacter=true;approvedCreation=snapshot;
    lastPlayTick=Date.now();render();
  }
  start=function(job){
    if(!Number.isInteger(job)||!CLASSES[job])return;
    if(choosingCharacter&&!state){
      const current=slotSnapshot(ACTIVE_SAVE_SLOT);
      if(!current){toast('無法確認本地存檔，已取消建立角色');return;}
      if(!approvedCreation||current.primary!==approvedCreation.primary||current.backup!==approvedCreation.backup){
        choosingCharacter=false;approvedCreation=null;titleOpen=true;
        render();openCharacterCreation();return;
      }
      approvedCreation=null;newGame();lastPlayTick=Date.now();
    }
    return gameStart(job);
  };
  window.continueFromTitle=function(){
    if(!state||!party)return showLoadFailure(ACTIVE_SAVE_SLOT);
    lastPlayTick=Date.now();titleOpen=false;render();
  };
  window.selectSaveSlot=function(slot){
    if(![1,2,3].includes(slot))return;
    const snapshot=slotSnapshot(slot);
    if(!snapshot)return toast('無法檢查本地存檔');
    const action=hasSave(snapshot)?'open':'create';
    if(slot===ACTIVE_SAVE_SLOT){
      if(action==='open')return (state&&party)||tryLateHydrateActiveSave()?continueFromTitle():showLoadFailure(slot);
      return openCharacterCreation();
    }
    try{
      sessionStorage.setItem(SAVE_SLOT_SESSION_KEY,String(slot));
      sessionStorage.setItem(SAVE_SLOT_INTENT_KEY,action+':'+slot);
      location.reload();
    }catch(e){console.warn('無法切換存檔欄位',e);toast('無法切換存檔欄位');}
  };
  window.openCharacterCreation=function(){
    const snapshot=slotSnapshot(ACTIVE_SAVE_SLOT);
    if(!snapshot){toast('無法確認本地存檔，請檢查瀏覽器儲存權限');return;}
    if(!hasSave(snapshot))return showCharacterSelection(snapshot);
    pendingCreation=snapshot;
    $('modal').innerHTML=`<h2>欄位 ${ACTIVE_SAVE_SLOT} 已有本地存檔</h2><p>即使目前無法正確解析，建立新角色仍會覆寫這份進度。建議先下載原始存檔。</p><div class="actions">${rawDownloadButtons(ACTIVE_SAVE_SLOT,snapshot)}<button class="danger" onclick="confirmTitleCreation()">仍要創建角色</button><button onclick="closeModal()">取消</button></div>`;
    $('modal').showModal();
  };
  window.confirmTitleCreation=function(){
    if(!pendingCreation)return;
    const current=slotSnapshot(ACTIVE_SAVE_SLOT);
    if(!current){toast('無法確認本地存檔，已取消建立角色');return;}
    if(current.primary!==pendingCreation.primary||current.backup!==pendingCreation.backup){closeModal();pendingCreation=null;openCharacterCreation();return;}
    showCharacterSelection(current);
  };
  function rawDownloadButtons(slot,snapshot){
    return ['primary','backup'].filter(which=>snapshot[which]!==null).map(which=>{
      let validJSON=false;try{JSON.parse(snapshot[which]);validJSON=true;}catch{}
      return `<button onclick="downloadRawLocalSave('${which}',${slot})">${validJSON?'匯出':'下載'}${which==='primary'?'主':'備份'}存檔${validJSON?' JSON':'原始文字'}</button>`;
    }).join('');
  }
  window.downloadRawLocalSave=function(which,slot=ACTIVE_SAVE_SLOT){
    if(![1,2,3].includes(slot)||!['primary','backup'].includes(which))return;
    const snapshot=slotSnapshot(slot),raw=snapshot?.[which];
    if(raw===null||raw===undefined){toast('這份本地存檔已不存在');return;}
    let validJSON=false;try{JSON.parse(raw);validJSON=true;}catch{}
    const link=document.createElement('a');
    link.href=URL.createObjectURL(new Blob([raw],{type:validJSON?'application/json':'text/plain;charset=utf-8'}));
    link.download=`dreaming-abyss-slot-${slot}-${which}-raw-${new Date().toISOString().slice(0,10)}.${validJSON?'json':'txt'}`;
    link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  };
  function showLoadFailure(slot){
    const snapshot=slotSnapshot(slot),reason=globalThis.__EMBERWILD_BOOT_SAVE_ERROR;
    const previewBuild=/(?:^|\/)preview(?:\/|$)/.test(location.pathname)||!!document.getElementById('preview-build-banner');
    const missingTestForm=previewBuild&&String(reason||'').startsWith('裝備類型無效：');
    const help=missingTestForm?'這份存檔使用目前尚未載入的測試裝備類型。原始存檔仍保留，請先匯入建立這份存檔時使用的測試 JSON；匯入成功後會自動重新讀取。':'原始資料仍保留在瀏覽器。若能匯出 JSON，可以先下載備份，再從 JSON 匯入重試。若資料不是合法 JSON，請下載原始文字留存；它無法直接匯入。';
    const retry=missingTestForm?'<button class="primary" onclick="closeModal();document.getElementById(\'title-test-json-import\')?.click()">匯入測試 JSON 後重試</button>':'<button class="primary" onclick="retryImportFromTitle()">匯入存檔 JSON 重試</button>';
    $('modal').innerHTML=`<h2>欄位 ${slot} 存檔讀取失敗</h2><p>${help}</p>${reason?`<p class="small">讀取錯誤：${esc(reason)}</p>`:''}<div class="actions">${snapshot?rawDownloadButtons(slot,snapshot):''}${retry}${snapshot&&hasSave(snapshot)?'<button onclick="closeModal();openCharacterCreation()">在此欄新建角色</button>':''}<button onclick="closeModal()">關閉</button></div>`;
    $('modal').showModal();
  }
  window.retryImportFromTitle=function(){closeModal();document.querySelector('header input[type="file"]')?.click();};
  window.backToTitle=function(){
    if(state)return;
    choosingCharacter=false;approvedCreation=null;titleOpen=true;render();
  };
  window.returnToTitle=function(){
    if(!state||!party)return;
    running=false;save();
    titleOpen=true;render();
  };
  window.requestDeleteSlot=function(slot){
    if(![1,2,3].includes(slot))return;
    const snapshot=slotSnapshot(slot);
    if(!snapshot||!hasSave(snapshot))return;
    pendingDelete={slot,snapshot};
    $('modal').innerHTML=`<h2>刪除存檔欄位 ${slot}？</h2><p>此操作會刪除該欄位的主存檔、備份存檔及戰鬥統計。建議先匯出備份。</p><div class="actions">${rawDownloadButtons(slot,snapshot)}<button class="danger" onclick="confirmDeleteSlotStep()">繼續刪除</button><button onclick="closeModal()">取消</button></div>`;
    $('modal').showModal();
  };
  window.confirmDeleteSlotStep=function(){
    if(!pendingDelete)return;
    const slot=pendingDelete.slot;
    $('modal').innerHTML=`<h2>再次確認：永久刪除欄位 ${slot}</h2><p>刪除後無法從此瀏覽器復原。確定要刪除嗎？</p><div class="actions"><button class="danger" onclick="deleteSaveSlot()">確認永久刪除</button><button onclick="closeModal()">取消</button></div>`;
  };
  window.deleteSaveSlot=function(){
    if(!pendingDelete)return;
    const {slot,snapshot}=pendingDelete,current=slotSnapshot(slot);
    if(!current||current.primary!==snapshot.primary||current.backup!==snapshot.backup){
      pendingDelete=null;closeModal();toast('存檔已變動，請重新確認刪除');render();return;
    }
    try{
      if(slot===ACTIVE_SAVE_SLOT){newGame();globalThis.__EMBERWILD_BOOT_SAVE_RAW=null;}
      else{localStorage.removeItem(saveKeyForSlot(slot));localStorage.removeItem(backupKeyForSlot(slot));localStorage.removeItem(battleStatsKeyForSlot(slot));localStorage.removeItem(playTimeKey(slot));}
    }catch(e){console.warn('刪除存檔失敗',e);toast('刪除失敗，請檢查瀏覽器儲存權限');return;}
    pendingDelete=null;closeModal();render();toast('欄位 '+slot+' 已刪除');
  };

  if(state&&party)party.playTimeMs=Math.max(party.playTimeMs||0,cachedPlayTime(ACTIVE_SAVE_SLOT));
  let intent=null;
  try{intent=sessionStorage.getItem(SAVE_SLOT_INTENT_KEY);sessionStorage.removeItem(SAVE_SLOT_INTENT_KEY);}catch{}
  render();
  const finishTitleBoot=()=>{
    if(intent==='open:'+ACTIVE_SAVE_SLOT){
      if((state&&party)||tryLateHydrateActiveSave())continueFromTitle();
      else showLoadFailure(ACTIVE_SAVE_SLOT);
    }else if(intent==='create:'+ACTIVE_SAVE_SLOT)openCharacterCreation();
    $('app').style.visibility='';
  };
  // Never try to resume a published save while the loader is still installing validators.
  if(globalThis.__EMBERWILD_BALANCE_SOURCE&&!globalThis.__EMBERWILD_BALANCE_READY)
    window.addEventListener('emberwild-balance-ready',finishTitleBoot,{once:true});
  else if(document.readyState==='loading')window.addEventListener('DOMContentLoaded',finishTitleBoot,{once:true});
  else setTimeout(finishTitleBoot,0);
})();
