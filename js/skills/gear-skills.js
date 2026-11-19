/* v0.172 gear skills of the forest monsters' exclusive gear.
   - 野狼怒吼 (systemEffect 'haste'): the caster's basic attack interval is shortened by `power` (0.15 = 15%) for `duration`
     seconds. The interval is base × reference speed ÷ speed, so the speed is divided by (1 − power).
   - 藤蔓纏繞 (systemEffect 'bind'): a random living enemy has its basic attack charge reset to a full interval, once.
   - 凝膠復原 (passive effect key 'regenPerSecond'): while worn (or carried by a companion's token) restores a fixed amount of HP
     each second, in and out of battle. The HP changes through EmberwildBattleEffects.quiet, without a healing effect, because
     a pulse every second would flicker.
   Who has a gear skill: the wearer of an item whose skillId is that skill, or a companion whose token carries it
   (globalThis.__EMBERWILD_TOKEN_SKILL, installed by skill-extraction.js). */
(()=>{
  'use strict';
  const S=()=>globalThis.__EMBERWILD_SKILLS;
  const HASTE='skillHaste';
  function gearSkillIds(h){
    const out=new Set();if(!h)return out;
    for(const g of S()?.worn?.(h)||[])if(g?.skillId)out.add(g.skillId);
    const token=globalThis.__EMBERWILD_TOKEN_SKILL?.(h);if(token)out.add(token);
    return out;
  }
  globalThis.__EMBERWILD_GEAR_SKILL_IDS=gearSkillIds;
  function regenPerSecond(h){
    let total=0;
    for(const id of gearSkillIds(h)){
      const sk=S()?.byId(id);if(!sk||sk.disabled||sk.type!=='passive')continue;
      if(S().passiveEnabled?.(h,id)===false)continue;
      for(const e of sk.effects||[])if(e.key==='regenPerSecond')total+=Number(e.value)||0;
    }
    return total;
  }
  globalThis.__EMBERWILD_GEAR_REGEN=function(delta){
    if(!party||!(delta>0))return;
    const apply=()=>{for(const h of heroes()){if(!(h.hp>0))continue;const r=regenPerSecond(h);if(r>0)h.hp=Math.min(stats(h).hp,h.hp+r*delta);}};
    const fx=globalThis.EmberwildBattleEffects;if(fx?.quiet)fx.quiet(apply);else apply();
  };
  globalThis.__EMBERWILD_GEAR_REGEN_RATE=regenPerSecond;

  function bind(e){
    const T=globalThis.EmberwildSecondsCombat?.timeline;
    try{const a=T.find(e.id);a.basicAt=T.now+T.interval(a);return true;}catch{return false;}
  }
  const castBase=castPartySkill;
  castPartySkill=function(h,i,v){
    const sk=S()?.byPosition?.(h?.job,'core',i);
    if(!sk||!['haste','bind'].includes(sk.systemEffect))return castBase(h,i,v);
    if(!S().validCast(h,i,'core'))return false;
    const alive=foes.filter(e=>e.hp>0);if(!alive.length)return false;
    if(sk.systemEffect==='haste'){
      const key=heroKey(h);effects=effects.filter(e=>!(e.target===key&&e.kind===HASTE&&e.skill===sk.id));
      effects.push({source:memberKey(h),skill:sk.id,target:key,kind:HASTE,value:sk.power,until:partyClock+sk.duration,name:sk.name});
      note(characterName(h)+'・'+sk.name+'：普攻間隔縮短 '+Math.round(sk.power*100)+'%，持續 '+sk.duration+' 秒');
    }else{
      const e=alive[Math.floor(Math.random()*alive.length)];bind(e);
      note(characterName(h)+'・'+sk.name+' → '+(globalThis.combatEnemyName?.(e)||e.name)+' 被綑綁，普通攻擊重新蓄力');
    }
    return true;
  };
  const statsBase=battleStats;
  battleStats=function(h){
    const v=statsBase(h),haste=effectTotal(heroKey(h),HASTE);
    if(haste>0&&Number.isFinite(v.speed))v.speed=v.speed/(1-Math.min(.9,haste));
    return v;
  };
  // Old saves: 凝膠護甲 dropped in v0.163–v0.169 carries 凝膠緩衝 (gel-guard, now disabled); it now carries 凝膠復原. The item keeps
  // its slot, so team plans that reference it stay valid. (活芯護符 keeps its skill id, which is now 藤蔓纏繞.)
  function migrateOldGear(){let changed=0;for(const g of state?.bag||[])if(g?.skillId==='gel-guard'){g.skillId='gel-recovery';changed++;}return changed;}
  const loadBase=loadParty;loadParty=function(...args){const out=loadBase.apply(this,args);if(party&&migrateOldGear()){globalThis.__EMBERWILD_SKILL_REFRESH?.();save();}return out;};
  if(party&&migrateOldGear()){globalThis.__EMBERWILD_SKILL_REFRESH?.();save();}
  globalThis.__EMBERWILD_GEAR_SKILLS={gearSkillIds,regenPerSecond,bind};
})();
