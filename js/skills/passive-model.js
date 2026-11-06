/* Shared passive contract: permanent effects reuse existing stat and combat keys. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EmberwildPassives=api;})(globalThis,function(){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const labels={flatAttack:'攻擊（固定值）',flatDefense:'防禦（固定值）',flatHp:'生命（固定值）',attackPct:'攻擊 %',defensePct:'防禦 %',hpPct:'生命 %',healingPct:'治療量 %',crit:'暴擊率 %',critDamage:'暴擊傷害 %',speed:'速度（固定值）',pierce:'防禦穿透（固定值）',defenseIgnore:'防禦無視 %',lifesteal:'生命竊取 %',evasion:'閃避率 %',elementBonus:'全屬性增傷 %',bossDamagePct:'BOSS 增傷 %',elementDamagePct:'指定屬性增傷 %',elementResistPct:'指定屬性抗性 %',raceDamagePct:'指定種族增傷 %',guard:'受到傷害減少 %',power:'主動／觸發技能效果 %',procChance:'普攻觸發率 %',weaken:'敵方攻擊降低 %',fracture:'敵方防禦降低 %',damageAmp:'敵方承受傷害增加 %'};
  const combatKeys=['guard','power','weaken','fracture','damageAmp'],enemyKeys=['weaken','fracture','damageAmp'];
  const elements=['physical','fire','ice','wind','light','shadow'],races=['beast','plant','undead','construct','demon','spirit'];
  const targets={self:'自己',allies:'我方全體',enemies:'敵方全體'};
  const defaults=[
    {id:'test-attack',name:'攻擊強化（測試）',effects:[{key:'attackPct',value:10}]},
    {id:'test-defense',name:'防禦強化（測試）',effects:[{key:'defensePct',value:10}]},
    {id:'test-health',name:'生命強化（測試）',effects:[{key:'hpPct',value:10}]},
    {id:'test-healing',name:'治療強化（測試）',effects:[{key:'healingPct',value:15}]}
  ].map(d=>({...d,description:'取得時常駐生效，不占技能槽。',kind:'buff',target:'self',requiredLevel:1}));
  const defaultAssignments={10:['test-attack'],11:['test-defense','test-health'],12:['test-attack'],13:['test-healing'],14:['test-attack']};
  const ident=s=>typeof s==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(s);
  function assert(ok,message){if(!ok)throw Error(message);}
  function normalize(raw){
    if(raw===undefined)return copy(defaults);
    assert(Array.isArray(raw)&&raw.length<=512,'被動定義必須為陣列，最多 512 個');
    const ids=new Set();
    return raw.map(d=>{
      assert(d&&ident(d.id)&&!ids.has(d.id),'被動 ID 無效或重複');ids.add(d.id);
      assert(typeof d.name==='string'&&d.name.trim()&&d.name.length<=80&&typeof (d.description??'')==='string'&&(d.description??'').length<=500,'被動名稱或說明無效：'+d.id);
      const kind=d.kind??'buff',target=d.target??'self';
      assert(['buff','debuff'].includes(kind)&&Object.hasOwn(targets,target),'被動分類或目標無效：'+d.id);
      assert(Array.isArray(d.effects)&&(d.effects.length>=1||d.eventPassive)&&d.effects.length<=32,'被動需要 1～32 個效果：'+d.id);
      const effects=d.effects.map(e=>{
        assert(e&&Object.hasOwn(labels,e.key)&&Number.isFinite(e.value)&&Math.abs(e.value)<=1e6,'被動效果無效：'+d.id);
        assert(target==='enemies'?enemyKeys.includes(e.key):!enemyKeys.includes(e.key),'被動效果與目標不相容：'+d.id);
        const out={key:e.key,value:e.value};
        if(['elementDamagePct','elementResistPct'].includes(e.key)){assert(elements.includes(e.element),'被動元素無效：'+d.id);out.element=e.element;}
        if(e.key==='raceDamagePct'){assert(races.includes(e.race),'被動種族無效：'+d.id);out.race=e.race;}
        return out;
      });
      const requiredLevel=d.requiredLevel??1;assert(Number.isSafeInteger(requiredLevel)&&requiredLevel>=1,'被動解鎖等級無效：'+d.id);
      assert(d.partnerId==null||Number.isInteger(d.partnerId)&&d.partnerId>=10,'被動指定夥伴無效：'+d.id);
      return {...(d.eventPassive?{eventPassive:copy(d.eventPassive)}:{}),id:d.id,name:d.name.trim(),description:d.description??'',kind,target,effects,requiredLevel,...(d.partnerId!=null?{partnerId:d.partnerId}:{})};
    });
  }
  function assignments(raw,id){
    const list=raw===undefined?(defaultAssignments[id]||[]):raw;
    assert(Array.isArray(list)&&list.length<=32&&list.every(ident)&&new Set(list).size===list.length,'夥伴被動清單無效：'+id);
    return [...list];
  }
  function effectText(e){
    const fixed=['flatAttack','flatDefense','flatHp','speed','pierce'].includes(e.key),extra=e.element?' · '+e.element:e.race?' · '+e.race:'';
    return labels[e.key].replace(' %','')+extra+' '+(e.value>=0?'+':'')+e.value+(fixed?'':'%');
  }
  return {copy,labels,combatKeys,enemyKeys,elements,races,targets,defaults,defaultAssignments,normalize,assignments,effectText};
});
