/* Shared inventory catalogue derived from the existing balance references. */
(function(root){
  const kinds=['equipment','item','material','gem','token','skill'],copy=x=>structuredClone(x);
  const materialGlyphs={'鍛鐵':'anvil','粉塵':'sparkles','以太鍛鐵':'anvil','光輝碎塊':'sparkles','紅色草':'leaf','小蟲':'bug','清水':'droplet','藥水瓶':'flask-round','升級卷軸':'scroll-text'};
  const tokenGlyphs={berserk:'swords',guardian:'shield',pursuit:'crosshair',arcane:'wand-sparkles',echo:'audio-lines',hunt:'bow-arrow',prayer:'hand-heart',revival:'heart-pulse',plunder:'droplets',endurance:'hourglass'};
  function fallback(kind,key,item){
    if(kind==='material')return 'lucide:'+(materialGlyphs[key]||(/牙|骨/.test(key)?'bone':/翼|羽/.test(key)?'feather':/晶|石/.test(key)?'gem':/齒輪/.test(key)?'cog':'package'));
    if(kind==='equipment')return 'lucide:'+({sword:'sword',axe:'axe',hammer:'hammer',bow:'bow-arrow',crossbow:'crosshair',staff:'wand-sparkles',grimoire:'book-open',prayerBook:'book-heart',holyStaff:'wand-sparkles'}[item?.weaponType]||['sword','shirt','shield','gem'][item?.slot??0]);
    if(kind==='gem')return 'lucide:gem';if(kind==='token')return 'lucide:'+(tokenGlyphs[key]||'medal');
    const type=item?.type||'',ticket=key==='level_scroll'||key.startsWith('companion-ticket-')||type==='levelScroll'||type==='timedBoost';
    return 'lucide:'+(ticket?'ticket':['healPotion','imbue','ward','elementTonic'].includes(type)?'flask-round':type==='gearTierReroll'?'sparkles':'package');
  }
  function entries(doc){
    const out=[],seen=new Set(),add=(kind,key,name,item)=>{key=String(key);const id=kind+':'+key;if(!key||seen.has(id))return;seen.add(id);out.push({id,kind,key,name:name||key,fallback:fallback(kind,key,item)});};
    for(const [job,slots] of (doc.equipmentForms||[]).entries())for(const [slot,forms] of slots.entries())for(const [index,form] of forms.entries()){add('equipment','form:'+job+':'+slot+':'+index,form.name,{...form,slot});Object.assign(out.at(-1),{job,slot,index,weaponType:form.weaponType});}
    for(const [region,map] of (doc.balanceSettings?.maps?.catalog||[]).entries())if(map.mapType!=='final'&&region!==6)for(const [job,cls] of (doc.classes||[]).entries()){const slot=[0,1,2,0,1,3][Math.max(0,Math.min(5,map.family??0))];add('equipment','boss:'+region+':'+job,map.name+' BOSS・'+cls.name+'・'+['武器','護甲','副手','飾品'][slot],{slot});Object.assign(out.at(-1),{job,slot,region});}
    for(const [job,cls] of (doc.classes||[]).entries())for(const [index,sk]of (cls.skills||[]).entries())add('skill','core:'+job+':'+index,sk.name);
    for(const [job,list]of (doc.supportSkills||[]).entries())for(const [index,sk]of list.entries())add('skill','support:'+job+':'+index,sk.name);
    for(const item of doc.items||[])add('item',item.id,item.name,item);add('item','level_scroll','升級卷軸');
    for(const p of doc.companions||[])if(['ticket','achievement'].includes(p.unlockCondition?.type))add('item','companion-ticket-'+p.id,p.name+'招募券');
    for(const key of ['鍛鐵','粉塵','以太鍛鐵','光輝碎塊','紅色草','小蟲','清水','藥水瓶'])add('material',key,key);
    for(const r of doc.balanceSettings?.economy?.materialPrices||[])if(r.key!=='升級卷軸')add('material',r.key,r.key);
    for(const m of doc.balanceSettings?.monsters?.catalog||[])if(m.material)add('material',m.material,m.material);
    for(const r of [...(doc.balanceSettings?.drops?.entries||[]),...(doc.balanceSettings?.equipment?.salvage?.extraRewards||[])])if(r.type==='material')add('material',r.key,r.key);
    for(const r of [...(doc.lifeSkills?.gathering||[]),...Object.values(doc.lifeSkills?.recipes||{})]){
      for(const p of [r,...(r.bonusDrops||[])])if(p.outputType==='material')add('material',p.output,p.output);
      for(const [key,,type='material'] of r.inputs||[])if(type==='material')add('material',key,key);
    }
    ['赤焰石','疾風石','靈巧石','生息石','守護石'].forEach((name,i)=>{for(let tier=0;tier<3;tier++)add('gem',i+tier*5,name+'・'+(tier+1)+'階');});
    for(const t of doc.companionTokens?.catalog||[])add('token',t.id,t.name);
    for(const key of Object.keys(doc.lifeSkills?.materialBuyPrices||{}))add('material',key,key);
    for(const pool of [doc.shopSettings?.fixedOffers,doc.shopSettings?.randomOffers])for(const r of pool?.entries||[])if(r.type==='material'&&r.key!=='region')add('material',r.key,r.key);
    for(const m of doc.balanceSettings?.monsters?.catalog||[])if(m.kind==='boss'&&m.material)for(const [mode,prefix]of [[1,'困難'],[2,'地獄']]){add('material','【'+prefix+'】'+m.material,'【'+prefix+'】'+m.material);Object.assign(out.find(r=>r.id==='material:【'+prefix+'】'+m.material),{region:m.mapIndex,difficulty:mode});}
    for(const r of doc.inventoryIcons||[])if(r.kind==='material')add('material',r.key,r.key);
    for(const r of doc.inventoryIcons||[])for(const p of r.salvageRewards||[])if(p.type==='material')add('material',p.key,p.key);
    const byId=new Map(out.map(r=>[r.id,Object.assign(r,{sources:[],sourceDetails:[],recipes:[],alchemyIngredient:r.kind==='material'||r.kind==='item'&&(doc.items||[]).some(x=>x.id===r.key)})]));
    const source=(kind,key,type,label,section)=>{const row=byId.get(kind+':'+key);if(!row)return;if(!row.sources.includes(type))row.sources.push(type);row.sourceDetails.push({type,label,section});};
    for(const r of doc.lifeSkills?.gathering||[])for(const drop of [r,...(r.bonusDrops||[])])source(drop.outputType,drop.output,'gather',r.name,'gatheringProducts');
    for(const [id,r] of Object.entries(doc.lifeSkills?.recipes||{})){
      source(r.outputType,r.output,'alchemy',r.name,'alchemyRecipes');
      for(const [key,quantity,kind='material']of r.inputs||[]){const row=byId.get(kind+':'+key);if(row)row.recipes.push({id,name:r.name,quantity});}
    }
    for(const key of Object.keys(doc.lifeSkills?.materialBuyPrices||{}))source('material',key,'shop','生活技能商店','inventoryIcons');
    for(const [pool,label] of [[doc.shopSettings?.fixedOffers,'固定商店'],[doc.shopSettings?.randomOffers,'隨機商店']])for(const r of pool?.entries||[]){
      if(r.enabled===false)continue;
      if(r.type==='material'&&r.key==='region'){for(const m of doc.balanceSettings?.monsters?.catalog||[])if(m.material&&m.enabled!==false)source('material',m.material,'shop',label+'（地區材料）','shopSettings');}
      else if(r.type==='gem'&&r.key==='random'){for(let i=0;i<5;i++)source('gem',i,'shop',label,'shopSettings');}
      else{const kind=['ore','dust','material'].includes(r.type)?'material':r.type,key=r.type==='ore'?'鍛鐵':r.type==='dust'?'粉塵':r.key;source(kind,key,'shop',label,'shopSettings');}
    }
    const monsters=(doc.balanceSettings?.monsters?.catalog||[]).filter(m=>m.enabled!==false||m.kind!=='boss'&&(m.bossStageCount||0)>0);
    for(const r of doc.balanceSettings?.drops?.entries||[]){
      if(r.enabled===false)continue;
      const targets=monsters.filter(m=>(!r.sources?.length||r.sources.includes(m.id))&&(!r.kinds?.length||r.kinds.includes(m.kind)||m.kind==='normal'&&m.eliteEnabled!==false&&r.kinds.includes('elite')));
      if(!targets.length)continue;
      const label=r.name||r.key;
      if(r.type==='sourceMaterial')for(const m of targets)if(m.material)source('material',m.material,'monster',m.name+' · '+label,'balanceSettings:drops');
      if(['material','item','ore','dust','token','equipment'].includes(r.type))source(['ore','dust'].includes(r.type)?'material':r.type,r.type==='ore'?'鍛鐵':r.type==='dust'?'粉塵':r.key,'monster',label,'balanceSettings:drops');
      if(r.type==='gem')for(let i=0;i<3;i++)if(r.key==='random'||String(i)===r.key)source('gem',i,'monster',label,'balanceSettings:drops');
      if(r.type==='potion'){const item=(doc.items||[]).find(x=>x.id==='heal_standard')||(doc.items||[]).find(x=>x.type==='healPotion');if(item)source('item',item.id,'monster',label,'balanceSettings:drops');}
      if(['gear','gearLegendary','bossGear'].includes(r.type))for(const row of out.filter(x=>x.kind==='equipment'))if(r.type==='bossGear'?row.region!==undefined&&targets.some(m=>m.mapIndex===row.region):row.index!==undefined)source('equipment',row.key,'monster',label,'balanceSettings:drops');
    }
    if(doc.companionTokens?.drop?.enabled!==false)for(const t of doc.companionTokens?.catalog||[])if(t.drop?.enabled!==false)source('token',t.id,'monster','信物掉落設定','companionTokens');
    for(const row of out)row.categoryPath=(doc.inventoryIcons||[]).find(x=>x.kind===row.kind&&String(x.key)===row.key)?.categoryPath||categoryPath(doc,row);
    enrich(doc,out);
    return out;
  }

  // The workbench owns description text. Legacy fields are import-only adapters.
  const descriptionDefaults={"item:imbue_fire": "讓武器暫時附著火之力，調整普通攻擊的屬性。", "item:ward_fire": "以火之力形成短暫防護，降低對應屬性的威脅。", "item:elementTonic_fire": "強化對火之力的運用，使對應屬性的攻勢更加集中。", "item:imbue_ice": "讓武器暫時附著冰之力，調整普通攻擊的屬性。", "item:ward_ice": "以冰之力形成短暫防護，降低對應屬性的威脅。", "item:elementTonic_ice": "強化對冰之力的運用，使對應屬性的攻勢更加集中。", "item:imbue_wind": "讓武器暫時附著風之力，調整普通攻擊的屬性。", "item:ward_wind": "以風之力形成短暫防護，降低對應屬性的威脅。", "item:elementTonic_wind": "強化對風之力的運用，使對應屬性的攻勢更加集中。", "item:imbue_light": "讓武器暫時附著光之力，調整普通攻擊的屬性。", "item:ward_light": "以光之力形成短暫防護，降低對應屬性的威脅。", "item:elementTonic_light": "強化對光之力的運用，使對應屬性的攻勢更加集中。", "item:imbue_shadow": "讓武器暫時附著暗之力，調整普通攻擊的屬性。", "item:ward_shadow": "以暗之力形成短暫防護，降低對應屬性的威脅。", "item:elementTonic_shadow": "強化對暗之力的運用，使對應屬性的攻勢更加集中。", "item:exp_100_30m": "暫時增加出戰角色取得的經驗值。", "item:drop_50_30m": "暫時提高物品掉落機率。", "item:heal_small": "恢復少量固定生命值，供戰鬥中緊急補血使用。", "item:heal_standard": "恢復固定生命值，可作為戰鬥中的備用補給。", "item:heal_greater": "恢復較多固定生命值，適合生命偏低時救急。", "item:heal_supreme": "提供大量固定生命值恢復，供危急戰況使用。", "item:power_tier_reroll": "重新抽選一件裝備的 T1～T10 強度階級；抽選分布依該裝備原始掉落難度決定。", "material:鍛鐵": "裝備強化材料。", "material:粉塵": "裝備強化、洗鍊與寶石合成材料。", "material:以太鍛鐵": "高階裝備強化材料。", "material:光輝碎塊": "洗鍊時用於保留指定詞條。", "material:紅色草": "採集後可與清水、藥水瓶直接煉製簡易治療藥水。", "material:小蟲": "尚無用途。", "material:清水": "製作簡易治療藥水的煉金材料，每份配方消耗 1 份。", "material:藥水瓶": "製作簡易治療藥水的空瓶，每份配方消耗 1 個。", "gem:0": "技能效果 +2%", "gem:1": "主動施放後 5% 機率冷卻 −1 回合", "gem:2": "觸發率 +1 個百分點", "gem:3": "生命比例最低的存活隊友恢復攻擊力 3% 生命", "gem:4": "生命比例最低的存活隊友獲得施放者防禦力 1% 可累加護盾", "item:level_scroll": "提升全隊共用等級 1 級，後備與名冊夥伴同步成長。"};
  const descriptionRecord=(doc,kind,key)=>(doc.inventoryIcons||[]).find(r=>r.kind===kind&&String(r.key)===String(key));
  function itemDescription(doc,kind,key){return descriptionRecord(doc,kind,key)?.description??'';}
  function migrateDescriptions(input,{hydrate=false}={}){
    const doc=copy(input),list=doc.inventoryIcons||[],meta=new Map(list.map(r=>[r.kind+':'+r.key,r]));
    const rows=entries(doc).filter(r=>r.kind!=='skill');
    for(const row of rows){
      let record=meta.get(row.id);
      if(!record){record={kind:row.kind,key:row.key,iconType:'auto'};list.push(record);meta.set(row.id,record);}
      if(!Object.hasOwn(record,'description')){
        const native=object(doc,row),rules=[...(doc.shopSettings?.fixedOffers?.entries||[]),...(doc.shopSettings?.randomOffers?.entries||[])];
        const rule=rules.find(r=>r.description&&((row.kind==='item'&&r.type==='item'&&r.key===row.key)||(row.kind==='gem'&&r.type==='gem'&&(r.key===row.key||r.key==='random'))||(row.kind==='material'&&((r.type==='material'&&(r.key===row.key||r.key==='region'))||(r.type==='ore'&&row.key==='鍛鐵')||(r.type==='dust'&&row.key==='粉塵')))));
        const bossSource=(doc.balanceSettings?.monsters?.catalog||[]).find(m=>m.material===row.key);
        record.description=(native?.description||native?.desc||undefined)??(row.kind==='item'&&row.key==='power_tier_reroll'?(doc.equipmentPowerSystem?.rerollItem?.description||undefined):undefined)??descriptionDefaults[row.id]??rule?.description??(row.key.startsWith('companion-ticket-')?'使用後開放該夥伴招募，再到夥伴名冊加入隊伍。':bossSource?'取自'+bossSource.name+'的探索素材。':row.kind==='material'?'共用材料。':'');
      }
      if(typeof record.description!=='string'||record.description.length>2000)throw Error('物品說明必須是最多 2000 字的文字：'+row.id);

    }
    doc.inventoryIcons=list;
    for(const row of rows){if(row.kind==='equipment'&&row.region!==undefined)continue;const native=object(doc,row);if(native){delete native.desc;delete native.description;if(hydrate&&row.kind!=='equipment')native.description=meta.get(row.id).description;}}
    if(doc.equipmentPowerSystem?.rerollItem){delete doc.equipmentPowerSystem.rerollItem.description;if(hydrate)doc.equipmentPowerSystem.rerollItem.description=meta.get('item:power_tier_reroll')?.description??'';}
    for(const pool of [doc.shopSettings?.fixedOffers,doc.shopSettings?.randomOffers])for(const r of pool?.entries||[]){delete r.description;if(hydrate)r.description='';}
    return doc;
  }
  const weaponLabels={sword:'劍',axe:'斧',hammer:'槌',bow:'弓',crossbow:'弩',staff:'法杖',grimoire:'魔導書',prayerBook:'祈禱書',holyStaff:'聖杖'};
  function categoryPath(doc,row){
    const name=row.name,key=row.key,slot=row.slot;
    if(row.kind==='equipment'){
      const path=['裝備','主角裝備',['武器','護甲','副手','飾品'][slot]||'其他部位'];
      if(row.region!==undefined)return [...path,'BOSS 專屬模板'];
      if(slot===0)return [...path,weaponLabels[row.weaponType]||'未指定'];
      if(slot===1)return [...path,/甲|鎧/.test(name)?'重裝／鎧甲':/皮|羽衣/.test(name)?'皮甲／輕裝':row.job===1?'法袍':'祭袍／聖衣'];
      if(slot===2)return [...path,['戰旗','魔典','箭袋','徽記'][row.job]||'其他'];
      return [...path,/環/.test(name)?'指環':/念珠/.test(name)?'念珠':'印記'];
    }
    if(row.kind==='token'){const a=doc.companionTokens?.catalog?.find(x=>x.id===key)?.ability?.action;return ['裝備','夥伴信物',['attack','guard','critical','power'].includes(a)?'增益型':['extraDamage','damageBonus'].includes(a)?'傷害型':'治療／護盾型'];}
    if(row.kind==='gem')return ['素材','技能培養素材','鑲嵌寶石'];
    if(row.kind==='material'){
      if(['鍛鐵','以太鍛鐵'].includes(key))return ['素材','裝備成長素材','強化材料'];
      if(key==='粉塵')return ['素材','裝備成長素材','強化／洗鍊／合成材料'];
      if(key==='光輝碎塊')return ['素材','裝備成長素材','詞條保留材料'];
      const plain=key.replace(/^【(?:困難|地獄)】/,'');
      if((doc.balanceSettings?.monsters?.catalog||[]).some(m=>m.kind==='boss'&&m.material===plain))return ['素材','製作材料','BOSS 裝備製作材料',key.startsWith('【困難】')?'困難材料':key.startsWith('【地獄】')?'地獄材料':'普通材料'];
      const shape={'紅色草':'自然原料','藍色草':'自然原料','小蟲':'自然原料','清水':'液體','藥水瓶':'容器'}[key];
      if(shape)return ['素材','製作材料','煉金與加工材料',shape];
      if(row.sources.includes('alchemy'))return ['素材','製作材料','煉金與加工材料','加工材料'];
      return ['素材','通用素材','區域通用素材'];
    }
    const item=(doc.items||[]).find(x=>x.id===key);
    if(key.startsWith('companion-ticket-'))return ['消耗品','卷軸與票券','夥伴招募券'];
    if(key==='level_scroll'||item?.type==='levelScroll')return ['消耗品','卷軸與票券','等級成長','升級卷軸'];
    if(item?.type==='timedBoost')return ['消耗品','卷軸與票券','限時增益',({exp:'經驗增益券',drop:'掉寶增益券'})[item.boostType]||'其他增益券'];
    if(item?.type==='healPotion')return ['消耗品','藥水','治療藥水'];
    if(['imbue','ward','elementTonic'].includes(item?.type))return ['消耗品','藥水','元素補給',({imbue:'附魔藥水',ward:'抗性藥水',elementTonic:'屬性增幅藥水'})[item.type]];
    if(item?.type==='gearTierReroll')return ['消耗品','裝備調整道具','強度重鑄石'];
    return ['消耗品','其他'];
  }
  const sourceLabels={gather:'採集',alchemy:'煉金／加工',shop:'商店',monster:'怪物',salvage:'分解',craft:'鍛造',quest:'任務／成就',mail:'信箱',initial:'初始配發'};
  const modes=['普通','困難','地獄'],classGear=[['長劍','板甲','戰旗','飾品'],['法杖','法袍','魔典','飾品'],['長弓','皮甲','箭袋','飾品'],['權杖','聖衣','聖徽','飾品']];
  function enrich(doc,out){
    const maps=doc.balanceSettings?.maps?.catalog||[],monsters=doc.balanceSettings?.monsters?.catalog||[],byId=new Map(out.map(r=>[r.id,r])),meta=new Map((doc.inventoryIcons||[]).map(r=>[r.kind+':'+r.key,r]));
    for(const row of out){row.sourceDetails=[];row.sources=[];row.uses=[];row.warnings=[];row.regions=row.region===undefined?[]:[row.region];row.jobs=row.job===undefined?[]:[row.job];row.elements=[];row.weaponTypes=row.weaponType?[row.weaponType]:[];row.storage=row.kind==='material'?row.key==='鍛鐵'?'共用鍛鐵庫':row.key==='粉塵'?'共用粉塵庫':'共用材料庫':row.kind==='gem'?'共用技能寶石庫':row.kind==='equipment'||row.kind==='token'?'共用裝備實例庫':'共用消耗品庫';}
    function add(kind,key,type,label,section,path='',rule={},active=true,usage=false){const row=byId.get(kind+':'+key);if(!row)return;const ref={type,label,section,path,active,...rule};const list=usage?row.uses:row.sourceDetails;if(!list.some(x=>x.type===type&&x.label===label&&x.path===path))list.push(ref);if(!usage&&active&&!row.sources.includes(type))row.sources.push(type);}
    const use=(kind,key,type,label,section,path='',rule={})=>add(kind,key,type,label,section,path,rule,true,true);
    for(const [i,r]of (doc.lifeSkills?.gathering||[]).entries())for(const [j,p]of [r,...(r.bonusDrops||[])].entries())add(p.outputType,p.output,'gather',r.name+(j?'（副產物）':''),'gatheringProducts','lifeSkills.gathering.'+i+(j?'.bonusDrops.'+(j-1):''),{periodMs:r.periodMs,chance:p.chance,quantity:p.quantity,refId:r.id},r.enabled!==false);
    for(const [id,r]of Object.entries(doc.lifeSkills?.recipes||{})){const path='lifeSkills.recipes.'+id;add(r.outputType,r.output,'alchemy',r.name,'alchemyRecipes',path,{periodMs:r.periodMs,chance:r.chance,quantity:r.quantity,refId:id},r.enabled!==false);for(const [i,[key,n,kind='material']]of (r.inputs||[]).entries())use(kind,key,'alchemy',r.name,'alchemyRecipes',path+'.inputs.'+i,{quantity:n,refId:id});}
    for(const [key,price]of Object.entries(doc.lifeSkills?.materialBuyPrices||{}))add('material',key,'shop','生活材料商店','inventoryIcons','lifeSkills.materialBuyPrices.'+key,{price,quantity:1});
    for(const [pool,label]of [['fixedOffers','固定商店'],['randomOffers','隨機商店']])for(const [i,r]of (doc.shopSettings?.[pool]?.entries||[]).entries()){
      const path='shopSettings.'+pool+'.entries.'+i,rule={price:r.unitPrice??doc.items?.find(x=>x.id===r.key)?.cost,quantity:r.quantity,quantityMin:r.quantityMin,quantityMax:r.quantityMax,chance:r.chance,refId:r.id};const active=r.enabled!==false;
      if(r.type==='material'&&r.key==='region')for(const m of monsters.filter(x=>x.kind==='normal'))add('material',m.material,'shop',label+'（地區材料）','shopSettings',path,rule,active);
      else if(r.type==='gem'&&r.key==='random')for(let g=0;g<5;g++)add('gem',g,'shop',label,'shopSettings',path,rule,active);
      else add(['ore','dust'].includes(r.type)?'material':r.type,r.type==='ore'?'鍛鐵':r.type==='dust'?'粉塵':r.key,'shop',label,'shopSettings',path,rule,active);
    }
    for(const [i,stage]of (doc.shopSettings?.equipmentStages||[]).entries())for(const [j,e]of stage.entries.entries()){
      for(const [group,slots]of (doc.equipmentForms||[]).entries())for(const [slot,forms]of slots.entries())for(const [index,form]of forms.entries())if(form.id===e.formId)add('equipment','form:'+group+':'+slot+':'+index,'shop',stage.name,'shopSettings','shopSettings.equipmentStages.'+i+'.entries.'+j,{price:e.unitPrice,quantity:e.quantity,level:stage.level,refId:e.id});
    }
    for(const [i,r]of (doc.balanceSettings?.drops?.entries||[]).entries()){
      const path='balanceSettings.drops.entries.'+i,targets=monsters.filter(m=>(!r.sources?.length||r.sources.includes(m.id))&&(!r.kinds?.length||r.kinds.includes(m.kind)||m.kind==='normal'&&m.eliteEnabled!==false&&r.kinds.includes('elite'))),rule={chanceByDifficulty:r.chanceByDifficulty,quantityMin:r.quantityMin,quantityMax:r.quantityMax,refId:r.id};
      const active=r.enabled!==false&&targets.some(m=>m.enabled!==false||m.kind!=='boss'&&(m.bossStageCount||0)>0&&maps[m.mapIndex]?.bossEnabled!==false);
      const grant=(kind,key,label,extra={})=>add(kind,key,'monster',label,'balanceSettings:drops',path,{...rule,...extra},active);
      if(r.type==='sourceMaterial')for(const m of targets){if(m.kind==='boss')for(let mode=0;mode<3;mode++)grant('material',(mode?'【'+modes[mode]+'】':'')+m.material,m.name+' · '+modes[mode],{region:m.mapIndex,difficulty:mode,monsterId:m.id});else grant('material',m.material,m.name,{region:m.mapIndex,monsterId:m.id});}
      else if(r.type==='material'&&r.key==='升級卷軸')grant('item','level_scroll',r.name||r.key);
      else if(['material','item','ore','dust','token','equipment'].includes(r.type))grant(['ore','dust'].includes(r.type)?'material':r.type,r.type==='ore'?'鍛鐵':r.type==='dust'?'粉塵':r.key,r.name||r.key);
      else if(r.type==='gem')for(let g=0;g<3;g++)if(r.key==='random'||String(g)===r.key)grant('gem',g,r.name);
      else if(r.type==='potion'){const item=doc.items?.find(x=>x.id==='heal_standard')||doc.items?.find(x=>x.type==='healPotion');if(item)grant('item',item.id,r.name);}
      else if(['gear','gearLegendary','bossGear'].includes(r.type))for(const row of out.filter(x=>x.kind==='equipment'))if(r.type==='bossGear'?row.region!==undefined&&targets.some(m=>m.mapIndex===row.region):row.index!==undefined)grant('equipment',row.key,r.name);
    }
    for(const row of out){
      if(row.kind==='equipment'&&row.region!==undefined){
        const map=maps[row.region],tier=Math.max(1,Math.ceil(map.min/(doc.balanceSettings?.progression?.regionTierLevels||5))),id=(map.parallel?'parallel':'legacy')+'_'+(tier>6?'high':'low')+'_'+map.family,profile=doc.equipmentPowerSystem?.bossAffixes?.find(x=>x.id===id);
        row.profileId=id;row.profileIndex=doc.equipmentPowerSystem?.bossAffixes?.findIndex(x=>x.id===id);row.name=(profile?.name||map.name)+(classGear[row.job]?.[row.slot]||doc.classes?.[row.job]?.name||'裝備');row.weaponTypes=row.slot===0?[...new Set((doc.equipmentForms?.[row.job]?.[0]||[]).map(f=>f.weaponType).filter(Boolean))]:[];
        row.craftModes=[];for(let mode=0;mode<3;mode++){const m=monsters.find(x=>x.mapIndex===row.region&&x.kind==='boss');if(!m)continue;const material=(mode?'【'+modes[mode]+'】':'')+m.material,quantity=doc.balanceSettings?.equipment?.boss?.craftMaterialCount??5,price=Math.round(tier*(doc.balanceSettings?.equipment?.boss?.craftGoldPerTier??250)*(mode+1));row.craftModes.push({mode,material,quantity,price});add('equipment',row.key,'craft',map.name+' · '+modes[mode]+' BOSS 製作','equipmentPower','equipmentPowerSystem.bossAffixes.'+row.profileIndex,{quantity:1,price,difficulty:mode},map.bossEnabled!==false);use('material',material,'craft',row.name+'（'+modes[mode]+'）','balanceSettings:equipment','balanceSettings.equipment.boss',{quantity,price,region:row.region});}
      }
      if(row.kind==='token'){row.slot=4;const index=doc.companionTokens?.catalog?.findIndex(x=>x.id===row.key),t=doc.companionTokens?.catalog?.[index];add('token',row.key,'monster','信物掉落','companionTokens','companionTokens.catalog.'+index+'.drop',{chanceByDifficulty:doc.companionTokens?.drop?.chanceByDifficulty,refId:row.key},doc.companionTokens?.drop?.enabled!==false&&t?.drop?.enabled!==false);row.jobs=t?.job===undefined||t.job==='all'?(doc.classes||[]).map((_,i)=>i):[Number(t.job)];use('token',row.key,'equip','夥伴穿戴','companionTokens','companionTokens.catalog.'+index);}
      if(row.kind==='gem'){add('gem',row.key,'craft','粉塵合成隨機寶石','balanceSettings:skills','balanceSettings.skills.gems',{quantity:1});use('gem',row.key,'socket','技能鑲嵌／卸除','balanceSettings:skills','balanceSettings.skills.gems');}
      if(row.kind==='item'){const item=doc.items?.find(x=>x.id===row.key);if(item){row.elements=item.element?[item.element]:[];row.storage=item.type==='healPotion'?'共用治療藥水庫':'共用消耗品庫';use('item',row.key,'consume',item.type==='healPotion'?'自動喝水':'使用消耗品',item.type==='healPotion'?'potions':item.type==='gearTierReroll'?'equipmentPower':'items','items.'+doc.items.indexOf(item),{quantity:1});}else if(row.key==='level_scroll'){row.storage='共用材料庫（升級卷軸）';use('item',row.key,'consume','全隊共用等級＋1','balanceSettings:progression','balanceSettings.progression');}else if(row.key.startsWith('companion-ticket-')){const p=doc.companions?.find(x=>'companion-ticket-'+x.id===row.key);row.storage='夥伴招募券庫';if(p){if(p.unlockCondition?.type==='achievement'){add('item',row.key,'quest','夥伴解鎖成就','companionUnlocks','companions.'+doc.companions.indexOf(p)+'.unlockCondition');add('item',row.key,'mail','成就信箱附件','companionUnlocks','companions.'+doc.companions.indexOf(p)+'.unlockCondition');}else add('item',row.key,'shop','指定夥伴招募券','companionUnlocks','companions.'+doc.companions.indexOf(p)+'.unlockCondition',{price:p.unlockCondition?.price});use('item',row.key,'consume','解鎖 '+p.name+'／重複券轉換','companionUnlocks','companions.'+doc.companions.indexOf(p)+'.unlockCondition');}}}
      if(row.kind==='equipment'&&row.index!==undefined){const form=doc.equipmentForms?.[row.job]?.[row.slot]?.[row.index];row.jobs=form?.wearableJobs||[row.job];row.elements=(form?.fixedEffects||[]).filter(e=>e.key==='basicElement').map(e=>e.value);use('equipment',row.key,'equip','主角穿戴','equipment','equipmentForms.'+row.job+'.'+row.slot+'.'+row.index);if(row.name==='穿甲槍'&&row.weaponType==='sword'||row.name==='淨化槌'&&row.weaponType==='holyStaff')row.warnings.push('名稱與有效武器類型不同；分類沿用現有武器規則。');}
    }
    for(const [job,pack]of (doc.starterPacks||[]).entries())for(const [i,g]of pack.entries())add('equipment','form:'+g.group+':'+g.slot+':'+g.form,'initial',(doc.classes?.[job]?.name||job)+' 初始裝備','starterPacks','starterPacks.'+job+'.'+i);
    for(const [job,rows]of (doc.starterPackItems||[]).entries())for(const [i,row]of rows.entries())add(row.kind,row.key,'initial',(doc.classes?.[job]?.name||job)+' 新手禮包','starterPacks','starterPackItems.'+job+'.'+i,{quantity:row.quantity});
    for(const [i,r]of (doc.balanceSettings?.equipment?.salvage?.extraRewards||[]).entries()){const path='balanceSettings.equipment.salvage.extraRewards.'+i;if(r.type==='gem'&&r.key==='random')for(let g=0;g<5;g++)add('gem',g,'salvage','品質 '+r.quality+' 分解產物','balanceSettings:equipment',path,{quantity:r.quantity});else add(['ore','dust'].includes(r.type)?'material':r.type,r.type==='ore'?'鍛鐵':r.type==='dust'?'粉塵':r.key,'salvage','品質 '+r.quality+' 分解產物','balanceSettings:equipment',path,{quantity:r.quantity});}
    for(const [i,r]of (doc.inventoryIcons||[]).entries())for(const [j,x]of (r.salvageRewards||[]).entries()){const key=x.type==='ore'?'鍛鐵':x.type==='dust'?'粉塵':x.key,kind=['ore','dust'].includes(x.type)?'material':x.type;add(kind,key,'salvage',(byId.get(r.kind+':'+r.key)?.name||r.key)+' 個別分解','inventoryIcons','inventoryIcons.'+i+'.salvageRewards.'+j,{quantity:x.quantity,refId:r.kind+':'+r.key});}
    for(const key of ['鍛鐵','粉塵'])add('material',key,'salvage','裝備與信物基本分解','balanceSettings:equipment','balanceSettings.equipment.salvage');
    for(const [key,label,path]of [['鍛鐵','裝備強化','equipment.enhance'],['以太鍛鐵','高階裝備強化','equipment.enhance'],['粉塵','強化／洗鍊／寶石合成','equipment.enhance'],['光輝碎塊','保留詞條洗鍊','equipment.salvage']])use('material',key,'upgrade',label,'balanceSettings:equipment','balanceSettings.'+path);
    use('material','粉塵','craft','技能寶石合成','balanceSettings:skills','balanceSettings.skills.gems',{quantity:doc.balanceSettings?.skills?.gems?.craftDust});
    const rewards=(r,label,path)=>{if(!r)return;for(const [kind,key,n]of [['material','鍛鐵',r.ore],['material','粉塵',r.dust],...((r.materials||[]).map(x=>['material',x.key,x.quantity])),...((r.items||[]).map(x=>['item',x.key,x.quantity])),...((r.potions||[]).map(x=>['item',x.key,x.quantity])),...((r.gemCounts||[]).map((n,i)=>['gem',String(i),n]))])if(n>0)add(kind,key,'quest',label,path.includes('.daily.')?'dailyQuests':'sideQuests',path,{quantity:n});if(r.randomGems>0)for(let g=0;g<5;g++)add('gem',g,'quest',label,path.includes('.daily.')?'dailyQuests':'sideQuests',path,{quantity:r.randomGems});};
    for(const [kind,quests]of [['daily',doc.balanceSettings?.quests?.design?.daily?.entries||[]],['side',doc.balanceSettings?.quests?.design?.side||[]]])for(const [i,q]of quests.entries()){
      const path='balanceSettings.quests.design.'+(kind==='daily'?'daily.entries.':'side.')+i;rewards(q.rewards,q.title,path+'.rewards');for(const o of q.objectives||[])if(o.type==='material'){const keys=o.key==='@currentMap'?monsters.filter(m=>m.kind==='normal').map(m=>m.material):[o.key];for(const key of keys)use('material',key,'quest',q.title,path.includes('.daily.')?'dailyQuests':'sideQuests',path,{quantity:o.quantity,quantityMax:o.quantityMax,refId:q.id});}
    }
    // Track existing scripted repeated commissions and tier-up materials explicitly.
    for(const m of monsters.filter(x=>x.kind==='normal'))use('material',m.material,'quest','區域委託／募集候選','balanceSettings:quests','balanceSettings.quests.board',{region:m.mapIndex});
    const starting=doc.balanceSettings?.progression?.starting||{};for(const [kind,key,n]of [['material','鍛鐵',starting.ore],['material','粉塵',starting.dust]])if(n>0)add(kind,key,'initial','初始資源','balanceSettings:progression','balanceSettings.progression.starting',{quantity:n});
    for(const row of out){const override=meta.get(row.id)||{};row.baseName=row.name;row.name=override.displayName||row.name;row.description=row.kind==='skill'?object(doc,row)?.description??'':override.description??'';row.tags=override.tags||[];row.categoryPath=override.categoryPath||categoryPath(doc,row);row.regions=[...new Set([...row.regions,...row.sourceDetails.map(x=>x.region).filter(Number.isInteger)])];row.canSell=override.saleEnabled??(!['gem','skill'].includes(row.kind)&&!row.key.startsWith('companion-ticket-'));row.customized=!!(Object.keys(override).some(k=>!['id','kind','key','iconType'].includes(k))||override.iconType&&override.iconType!=='auto');row.usageTypes=[...new Set(row.uses.map(x=>x.type))];}
  }
  function object(doc,row){if(row.kind==='item')return doc.items?.find(x=>x.id===row.key);if(row.kind==='token')return doc.companionTokens?.catalog?.find(x=>x.id===row.key);if(row.kind==='equipment')return row.region!==undefined?doc.equipmentPowerSystem?.bossAffixes?.find(x=>x.id===row.profileId):doc.equipmentForms?.[row.job]?.[row.slot]?.[row.index];}
  function query(doc,options={}){
    const rows=entries(doc).filter(r=>r.kind!=='skill'),terms=String(options.search||'').toLocaleLowerCase().split(/\s+/).filter(Boolean),selectedSources=options.sources||[];
    const filtered=rows.filter(r=>(options.hierarchy||[]).every((v,i)=>!v||r.categoryPath[i]===v)&&(!selectedSources.length||selectedSources.some(s=>r.sources.includes(s)))&&(!options.use||r.usageTypes.includes(options.use)||options.use==='ingredient'&&r.alchemyIngredient)&&(!options.job||r.jobs.includes(Number(options.job)-1))&&(!options.slot||r.slot===Number(options.slot)-1)&&(!options.element||r.elements.includes(options.element))&&(!options.weapon||r.weaponTypes.includes(options.weapon))&&(!options.region||r.regions.includes(Number(options.region)-1))&&(options.minPrice===''||options.minPrice===undefined||(r.price??economics(doc,r).sellPrice)>=Number(options.minPrice))&&(options.maxPrice===''||options.maxPrice===undefined||(r.price??economics(doc,r).sellPrice)<=Number(options.maxPrice))&&(!options.palette||(r.paletteId??(doc.inventoryIcons||[]).find(x=>x.kind===r.kind&&x.key===r.key)?.colorTemplateId)===options.palette)&&(!options.status||options.status==='custom'&&r.customized||options.status==='default'&&!r.customized||options.status==='noSource'&&!r.sources.length||options.status==='unused'&&!r.uses.length||options.status==='saleable'&&r.canSell||options.status==='unsaleable'&&!r.canSell||options.status==='warning'&&r.warnings.length)&&terms.every(t=>(r.searchText||[r.name,r.id,r.key,r.kind,r.description,...r.categoryPath,...r.tags,...r.sourceDetails.map(x=>x.label),...r.uses.map(x=>x.label)].join(' ').toLocaleLowerCase()).includes(t)));
    const compare=(a,b)=>{let n=0;switch(options.sort){case 'buyPrice':n=Math.min(...a.sourceDetails.filter(r=>r.type==='shop'&&r.price!==undefined).map(r=>r.price),Number.MAX_SAFE_INTEGER)-Math.min(...b.sourceDetails.filter(r=>r.type==='shop'&&r.price!==undefined).map(r=>r.price),Number.MAX_SAFE_INTEGER);break;case 'slot':n=(a.slot??99)-(b.slot??99);break;case 'region':n=Math.min(...a.regions,999)-Math.min(...b.regions,999);break;case 'price':n=(a.price??economics(doc,a).sellPrice)-(b.price??economics(doc,b).sellPrice);break;case 'sources':n=a.sourceDetails.length-b.sourceDetails.length;break;case 'uses':n=a.uses.length-b.uses.length;break;case 'name':n=a.name.localeCompare(b.name,'zh-Hant',{numeric:true});break;case 'id':n=a.id.localeCompare(b.id,undefined,{numeric:true});break;default:n=a.categoryPath.join('/').localeCompare(b.categoryPath.join('/'),'zh-Hant',{numeric:true});}return (options.direction==='desc'?-1:1)*(n||a.name.localeCompare(b.name,'zh-Hant',{numeric:true})||a.id.localeCompare(b.id));};
    return filtered.sort(compare);
  }
  function economics(doc,row,{quality=0,tier=1,enhance=0}={}){if(row.kind==='token')tier=1;
    const override=(doc.inventoryIcons||[]).find(x=>x.kind===row.kind&&String(x.key)===row.key),economy=doc.balanceSettings?.economy||{};
    const item=(doc.items||[]).find(x=>x.id===row.key),materialKey=row.key==='level_scroll'?'升級卷軸':row.key;
    const materialPrice=economy.materialPrices?.find(x=>x.key===materialKey)?.sellPrice??economy.materialDefaultSellPrice??0;
    const equipment=row.kind==='equipment'||row.kind==='token';
    const sellPrice=override?.sellPrice??(equipment?economy.equipmentSellPriceByQuality?.[quality]??0:row.kind==='material'||row.key==='level_scroll'?materialPrice:item?.sellPrice??0);
    const salvage=[];
    if(equipment){const cfg=doc.balanceSettings?.equipment?.salvage||{};salvage.push({type:'ore',key:'鍛鐵',quantity:Math.max(0,Math.round(tier*((cfg.oreBasePerTier||0)+quality*(cfg.orePerQualityPerTier||0)+enhance*(cfg.orePerEnhancePerTier||0))))},{type:'dust',key:'粉塵',quantity:Math.max(0,Math.round((cfg.dustBase||0)+quality*(cfg.dustPerQuality||0)))});salvage.push(...(cfg.extraRewards||[]).filter(x=>x.quality===quality));}
    const rewards=override?.salvageRewards??salvage;return {sellPrice,salvage:rewards,canSell:override?.saleEnabled??(!['gem','skill'].includes(row.kind)&&!row.key.startsWith('companion-ticket-'))};
  }
  function issues(doc,library=root.__EMBERWILD_SKILL_ICONS){
    const paletteErrors=root.EmberwildIconColors?.issues(doc)||[];
    if(doc.inventoryIcons===undefined)return paletteErrors;
    if(!Array.isArray(doc.inventoryIcons)||doc.inventoryIcons.length>20000)return ['道具圖示必須是最多 20000 筆的陣列'];
    const customItemIds=new Set((doc.items||[]).map(x=>x.id));const errors=[...paletteErrors],seen=new Set(),custom=new Set((doc.skillIcons||[]).map(x=>x.id));
    const known=new Set(entries({...doc,inventoryIcons:[]}).map(x=>x.id));
    for(const [i,r] of doc.inventoryIcons.entries()){
      if(!r||!kinds.includes(r.kind)||typeof r.key!=='string'||!r.key.trim()||r.key.length>100||['__proto__','constructor','prototype'].includes(r.key)){errors.push('道具圖示第 '+(i+1)+' 筆種類或名稱無效');continue;}
      const id=r.kind+':'+r.key;if(seen.has(id))errors.push('道具圖示重複：'+id);seen.add(id);
      if(r.kind!=='material'&&!known.has(id))errors.push('道具圖示引用不存在的道具：'+id);
      if(r.color!==undefined&&(typeof r.color!=='string'||!/^#[0-9a-fA-F]{6}$/.test(r.color)))errors.push('道具圖示顏色必須是 #RRGGBB：'+id);
      if(r.sellPrice!==undefined&&(!Number.isSafeInteger(r.sellPrice)||r.sellPrice<0||r.sellPrice>1e9))errors.push('個別道具售價必須是 0～1000000000 的整數：'+id);
      if(r.categoryPath!==undefined&&(!Array.isArray(r.categoryPath)||r.categoryPath.length<2||r.categoryPath.length>5||!['裝備','素材','消耗品'].includes(r.categoryPath[0])||r.categoryPath.some(x=>typeof x!=='string'||!x.trim()||x!==x.trim()||x.length>40)))errors.push('道具分類必須為 2～5 層，每層最多 40 字：'+id);
      if(r.displayName!==undefined&&(typeof r.displayName!=='string'||!r.displayName.trim()||r.displayName.length>80))errors.push('道具顯示名稱無效：'+id);
      if(r.tags!==undefined&&(!Array.isArray(r.tags)||r.tags.length>20||r.tags.some(x=>typeof x!=='string'||!x.trim()||x.length>40)))errors.push('用途標籤最多 20 個，每個最多 40 字：'+id);
      if(r.saleEnabled!==undefined&&typeof r.saleEnabled!=='boolean')errors.push('販售資格必須是布林值：'+id);
      if(r.salvageRewards!==undefined){if(!['equipment','token'].includes(r.kind)||!Array.isArray(r.salvageRewards)||r.salvageRewards.length>20)errors.push('個別分解產物只能設於裝備／信物，最多 20 筆：'+id);else for(const x of r.salvageRewards)if(!x||!['ore','dust','material','item','potion','gem'].includes(x.type)||typeof x.key!=='string'||!Number.isSafeInteger(x.quantity)||x.quantity<1||x.quantity>999||x.type==='material'&&(!x.key.trim()||['__proto__','constructor','prototype'].includes(x.key))||x.type==='item'&&!customItemIds.has(x.key)||x.type==='gem'&&!['random','0','1','2'].includes(x.key))errors.push('個別分解產物名稱、數量或引用無效：'+id);}
      if(r.description!==undefined&&(typeof r.description!=='string'||r.description.length>2000))errors.push('道具圖示說明必須是最多 2000 字的文字：'+id);
      const type=r.iconType,valid=typeof type==='string'&&(type==='auto'||(type.startsWith('custom:')?custom.has(type.slice(7)):library?(type==='none'||library.hasIcon(type)):/^(?:lucide:)?[a-z][a-z0-9-]*$/.test(type)));
      if(!valid)errors.push('道具圖示引用不存在或無效的圖示：'+id);
    }
    return errors;
  }
  function validate(doc,library){const errors=issues(doc,library);if(errors.length)throw Error(errors.join('\n'));return doc.inventoryIcons===undefined?undefined:copy(doc.inventoryIcons);}
  const api={itemDescription,migrateDescriptions,descriptionDefaults,VERSION:2,sourceLabels,itemDetailsVersion:2,kinds,entries,object,query,categoryPath,economics,fallback,issues,validate};root.EmberwildInventoryIcons=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
