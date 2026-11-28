/* Cosmetic member portraits. All artwork comes from this trusted SVG catalog. */
(()=>{
  'use strict';
  const svg=body=>`<svg viewBox="0 0 64 64" width="64" height="64" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="32" cy="32" r="29" fill="currentColor" fill-opacity=".08" stroke-opacity=".35"/>${body}</svg>`;
  const catalog=Object.freeze([
    Object.freeze({id:'guardian',name:'守衛',art:svg('<path d="M20 28c0-10 5-16 12-16s12 6 12 16v17L32 53 20 45Z" fill="currentColor" fill-opacity=".14"/><path d="M18 29h28M32 14v17M25 35h4m6 0h4M32 36v10M24 20l-5-4m21 4 5-4"/>')}),
    Object.freeze({id:'mage',name:'秘法師',art:svg('<path d="m19 29 8-17 9 6 7 13M15 32c10-5 24-5 34 0-10 4-24 4-34 0Z" fill="currentColor" fill-opacity=".14"/><path d="M22 35v5a10 10 0 0 0 20 0v-5M19 51c7-5 19-5 26 0M31 23h4m-2-2v4M25 40h2m10 0h2"/>')}),
    Object.freeze({id:'ranger',name:'遊俠',art:svg('<path d="M15 43c1-17 9-29 17-29s16 12 17 29l-9 9H24Z" fill="currentColor" fill-opacity=".14"/><path d="M23 29c5-3 13-3 18 0l-2 12-7 6-7-6ZM27 34h2m6 0h2M42 15c8 0 10-5 10-5 0 10-4 17-12 17m2-5 6-8M18 49l-4 5m32-5 4 5"/>')}),
    Object.freeze({id:'healer',name:'療癒者',art:svg('<ellipse cx="32" cy="14" rx="13" ry="4"/><path d="M22 29c0-7 4-11 10-11s10 4 10 11v9a10 10 0 0 1-20 0ZM17 52c2-8 8-12 15-12s13 4 15 12" fill="currentColor" fill-opacity=".12"/><path d="M27 29h2m6 0h2M29 36h6M29 47h6m-3-3v7"/>')}),
    Object.freeze({id:'wanderer',name:'旅人',art:svg('<path d="m19 24 7-10h12l7 10M13 27c12-4 26-4 38 0M23 29v10a9 9 0 0 0 18 0V29M18 51c5-7 23-7 28 0M27 34h2m6 0h2"/><circle cx="44" cy="46" r="9" fill="var(--panel,#192327)"/><path d="m41 49 1-5 5-1-1 5Z" fill="currentColor" fill-opacity=".3"/>')}),
    Object.freeze({id:'phoenix',name:'鳳凰',art:svg('<path d="M31 25c-3-6-1-11 5-15l-1 10 7-3-4 11M29 30 13 19l5 16-8-2 15 13M36 30l15-11-5 16 8-2-15 13M26 36l6 8 6-8M25 46l-2 9 9-6 9 6-2-9" fill="currentColor" fill-opacity=".14"/><path d="m27 30 5 5 5-5m-9-5 3 1m5-1-3 1"/>')})
  ]);
  const byId=new Map(catalog.map(x=>[x.id,x]));
  const defaults=['guardian','mage','ranger','healer'];
  const resolved=h=>byId.get(h?.avatarId)||byId.get(defaults[h?.job]||'wanderer');
  let picker=null;

  function control(h){
    const key=memberKey(h);if(!Number.isInteger(key))return '';
    const choice=resolved(h),label=`${characterName(h)}的代表圖示：${choice.name}；點選更換`;
    return `<button type="button" class="character-avatar-control avatar-${choice.id}" data-avatar-owner="${key}" data-avatar-id="${choice.id}" onclick="showCharacterAvatarPicker(${key})" aria-label="${esc(label)}" title="${esc(label)}">${choice.art}</button>`;
  }

  function restorePickerFocus(){
    if(!picker)return;
    const previous=picker;picker=null;const modal=$('modal');
    modal.classList.remove('character-avatar-dialog');
    if(previous.label===null)modal.removeAttribute('aria-labelledby');else modal.setAttribute('aria-labelledby',previous.label);
    requestAnimationFrame(function focusTrigger(){
      if(modal.open)return;
      // The pointer guard may still have a redraw queued after the dialog closes.
      // Restore focus only after that redraw has replaced the original trigger.
      if(globalThis.isEmberwildUIInteracting?.()){requestAnimationFrame(focusTrigger);return;}
      document.querySelector(`[data-avatar-owner="${previous.key}"]`)?.focus({preventScroll:true});
    });
  }

  globalThis.showCharacterAvatarPicker=function(key){
    key=Number(key);const h=partyMember(key);if(!h)return false;
    const modal=$('modal'),current=resolved(h);
    picker={key,label:picker?picker.label:modal.getAttribute('aria-labelledby')};
    modal.classList.add('character-avatar-dialog');modal.dataset.view='character-avatar';
    modal.setAttribute('aria-labelledby','character-avatar-title');
    modal.innerHTML=`<h2 id="character-avatar-title">${esc(characterName(h))} · 角色代表圖示</h2><p class="small">選擇喜歡的代表圖示，會跟著這位角色保存。</p><div class="character-avatar-options" aria-label="角色代表圖示選項">${catalog.map(choice=>`<button type="button" class="character-avatar-option avatar-${choice.id}" data-avatar-choice="${choice.id}" aria-pressed="${current.id===choice.id}" onclick="setCharacterAvatar(${key},'${choice.id}')">${choice.art}<span>${choice.name}</span>${current.id===choice.id?'<small>目前使用</small>':'<small>選擇圖示</small>'}</button>`).join('')}</div><div class="actions"><button type="button" onclick="setCharacterAvatar(${key},'')">使用職業預設圖示</button><button type="button" onclick="closeModal()">取消</button></div>`;
    if(!modal.open)modal.showModal();
    modal.querySelector('[aria-pressed="true"]')?.focus();return true;
  };

  globalThis.setCharacterAvatar=function(key,id){
    const h=partyMember(Number(key));if(!h||id!==''&&!byId.has(id))return false;
    const existed=Object.prototype.hasOwnProperty.call(h,'avatarId'),previous=h.avatarId;
    if(id==='')delete h.avatarId;else h.avatarId=id;
    try{
      if(save()===false)throw Error(saveFailureText());
    }catch(e){
      if(existed)h.avatarId=previous;else delete h.avatarId;
      toast('圖示未保存：'+e.message);return false;
    }
    closeModal();render();return true;
  };
  $('modal').addEventListener('close',restorePickerFocus);

  const rosterBase=rosterView;
  rosterView=function(){
    return rosterBase().replace(/(<article\b[^>]*\bdata-member-key="(\d+)"[^>]*>[\s\S]*?<div class="[^"]*\bmember-identity\b[^"]*">)/g,(html,prefix,key)=>prefix+control(partyMember(Number(key))));
  };
  const battleBase=battleView;
  battleView=function(){
    return battleBase().replace(/(<article\b[^>]*\bdata-combat-id="([^"]+)"[^>]*>[\s\S]*?<div class="[^"]*\bunit-title\b[^"]*">)/g,(html,prefix,id)=>{
      const h=party?.members.find(x=>heroKey(x)===id);return h?prefix+control(h):prefix;
    });
  };
  globalThis.EmberwildAvatars=Object.freeze({catalog,ids:Object.freeze(catalog.map(x=>x.id)),resolvedId:h=>resolved(h).id,control,isKnownId:id=>typeof id==='string'&&byId.has(id)});
  if(party)render();
})();
