(function(root){
 const labels={cooldownSeconds:'技能冷卻（秒）',durationSeconds:'效果持續（秒）',baseIntervalSeconds:'普攻基礎間隔（秒）',minimumActionIntervalSeconds:'最短間隔（秒）',mpCost:'技能 MP 消耗',maxMp:'最大 MP',regenPerSecond:'每秒恢復 MP',costMultiplier:'MP 消耗倍率',castSeconds:'個別詠唱（秒）',actionCostSeconds:'個別動作鎖定（秒）',hpFractionPerSecond:'脫戰每秒 HP 比例',mpRegenMultiplier:'脫戰 MP 恢復倍率',minimumHpRatio:'下一場最低 HP 比例',minimumMpRatio:'下一場最低 MP 比例',periodicIntervalSeconds:'DOT／HOT 間隔（秒）',triggerIntervalSeconds:'觸發間隔（秒）',power:'傷害／效果倍率',cooldown:'冷卻回合',cost:'購買價格',sellPrice:'售價',name:'名稱',requiredLevel:'解鎖等級',hp:'生命',atk:'攻擊',def:'防禦',chance:'機率',chanceByDifficulty:'各難度機率',quantityMin:'最少數量',quantityMax:'最多數量',enabled:'啟用',periodMs:'動作時間（毫秒）',bugChance:'小蟲機率',description:'說明',value:'效果值',element:'元素',maxTargets:'最大目標數',hitCount:'命中次數',powerPerLevel:'每級倍率'};
 const omit=new Set(['_reference','notes']);
 function stable(x){if(Array.isArray(x))return '['+x.map(stable).join(',')+']';if(x&&typeof x==='object')return '{'+Object.keys(x).filter(k=>!omit.has(k)).sort().map(k=>JSON.stringify(k)+':'+stable(x[k])).join(',')+'}';return JSON.stringify(x);}
 function system(p){if(/\.skills\.|^supportSkills/.test(p))return '技能';if(/^classes/.test(p))return '職業';if(/^companions|^companionSettings/.test(p))return '夥伴';if(/^passive/.test(p))return '被動';if(/^status/.test(p))return '狀態';if(/^companionTokens/.test(p))return '信物';if(/monsters/.test(p))return '怪物';if(/maps/.test(p))return '地圖';if(/drops/.test(p))return '掉落';if(/^equipmentForms|^equipmentPowerSystem|^starterPack/.test(p))return '裝備';if(/affixes/.test(p))return '詞綴';if(/^shopSettings/.test(p))return '商店';if(/materialPrices|materialBuyPrices/.test(p))return '材料';if(/^items/.test(p))return '消耗品';if(/progression/.test(p))return '成長';if(/combat/.test(p))return '戰鬥公式';if(/^lifeSkills/.test(p))return '生活技能';if(/quests/.test(p))return '委託與支線';if(/^teamSettings/.test(p))return '角色';return '其他設定';}
 function diff(before,after){const rows=[];
  function emit(type,p,a,b,owner){const key=p.split('.').at(-1);rows.push({type,system:system(p),object:owner?.name||owner?.title||String(owner?.id??system(p)),id:owner?.id??'',path:p,field:labels[key]||key,before:a,after:b});}
  function walk(a,b,p='',owner=null){if(stable(a)===stable(b))return;if(a===undefined){emit('新增',p,a,b,b?.id!==undefined?b:owner);return;}if(b===undefined){emit('刪除',p,a,b,a?.id!==undefined?a:owner);return;}
   if(Array.isArray(a)&&Array.isArray(b)){
    const keyed=a.concat(b).length&&a.concat(b).every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&(x.id!==undefined||x.key!==undefined));
    if(keyed){const id=x=>String(x.id??x.key),am=new Map(a.map(x=>[id(x),x])),bm=new Map(b.map(x=>[id(x),x]));for(const k of new Set([...am.keys(),...bm.keys()]))walk(am.get(k),bm.get(k),p+'.'+k,bm.get(k)||am.get(k));
     const commonA=a.map(id).filter(k=>bm.has(k)),commonB=b.map(id).filter(k=>am.has(k));if(stable(commonA)!==stable(commonB))emit('修改',p+'.order',a.map(id),b.map(id),owner);
    }else if(a.every(x=>x===null||typeof x!=='object')&&b.every(x=>x===null||typeof x!=='object'))emit('修改',p,a,b,owner);
    else for(let i=0;i<Math.max(a.length,b.length);i++)walk(a[i],b[i],p+'.'+i,b[i]?.name?b[i]:owner);
    return;
   }
   if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){const o=b.name||b.title||b.id!==undefined?b:owner;for(const k of new Set([...Object.keys(a),...Object.keys(b)]))if(!omit.has(k))walk(a[k],b[k],p?p+'.'+k:k,o);return;}
   emit('修改',p,a,b,owner);
  }walk(before,after);return {rows,total:rows.length,added:rows.filter(r=>r.type==='新增').length,modified:rows.filter(r=>r.type==='修改').length,deleted:rows.filter(r=>r.type==='刪除').length};
 }
 const api={stable,system,diff,labels};root.EmberwildBalanceDiff=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
