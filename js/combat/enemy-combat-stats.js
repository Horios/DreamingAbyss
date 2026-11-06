/* Shared combat-stat shape for enemies.
   Monsters expose the same derived combat fields as heroes. Neutral defaults preserve current balance. */
(()=>{
  const ELEMENT_KEYS=['physical','fire','ice','wind','light','shadow'];
  const RACE_KEYS=['beast','plant','undead','construct','demon','spirit'];
  function zeroMap(keys,src){const out={};for(const k of keys){const v=Number(src?.[k]);out[k]=Number.isFinite(v)?v:0;}return out;}
  function rowForEnemy(e){return (GAMEPLAY_SETTINGS?.monsters?.catalog||[]).find(m=>m.id===e?.monsterId)||null;}
  function profileForEnemy(e){
    const row=rowForEnemy(e),cache=globalThis.__EMBERWILD_OFFLINE_RULE_CACHE,profiles=cache?(cache.enemyProfiles??=new Map()):null;
    if(profiles?.has(row))return profiles.get(row);
    const raw=typeof normalizeMonsterCombatStats==='function'?normalizeMonsterCombatStats(row?.combatStats):row?.combatStats||{};
    const profile={
      crit:Number.isFinite(raw.crit)?raw.crit:0,
      critDamage:Number.isFinite(raw.critDamage)?raw.critDamage:Number(GS('combat.baseCritDamage',1.5))||1.5,
      pierce:Number.isFinite(raw.pierce)?raw.pierce:0,
      defenseIgnore:Number.isFinite(raw.defenseIgnore)?raw.defenseIgnore:0,
      lifesteal:Number.isFinite(raw.lifesteal)?raw.lifesteal:0,
      evasion:Number.isFinite(raw.evasion)?raw.evasion:0,
      elementBonus:Number.isFinite(raw.elementBonus)?raw.elementBonus:0,
      bossDamage:Number.isFinite(raw.bossDamage)?raw.bossDamage:0,
      speedBonus:Number.isFinite(raw.speedBonus)?raw.speedBonus:0,
      elementDamage:zeroMap(ELEMENT_KEYS,raw.elementDamage),
      raceDamage:zeroMap(RACE_KEYS,raw.raceDamage),
      resist:zeroMap(ELEMENT_KEYS,raw.resist)
    };
    profiles?.set(row,profile);return profile;
  }
  function hydrateEnemyCombatStats(e){
    if(!e||typeof e!=='object')return e;const p=profileForEnemy(e);
    for(const k of ['crit','critDamage','pierce','defenseIgnore','lifesteal','evasion','elementBonus','bossDamage','speedBonus'])e[k]=p[k];
    e.elementDamage={...p.elementDamage};e.raceDamage={...p.raceDamage};e.resist={...p.resist};
    if(!Number.isFinite(e.shield))e.shield=0;
    return e;
  }
  globalThis.hydrateEnemyCombatStats=hydrateEnemyCombatStats;
  globalThis.enemyBattleStats=function(e){
    hydrateEnemyCombatStats(e);
    return {hp:e.maxhp,atk:e.atk*(1+effectTotal(e.id,'attack')),def:e.def,crit:Math.min(1,Math.max(0,e.crit+effectTotal(e.id,'critical'))),critDamage:e.critDamage,pierce:e.pierce,defenseIgnore:e.defenseIgnore,lifesteal:e.lifesteal,evasion:e.evasion,elementBonus:e.elementBonus,bossDamage:e.bossDamage,speed:combatSpeed(e),elementDamage:{...e.elementDamage},raceDamage:{...e.raceDamage},resist:{...e.resist}};
  };
  if(typeof makeEnemy==='function'){const base=makeEnemy;makeEnemy=function(...args){return hydrateEnemyCombatStats(base(...args));};}
  if(typeof spawnGroup==='function'){const base=spawnGroup;spawnGroup=function(...args){const out=base(...args);for(const e of foes||[])hydrateEnemyCombatStats(e);return out;};}
  if(typeof combatSpeed==='function'){const base=combatSpeed;combatSpeed=function(e){hydrateEnemyCombatStats(e);return Math.round(base(e)+(Number(e?.speedBonus)||0));};}
  for(const e of globalThis.foes||[])hydrateEnemyCombatStats(e);
})();
