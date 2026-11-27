/* v0.172 skill extraction: a skill gear item (gear with a skillId, e.g. the forest monsters' exclusive gear) and a companion
   token are combined. The gear disappears and its skill moves onto the token; the token's name gets a prefix taken from the
   gear (凝膠／狼牙／纏藤). A companion wearing the token can use the skill whatever its class; cooldown and MP cost are the
   skill's own. A token can be extracted onto again: the newer skill replaces the older one.
   Two confirmations come first: the gear will disappear, and (when the token already has a skill) that skill is replaced.
   The removal goes through the shared gear disposal (team references, current-battle protection, rollback on a failed save). */
(()=>{
  'use strict';
  const S=()=>globalThis.__EMBERWILD_SKILLS,isToken=g=>!!g&&EmberwildTokens.isToken(g);
  function gearSkill(g){if(!g||isToken(g)||!g.skillId)return null;const sk=S()?.byId(g.skillId);return sk&&!sk.disabled&&sk.sources.some(s=>s.type==='equipment')?sk:null;}
  // The prefix is the first two characters of the gear form's name (凝膠護符 → 凝膠).
  function prefixFor(g){const name=String((typeof itemForm==='function'&&itemForm(g)?.name)||g.name||'').trim();return name.slice(0,2);}
  function candidates(){return (state?.bag||[]).filter(g=>gearSkill(g));}
  const kindLabel=sk=>({active:'主動',proc:'觸發',support:'主動',passive:'被動'}[sk.type]||sk.type);
  function extract(gearId,tokenId){
    const g=findGear(gearId),t=findGear(tokenId),sk=gearSkill(g);
    if(!sk){toast('這件裝備沒有可萃取的技能');return false;}
    if(!isToken(t)){toast('請選擇夥伴信物');return false;}
    if(!confirm(`萃取後「${equipmentDisplayName(g)}」會消失，技能「${sk.name}」會轉移到信物「${equipmentDisplayName(t)}」。\n確定萃取？`))return false;
    const old=t.extractedSkillId&&S().byId(t.extractedSkillId);
    if(t.extractedSkillId&&!confirm(`信物「${equipmentDisplayName(t)}」已有技能「${old?.name||t.extractedSkillId}」，萃取後會被「${sk.name}」覆蓋。\n確定繼續？`))return false;
    const before={id:t.extractedSkillId,prefix:t.extractedPrefix},prefix=prefixFor(g);
    const ok=globalThis.__EMBERWILD_DISPOSE_GEAR([gearId],'extract',false,{reviewed:true,message:`已萃取：「${sk.name}」轉移到 ${prefix} ${t.snapshot.name}`,apply:()=>{t.extractedSkillId=sk.id;t.extractedPrefix=prefix;}});
    if(!ok){if(before.id===undefined){delete t.extractedSkillId;delete t.extractedPrefix;}else{t.extractedSkillId=before.id;t.extractedPrefix=before.prefix;}return false;}
    globalThis.__EMBERWILD_SKILL_REFRESH?.();closeModal();render();return true;
  }
  globalThis.extractSkillToToken=extract;
  globalThis.openSkillExtraction=function(tokenId){
    const t=findGear(tokenId);if(!isToken(t))return false;
    const rows=candidates(),current=t.extractedSkillId&&S().byId(t.extractedSkillId),modal=$('modal');
    modal.innerHTML=`<h2>技能萃取</h2><p class="small">選擇一件技能裝備，把它的技能轉移到「${esc(equipmentDisplayName(t))}」。萃取後裝備會消失；夥伴穿戴這件信物即可使用該技能，不受職業限制，冷卻與 MP 消耗不變。</p>${current?`<p class="small">目前信物技能：${esc(current.name)}（萃取新技能會覆蓋）</p>`:''}<div class="skill-extraction-list">${rows.map(g=>{const sk=gearSkill(g);return `<article class="skill-extraction-row" data-extract-gear="${esc(g.id)}"><div><b>${equipmentNameHTML(g)}</b><p class="small">${esc(sk.name)}（${kindLabel(sk)}）· ${esc(sk.description||'')}</p></div><button type="button" onclick="extractSkillToToken('${esc(g.id)}','${esc(t.id)}')">萃取</button></article>`;}).join('')||'<p>背包裡沒有技能裝備。</p>'}</div><div class="actions"><button type="button" onclick="closeModal()">關閉</button></div>`;
    if(!modal.open)modal.showModal();return true;
  };
  /* v0.178: extraction was done on the forge page (裝備強化). Each companion token gets a row with its current skill and a
     button that opens the gear list above; the bag no longer has its own button. */
  function panelHTML(){
   const tokens=(state?.bag||[]).filter(isToken),gear=candidates().length;
   const rows=tokens.map(t=>{const sk=t.extractedSkillId&&S().byId(t.extractedSkillId),wearer=gearWearer(t.id);return `<article class="skill-extraction-row" data-extract-token="${esc(t.id)}"><div><b>${equipmentNameHTML(t)}</b><p class="small">${wearer?esc(characterName(wearer))+' 穿戴中 · ':''}${sk?'目前技能：'+esc(sk.name)+'（'+kindLabel(sk)+'）':'尚未萃取技能'}</p></div><button type="button" onclick="openSkillExtraction('${esc(t.id)}')" ${gear?'':'disabled'}>萃取技能</button></article>`;}).join('');
   return `<section class="panel forge-extraction" aria-label="技能萃取"><h2>技能萃取</h2><p class="small">把技能裝備的技能轉移到夥伴信物。萃取後裝備會消失；夥伴穿戴這件信物即可使用該技能，不受職業限制，冷卻與 MP 消耗不變。信物已有技能時，新的技能會覆蓋舊的。</p><p class="small">背包中的技能裝備：${gear} 件</p><div class="skill-extraction-list">${rows||'<p class="empty">尚未持有夥伴信物。</p>'}</div></section>`;
  }
  /* v0.194: the forge page became the equipment workshop (裝備工坊). Extraction is its 信物萃取 action: with a token on the
     bench the action lists the skill gear to extract from; with skill gear on the bench it lists the tokens to extract into. */
  function workshopHTML(item){
   const intro='<p class="small">把技能裝備的技能轉移到夥伴信物。萃取後裝備會消失；夥伴穿戴這件信物即可使用該技能，不受職業限制，冷卻與 MP 消耗不變。信物已有技能時，新的技能會覆蓋舊的。</p>';
   if(isToken(item)){
    const current=item.extractedSkillId&&S().byId(item.extractedSkillId),rows=candidates();
    const list=rows.map(g=>{const sk=gearSkill(g),wearer=gearWearer(g.id);return `<article class="skill-extraction-row" data-extract-gear="${esc(g.id)}"><div><b>${equipmentNameHTML(g)}</b><p class="small">${wearer?esc(characterName(wearer))+' 穿戴中 · ':''}技能：${esc(sk.name)}（${kindLabel(sk)}）</p></div><button type="button" onclick="extractSkillToToken('${esc(g.id)}','${esc(item.id)}')">萃取</button></article>`;}).join('');
    return `<section class="forge-extraction" aria-label="信物萃取"><h3>信物萃取</h3>${intro}<p class="small">目前信物技能：${current?esc(current.name)+'（'+kindLabel(current)+'）':'尚未萃取技能'}</p><div class="skill-extraction-list">${list||'<p class="empty">物品欄沒有可萃取技能的裝備。</p>'}</div></section>`;
   }
   const sk=gearSkill(item);if(!sk)return '';
   const tokens=(state?.bag||[]).filter(isToken);
   const list=tokens.map(t=>{const own=t.extractedSkillId&&S().byId(t.extractedSkillId),wearer=gearWearer(t.id);return `<article class="skill-extraction-row" data-extract-token="${esc(t.id)}"><div><b>${equipmentNameHTML(t)}</b><p class="small">${wearer?esc(characterName(wearer))+' 穿戴中 · ':''}${own?'目前技能：'+esc(own.name)+'（'+kindLabel(own)+'）':'尚未萃取技能'}</p></div><button type="button" onclick="extractSkillToToken('${esc(item.id)}','${esc(t.id)}')">萃取到此信物</button></article>`;}).join('');
   return `<section class="forge-extraction" aria-label="信物萃取"><h3>信物萃取</h3>${intro}<p class="small">這件裝備的技能：${esc(sk.name)}（${kindLabel(sk)}）</p><div class="skill-extraction-list">${list||'<p class="empty">尚未持有夥伴信物。</p>'}</div></section>`;
  }
  globalThis.__EMBERWILD_SKILL_EXTRACTION={gearSkill,prefixFor,candidates,extract,panelHTML,workshopHTML};
})();
