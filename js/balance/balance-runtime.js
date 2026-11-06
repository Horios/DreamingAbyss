
/* Update 16b: restore the shared expedition journal after later rewardGroupKill wrappers. */
const update16bRewardGroupKillBase=rewardGroupKill;
rewardGroupKill=function(e){
  if(e?.rewarded)return;
  const healingBefore=typeof healingInventory==='function'?{...healingInventory()}:{};
  const replay=!!globalThis.__EMBERWILD_OFFLINE_RULE_CACHE,bag=replay?party?.members?.[0]?.bag:null,tail=bag?.length||0;
  const owner=party?.members?.[0];
  const before=replay?{gold:owner.gold,ore:owner.ore,dust:owner.dust,potions:owner.potions,gems:[...owner.gems],materials:{...owner.materials}}:typeof combatLootSnapshot==='function'?combatLootSnapshot():null;
  const result=update16bRewardGroupKillBase(e);
  if(before&&party?.members?.[0]&&typeof addExpeditionLoot==='function'){
    const h=party.members[0];expeditionLoot.kills++;
    for(const [key,name] of [['gold','金幣'],['ore','鍛鐵'],['dust','寶石粉塵'],['potions','治療藥水']])addExpeditionLoot(name,h[key]-before[key]);
    for(const [id,n] of Object.entries(typeof healingInventory==='function'?healingInventory():{})){const item=SHOP.find(x=>x.id===id);if(item)addExpeditionLoot(item.name,n-(healingBefore[id]||0));}
    h.gems.forEach((n,i)=>addExpeditionLoot(GEMS[i].name,n-before.gems[i]));
    for(const [name,n] of Object.entries(h.materials))addExpeditionLoot(name,n-(before.materials[name]||0));
    const replaced=replay&&h.bag!==bag?new Set((bag||[]).slice(0,tail).map(g=>g.id)):null;
    for(const gearItem of replay&&h.bag===bag?h.bag.slice(tail):h.bag)if(replay?(!replaced||!replaced.has(gearItem.id)):!before.gear.has(gearItem.id))addExpeditionLoot(equipmentDisplayName(gearItem),1,typeof gearQualityRank==='function'?gearQualityRank(gearItem):Math.max(0,Math.min(3,Number(gearItem.rar)||0)));
  }
  return result;
};
