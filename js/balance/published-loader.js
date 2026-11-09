/* Fetch one branch-owned design document before loading any game module. */
(async()=>{
  const app=document.getElementById('app');
  const guard=document.createElement('style');guard.textContent='#app{visibility:hidden!important}header{pointer-events:none;opacity:.65}';document.head.appendChild(guard);
  const panel=document.createElement('section');panel.className='panel';panel.style.cssText='position:fixed;inset:90px 20px auto;max-width:620px;margin:auto;z-index:2147483646;padding:24px';
  panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
  panel.innerHTML='<h1>正在啟動夢淵…</h1><p data-boot-stage>正在取得版本與平衡資料</p><progress aria-label="遊戲載入進度" max="1" value="0" style="width:100%"></progress><p data-boot-count>請稍候，原有存檔保留。</p>';
  document.body.appendChild(panel);
  const stage=panel.querySelector('[data-boot-stage]'),count=panel.querySelector('[data-boot-count]'),progress=panel.querySelector('progress');
  const preloads=[],cancelPreloads=[],controllers=new Set();let downloaded=0,initialized=0,total=0,activeScript=null,scriptError=null,stopped=false;
  const deadline=Date.now()+90000,remaining=limit=>Math.max(1,Math.min(limit,deadline-Date.now()));
  const update=message=>{if(stopped)return;stage.textContent=message;progress.max=total||1;progress.value=initialized;count.textContent=total?'已下載 '+downloaded+'／'+total+' · 已初始化 '+initialized+'／'+total:'請稍候，原有存檔保留。';};
  const scriptFailure=event=>{if(activeScript&&event.filename===activeScript.src)scriptError=Error('遊戲模組執行失敗：'+(event.message||'未知錯誤'));};
  window.addEventListener('error',scriptFailure);
  async function readJSON(url,label,withText=false,optional=false){
    const controller=new AbortController();controllers.add(controller);
    const timeout=setTimeout(()=>controller.abort(),remaining(30000));
    try{const response=await fetch(url,{cache:'no-store',signal:controller.signal});if(optional&&response.status===404)return null;if(!response.ok)throw Error(label+'無法取得（HTTP '+response.status+'）');if(!withText)return await response.json();const text=await response.text();let value;try{value=JSON.parse(text);}catch{throw Error(label+'不是有效的 JSON');}return {text,value};}
    catch(error){if(controller.signal.aborted)throw Error(label+'載入逾時，請檢查連線後重試');throw error;}
    finally{clearTimeout(timeout);controllers.delete(controller);}
  }
  // Every module the manifest lists must be present in the integrated document, otherwise nothing starts.
  async function verifyModules(published,manifest){
    if(!manifest)return {state:'legacy',message:'此版本沒有模組清單，直接使用整合平衡資料'};
    const M=globalThis.EmberwildBalanceModules;if(!M)throw Error('平衡模組程式未載入');
    const problems=M.checkManifest(manifest);if(problems.length)throw Error('平衡模組清單無效：'+problems.join('；'));
    const {modules}=M.split(published.value),missing=manifest.modules.filter(row=>row.present&&modules[row.id]===undefined);
    if(missing.length)throw Error('平衡資料缺少必要模組：'+missing.map(row=>row.id+'（'+row.source+'）').join('、'));
    let state='verified',message='整合平衡資料與模組清單一致（資料修訂 '+manifest.dataRevision+'）';
    if(globalThis.crypto?.subtle){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(published.text)),hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
      // A legacy publisher writes only data/balance.json; the document itself is complete and validated below.
      if(hex!==manifest.integrated.sha256){state='integrated-newer';message='整合平衡資料比模組清單新（舊版發布器只更新了 data/balance.json），來源模組待同步';console.warn(message);}}
    else state='unverified-hash';
    return {state,message,dataRevision:manifest.dataRevision,modules:manifest.modules.map(row=>({id:row.id,version:row.version}))};
  }
  function preload(url,index){
    const link=document.createElement('link');link.rel='preload';link.as='script';link.href=url;preloads.push(link);
    const ready=new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>finish(Error('遊戲模組下載逾時（'+(index+1)+'／'+total+'）：'+new URL(url).pathname.split('/').pop())),remaining(30000));
      let settled=false;
      function finish(error){if(settled)return;settled=true;clearTimeout(timeout);link.onload=null;link.onerror=null;if(error)reject(error);else{downloaded++;update('正在下載與初始化遊戲');resolve();}}
      cancelPreloads.push(()=>finish(Error('載入已停止')));
      link.onload=()=>finish();link.onerror=()=>finish(Error('遊戲模組下載失敗（'+(index+1)+'／'+total+'）：'+new URL(url).pathname.split('/').pop()));
      document.head.appendChild(link);
    });
    // All downloads start now. Observe failures immediately, even while an earlier
    // module is executing; await each result in source order before inserting code.
    return ready.then(()=>({}),error=>({error}));
  }
  async function execute(url){
    await new Promise((resolve,reject)=>{
      const script=document.createElement('script');activeScript=script;scriptError=null;script.async=false;script.src=url;
      const timeout=setTimeout(()=>finish(Error('遊戲模組載入逾時：'+new URL(url).pathname.split('/').pop())),remaining(15000));
      let settled=false;
      function finish(error){if(settled)return;settled=true;clearTimeout(timeout);script.onload=null;script.onerror=null;activeScript=null;if(error){script.remove();reject(error);}else resolve();}
      script.onload=()=>finish(scriptError);script.onerror=()=>finish(Error('遊戲模組載入失敗：'+new URL(url).pathname.split('/').pop()));document.body.appendChild(script);
    });
  }
  try{
    const build=await readJSON('data/build.json?build='+Date.now(),'版本資訊'),runtimeVersion=build.commit==='development'?String(Date.now()):build.commit;
    // data/balance.json is generated from data/balance/<module>.json; the manifest lists the modules and the
    // integrated file's hash. A deployment without a manifest is a pre-module build and still loads.
    const [published,manifest]=await Promise.all([readJSON('data/balance.json?build='+runtimeVersion,'平衡資料',true),readJSON('data/balance/manifest.json?build='+runtimeVersion,'平衡模組清單',false,true)]);
    if(published.value.schema!=='emberwild-balance-v1'||published.value.schemaVersion!==1)throw Error('不支援的平衡資料版本');
    globalThis.__EMBERWILD_BALANCE_MODULES=await verifyModules(published,manifest);
    const issues=EmberwildBalanceDocument.inspect(published.value);if(issues.length)throw Error(issues.map(x=>x.field+'：'+x.reason).join('；'));
    globalThis.__EMBERWILD_PUBLISHED_BALANCE=published.value;
    const version=JSON.stringify(published.value);
    globalThis.__EMBERWILD_BALANCE_SOURCE=published.value;
    // An explicit preview import survives reload only while the published base is unchanged.
    const preview=/(?:^|\/)preview(?:\/|$)/.test(location.pathname);
    const key=preview?'emberwild-preview-balance-test-v1':'emberwild-balance-test-v1';
    if(preview){try{if(localStorage.getItem(key+'-published-base')===version){const raw=localStorage.getItem(key);if(raw)globalThis.__EMBERWILD_BALANCE_SOURCE=JSON.parse(raw);}}catch{}}
    if(!navigator.locks){throw Error('此瀏覽器不支援安全的多分頁存檔鎖，請使用支援 Web Locks 的瀏覽器');}
    update('正在取得存檔使用權；若另一分頁正在遊玩，請先關閉該分頁');
    let releaseOwnership;
    const ownership=new Promise(resolve=>{releaseOwnership=resolve;});
    await new Promise((resolve,reject)=>{
      navigator.locks.request('emberwild-game:'+(preview?'preview':'production'),async()=>{
        globalThis.__EMBERWILD_SAVE_OWNER=true;resolve();await ownership;
        globalThis.__EMBERWILD_SAVE_OWNER=false;
      }).catch(reject);
    });
    addEventListener('pagehide',()=>{globalThis.save?.();releaseOwnership();},{once:true});
    addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
    const urls=Array.from(document.querySelectorAll('script[data-balance-src]'),node=>{const url=new URL(node.getAttribute('data-balance-src'),location.href);url.searchParams.set('balance-build',runtimeVersion);return url.href;});
    // Every module below is followed by one full apply of the published document, so modules may
    // skip their own load-time re-apply (it only restored their layer for loader-less boots).
    globalThis.__EMBERWILD_BALANCE_FINAL_APPLY_PENDING=true;
    total=urls.length;update('正在下載遊戲');
    const downloads=urls.map(preload);
    for(let i=0;i<urls.length;i++){
      const result=await downloads[i];if(result.error)throw result.error;
      await execute(urls[i]);initialized++;update('正在初始化遊戲');
    }
    update('正在套用平衡資料與讀取存檔');
    try{applyBalanceConfig(globalThis.__EMBERWILD_BALANCE_SOURCE,{persist:false});}finally{globalThis.__EMBERWILD_BALANCE_FINAL_APPLY_PENDING=false;}
    // Only the fully installed validators can decide whether a save is unreadable.
    const playerBytes=globalThis.__EMBERWILD_TEAM_BOOT_RAW||globalThis.__EMBERWILD_BOOT_SAVE_RAW;
    const candidates=[];
    if(playerBytes)candidates.push({raw:playerBytes,label:'主要存檔'});
    try{
      const backup=localStorage.getItem(BACKUP_KEY);
      if(backup&&!candidates.some(x=>x.raw===backup))candidates.push({raw:backup,label:'備份存檔'});
    }catch(error){console.warn('讀取備份存檔失敗',error);}
    // Last resort only: tried after primary and backup, so existing recovery order is unchanged.
    try{
      const verified=localStorage.getItem(VERIFIED_KEY);
      if(verified&&!candidates.some(x=>x.raw===verified))candidates.push({raw:verified,label:'開機驗證存檔'});
    }catch(error){console.warn('讀取開機驗證存檔失敗',error);}
    let recoveredBackup=false,recoveredVerified=false,firstError=null;
    for(const candidate of candidates){
      try{
        const parsed=JSON.parse(candidate.raw);
        // World migration and split battle statistics were previously restored
        // by premature boot passes. Apply them here with all modules ready.
        loadParty(migrateWorldSave(parsed));
        if(!parsed.battleStatistics&&typeof normalizeBattleStatistics==='function'){
          try{
            const rawStats=typeof BATTLE_STATS_STORAGE_KEY!=='undefined'?localStorage.getItem(BATTLE_STATS_STORAGE_KEY):null;
            if(rawStats)party.battleStatistics=normalizeBattleStatistics(JSON.parse(rawStats));
          }catch(error){console.warn('舊版戰鬥統計補讀失敗',error);}
        }
        globalThis.__EMBERWILD_BOOT_SAVE_RAW=candidate.raw;
        globalThis.__EMBERWILD_BOOT_SAVE_ERROR=null;
        recoveredBackup=candidate.label==='備份存檔';
        recoveredVerified=candidate.label==='開機驗證存檔';
        // These bytes passed every installed validator; keep them as the cold-boot generation.
        if(!recoveredVerified){try{if(localStorage.getItem(VERIFIED_KEY)!==candidate.raw)localStorage.setItem(VERIFIED_KEY,candidate.raw);}catch(error){console.warn('無法保存開機驗證存檔，主要存檔與備份不受影響',error);}}
        if(recoveredBackup||recoveredVerified){
          // Keep this known-good backup until the next cold start validates
          // the newly written primary, not just through one autosave.
          globalThis.__EMBERWILD_RECOVERED_BACKUP_SESSION=true;
          if(playerBytes&&candidate.raw!==playerBytes)globalThis.__EMBERWILD_UNREADABLE_PRIMARY_RAW=playerBytes;
        }
        break;
      }catch(error){
        const reason=String(error?.message||error);
        if(!firstError)firstError=reason;
        party=null;state=null;running=false;
        console.warn(candidate.label+'載入失敗，原始存檔保留',error);
        // Preview saves using custom equipment forms require their original JSON;
        // silently falling back would hide the missing-design problem.
        if(candidate.label==='主要存檔'&&reason.startsWith('裝備類型無效：'))break;
      }
    }
    if(candidates.length&&!state){
      globalThis.__EMBERWILD_BOOT_SAVE_ERROR=firstError;
      if(typeof backToTitle==='function')backToTitle();else render();
      if(firstError)toast('存檔未能載入：'+firstError+'；可匯入備份。');
    }
    const importBase=importBalanceJSON;
    importBalanceJSON=async ev=>{const result=await importBase(ev);if(result){globalThis.__EMBERWILD_BALANCE_SOURCE=exportableBalance();if(preview)localStorage.setItem(key+'-published-base',version);}return result;};
    const resetBase=resetBalanceJSON;resetBalanceJSON=()=>{const result=resetBase();if(result!==false){globalThis.__EMBERWILD_BALANCE_SOURCE=published.value;localStorage.removeItem(key);localStorage.removeItem(key+'-published-base');toast('已恢復目前發布版本的平衡資料');}return result;};
    globalThis.__EMBERWILD_BALANCE_READY=true;
    if(recoveredBackup)toast('主要存檔無法載入，已讀取上一份備份；原始資料保留');
    else if(recoveredVerified)toast('主要存檔與備份都無法載入，已讀取上次成功開機時的存檔；原始資料保留');
    guard.remove();panel.remove();window.emberwildBootComplete=true;app.style.visibility='';window.dispatchEvent(new Event('emberwild-balance-ready'));
  }catch(e){
    if(typeof timer!=='undefined')clearInterval(timer);
    guard.remove();panel.remove();app.style.visibility='';app.textContent='';
    const errorPanel=document.createElement('section');errorPanel.className='panel';errorPanel.style.margin='32px';
    const heading=document.createElement('h1');heading.textContent='遊戲資料載入失敗';
    const detail=document.createElement('p');detail.textContent=e.message+'。原有存檔保留。';
    const retry=document.createElement('button');retry.textContent='重新載入';retry.onclick=()=>location.reload();
    errorPanel.append(heading,detail,retry);app.appendChild(errorPanel);
    globalThis.__EMBERWILD_BALANCE_LOAD_ERROR=e.message;
  }finally{
    stopped=true;window.removeEventListener('error',scriptFailure);for(const controller of controllers)controller.abort();for(const cancel of cancelPreloads)cancel();for(const link of preloads)link.remove();
  }
})();
