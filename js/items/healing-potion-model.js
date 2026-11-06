/* Shared potion definitions and one-time design migration. Player saves are untouched. */
(function(root){
 const defaults=[
  {id:'heal_small',type:'healPotion',cost:15,sellPrice:2,duration:0,cooldown:2,healAmount:20,shopAvailable:true,requiredVip:0,name:'簡易治療藥水',description:''},
  {id:'heal_standard',type:'healPotion',cost:200,sellPrice:4,duration:0,cooldown:3,healAmount:50,shopAvailable:true,requiredVip:1,name:'治療藥水',description:''},
  {id:'heal_greater',type:'healPotion',cost:500,sellPrice:7,duration:0,cooldown:4,healAmount:200,shopAvailable:false,requiredVip:0,name:'強效治療藥水',description:''},
  {id:'heal_supreme',type:'healPotion',cost:2000,sellPrice:12,duration:0,cooldown:5,healAmount:500,shopAvailable:false,requiredVip:0,name:'特級治療藥水',description:''}
 ];
 function migrateItems(items){for(const x of items||[]){if(x?.type!=='healPotion')continue;const d=defaults.find(d=>d.id===x.id);
  if(x.healAmount===undefined&&x.healFraction!==undefined){x.healAmount=d?.healAmount??50;if(d){x.cost=d.cost;x.shopAvailable=d.shopAvailable;x.requiredVip=d.requiredVip;}delete x.healFraction;}
  delete x.healFraction;x.shopAvailable??=d?.shopAvailable??true;x.requiredVip??=d?.requiredVip??0;
 }return items;}
 const DEFAULT_DROP_BANDS=[
  {minLevel:1,maxLevel:19,kinds:['normal','elite'],chance:0.02},
  {minLevel:20,maxLevel:39,kinds:['normal','elite'],chance:0.01},
  {minLevel:40,maxLevel:59,kinds:['normal','elite'],chance:0.01},
  {minLevel:60,maxLevel:0,kinds:['elite'],chance:0.005}
 ];
 const DIFFICULTY_COUNT=3;
 function dropDefaults(catalog){const sources=(catalog||[]).filter(m=>['normal','elite'].includes(m.kind)).map(m=>m.id);
  return defaults.map((x,i)=>{const band=DEFAULT_DROP_BANDS[i];return {id:'healing_'+x.id,name:x.name,enabled:true,type:'item',key:x.id,kinds:[...band.kinds],chanceByDifficulty:Array(DIFFICULTY_COUNT).fill(band.chance),quantityMin:1,quantityMax:1,sources:[...sources],minLevel:band.minLevel,maxLevel:band.maxLevel,independent:true};});
 }
 function migrateDrops(settings){const entries=settings?.drops?.entries;if(!Array.isArray(entries))return;
  const old=entries.findIndex(x=>x.id==='potion_all'&&x.type==='potion');if(old<0)return;
  entries.splice(old,1,...dropDefaults(settings.monsters?.catalog).filter(x=>!entries.some(r=>r.id===x.id)));
 }
 function migrate(doc){migrateItems(doc?.items);migrateDrops(doc?.balanceSettings);return doc;}
 function issues(item){const out=[];if(!Number.isSafeInteger(item.healAmount)||item.healAmount<1||item.healAmount>1e9)out.push('固定恢復 HP 必須為 1～1000000000 的整數');if(typeof item.shopAvailable!=='boolean')out.push('商店販售狀態必須為布林值');if(!Number.isSafeInteger(item.requiredVip)||item.requiredVip<0||item.requiredVip>99)out.push('VIP 等級必須為 0～99 的整數');if(item.healFraction!==undefined)out.push('請移除舊 healFraction 欄位');return out;}
 function dropIssues(rule){const out=[];if(!rule)return out;for(const k of ['minLevel','maxLevel'])if(rule[k]!==undefined&&(!Number.isSafeInteger(rule[k])||rule[k]<(k==='minLevel'?1:0)||rule[k]>1e9))out.push('怪物等級範圍無效');if(rule.minLevel!==undefined&&rule.maxLevel>0&&rule.maxLevel<rule.minLevel)out.push('最高等級不可小於最低等級');if(rule.independent!==undefined&&typeof rule.independent!=='boolean')out.push('獨立掉落設定必須為布林值');return out;}
 function lockReason(item,vip=0){if(item?.type!=='healPotion')return '';if(item.shopAvailable===false)return '尚未開放購買';if(vip<(item.requiredVip||0))return item.requiredVip===1?'銅級 VIP 解鎖':'VIP '+item.requiredVip+' 級解鎖';return '';}
 root.EmberwildHealingPotions={defaults,migrateItems,dropDefaults,migrateDrops,migrate,issues,dropIssues,lockReason};
})(globalThis);
