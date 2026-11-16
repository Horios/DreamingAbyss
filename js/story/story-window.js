/* Shared story window: a floating dialog over the game area, used by the prologue and by ordinary quest dialogue.
   It only presents a view handed to it (title, one line of text, optional interaction body, actions) and owns the text
   presentation: grapheme-by-grapheme reveal, follow-scroll, show-all, text speed, fast-forward and the skip confirmation.
   What "continue" and "skip" do is decided by the caller through the function names in the view. */
(()=>{
 'use strict';
 const SPEEDS={slow:60,normal:30,fast:15,instant:0},LABELS={slow:'慢速',normal:'標準',fast:'快速',instant:'即時'},STORAGE='emberwild-story-text-speed';
 let speed='normal';try{const saved=localStorage.getItem(STORAGE);if(Object.hasOwn(SPEEDS,saved))speed=saved;}catch{}
 let view=null,signature='',typing=null,fast=false,fastTimer=null,confirming=false,follow=true,latest=null;
 const reduced=()=>!!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
 const graphemes=text=>{try{return [...new Intl.Segmenter('zh-Hant',{granularity:'grapheme'}).segment(text)].map(x=>x.segment);}catch{return Array.from(text);}};
 function layer(){let el=document.getElementById('prologue-layer');if(!el){el=document.createElement('div');el.id='prologue-layer';el.className='story-window-layer';el.hidden=true;document.body.appendChild(el);}return el;}
 // The mask covers the game content area only (below the header), not the whole browser window.
 function place(){
  const el=layer(),app=document.getElementById('app'),box=app?.getBoundingClientRect?.();if(!box||!el.style)return;
  const visible=globalThis.visualViewport,height=visible?Math.min(box.bottom,visible.offsetTop+visible.height)-box.top:box.height;
  el.style.top=box.top+'px';el.style.left=box.left+'px';el.style.width=box.width+'px';el.style.height=Math.max(160,height)+'px';
 }
 function stopTyping(){if(typing){clearTimeout(typing.timer);typing=null;}}
 function stopFast(){clearTimeout(fastTimer);fastTimer=null;}
 function textNode(){return layer().querySelector?.('[data-story-text]')||null;}
 function scroller(){return layer().querySelector?.('[data-story-scroll]')||null;}
 function finishTyping(){
  const node=textNode();stopTyping();
  if(node){node.querySelectorAll('.story-char:not(.on)').forEach(c=>c.classList.add('on','now'));node.dataset.typed='done';}
  syncControls();scheduleFast();
 }
 const charBottom=(box,char)=>char.getBoundingClientRect().bottom-box.getBoundingClientRect().top+box.scrollTop;
 function keepInView(char){
  const box=scroller();latest=char;if(!box||!follow||!char)return;
  const bottom=charBottom(box,char)-box.clientHeight+24;
  if(bottom>box.scrollTop)box.scrollTo({top:bottom,behavior:reduced()?'auto':'smooth'});
 }
 function startTyping(){
  stopTyping();const node=textNode();if(!node)return scheduleFast();
  const chars=[...node.querySelectorAll('.story-char')],delay=fast?0:SPEEDS[speed];
  if(!chars.length||delay===0)return finishTyping();
  node.dataset.typed='running';let i=0;const run={timer:null};typing=run;
  const step=()=>{
   if(typing!==run)return;const c=chars[i++];c.classList.add('on');keepInView(c);
   if(i>=chars.length){typing=null;node.dataset.typed='done';syncControls();return scheduleFast();}
   // A short breath after sentence punctuation, none after ordinary characters.
   run.timer=setTimeout(step,delay*(/[。！？…!?]/.test(c.textContent)?5:/[，、；：,;:]/.test(c.textContent)?2.5:1));
  };
  step();
 }
 function scheduleFast(){
  stopFast();if(!fast||!view)return;
  // Fast-forward only walks plain lines; anything that needs the player stops it.
  if(!view.line||!view.advance){fast=false;return syncControls();}
  const current=signature,hold=Math.max(800,Math.min(4000,graphemes(view.line.text).length*45));
  fastTimer=setTimeout(()=>{if(fast&&signature===current&&!typing)call(view.advance);},hold);
 }
 const call=name=>{const fn=globalThis[name];if(typeof fn==='function')return fn();};
 function syncControls(){
  const el=layer();if(!el.querySelector)return;
  const all=el.querySelector('[data-story-all]'),fastButton=el.querySelector('[data-story-fast]');
  if(all)all.disabled=!typing;
  if(fastButton){fastButton.setAttribute('aria-pressed',String(fast));fastButton.textContent=fast?'停止加速':'加速';}
 }
 function controlsHTML(){
  const v=view,line=!!v.line;
  const skip=v.skip?(confirming?`<span class="story-window-confirm" role="alertdialog" aria-label="確認跳過劇情"><span>跳過這段劇情？</span><button type="button" class="danger" data-story-skip-confirm onclick="storyWindowSkip(true)">確定跳過</button><button type="button" onclick="storyWindowSkip(false)">取消</button></span>`:`<button type="button" data-story-skip onclick="storyWindowSkip()">跳過劇情</button>`):'';
  const tools=line?`<button type="button" data-story-all onclick="storyWindowShowAll()">顯示全部</button><button type="button" data-story-fast aria-pressed="${fast}" onclick="storyWindowToggleFast()">${fast?'停止加速':'加速'}</button><label class="story-window-speed"><span>文字速度</span><select data-story-speed aria-label="文字速度" onchange="storyWindowSpeed(this.value)">${Object.keys(SPEEDS).map(k=>`<option value="${k}" ${k===speed?'selected':''}>${LABELS[k]}</option>`).join('')}</select></label>`:'';
  const next=v.advance?`<button type="button" class="primary" data-story-continue onclick="storyWindowContinue()">${esc(v.continueLabel||'繼續')}</button>`:'';
  return `<div class="story-window-tools">${tools}${skip}</div><div class="story-window-actions actions">${v.actions||''}${next}</div>`;
 }
 function html(){
  const v=view,l=v.line;
  const text=l?`<div class="prologue-box prologue-${esc(l.kind)}" data-line="${esc(v.lineKey||'')}">${l.speaker?`<b class="prologue-speaker">${esc(l.speaker)}</b>`:''}<p class="${l.kind==='narrator'?'prologue-narration':'prologue-text'} story-typed" data-story-text aria-label="${esc(l.text)}" onclick="storyWindowShowAll()">${graphemes(l.text).map(c=>`<span class="story-char" aria-hidden="true">${esc(c)}</span>`).join('')}</p></div>`:'';
  return `<div class="story-window-mask" aria-hidden="true"></div><section class="story-window prologue-scene" role="dialog" aria-modal="true" aria-label="${esc(v.head?.title||'劇情')}" ${v.attrs||''}>${v.decor||''}<div class="story-window-head prologue-head"><span class="eyebrow">${esc(v.head?.eyebrow||'')}</span><h1>${esc(v.head?.title||'')}</h1></div><div class="story-window-body" data-story-scroll>${v.before||''}${text}${v.body||''}</div><div class="story-window-controls">${controlsHTML()}</div></section>`;
 }
 function render(next){
  const el=layer();
  if(!next){if(signature!==''||!el.hidden){stopTyping();stopFast();el.innerHTML='';el.hidden=true;signature='';view=null;confirming=false;document.body.classList.remove('prologue-open','story-window-open');}return;}
  place();
  // Rebuild only when the view changes: the game's periodic render must not restart the text or clear what was typed.
  if(next.signature===signature){view=next;return;}
  stopTyping();stopFast();view=next;signature=next.signature;confirming=false;follow=true;
  el.innerHTML=html();el.hidden=false;document.body.classList.add('prologue-open','story-window-open');
  // The whole line is laid out from the start, so "the bottom" is the newest revealed character. Following pauses only
  // when the reader scrolls (wheel, touch, keys, scrollbar) to where that character is out of view, and resumes when it is back.
  const box=scroller();latest=null;if(box){box.scrollTop=0;const reader=()=>{if(!latest){follow=true;return;}const bottom=charBottom(box,latest);follow=bottom<=box.scrollTop+box.clientHeight+12;/* Scrolled past the newest text into the part not shown yet: come back to it. */if(follow&&bottom-(latest.offsetHeight||24)<box.scrollTop+4)box.scrollTo({top:Math.max(0,bottom-box.clientHeight+24),behavior:'auto'});};for(const type of ['wheel','touchmove','keydown','pointerdown'])box.addEventListener(type,()=>{/* The reader takes over: stop following and cut short any smooth scroll still under way. */if(follow){follow=false;box.scrollTo({top:box.scrollTop,behavior:'auto'});}clearTimeout(box.__reader);box.__reader=setTimeout(reader,220);},{passive:true});}
  if(next.focus)el.querySelector?.(next.focus)?.focus?.();
  startTyping();
 }
 globalThis.storyWindowContinue=function(){if(!view?.advance)return;if(typing)return finishTyping();stopFast();return call(view.advance);};
 globalThis.storyWindowShowAll=function(){if(typing)finishTyping();};
 globalThis.storyWindowToggleFast=function(){if(!view)return;fast=!fast;if(fast){if(typing)finishTyping();else scheduleFast();}else stopFast();syncControls();};
 globalThis.storyWindowSpeed=function(value){if(!Object.hasOwn(SPEEDS,value))return false;speed=value;try{localStorage.setItem(STORAGE,value);}catch{toast('文字速度已套用，但瀏覽器無法保存設定。');}for(const s of document.querySelectorAll?.('[data-story-speed]')||[])s.value=value;if(value==='instant'&&typing)finishTyping();return true;};
 // Skipping is refused here as well as hidden in the controls: a view without a skip handler cannot be skipped by any route.
 globalThis.storyWindowSkip=function(answer){
  if(!view?.skip)return false;
  if(answer===undefined){confirming=true;}else if(answer===false){confirming=false;}else{confirming=false;fast=false;stopFast();return call(view.skip);}
  const bar=layer().querySelector?.('.story-window-controls');if(bar){bar.innerHTML=controlsHTML();syncControls();}return true;
 };
 globalThis.storyTextOptionsView=()=>`<section class="panel option-row"><div><h2>劇情文字速度</h2><p class="small">劇情對話逐字顯示的速度；「即時」不使用逐字效果。劇情視窗中也可以調整。</p></div><select data-story-speed aria-label="劇情文字速度" onchange="storyWindowSpeed(this.value)">${Object.keys(SPEEDS).map(k=>`<option value="${k}" ${k===speed?'selected':''}>${LABELS[k]}</option>`).join('')}</select></section>`;
 globalThis.addEventListener?.('resize',()=>{if(view)place();});
 globalThis.visualViewport?.addEventListener?.('resize',()=>{if(view){place();const active=document.activeElement;if(active&&layer().contains?.(active))active.scrollIntoView?.({block:'center'});}});
 globalThis.addEventListener?.('keydown',e=>{if(!view||e.defaultPrevented)return;if(e.key==='Escape'){e.preventDefault();return;}if((e.key==='Enter'||e.key===' ')&&view.advance&&!/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName||'')){e.preventDefault();storyWindowContinue();}});
 globalThis.EmberwildStoryWindow={render,hide:()=>render(null),get open(){return !!view;},get typing(){return !!typing;},get fast(){return fast;},get speed(){return speed;},speeds:{...SPEEDS},finish:finishTyping};
})();
