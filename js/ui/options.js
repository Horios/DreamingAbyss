/* Account actions live in Options.
   Options are grouped into 一般 (appearance), 存檔 (save, export, import, title) and 其他 (codes, test data). */
(function(){
  globalThis.isEmberwildPreview=function(){return /(?:^|\/)preview(?:\/|$)/.test(location.pathname)||!!document.getElementById('preview-build-banner');};
  const tabs=[['general','一般'],['save','存檔'],['other','其他']];
  let current='general';
  globalThis.setOptionsTab=function(id){if(!tabs.some(([key])=>key===id))return false;current=id;render();return true;};
  const row=(title,text,action)=>`<section class="panel option-row"><div><h2>${title}</h2><p class="small">${text}</p></div>${action}</section>`;
  function general(){return `${globalThis.uiThemeOptionsView?.()||''}${globalThis.itemDisplayOptionsView?.()||''}${globalThis.numberReminderOptionsView?.()||''}${globalThis.battleEffectsOptionsView?.()||''}`;}
  function saves(){
    return row('儲存','立即儲存目前進度到這個存檔欄位。','<button onclick="save(true)">儲存</button>')
      +row('匯出存檔 JSON','下載目前進度的 JSON 備份檔。','<button onclick="exportSave()">匯出存檔 JSON</button>')
      +row('匯入存檔','從 JSON 備份檔讀入進度；目前進度會被取代，建議先匯出備份。','<label class="button">匯入存檔<input id="options-save-import" type="file" accept=".json,application/json" onchange="importSave(event)" hidden></label>')
      +row('返回標題','儲存目前進度、暫停探索，返回存檔選擇畫面。','<button onclick="returnToTitle()">返回標題</button>');
  }
  function other(){
    // Balance JSON imports belong to the balance designer's developer mode, not to player settings.
    return row('兌換碼','輸入兌換碼並領取獎勵。','<button onclick="showTestCodes()">兌換碼</button>');
  }
  globalThis.optionsView=function(){
    const body={general,save:saves,other}[current]();
    return heading('OPTIONS / 選項','選項')+`<div class="options-tabs" role="tablist" aria-label="設定分類">${tabs.map(([key,label])=>`<button type="button" role="tab" data-options-tab="${key}" aria-selected="${key===current}" class="${key===current?'primary':''}" onclick="setOptionsTab('${key}')">${label}</button>`).join('')}</div><div class="options-list" role="tabpanel" data-options-panel="${current}">${body}</div>`;
  };
})();
