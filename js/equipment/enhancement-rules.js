/* v0.180 equipment enhancement rules (+1 to +12). One table holds, for each target level, the material cost, the success
   rate, what a failure does and the cumulative bonus to the item's BASE attack / HP / defense (random affixes, gems,
   skills and fixed effects are not enhanced).
     +1～+3   粉塵 ×2/4/6        100%
     +4       粉塵 ×8            90%   failure: back to +2
     +5～+6   鍛鐵 ×2/3          80/70% failure: back to +3 / +4
     +7～+8   鍛鐵 ×4/5          60/50% failure: back to +3
     +9       鍛鐵 ×6            40%   failure: back to +0
     +10      以太鍛鐵 ×1        30%   failure: back to +0
     +11～+12 以太鍛鐵 ×2/3       20/10% failure: the item is destroyed (also when worn or a story item)
   Bonus: +1 5%, +2 10%, +3 15%, +4 22%, +5 30%, +6 40%, +7 55%, +8 75%, +9 100%, +10 130%, +11 160%, +12 190%.
   Cost by item level: the listed materials × ceil(裝等 / 5): 裝等 1～5 ×1, 6～10 ×2, 11～15 ×3, and so on.
   Accessories (both 飾品 slots) cannot be enhanced. Companion tokens keep their own enhancement (companion-tokens.js).
   An attempt that can destroy the item asks for confirmation first. Materials are spent on every attempt. */
(()=>{
  'use strict';
  /* The table lives in the balance data: balanceSettings.equipment.enhance.levels (one row per target level: cost
     {dust, ore, ether}, successRate, failure none/drop/destroy, failureLevel for drop, baseBonus), costLevelStep (5) and
     maxLevel (12). The balance editor edits it like any other setting. */
  const settings=()=>GAMEPLAY_SETTINGS.equipment?.enhance||{};
  const levels=()=>Array.isArray(settings().levels)?settings().levels:[];
  const tableRow=r=>r&&{cost:{dust:r.cost?.dust||0,ore:r.cost?.ore||0,ether:r.cost?.ether||0},rate:Number(r.successRate)||0,fail:r.failure==='destroy'?'destroy':r.failure==='drop'?Math.max(0,Math.floor(Number(r.failureLevel)||0)):null,bonus:Number(r.baseBonus)||0};
  const maxLevel=()=>Math.max(0,Math.min(levels().length,Math.floor(Number(RULES.enhanceMax)||0)));
  const validate=validateGameplaySettings;
  validateGameplaySettings=function(cfg){
    const out=validate(cfg),e=out.equipment.enhance,rows=e.levels;
    if(!Number.isInteger(e.costLevelStep)||e.costLevelStep<1||e.costLevelStep>999)throw Error('強化材料倍增的裝等間隔必須是 1 以上的整數');
    if(!Array.isArray(rows)||!rows.length)throw Error('強化表不可為空');
    if(e.maxLevel>rows.length)throw Error('強化上限不可超過強化表的列數');
    rows.forEach((r,i)=>{const at='強化表 +'+(i+1)+'：';
      if(r.level!==i+1)throw Error(at+'等級必須依序為 '+(i+1));
      for(const k of ['dust','ore','ether'])if(!Number.isInteger(r.cost?.[k])||r.cost[k]<0)throw Error(at+'材料數量必須是非負整數');
      if(!Number.isFinite(r.successRate)||r.successRate<0||r.successRate>1)throw Error(at+'成功率需介於 0～1');
      if(!['none','drop','destroy'].includes(r.failure))throw Error(at+'失敗結果必須是 none、drop 或 destroy');
      if(r.failure==='none'&&r.successRate<1)throw Error(at+'成功率低於 100% 時必須設定失敗結果');
      if(r.failure==='drop'&&(!Number.isInteger(r.failureLevel)||r.failureLevel<0||r.failureLevel>i))throw Error(at+'失敗後的等級必須介於 +0 與 +'+i);
      if(!Number.isFinite(r.baseBonus)||r.baseBonus<0||r.baseBonus>100)throw Error(at+'基礎能力加成無效');});
    return out;
  };
  const ACCESSORY_SLOT=3;
  const isToken=g=>!!g&&globalThis.EmberwildTokens?.isToken(g);
  const row=level=>{const n=Math.floor(Number(level)||0);return n>=1&&n<=levels().length?tableRow(levels()[n-1]):null;};
  const bonusAt=plus=>plus>0?row(plus)?.bonus||0:0;
  const enhanceable=g=>!!g&&!isToken(g)&&g.slot!==ACCESSORY_SLOT&&g.canEnhance!==false;
  // Cost multiplier from the item level (裝等): 1～5 ×1, 6～10 ×2, 11～15 ×3...
  const levelMultiplier=g=>Math.max(1,Math.ceil((Number(typeof gearRequiredLevel==='function'?gearRequiredLevel(g):g?.equipmentLevel)||1)/Math.max(1,Number(settings().costLevelStep)||5)));
  const costOf=g=>{const r=row((g?.plus||0)+1),m=levelMultiplier(g);return {ore:(r?.cost.ore||0)*m,dust:(r?.cost.dust||0)*m,ether:(r?.cost.ether||0)*m};};
  const failText=f=>f===null?'—':f==='destroy'?'裝備損毀':'退至 +'+f;
  const pct=n=>Math.round(n*100)+'%';

  // Base attack / HP / defense after enhancement: each base stat × (1 + cumulative bonus), rounded.
  const P=globalThis.EmberwildProgression;
  if(P)P.enhancedGearStats=function(base,plus){const m=1+bonusAt(Number(plus)||0);return Object.fromEntries(['hp','atk','def'].map(k=>{const v=Math.max(0,Number(base?.[k])||0);return [k,v>0?Math.round(v*m):0];}));};

  const baseMaterials=upgradeMaterials;
  upgradeMaterials=function(g){return isToken(g)?baseMaterials(g):costOf(g);};
  globalThis.upgradeMaterials=upgradeMaterials;
  const have=c=>state.dust>=c.dust&&state.ore>=c.ore&&(state.materials['以太鍛鐵']||0)>=c.ether;
  const baseCan=canEnhance;
  canEnhance=function(g){if(isToken(g))return baseCan(g);return enhanceable(g)&&(g.plus||0)<maxLevel()&&have(costOf(g));};
  globalThis.canEnhance=canEnhance;

  function destroy(g){
    const T=globalThis.__EMBERWILD_TEAMS,M=globalThis.EmberwildTeams;
    if(T&&M)M.clearReferences(T.build(),[g.id]);
    for(const x of party.members){x.equipped=(x.equipped||[]).map(id=>id===g.id?null:id);if(x.tokenId===g.id)x.tokenId=null;}
    globalThis.__EMBERWILD_EQUIPMENT_SKILLS?.refund?.(g,playerHero());
    state.bag=state.bag.filter(x=>x.id!==g.id);
    for(const x of party.members)x.hp=Math.min(x.hp,stats(x).hp);
  }
  const baseEnhance=enhance;
  enhance=function(id){
    const g=findGear(id);if(!g||isToken(g))return baseEnhance(id);
    if(g.slot===ACCESSORY_SLOT){toast('飾品無法強化');return false;}
    if(g.canEnhance===false){toast('此裝備不可強化');return false;}
    const plus=g.plus||0,MAX=maxLevel();if(plus>=MAX){toast('已達 +'+MAX+' 強化上限');return false;}
    const target=plus+1,r=row(target),c=costOf(g);
    if(!have(c)){toast('材料不足：'+upgradeCostText(g));return false;}
    if(r.fail==='destroy'&&!confirm(`強化至 +${target} 的成功率為 ${pct(r.rate)}，失敗時「${equipmentDisplayName(g)}」會損毀並消失，無法復原${gearWearer(g.id)?'（穿戴中的裝備也會損毀）':''}。\n確定強化？`))return false;
    const T=globalThis.__EMBERWILD_TEAMS,M=globalThis.EmberwildTeams;T?.capture?.();
    const snap={ore:state.ore,dust:state.dust,ether:state.materials['以太鍛鐵']||0,plus,bag:state.bag,members:party.members.map(x=>({equipped:[...(x.equipped||[])],tokenId:x.tokenId,hp:x.hp})),build:T&&M?M.copy(T.build()):null,gems:[...(playerHero().gems||[])],progress:party.progressStats?JSON.parse(JSON.stringify(party.progressStats)):null,board:JSON.parse(JSON.stringify(playerHero().board||null))};
    state.dust-=c.dust;state.ore-=c.ore;if(c.ether)state.materials['以太鍛鐵']=snap.ether-c.ether;
    const ok=Math.random()<r.rate;let result;
    if(ok){g.plus=target;result='success';globalThis.recordEnhancement?.(g.plus);}
    else if(r.fail==='destroy'){destroy(g);result='destroyed';}
    else{g.plus=r.fail;result='failed';}
    if(save()===false){
      state.ore=snap.ore;state.dust=snap.dust;state.materials['以太鍛鐵']=snap.ether;if(!state.materials['以太鍛鐵']&&!snap.ether)delete state.materials['以太鍛鐵'];
      g.plus=snap.plus;state.bag=snap.bag;party.members.forEach((x,i)=>{x.equipped=snap.members[i].equipped;x.tokenId=snap.members[i].tokenId;x.hp=snap.members[i].hp;});
      if(snap.build)party.buildSystem=snap.build;playerHero().gems=snap.gems;if(snap.progress)party.progressStats=snap.progress;playerHero().board=snap.board;
      return false;
    }
    if(result==='destroyed')globalThis.pruneGearSelections?.();
    render();
    // The forge effects (js/ui/enhancement-effects.js) show a success from the raised level; a committed failure or
    // destruction is announced explicitly.
    if(result!=='success'&&typeof dispatchEvent==='function'&&typeof CustomEvent==='function')dispatchEvent(new CustomEvent('emberwild:enhancement-result',{detail:{outcome:result==='failed'?'failure':'destroyed',level:target,gearId:id}}));
    toast(result==='success'?`強化成功：+${target}`:result==='destroyed'?`強化失敗：「${equipmentDisplayName(g)}」已損毀`:`強化失敗：退至 +${g.plus}`);
    return result;
  };

  // Forge page text for the selected item.
  function controlsHTML(g){
    if(!g||isToken(g))return '';
    if(g.slot===ACCESSORY_SLOT)return '<p class="small enhance-locked">飾品無法強化。</p>';
    if(g.canEnhance===false)return '<p class="small enhance-locked">此裝備不可強化。</p>';
    const plus=g.plus||0,MAX=maxLevel();
    if(plus>=MAX)return `<p class="gold">已達 +${MAX} 強化上限（基礎能力 +${pct(bonusAt(plus))}）。</p>`;
    const target=plus+1,r=row(target),now=gearBaseStats(g),next=gearBaseStats({...g,plus:target});
    const gains=['atk','hp','def'].filter(k=>next[k]>now[k]).map(k=>`${{atk:'攻擊',hp:'生命',def:'防禦'}[k]} +${next[k]-now[k]}`).join(' / ')||'基礎數值較小，這一級四捨五入後沒有增加';
    const fail=r.fail===null?'':r.fail==='destroy'?`<p class="enhance-danger">失敗時裝備會損毀並消失（穿戴中與任務裝備也一樣），強化前會再次確認。</p>`:`<p class="small">失敗時：退至 +${r.fail}</p>`;
    return `<p class="green">強化至 +${target}：基礎能力 +${pct(bonusAt(plus))} → +${pct(r.bonus)}，${gains}</p><p class="small">費用：${itemCostHTML(g)}${levelMultiplier(g)>1?'（裝等 '+gearRequiredLevel(g)+'，材料 ×'+levelMultiplier(g)+'）':''} · 成功率 ${pct(r.rate)}</p>${fail}<button class="${r.fail==='destroy'?'danger':'primary'}" onclick="enhance('${g.id}')" ${canEnhance(g)?'':'disabled'}>強化至 +${target}</button>`;
  }
  function tableHTML(){
    const cost=c=>[c.dust?'粉塵 ×'+c.dust:'',c.ore?'鍛鐵 ×'+c.ore:'',c.ether?'以太鍛鐵 ×'+c.ether:''].filter(Boolean).join('、');
    return `<p class="small">表中為裝等 1～${settings().costLevelStep||5} 的消耗；裝等每高 ${settings().costLevelStep||5} 級，材料增加 1 倍。</p><table class="enhance-table"><thead><tr><th>強化目標</th><th>每次消耗</th><th>成功率</th><th>失敗結果</th><th>基礎能力累計加成</th></tr></thead><tbody>${levels().map(tableRow).map((r,i)=>`<tr${r.fail==='destroy'?' class="enhance-danger-row"':''}><td>+${i+1}</td><td>${cost(r.cost)}</td><td>${pct(r.rate)}</td><td>${failText(r.fail)}</td><td>${pct(r.bonus)}</td></tr>`).join('')}</tbody></table>`;
  }
  globalThis.__EMBERWILD_ENHANCE={get table(){return levels().map(tableRow);},get max(){return maxLevel();},row,bonusAt,costOf,levelMultiplier,enhanceable,controlsHTML,tableHTML,ACCESSORY_SLOT};
})();
