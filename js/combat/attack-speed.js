/* v0.196 attack speed. Every player character and companion uses one rule:
     total bonus  = sum of every attackSpeedPct source (gear, gems, tokens, passives, skills), in percent points
     interval     = max(minimum, class base interval / (1 + bonus / 100))
     minimum      = 1 / maxAttacksPerSecond (2/3 s at 1.5 attacks per second)
   The bonus is clamped below at minimumBonusPct (-90) so the divisor stays positive; there is no upper clamp, the
   minimum interval caps the result instead. Internal values keep full precision; only the timeline conversion to
   integer microseconds rounds, and the minimum is rounded up (666667 µs) so a discrete clock never exceeds the cap.
   Monsters keep their own speed formula; nothing here applies to them. The same file is loaded by the game, the
   offline settlement (same driver) and the balance editor. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EmberwildAttackSpeed=api;})(globalThis,()=>{
 'use strict';
 const SCALE=1000000,FIELD='attackSpeedPct';
 const DEFAULTS=Object.freeze({maxAttacksPerSecond:1.5,minimumBonusPct:-90});
 const CLASS_INTERVALS=Object.freeze([2,2.65,1.4,2.65]);
 const finite=v=>typeof v==='number'&&Number.isFinite(v);
 const fail=s=>{throw Error('攻擊速度：'+s);};
 function settings(cfg){
  const c={...DEFAULTS,...(cfg||{})};
  if(!finite(c.maxAttacksPerSecond)||c.maxAttacksPerSecond<=0||c.maxAttacksPerSecond>100)fail('最高普攻頻率必須為 0～100 的正數');
  if(!finite(c.minimumBonusPct)||c.minimumBonusPct<=-100||c.minimumBonusPct>0)fail('最低有效加成必須大於 -100% 且不大於 0%');
  return c;
 }
 function validate(cfg){settings(cfg);return true;}
 // A single source value: a finite number of percent points. Strings, NaN and Infinity are rejected, never coerced.
 function checkPct(value,label='attackSpeedPct'){if(!finite(value))fail(label+' 必須是有限數字（百分點，10 = +10%）');if(Math.abs(value)>10000)fail(label+' 超出範圍');return value;}
 function sum(values){let total=0;for(const v of values||[])total+=checkPct(v);return total;}
 function effectivePct(total,cfg){return Math.max(settings(cfg).minimumBonusPct,checkPct(total,'總攻擊速度'));}
 // The exact formula constant: 1/1.5 is the double nearest 2/3.
 function minimumIntervalSeconds(cfg){return 1/settings(cfg).maxAttacksPerSecond;}
 // Rounded up so maxAttacksPerSecond is never exceeded on the microsecond clock (1.5/s -> 666667 µs).
 function minimumIntervalMicros(cfg){return Math.ceil(SCALE/settings(cfg).maxAttacksPerSecond-1e-7);}
 function checkBase(base){if(!finite(base)||base<=0||base>3600)fail('基礎普攻間隔必須為正秒數');return base;}
 function rawIntervalSeconds(base,total,cfg){return checkBase(base)/(1+effectivePct(total,cfg)/100);}
 function intervalSeconds(base,total,cfg){return Math.max(minimumIntervalSeconds(cfg),rawIntervalSeconds(base,total,cfg));}
 function intervalMicros(base,total,cfg){return Math.max(minimumIntervalMicros(cfg),Math.round(rawIntervalSeconds(base,total,cfg)*SCALE));}
 function attacksPerSecond(base,total,cfg){return 1/intervalSeconds(base,total,cfg);}
 function capped(base,total,cfg){return rawIntervalSeconds(base,total,cfg)<=minimumIntervalSeconds(cfg);}
 // Bonus needed to reach the cap: base x maxAttacksPerSecond - 1, in percent points (warrior 2 s -> 200).
 function requiredPctForCap(base,cfg){return Math.max(0,(checkBase(base)*settings(cfg).maxAttacksPerSecond-1)*100);}
 function summary(base,total,cfg){const pct=checkPct(total,'總攻擊速度'),interval=intervalSeconds(base,pct,cfg);return {bonusPct:pct,effectivePct:effectivePct(pct,cfg),intervalSeconds:interval,attacksPerSecond:1/interval,capped:capped(base,pct,cfg),requiredPctForCap:requiredPctForCap(base,cfg)};}
 const round=(n,d=3)=>Number(n.toFixed(d));
 function formatPct(total){const n=round(checkPct(total),2);return (n>=0?'+':'')+n+'%';}
 function label(total){return '攻擊速度 '+formatPct(total);}
 return Object.freeze({SCALE,FIELD,DEFAULTS,CLASS_INTERVALS,settings,validate,checkPct,sum,effectivePct,minimumIntervalSeconds,minimumIntervalMicros,rawIntervalSeconds,intervalSeconds,intervalMicros,attacksPerSecond,capped,requiredPctForCap,summary,formatPct,label});
});
