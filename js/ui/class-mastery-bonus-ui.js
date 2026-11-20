/* v0.179: 角色能力 page, 「精通加成」 panel. The main class mastery (the class being played) and one sub-class mastery give
   HP / attack / defense per level; the sub-class is chosen here and can be changed at any time. Every class row shows
   what one level gives and what it leans on. Weapon and element masteries are listed with the damage they add. */
(()=>{
  'use strict';
  const STATS=[['hp','生命'],['atk','攻擊'],['def','防禦']];
  const num=v=>Math.round(v*100)/100;
  const statText=b=>STATS.filter(([k])=>b[k]>0).map(([k,n])=>n+' +'+num(b[k])).join('、')||'無';
  // What a class leans on: its stat furthest above the average of all classes (balanced when none stands out).
  function emphasis(rows,j){
    const avg=k=>rows.reduce((n,r)=>n+(Number(r?.[k])||0),0)/Math.max(1,rows.length);
    let best=null,ratio=0;for(const [k,n] of STATS){const a=avg(k),r=a>0?(Number(rows[j]?.[k])||0)/a:0;if(r>ratio){ratio=r;best=n;}}
    return ratio>=1.3?'偏重'+best:'均衡';
  }
  function panelHTML(){
    const h=playerHero();if(!h||h.companionId!==undefined)return '';
    const rows=GAMEPLAY_SETTINGS.skills?.mastery?.classBonus||[],M=__EMBERWILD_MASTERY,perm=globalThis.__EMBERWILD_TEAMS?.build?.()?.permanent;
    const sources=classMasterySources(h),main=sources.find(s=>s.role==='main'),sub=sources.find(s=>s.role==='sub');
    const trained=CLASSES.map((c,j)=>({j,name:c.name,on:!!perm?.classes?.[j]?.activated,level:M.masteryLevelFromXp(perm?.classes?.[j]?.xp||0)}));
    const options=trained.filter(t=>t.j!==h.job&&t.on);
    const line=(s,label)=>`<li><b>${label}：${esc(CLASSES[s.job].name)}精通 Lv${s.level}</b><span>每級 ${esc(statText(s.perLevel))}，目前 ${esc(statText({hp:s.perLevel.hp*s.level,atk:s.perLevel.atk*s.level,def:s.perLevel.def*s.level}))}</span></li>`;
    const select=`<label class="mastery-sub-select">副職業精通 <select aria-label="副職業精通" onchange="setMasterySubClass(this.value===''?null:Number(this.value))"><option value="" ${sub?'':'selected'}>不啟用</option>${options.map(t=>`<option value="${t.j}" ${sub?.job===t.j?'selected':''}>${esc(t.name)}精通 Lv${t.level}</option>`).join('')}</select></label>`;
    const table=`<table class="mastery-class-table"><thead><tr><th>職業精通</th><th>每級生命</th><th>每級攻擊</th><th>每級防禦</th><th>特色</th><th>目前</th></tr></thead><tbody>${trained.map(t=>`<tr${t.j===h.job?' class="mastery-main-row"':sub?.job===t.j?' class="mastery-sub-row"':''}><td>${esc(t.name)}${t.on?' Lv'+t.level:'（未修練）'}</td>${STATS.map(([k])=>`<td>+${num(Number(rows[t.j]?.[k])||0)}</td>`).join('')}<td>${emphasis(rows,t.j)}</td><td>${t.j===h.job?'主職業':sub?.job===t.j?'副職業':'—'}</td></tr>`).join('')}</tbody></table>`;
    const dmg=(globalThis.__EMBERWILD_MASTERY_DAMAGE?.summary(h)||[]).map(r=>{const n=M.masteryLabels[r.key]||r.key;return `<li><b>${esc(n)}精通 Lv${r.level}</b><span>${r.kind==='weapon'?`使用${esc(n)}時傷害 +${Math.round(r.bonus*100)}%${r.active?'':'（目前未持有）'}`:`${esc(n)}屬性法術傷害 +${Math.round(r.bonus*100)}%`}</span></li>`;}).join('');
    return `<section class="panel class-mastery-bonus-panel" aria-label="精通加成"><h2>精通加成</h2>
      <p class="small">職業精通提供生命、攻擊與防禦：主職業（目前職業）自動套用，另可選一個已修練的職業作為副職業，兩者同時生效。副職業可隨時切換，立即生效。</p>
      <ul class="mastery-bonus-lines">${line(main,'主職業')}${sub?line(sub,'副職業'):''}</ul>${select}
      <p class="mastery-bonus-total">職業精通合計：${esc(statText(classMasteryBonus(h)))}</p>${table}
      <h3>武器與元素精通</h3><p class="small">武器精通：每級 +1% 使用該武器時的傷害。元素精通：每級 +1% 同屬性法術的傷害（普攻不算法術）。</p>
      <ul class="mastery-bonus-lines">${dmg||'<li><span>尚未修練武器或元素精通。</span></li>'}</ul></section>`;
  }
  const base=characterView;
  characterView=function(){const html=base();const h=playerHero(),plan=globalThis.__EMBERWILD_TEAMS?.plan?.();if(!h||plan?.job===null)return html;return html+panelHTML();};
  globalThis.__EMBERWILD_CLASS_MASTERY_BONUS_UI={panelHTML,emphasis};
})();
