'use strict';
// Extracted from core-game.js without changing exported globals or validation rules.
// Presentation metadata only. New mechanics must be implemented in combat before
// supplying metadata here; names/elements never imply AoE, casting or control.
const SKILL_CONTROL_LABELS=Object.freeze({stun:'暈眩',freeze:'冰凍',silence:'沉默',root:'定身'});
const SKILL_STATUS_LABELS=Object.freeze({...SKILL_CONTROL_LABELS,burn:'燃燒',poison:'中毒'});
const SKILL_TYPE_RULES=[
 {id:'trigger',label:'觸發',match:m=>m.activation==='proc'},
 {id:'instant',label:'瞬發',match:m=>!['passive','proc'].includes(m.activation)&&!(m.castTimeSeconds>0)},
 {id:'cast',label:'吟唱',match:m=>m.castTimeSeconds>0},
 {id:'burst',label:'爆發',match:m=>m.delivery==='burst'},
 {id:'duration',label:'持續',match:m=>m.effects.some(e=>e.durationSeconds>0||e.periodic)},
 {id:'area',label:'範圍',match:m=>['allies','enemies','area'].includes(m.target)||m.maxTargets>1},
 {id:'control',label:'控制',match:m=>m.effects.some(e=>Object.hasOwn(SKILL_CONTROL_LABELS,e.kind))},
 {id:'support',label:'輔助',match:m=>m.effects.some(e=>['buff','debuff'].includes(e.kind))},
 {id:'heal',label:'治療',match:m=>m.effects.some(e=>['heal','drain','regen'].includes(e.kind))},
 {id:'shield',label:'護盾',match:m=>m.effects.some(e=>e.kind==='shield')},
 {id:'passive',label:'被動',match:m=>m.activation==='passive'}
];
function skillMechanics(job,index,group='core'){
 const sk=group==='support'?SUPPORT[job]?.[index]:CLASSES[job]?.skills?.[index];
 if(!sk)return {activation:'active',castTimeSeconds:0,target:'enemy',maxTargets:1,effects:[]};
 if(group==='support'){
  const meta=sk.mechanics&&typeof sk.mechanics==='object'&&!Array.isArray(sk.mechanics)?sk.mechanics:{};
  const fallbackEffects=[{kind:['fracture','weaken','vulnerable'].includes(sk.kind)?'debuff':'buff',durationSeconds:sk.duration},...(sk.kind==='regen'?[{kind:'regen',periodic:true,durationSeconds:sk.duration}]:[])];
  return {...meta,activation:meta.activation??'active',castTimeSeconds:Number(meta.castTimeSeconds)||0,target:meta.target??sk.target,maxTargets:Math.max(1,Number(meta.maxTargets)||1),effects:Array.isArray(meta.effects)?meta.effects:fallbackEffects};
 }
 const meta=sk[6]&&typeof sk[6]==='object'&&!Array.isArray(sk[6])?sk[6]:{};
 return {...meta,activation:meta.activation??sk[1],castTimeSeconds:Number(meta.castTimeSeconds)||0,target:meta.target??(sk[5]==='heal'?'weakest':sk[5]==='shield'?'self':'enemy'),maxTargets:Math.max(1,Number(meta.maxTargets)||1),effects:Array.isArray(meta.effects)?meta.effects:[{kind:sk[5]}]};
}
function skillTypeTags(mechanics){
 const tags=SKILL_TYPE_RULES.filter(rule=>rule.match(mechanics)).map(({id,label})=>({id,label}));
 const secondary=[...new Set(mechanics.effects.map(e=>e.kind))].filter(kind=>Object.hasOwn(SKILL_STATUS_LABELS,kind)).slice(0,2);
 return [...tags,...secondary.map(id=>({id,label:SKILL_STATUS_LABELS[id],secondary:true}))];
}
function skillTypeBadges(job,index,group='core'){
 return `<span class="skill-type-tags" aria-label="技能類型">${skillTypeTags(skillMechanics(job,index,group)).map(tag=>`<span class="skill-type-tag${tag.secondary?' skill-type-secondary':''}">【${esc(tag.label)}】</span>`).join('')}</span>`;
}
function skillMechanicsDetails(job,index,group='core'){
 const m=skillMechanics(job,index,group),details=[],timeUnit='戰鬥回合';
 if(m.castTimeSeconds>0)details.push('吟唱時間：'+m.castTimeSeconds+' '+timeUnit);
 for(const effect of m.effects)if(Object.hasOwn(SKILL_CONTROL_LABELS,effect.kind))details.push('控制效果：'+SKILL_CONTROL_LABELS[effect.kind]+' · 持續 '+effect.durationSeconds+' '+timeUnit);
 return details.length?`<p class="skill-mechanics-details">${details.map(esc).join('<br>')}</p>`:'';
}
