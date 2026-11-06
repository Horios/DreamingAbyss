/* LV1–60 progression formulas. This same source is embedded in the standalone balance editor. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.EmberwildProgression=api;
})(globalThis,function(){
  const defaults={
  "classes": [
    {
      "hp": 30,
      "atk": 10,
      "def": 6,
      "initialStats": {
        "hp": 30,
        "atk": 10,
        "def": 6,
        "crit": 0.07,
        "critDamage": 1.5
      },
      "growthPerLevel": {
        "hp": 5,
        "atk": 1,
        "def": 1,
        "crit": 0,
        "critDamage": 0
      },
      "growthSteps": [
        {
          "every": 3,
          "hp": 0,
          "atk": 1,
          "def": 0
        }
      ]
    },
    {
      "hp": 22,
      "atk": 12,
      "def": 3,
      "initialStats": {
        "hp": 22,
        "atk": 12,
        "def": 3,
        "crit": 0.07,
        "critDamage": 1.5
      },
      "growthPerLevel": {
        "hp": 3,
        "atk": 2,
        "def": 0,
        "crit": 0,
        "critDamage": 0
      },
      "growthSteps": [
        {
          "every": 3,
          "hp": 0,
          "atk": 0,
          "def": 1
        }
      ]
    },
    {
      "hp": 25,
      "atk": 11,
      "def": 4,
      "initialStats": {
        "hp": 25,
        "atk": 11,
        "def": 4,
        "crit": 0.17,
        "critDamage": 1.5
      },
      "growthPerLevel": {
        "hp": 4,
        "atk": 1,
        "def": 0,
        "crit": 0,
        "critDamage": 0
      },
      "growthSteps": [
        {
          "every": 2,
          "hp": 0,
          "atk": 1,
          "def": 1
        }
      ]
    },
    {
      "hp": 27,
      "atk": 10,
      "def": 5,
      "initialStats": {
        "hp": 27,
        "atk": 10,
        "def": 5,
        "crit": 0.07,
        "critDamage": 1.5
      },
      "growthPerLevel": {
        "hp": 4,
        "atk": 1,
        "def": 0,
        "crit": 0,
        "critDamage": 0
      },
      "growthSteps": [
        {
          "every": 2,
          "hp": 0,
          "atk": 0,
          "def": 1
        },
        {
          "every": 3,
          "hp": 0,
          "atk": 1,
          "def": 0
        }
      ]
    }
  ],
  "settings": {
    "progression": {
      "xpCurve": {
        "base": 24,
        "linear": 18,
        "quadratic": 8,
        "multiplierBase": 1,
        "multiplierPerLevel": 0,
        "lateStart": 30,
        "latePerLevel": 0.05,
        "endStart": 45,
        "endPerLevel": 0.075
      },
      "xpLevelGap": {
        "enabled": true,
        "freeLevels": 2,
        "midGap": 3,
        "midMultiplier": 0.5,
        "highGap": 5,
        "highMultiplier": 0.2,
        "zeroGap": 10,
        "minimumMultiplier": 0
      },
      "advance": {
        "hpMultiplier": 1.12,
        "attackMultiplier": 1.15,
        "defenseMultiplier": 1.12
      }
    },
    "equipment": {
      "baseStats": {
        "weaponAttackPerTier": 3,
        "armorHpPerTier": 8,
        "armorDefensePerTier": 2,
        "accessoryAttackPerTier": 1,
        "accessoryHpPerTier": 3,
        "offhandAttackPerTier": 1,
        "offhandHpPerTier": 3
      },
      "enhance": {
        "statPerLevel": 0.05,
        "flatStatsPerLevel": {"atk": 0.5, "hp": 1, "def": 0.2},
        "flatStatsPerEquipmentLevel": {"atk": 0.02, "hp": 0.08, "def": 0.015}
      }
    },
    "monsters": {
      "encounter": {
        "levelLeadInterval": 5
      },
      "normal": {
        "hpBase": 18,
        "hpPerLevel": 9,
        "hpQuadratic": 0.12,
        "attackBase": 4,
        "attackPerLevel": 1.7,
        "defensePerLevel": 0.6
      },
      "awakened": {
        "threshold": 30,
        "hpBaseMultiplier": 1,
        "hpPerLevel": 0.003,
        "attackBaseMultiplier": 1,
        "attackPerLevel": 0.002,
        "defenseMultiplier": 1
      },
      "kindMultipliers": {
        "bossHp": 9,
        "eliteHp": 1.6,
        "bossAttack": 2,
        "eliteAttack": 1.2,
        "eliteDefense": 1.1,
        "bossDefense": 1.2
      },
      "finalBoss": {
        "level": 40,
        "hp": 5500,
        "attack": 95,
        "defense": 35
      }
    },
    "skills": {
      "mastery": {
        "characterXpMultiplier": 1
      }
    },
    "rewards": {
      "xp": {
        "base": 18,
        "perLevel": 9,
        "kindMultiplier": {
          "normal": 1,
          "elite": 2.2,
          "boss": 10
        }
      },
      "gold": {
        "base": 2,
        "perLevel": 0.45,
        "quadratic": 0.003,
        "kindMultiplier": {"normal": 1, "elite": 2.6, "boss": 7},
        "levelGap": {"enabled": true, "freeLevels": 2, "midGap": 3, "midMultiplier": 0.5, "highGap": 5, "highMultiplier": 0.2, "zeroGap": 10}
      }
    },
    "difficulty": {
      "modes": [
        {
          "hp": 1,
          "attack": 1,
          "defense": 1,
          "reward": 1,
          "xpMultiplier": 1
        },
        {
          "hp": 1.45,
          "attack": 1.2,
          "defense": 1.08,
          "reward": 1.3,
          "xpMultiplier": 1.45
        },
        {
          "hp": 1.95,
          "attack": 1.4,
          "defense": 1.15,
          "reward": 1.65,
          "xpMultiplier": 2
        }
      ]
    },
    "meta": {
      "progressionCurveVersion": 2
    }
  },
  "powerMultipliers": [
    1,
    1.08,
    1.16,
    1.24,
    1.32,
    1.4,
    1.48,
    1.56,
    1.64,
    1.72
  ]
};
  const copy=v=>JSON.parse(JSON.stringify(v));
  function mergeDefaults(target,source){
    for(const [key,value] of Object.entries(source)){
      if(Array.isArray(value)){target[key]??=[];value.forEach((row,i)=>{target[key][i]??={};mergeDefaults(target[key][i],row);});}
      else if(value&&typeof value==='object'){target[key]??={};mergeDefaults(target[key],value);}
      else target[key]=value;
    }
    return target;
  }
  function applyDefaults(settings){return mergeDefaults(settings,defaults.settings);}
  function applyClassDefaults(cls,job){Object.assign(cls,copy(defaults.classes[job]));return cls;}
  function naturalStats(cls,level){
    const initial=cls.initialStats||cls,growth=cls.growthPerLevel||{},n=Math.max(0,Math.floor(level)-1),out={};
    for(const key of ['hp','atk','def']){
      const stair=(cls.growthSteps||[]).reduce((sum,s)=>sum+Math.floor(n/s.every)*(s[key]||0),0);
      out[key]=Math.max(key==='def'?0:1,Math.round(Number(initial[key]||0)+n*Number(growth[key]||0)+stair));
    }
    out.crit=Number(initial.crit||0)+n*Number(growth.crit||0);
    out.critDamage=Number(initial.critDamage??1.5)+n*Number(growth.critDamage||0);
    return out;
  }
  function encounterLevelLead(settings,level){
    const maximum=Math.max(0,Number(settings.progression.mapAheadAllowance??5)),interval=Number(settings.monsters.encounter?.levelLeadInterval||0);
    return interval>0?Math.min(maximum,Math.floor(Math.max(0,level-1)/interval)):maximum;
  }
  function baseMonsterStats(settings,level,kind='normal',row={}){
    const n=settings.monsters.normal,k=settings.monsters.kindMultipliers,f=settings.monsters.finalBoss;
    const hp=Number(row.baseStats?.hp)>0?row.baseStats.hp:kind==='final'?f.hp:(n.hpBase+level*n.hpPerLevel+level*level*n.hpQuadratic)*(kind==='boss'?k.bossHp:kind==='elite'?k.eliteHp:1);
    const atk=Number(row.baseStats?.attack)>0?row.baseStats.attack:kind==='final'?f.attack:(n.attackBase+level*n.attackPerLevel)*(kind==='boss'?k.bossAttack:kind==='elite'?k.eliteAttack:1);
    const def=Number(row.baseStats?.defense)>=0?row.baseStats.defense:kind==='final'?f.defense:level*n.defensePerLevel*(kind==='boss'?k.bossDefense:kind==='elite'?k.eliteDefense:1);
    return {hp:Math.max(1,Math.round(hp*(row.hpMultiplier??1))),atk:Math.max(1,Math.round(atk*(row.attackMultiplier??1))),def:Math.max(0,Math.round(def*(row.defenseMultiplier??1)))};
  }
  function scaleMonsterStats(settings,level,kind,mode,base){
    const a=settings.monsters.awakened,d=settings.difficulty.modes[mode]||settings.difficulty.modes[0];let {hp,atk,def}=base;
    if(level>a.threshold&&kind!=='final'){
      const n=level-a.threshold;
      hp=Math.round(hp*(a.hpBaseMultiplier+n*a.hpPerLevel));
      atk=Math.round(atk*(a.attackBaseMultiplier+n*a.attackPerLevel));
      def=Math.round(def*a.defenseMultiplier);
    }
    return {hp:Math.max(1,Math.round(hp*d.hp)),atk:Math.max(1,Math.round(atk*d.attack)),def:Math.max(0,Math.round(def*d.defense))};
  }
  function monsterStats(settings,level,kind='normal',mode=0,row={}){return scaleMonsterStats(settings,level,kind,mode,baseMonsterStats(settings,level,kind,row));}
  function requiredXp(settings,level){
    const c=settings.progression.xpCurve,m=settings.skills?.mastery?.characterXpMultiplier??1;
    const base=Math.round((c.base+level*c.linear+level*level*c.quadratic)*(c.multiplierBase+level*c.multiplierPerLevel));
    return Math.max(1,Math.round(base*m*(1+Math.max(0,level-(c.lateStart??30))*(c.latePerLevel??0)+Math.max(0,level-(c.endStart??45))*(c.endPerLevel??0))));
  }
  // Same-level and higher-level monsters retain their existing EXP. The
  // reduction is applied once, before sharing the reward with party members.
  function xpLevelGapFactor(settings,playerLevel,enemyLevel){
    const cfg=settings.progression?.xpLevelGap;
    if(!cfg?.enabled||!Number.isFinite(playerLevel)||!Number.isFinite(enemyLevel))return 1;
    const gap=Math.max(0,playerLevel-enemyLevel);
    if(gap<=cfg.freeLevels)return 1;
    if(gap>=cfg.zeroGap)return 0;
    if(gap>=cfg.highGap)return cfg.highMultiplier;
    if(gap>=cfg.midGap)return cfg.midMultiplier;
    return 1;
  }
  function enemyXp(settings,level,kind='normal',mode=0,playerLevel=null){
    const r=settings.rewards,x=r.xp,k=x.kindMultiplier||r.kindMultiplier,key=kind==='final'?'boss':kind;
    const difficulty=settings.difficulty.modes[mode];
    const base=(x.base+level*x.perLevel)*(k[key]??1)*(difficulty?.xpMultiplier??difficulty?.reward??1);
    return Math.max(0,base*xpLevelGapFactor(settings,playerLevel,level));
  }
  function xpShare(xp,count){return Math.max(0,xp/Math.max(1,count));}
  function goldLevelGapFactor(settings,playerLevel,enemyLevel){
    const c=(settings.rewards?.gold??defaults.settings.rewards.gold).levelGap;
    if(!c?.enabled||!Number.isFinite(playerLevel)||!Number.isFinite(enemyLevel))return 1;
    const gap=Math.max(0,playerLevel-enemyLevel);
    if(gap<=c.freeLevels)return 1;
    if(gap>=c.zeroGap)return 0;
    if(gap>=c.highGap)return c.highMultiplier;
    if(gap>=c.midGap)return c.midMultiplier;
    return 1;
  }
  function enemyGold(settings,level,kind='normal',mode=0,playerLevel=null){
    const c=settings.rewards?.gold??defaults.settings.rewards.gold,key=kind==='final'?'boss':kind;
    const base=c.base+level*c.perLevel+level*level*(c.quadratic??0);
    const mult=c.kindMultiplier?.[key]??settings.rewards.kindMultiplier[key]??1;
    const difficulty=settings.difficulty.modes[mode]?.goldMultiplier??1;
    return Math.max(0,Math.floor(base*mult*difficulty*goldLevelGapFactor(settings,playerLevel,level)));
  }
  // Refinement adds fixed stats based only on the item's required level. T grade
  // applies to the base first; it never multiplies these refinement gains.
  function enhancedGearStats(base,plus,equipmentLevel,flat=defaults.settings.equipment.enhance.flatStatsPerLevel,growth=defaults.settings.equipment.enhance.flatStatsPerEquipmentLevel){
    const levels=Math.max(0,Number(plus)||0),itemLevels=Math.max(0,(Number(equipmentLevel)||1)-1);
    return Object.fromEntries(['hp','atk','def'].map(k=>{
      const value=Math.max(0,Number(base[k])||0),gain=(Number(flat[k])||0)+itemLevels*(Number(growth[k])||0);
      return [k,value>0?value+levels*Math.max(1,Math.ceil(gain)):0];
    }));
  }
  function gearStats(raw,effects,power,plus,equipmentLevel=1,flat,growth){
    const rounded=v=>Object.fromEntries(['hp','atk','def'].map(k=>[k,Math.max(0,Math.round(v[k]||0))]));
    const body=rounded({hp:raw.hp*(1+(effects.hp||0)/100),atk:raw.atk*(1+(effects.atk||0)/100),def:raw.def*(1+(effects.def||0)/100)});
    const graded=rounded(Object.fromEntries(['hp','atk','def'].map(k=>[k,body[k]*power])));
    const total=enhancedGearStats(graded,plus,equipmentLevel,flat,growth);
    const grade=Object.fromEntries(['hp','atk','def'].map(k=>[k,graded[k]-body[k]])),enhance=Object.fromEntries(['hp','atk','def'].map(k=>[k,total[k]-graded[k]]));
    return {raw:rounded(raw),body,grade,enhance,total};
  }
  function validSteps(steps){return Array.isArray(steps)&&steps.length<=12&&steps.every(s=>s&&Number.isInteger(s.every)&&s.every>=1&&s.every<=60&&['hp','atk','def'].every(k=>Number.isSafeInteger(s[k])&&s[k]>=0));}
  return {defaults,applyDefaults,applyClassDefaults,naturalStats,encounterLevelLead,baseMonsterStats,scaleMonsterStats,monsterStats,requiredXp,enemyXp,xpLevelGapFactor,xpShare,enemyGold,goldLevelGapFactor,gearStats,enhancedGearStats,validSteps};
});
