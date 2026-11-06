/* Browser-wide appearance preference, independent of character and balance data. */
(()=>{
  const storageKey='emberwild-ui-theme';
  const themes=[
    {id:'ember',name:'餘燼夜色',description:'墨紫底色・暖金點綴'},
    {id:'forest',name:'苔林暮色',description:'深綠底色・苔青點綴'},
    {id:'paper',name:'晨霧紙頁',description:'暖白底色・墨綠點綴'}
  ];
  const valid=id=>themes.some(theme=>theme.id===id);
  let selected='ember';
  try{const saved=localStorage.getItem(storageKey);if(valid(saved))selected=saved;}catch{}
  document.documentElement.dataset.uiTheme=selected;
  function refreshChoices(){
    document.querySelectorAll('[data-theme-choice]').forEach(button=>{
      const active=button.dataset.themeChoice===selected;
      button.setAttribute('aria-pressed',String(active));
      button.querySelector('.theme-choice-state').textContent=active?'使用中':'選擇配色';
    });
  }
  globalThis.setUITheme=function(id){
    if(!valid(id))return false;
    selected=id;document.documentElement.dataset.uiTheme=id;
    refreshChoices();
    try{localStorage.setItem(storageKey,id);}catch{globalThis.toast?.('配色已套用，但瀏覽器無法保存，下次開啟需重新選擇。');}
    return true;
  };
  globalThis.uiThemeOptionsView=function(){
    return `<section class="panel theme-options"><h2>網站配色</h2><p class="small">立即套用整體配色，並記住此瀏覽器的選擇。</p><div class="theme-choices" role="group" aria-label="網站配色">${themes.map(theme=>`<button type="button" class="theme-choice" data-theme-choice="${theme.id}" aria-pressed="${selected===theme.id}" onclick="setUITheme('${theme.id}')"><span class="theme-preview" aria-hidden="true"><i></i><i></i><i></i><i></i></span><strong>${theme.name}</strong><span class="theme-choice-description">${theme.description}</span><span class="theme-choice-state">${selected===theme.id?'使用中':'選擇配色'}</span></button>`).join('')}</div></section>`;
  };
  addEventListener('storage',event=>{
    if(event.key!==storageKey&&event.key!==null)return;
    selected=valid(event.newValue)?event.newValue:'ember';
    document.documentElement.dataset.uiTheme=selected;refreshChoices();
  });
})();
