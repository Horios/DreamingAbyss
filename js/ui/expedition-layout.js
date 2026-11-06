
/* Update 29: keep the expedition battlefield geometry stable while effects/status change. */
(function installExpeditionLayoutStabilityFix(){
  const style=document.createElement('style');
  style.textContent=`
  /* The exploration control belongs to the battle grid, not to main's vertical flex stack. */
  .text-battle-layout{flex:1 1 0!important;min-height:0!important;height:auto!important;overflow:hidden!important;grid-template-columns:minmax(0,1.78fr) minmax(250px,.72fr)!important;grid-template-rows:minmax(0,1fr)!important;gap:8px!important}
  .text-battle-layout>.party-combat{grid-column:1!important;grid-row:1!important;min-height:0!important;height:100%!important}
  .text-battle-layout>.expedition-control-card{grid-column:2!important;grid-row:1!important;align-self:stretch!important;height:100%!important;max-height:none!important;min-height:0!important;overflow:auto!important;margin:0!important}
  /* Effects never change the battlefield's allocated height. Full details open in the modal. */
  .battle-buffs.battle-effects-bar{flex:0 0 36px!important;height:36px!important;min-height:36px!important;max-height:36px!important;padding:5px 7px!important;margin:0!important;display:flex!important;align-items:center!important;overflow:hidden!important}
  .battle-effects-bar .effects-bar-inner{display:flex;align-items:center;gap:8px;width:100%;min-width:0}
  .battle-effects-bar .effects-bar-inner>b{font-size:11px;white-space:nowrap}
  .battle-effects-bar .effects-summary{font-size:10px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}
  .battle-effects-bar button{height:24px!important;min-height:24px!important;width:auto!important;padding:2px 7px!important;font-size:10px!important;flex:0 0 auto!important}
  .effects-modal-table{width:100%;border-collapse:collapse;font-size:12px}
  .effects-modal-table th,.effects-modal-table td{padding:5px 7px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
  .effects-modal-scroll{max-height:55vh;overflow:auto;margin:8px 0}
  @media(max-width:1100px){
    .text-battle-layout{grid-template-columns:minmax(0,1fr)!important;grid-template-rows:minmax(220px,1fr) minmax(180px,230px)!important;overflow:hidden!important}
    .text-battle-layout>.party-combat{grid-column:1!important;grid-row:1!important}
    .text-battle-layout>.expedition-control-card{grid-column:1!important;grid-row:2!important;height:100%!important;max-height:none!important}
  }
  `;
  document.head.appendChild(style);

  const rowsHtml=()=>typeof battleBuffRows==='function'?battleBuffRows():'';
  function effectCount(){
    const rows=rowsHtml();
    if(!rows||rows.includes('no-buffs'))return 0;
    return (rows.match(/<tr>/g)||[]).length;
  }
  function effectSummaryText(){
    const count=effectCount();
    if(!count)return '目前沒有 BUFF／DEBUFF 或消耗品效果';
    return `${count} 項效果作用中 · 點「查看」檢視剩餘時間與能力變化`;
  }
  globalThis.showBattleEffects=function(){
    if(!party)return;
    const modal=$('modal');
    modal.innerHTML=`<h2>生效效果與持續時間</h2><p class="small">此視窗只顯示狀態，不會改變主戰場尺寸。</p><div class="effects-modal-scroll"><table class="effects-modal-table"><thead><tr><th>對象</th><th>效果</th><th>能力變化</th><th>持續時間</th><th>計時方式</th></tr></thead><tbody id="battle-effect-modal-rows">${rowsHtml()}</tbody></table></div><button onclick="closeModal()">關閉</button>`;
    modal.showModal();
  };
  if(typeof battleBuffPanel==='function'){
    battleBuffPanel=function(){
      return `<section class="panel battle-buffs battle-effects-bar"><div class="effects-bar-inner"><b>生效效果</b><span id="battle-effect-summary" class="effects-summary">${effectSummaryText()}</span><button onclick="showBattleEffects()" title="查看目前 BUFF、DEBUFF、護盾與消耗品效果">查看</button></div></section>`;
    };
  }
  refreshBattleBuffTimers=function(){
    if(!party)return;
    const summary=$('battle-effect-summary');if(summary)summary.textContent=effectSummaryText();
    const body=$('battle-effect-modal-rows');if(body&&!globalThis.isEmberwildUIInteracting?.()){const next=rowsHtml();if(body.innerHTML!==next)body.innerHTML=next;}
    refreshSupplyStatus();
  };

  /* The previous compacting pass generated the control card as a main-level sibling.
     Move that exact card into .text-battle-layout so its height can no longer resize the whole page. */
  if(typeof battleView==='function'){
    const stableBattleViewBase=battleView;
    battleView=function(){
      let html=stableBattleViewBase();
      const match=html.match(/<section class="panel battle-map-column expedition-control-card">[\s\S]*?<\/section>/);
      if(match){
        html=html.replace(match[0],'');
        const open='<div class="text-battle-layout">';
        if(html.includes(open))html=html.replace(open,open+match[0]);
      }
      return html;
    };
  }
  if(typeof render==='function'&&typeof party!=='undefined'&&party)render();
})();
