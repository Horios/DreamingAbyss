'use strict';
// Extracted from core-game.js without changing exported globals or validation rules.
function cloneGameplaySettings(v){return JSON.parse(JSON.stringify(v));}
function mergeGameplayShape(def,src){
  if(Array.isArray(def))return def.map((v,i)=>mergeGameplayShape(v,Array.isArray(src)?src[i]:undefined));
  if(def&&typeof def==='object'){const out={};for(const k of Object.keys(def))out[k]=mergeGameplayShape(def[k],src&&typeof src==='object'?src[k]:undefined);return out;}
  if(typeof def==='number')return typeof src==='number'&&Number.isFinite(src)?src:def;
  return typeof src===typeof def?src:def;
}
function gameplayAt(root,path){return String(path).split('.').reduce((v,k)=>v?.[k],root);}
function validateGameplaySettings(cfg){
  const probs=[
   'equipment.lootOwnerSameJobChance','equipment.difficultyAffix.hardChance','equipment.difficultyAffix.hellChance','equipment.difficultyAffix.hardFineThreshold','equipment.difficultyAffix.hardRareThreshold','equipment.difficultyAffix.hellFineThreshold','equipment.difficultyAffix.hellRareThreshold','equipment.difficultyAffix.skillChance',
   'monsters.encounter.bossChance','monsters.encounter.eliteChance','rewards.equipmentQuality.rareChance','rewards.equipmentQuality.fineConditionalChance','rewards.potionDropChance','rewards.postVictoryHeal','rewards.radiant.normalElite','rewards.radiant.bossFinal','rewards.ether.eliteBase','rewards.ether.elitePerTier','rewards.ether.eliteCap','rewards.ether.bossRepeat','combat.autoPotionThreshold','combat.defeatGoldLoss','combat.supply.wardResistance','combat.supply.elementTonicDamage'
  ];
  for(const p of probs){const n=gameplayAt(cfg,p);if(!Number.isFinite(n)||n<0||n>1)throw Error('平衡設定機率需介於 0~1：'+p);}
  for(const mode of cfg.difficulty.modes)for(const p of [...mode.equipmentChance,...mode.gemChance,mode.bossGearChance,mode.legendaryGearChance])if(!Number.isFinite(p)||p<0||p>1)throw Error('難度掉落率需介於 0~1');
  for(const p of cfg.difficulty.materialChance)if(!Number.isFinite(p)||p<0||p>1)throw Error('素材掉落率需介於 0~1');
  if(cfg.monsters.encounter.bossChance+cfg.monsters.encounter.eliteChance>1)throw Error('BOSS 與菁英遭遇率合計不可超過 1');
  if(cfg.combat.groupSize.min<1||cfg.combat.groupSize.max<cfg.combat.groupSize.min)throw Error('群怪數量範圍無效');
  if(cfg.equipment.enhance.maxLevel<0||!Number.isInteger(cfg.equipment.enhance.maxLevel))throw Error('強化上限必須是非負整數');
  if(cfg.progression.levelCaps.beforeClear<1||cfg.progression.levelCaps.afterClear<cfg.progression.levelCaps.beforeClear)throw Error('等級上限設定無效');
  if(cfg.rewards.ether.firstBossMax<cfg.rewards.ether.firstBossMin)throw Error('首次 BOSS 以太鍛鐵範圍無效');
  cfg.maps.levelRanges.forEach((m,i)=>{if(!Number.isFinite(m.min)||!Number.isFinite(m.max)||m.min<1||m.max<m.min)throw Error('地圖等級範圍無效：'+i);});
  return cfg;
}
function normalizeGameplaySettings(input){return validateGameplaySettings(mergeGameplayShape(GAMEPLAY_SETTINGS_DEFAULTS,input||{}));}
