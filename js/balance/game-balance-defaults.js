'use strict';
// Built-in static catalog; game runtime keeps ownership of mutations and migrations.
const GAME_BALANCE_DEFAULTS={
  combat:{
    elementMultipliers:{neutral:1,same:.8,strong:1.3,weak:.85},
    statCaps:{crit:.85,pierce:.65,evasion:.45,lifesteal:.25},
    minimumActiveCooldown:1
  },
  affixes:{
    qualityChance:{normal:.60,fine:.27,rare:.10,legendary:.03},
    qualityMultiplier:{normal:1,fine:1.4,rare:1.9,legendary:2.6},
    skillSpecialChance:.40,
    skillEffectShare:.72,
    extendedPoolChance:.55,
    procChancePerPointPercent:6,
    baseValues:{
      attackPerTier:{min:3,max:6},
      hpPerTier:{min:15,max:30},
      defensePerTier:{min:2,max:4},
      critPercent:{min:3,max:6,cap:18}
    },
    skillEffectPercent:{normal:0,fine:18,rare:30,legendary:45},
    cooldownReduction:{normal:0,fine:1,rare:1,legendary:2},
    extendedValues:{
      critDamage:{normal:5,fine:10,rare:15,legendary:20},
      pierce:{normal:5,fine:10,rare:15,legendary:20},
      lifesteal:{normal:1,fine:2,rare:3,legendary:4},
      evasion:{normal:2,fine:4,rare:6,legendary:8},
      elementDamage:{normal:5,fine:10,rare:15,legendary:20},
      raceDamage:{normal:5,fine:10,rare:15,legendary:20},
      resist:{normal:5,fine:10,rare:15,legendary:20},
      attackPercent:{normal:0,fine:0,rare:3,legendary:5}
    },
    rerollCost:{goldPerTier:80,dustPerRoll:10}
  }
};
