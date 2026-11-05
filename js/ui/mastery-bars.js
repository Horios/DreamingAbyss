/* v0.083 mastery bars: an icon and a fill bar per mastery, colored by element; warrior masteries (class and weapons)
   are always gray and archer masteries always cyan. Used by the 目前精通等級 panel and the exploration header. */
(()=>{
 'use strict';
 const GRAY='#9aa3a8',CYAN='#3fc9d4';
 const ELEMENT={fire:'#e0603f',ice:'#5fa8e8',wind:'#5cc47a',light:'#e6c25a',shadow:'#9a6fe0'};
 const KEY={sword:[GRAY,'sword'],axe:[GRAY,'axe'],hammer:[GRAY,'hammer'],bow:[CYAN,'bow-arrow'],crossbow:[CYAN,'crosshair'],
  fire:[ELEMENT.fire,'flame'],ice:[ELEMENT.ice,'snowflake'],wind:[ELEMENT.wind,'wind'],light:[ELEMENT.light,'sun'],shadow:[ELEMENT.shadow,'moon']};
 // Class masteries: warrior gray, mage arcane violet, archer cyan, priest light.
 const CLASS=[[GRAY,'shield'],['#a07ce8','wand-sparkles'],[CYAN,'bow-arrow'],[ELEMENT.light,'cross']];
 const icon=glyph=>globalThis.__EMBERWILD_SKILL_ICONS?.svgFor('lucide:'+glyph,[],{size:18})||'';
 const style=key=>key.startsWith('class:')?CLASS[Number(key.slice(6))]||[GRAY,'shield']:KEY[key]||[GRAY,'target'];
 function bar(key,{label,level,current=0,next=0,xp=0,inactive=false,compact=false,note=''}={}){
  const [color,glyph]=style(key),pct=next?Math.max(0,Math.min(100,current/next*100)):100,text=inactive?'尚未使用':next?`${current} / ${next}`:'MAX';
  return `<div class="mastery-bar${compact?' compact':''}${inactive?' inactive':''}" style="--mastery-color:${color}" data-mastery-key="${key}" title="${label} · Lv${level} · ${inactive?'尚未使用':(next?`${current} / ${next} EXP`:'已達上限')} · 累積 ${xp}">`+
   `<span class="mastery-bar-icon" aria-hidden="true">${icon(glyph)}</span><span class="mastery-bar-body"><span class="mastery-bar-head"><b>${label}</b><span>Lv${level}</span></span>`+
   `<span class="mastery-bar-track" role="progressbar" aria-label="${label}精通進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span class="mastery-bar-fill" style="width:${pct}%"></span></span>`+
   `${compact?'':`<small>${text}${inactive?'':' EXP · 累積 '+xp}${note?' · '+note:''}</small>`}</span>${compact?`<small class="mastery-bar-value">${text}</small>`:''}</div>`;
 }
 // The protagonist's current class mastery, for the exploration header next to the experience bar.
 function current(h){
  const T=globalThis.__EMBERWILD_TEAMS,M=globalThis.__EMBERWILD_MASTERY;if(!h||!T?.build?.()||!M?.masteryProgress||!Number.isInteger(h.job))return '';
  const v=T.build().permanent.classes?.[h.job],p=M.masteryProgress(v?.xp||0);
  return bar('class:'+h.job,{label:(CLASSES[h.job]?.name||'')+'精通',level:p.level,current:p.current,next:p.next,xp:p.xp,compact:true});
 }
 globalThis.EmberwildMasteryBars={bar,current,CLASS,KEY};
})();
