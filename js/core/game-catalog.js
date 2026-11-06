'use strict';
// Built-in static catalog; game runtime keeps ownership of mutations and migrations.
const CLASSES=[{name:'戰士',advanced:'破曉騎士',icon:'',desc:'堅守前線，以重擊與護盾承受攻勢。',hp:155,atk:19,def:9,main:'力量',skills:[['裂地斬','active',1,3,2.4,'damage'],['堅毅壁壘','active',4,6,1.6,'shield'],['反擊之刃','proc',7,0,.9,'damage'],['浴血重擊','proc',11,0,.45,'drain'],['聖鋼裁決','active',15,4,3.8,'damage'],['不屈戰意','proc',20,0,1.1,'shield']]},{name:'法師',advanced:'星火賢者',icon:'',desc:'法術普攻，以高倍率魔法突破敵人防線。',hp:105,atk:26,def:4,main:'智力',skills:[['火焰箭','active',1,3,2.8,'damage'],['冰霜護幕','active',4,5,1.5,'shield'],['餘燼爆發','proc',7,0,1.3,'damage'],['奧術汲取','proc',11,0,.5,'drain'],['隕星墜落','active',15,5,5.6,'damage'],['魔力迴響','proc',20,0,1.9,'damage']]},{name:'弓箭手',advanced:'逐風遊俠',icon:'',desc:'高暴擊遠程射擊，連續觸發追擊。',hp:120,atk:23,def:5,main:'敏捷',skills:[['穿透箭','active',1,3,2.6,'damage'],['林間休憩','active',4,5,1.3,'heal'],['連射','proc',7,0,1.2,'damage'],['獵手印記','proc',11,0,1.5,'damage'],['疾風箭雨','active',15,4,4,'damage'],['生命之箭','proc',20,0,.8,'drain']]},{name:'牧師',advanced:'晨光主教',icon:'',desc:'聖光普攻，治癒與庇護維持長期作戰。',hp:130,atk:20,def:7,main:'精神',skills:[['聖光審判','active',1,3,2.5,'damage'],['治癒禱言','active',4,4,1.8,'heal'],['懲戒','proc',7,0,1.1,'damage'],['生命泉源','proc',11,0,.8,'heal'],['黎明聖印','active',15,4,3.8,'damage'],['神聖庇護','proc',20,0,1.4,'shield']]}];
const MAPS=[{name:'苔光林地',min:1,max:5,icon:'',color:'#34483a',mobs:[['苔原史萊姆','','黏稠凝膠'],['林間野狼','','完整狼牙'],['迷路樹精','','活性樹芯']],boss:['古木守望者','','古木年輪']},{name:'風蝕礦坑',min:6,max:10,icon:'',color:'#494333',mobs:[['洞穴蝙蝠','','薄翼膜'],['岩背蜥蜴','','堅硬石鱗'],['礦坑魔偶','','魔偶齒輪']],boss:['礦脈巨人','','礦脈之心']},{name:'暮色沼澤',min:11,max:15,icon:'≋',color:'#3d394b',mobs:[['劇毒蛙','','劇毒腺體'],['幽光飛蛾','','微光鱗粉'],['沼地亡魂','','怨念碎片']],boss:['泥沼女巫','‍','女巫符印']},{name:'霜眠山脊',min:16,max:20,icon:'△',color:'#364956',mobs:[['霜牙雪狼','','霜牙'],['冰晶妖精','','冰晶翅片'],['雪原巨熊','‍','厚暖熊皮']],boss:['凜冬巨獸','','永凍結晶']},{name:'熔火遺跡',min:21,max:25,icon:'',color:'#57392e',mobs:[['熔岩蟲','','灼熱甲殼'],['火羽渡鴉','‍','不熄火羽'],['失控鎧甲','','焦黑鋼片']],boss:['熔爐暴君','','熔核']},{name:'星隕荒原',min:26,max:30,icon:'',color:'#3c3c53',mobs:[['虛空獵犬','','虛空尖牙'],['星塵水母','','星塵觸鬚'],['墜星魔像','','隕鐵核心']],boss:['星隕監視者','','星隕稜鏡']},{name:'終焉王座',min:40,max:40,icon:'',color:'#4a2c3b',mobs:[],boss:['噬日者・厄爾','','日蝕王冠']}];
// Each gem ID identifies one of five independent effects at one of three tiers.
const GEM_NAMES=['赤焰石','疾風石','靈巧石','生息石','守護石'];
const GEM_COLORS=['#ec5555','#51b878','#a57be4','#e9eef7','#559ff0'];
const GEM_RATES=[[.02,.04,.06],[.05,.10,.15],[.01,.02,.03],[.03,.06,.09],[.01,.02,.03]];
const GEM_KINDS=GEM_NAMES.length;
const GEMS=Array.from({length:GEM_KINDS*3},(_,id)=>{
 const kind=id%GEM_KINDS,tier=Math.floor(id/GEM_KINDS),pct=Number((GEM_RATES[kind][tier]*100).toFixed(3));
 const desc=[
  '技能效果 +'+pct+'%（加算型增幅）',
  '主動技能施放後 '+pct+'% 機率減少 1 回合冷卻（最低 1）',
  '普攻觸發技能發動率 +'+pct+' 個百分點',
  '技能成功發動後，使生命比例最低的存活隊友恢復施放者攻擊力 '+pct+'% 的生命',
  '技能成功發動後，使生命比例最低的存活隊友獲得施放者防禦力 '+pct+'% 的護盾（可與其他護盾累加）'
 ][kind];
 return {name:GEM_NAMES[kind]+'・'+(tier+1)+'階',desc,icon:'',color:GEM_COLORS[kind],kind,tier:tier+1};
});

const SLOTS=['武器','護甲','副手','飾品'];const RARITY=['普通','精良','稀有','傳說'];const AFFIX=['攻擊','生命','防禦','暴擊'];

const QUESTS=[{id:'wolves',title:'縫補獵人的披肩',desc:'林間野狼的狼牙，是獵人交換皮革的憑證。',mat:'完整狼牙',n:5,gold:300,ore:20},{id:'witch',title:'淨化沼澤',desc:'採集女巫符印，協助營地研究暮色詛咒。',mat:'女巫符印',n:2,gold:800,ore:55},{id:'stars',title:'鍛造師的最後一課',desc:'取得星隕監視者的稜鏡，準備迎戰噬日者。',mat:'星隕稜鏡',n:3,gold:2000,ore:120}];

const CLASS_GEAR=[['長劍','板甲','戰旗','飾品'],['法杖','法袍','魔典','飾品'],['長弓','皮甲','箭袋','飾品'],['權杖','聖衣','聖徽','飾品']];
const BOSS_GEAR=['古木誓約','礦脈共鳴','暮沼咒印','永凍之誓','熔核意志','隕星遺產'];

const MODES=[{name:'普通',hp:1,atk:1,def:1,xp:1,equip:[.22,.55,1],gem:[.04,.12,.35],boss:.25,ore:1,rare:.0015},{name:'困難',hp:1.8,atk:1.35,def:1.2,xp:1.3,equip:[.38,.75,1],gem:[.08,.22,.5],boss:.4,ore:1.5,rare:.004},{name:'地獄',hp:3,atk:1.8,def:1.45,xp:1.65,equip:[.55,.95,1],gem:[.13,.35,.7],boss:.6,ore:2,rare:.008}];
const ASCENDED_NAMES=['翠影秘境','深淵礦脈','幽冥水澤','極夜冰川','煉獄熔城','天隕聖域'];

const tierPrefixes=['旅人','礦紋','暮影','霜刻','熔火','星隕','翠影','深淵','幽冥','極夜','煉獄','天隕'];

const SUPPORT=[
 [{name:'戰吼',target:'allies',kind:'attack',value:.18,duration:10,cooldown:16,level:1}, {name:'守護誓言',target:'weakest',kind:'guard',value:.30,duration:8,cooldown:14,level:7}, {name:'破甲怒吼',target:'enemies',kind:'fracture',value:.20,duration:8,cooldown:15,level:15}],
 [{name:'奧術共鳴',target:'allies',kind:'power',value:.20,duration:10,cooldown:17,level:1}, {name:'時間凝滯',target:'enemies',kind:'weaken',value:.18,duration:7,cooldown:14,level:7}, {name:'元素灼印',target:'enemy',kind:'followup',element:'fire',value:.25,duration:10,cooldown:16,level:15}],
 [{name:'鷹眼指引',target:'allies',kind:'critical',value:.10,duration:12,cooldown:18,level:1}, {name:'獵手標記',target:'enemy',kind:'damageAmp',element:'physical',value:.20,duration:10,cooldown:15,level:7}, {name:'風行庇佑',target:'allies',kind:'guard',value:.15,duration:8,cooldown:16,level:15}],
 [{name:'晨光祝福',target:'allies',kind:'regen',value:.025,duration:10,cooldown:16,level:1}, {name:'聖光庇護',target:'weakest',kind:'guard',value:.35,duration:8,cooldown:14,level:7}, {name:'光明祈願',target:'allies',kind:'attack',value:.22,duration:10,cooldown:18,level:15}, {name:'苦痛蔓延',description:'指定攻擊力最高的夥伴，使其下一次單體技能對額外最多 2 名敵人造成 30% 傷害。',target:'rankedAllies',statusTarget:'rankedAllies',statusTargetStat:'attack',statusTargetOrder:'highest',statusTargetIncludeSelf:false,kind:'applyStatus',statusId:'pain-spread',element:'light',value:0,effectPerLevel:0,duration:99,cooldown:16,level:1}]
];
const EFFECT_NAMES={attack:'攻擊',guard:'減傷',fracture:'破甲',power:'技能效果',weaken:'攻擊降低',vulnerable:'承傷增加',critical:'暴擊率',regen:'每回合回復生命'};
const TARGET_NAMES={allies:'我方全體',weakest:'生命比例最低的隊友',enemies:'敵方全體',enemy:'目前集火目標'};

const SKILL_ELEMENTS=[['physical','light','physical','shadow','light','light'],['fire','ice','fire','shadow','fire','wind'],['wind','wind','physical','physical','wind','light'],['light','light','light','light','light','light']];
const REGION_ELEMENTS=['wind','physical','shadow','ice','fire','shadow'];
const ORIGINAL_RACES=[['spirit','beast','plant','plant'],['beast','beast','construct','construct'],['beast','spirit','undead','undead'],['beast','spirit','beast','beast'],['beast','beast','construct','demon'],['demon','spirit','construct','construct']];
const SUPPORT_ELEMENTS=[['physical','light','physical'],['wind','ice','fire'],['wind','physical','wind'],['light','light','light']];

const SIDE_REGIONS=[
 ['赤楓丘陵','fire',[['燼翼火蛾','燼翼粉',10,'spirit'],['赤鬃山狼','赤鬃毛皮',1,'beast'],['焦根樹人','焦根木髓',2,'plant'],['炭殼魔偶','炭殼碎片',6,'construct']],['赤楓炎靈','炎靈心木',3,'spirit']],
 ['潮汐洞窟','ice',[['潮影蝙蝠','潮影翼膜',4,'beast'],['寒潮蜥蜴','寒潮腺體',5,'beast'],['海霧幽魂','海霧結珠',11,'undead'],['鹽晶魔像','鹽晶塊',6,'construct']],['潮汐巨像','深潮齒輪',7,'construct']],
 ['白骨墓園','shadow',[['墓園亡魂','亡者殘響',11,'undead'],['噬骨獵犬','噬骨獠牙',20,'beast'],['墓火飛蛾','墓火鱗片',10,'spirit'],['腐枝守衛','腐枝黑核',2,'plant']],['白骨巫后','巫后骨印',11,'undead']],
 ['雷鳴高地','wind',[['雷牙蒼狼','雷牙',12,'beast'],['風暴妖精','風暴晶羽',13,'spirit'],['雷殼魔偶','雷殼銅片',6,'construct'],['高地巨熊','高地熊膽',14,'beast']],['雷鳴獸王','獸王雷角',15,'beast']],
 ['蒼翠聖所','light',[['聖樹幼靈','聖樹芽核',2,'plant'],['晶光妖精','晶光翼',13,'spirit'],['聖羽渡鴉','聖羽',17,'beast'],['失序聖鎧','聖鎧殘片',18,'construct']],['聖所守護者','聖所徽核',19,'construct']],
 ['幽冥邊境','shadow',[['冥界獵犬','冥犬黑牙',20,'demon'],['幽影水母','幽影觸鬚',21,'spirit'],['黑曜魔像','黑曜脊核',22,'construct'],['游蕩冤魂','邊境魂塵',11,'undead']],['幽冥觀測者','冥視之瞳',23,'demon']]
];
const HIGH_REGION_NAMES=['炎晶裂谷','深海祭壇','亡者王庭','風暴浮島','聖光禁林','日蝕深淵'];

const ITEM_FORMS=[
 [[{name:'闊刃劍',atk:1.2,critDamage:10},{name:'穿甲槍',atk:.95,pierce:12},{name:'汲血斧',atk:1.08,lifesteal:3}], [{name:'重型板甲',hp:1.15,def:1.25},{name:'決鬥鎧',hp:.9,def:.9,evasion:6}], [{name:'征戰旗',atk:1.2},{name:'守誓印',hp:1.3,exclusive:{attackPct:2}}]],
 [[{name:'炎晶杖',fixedEffects:[{key:'gearAtkPct',value:15},{key:'basicElement',value:'fire'}]},{name:'霜紋杖',fixedEffects:[{key:'attackPct',value:3},{key:'basicElement',value:'ice'}]},{name:'疾風法器',fixedEffects:[{key:'gearAtkPct',value:-5},{key:'attackPct',value:2},{key:'basicElement',value:'wind'}]}], [{name:'秘法袍',hp:1,exclusive:{attackPct:4}},{name:'月影袍',hp:.9,def:1,evasion:6}], [{name:'元素魔典',atk:1.15,elementBonus:8},{name:'回響符環',hp:1.1,exclusive:{attackPct:2}}]],
 [[{name:'狙擊長弓',atk:1.15,critDamage:12},{name:'穿雲弩',atk:1,pierce:12},{name:'風羽短弓',fixedEffects:[{key:'gearAtkPct',value:-5},{key:'evasion',value:4},{key:'basicElement',value:'wind'}]}], [{name:'獵手皮甲',hp:1,def:1.1},{name:'輕羽衣',hp:.9,def:.9,evasion:8}], [{name:'破甲箭袋',atk:1,pierce:8},{name:'鷹眼指環',atk:1.1,critDamage:15}]],
 [[{name:'晨光權杖',fixedEffects:[{key:'gearAtkPct',value:10},{key:'basicElement',value:'light'}]},{name:'淨化槌',atk:1,pierce:10},{name:'祈禱法杖',atk:.95,exclusive:{attackPct:5}}], [{name:'祝禱聖衣',hp:1.15,exclusive:{attackPct:3}},{name:'守護祭袍',hp:1,def:1.2}], [{name:'聖光徽記',atk:1.1,elementBonus:8},{name:'生命念珠',hp:1.25,exclusive:{attackPct:2}}]]
];
const EQUIP_POSITION_NAMES=['武器','護甲','副手','飾品 1','飾品 2'];

const CORE_SKILL_DEFAULT_DESCRIPTIONS=[
 ['以沉重武器震裂地面，正面擊潰敵人。','架起堅固防勢，以護盾吸收來襲傷害。','抓住敵人攻勢的空隙，順勢追加一次反擊。','以兇猛重擊奪取敵人的生命力補充自身。','凝聚聖鋼之力，向敵人降下沉重裁決。','在持續作戰中激發意志，為自身形成護盾。'],
 ['射出凝聚火焰的魔法箭，灼穿眼前的敵人。','展開冰霜護幕，以護盾隔絕來襲傷害。','讓殘留的魔力驟然引爆，追加猛烈的法術攻勢。','以奧術迴路抽取敵人的生命力，回補自身。','召來高空隕星，以龐大魔力轟擊戰場。','讓殘存魔力再次共鳴，形成追加的法術打擊。'],
 ['以強勁箭矢貫穿目標，迅速壓制敵人。','藉由短暫喘息恢復傷勢，維持遠征節奏。','趁普攻命中時連續補上箭矢，延續攻勢。','鎖定獵物的破綻，在射擊間追加精準打擊。','引導疾風化作箭雨，覆蓋前方敵群。','將生命之力附著於箭矢，命中後回補自身。'],
 ['以聖光審判敵人，將信念化為直接攻勢。','以禱言治癒傷勢，優先扶起最需要支援的隊友。','在普通攻擊間引發聖光懲戒，追加神聖打擊。','喚起持續湧出的生命力，為受傷隊友提供治療。','刻下黎明聖印，以耀眼聖光壓制敵人。','以神聖力量庇護自身，形成護盾。']
];
const SUPPORT_SKILL_DEFAULT_DESCRIPTIONS=[
 ['以戰吼鼓舞隊伍，讓全員更積極地發動攻勢。','將守護誓言施加在最危急的隊友身上，替其承受壓力。','以怒吼動搖敵方防線，讓整個敵群更容易受到傷害。'],
 ['讓奧術能量在隊伍間共鳴，強化技能的發揮。','干擾敵人的時間感，使整個敵群的攻勢變得遲滯。','在集火目標上留下元素印記，放大後續攻擊的效果。'],
 ['以鷹眼般的視野指引隊伍，提高抓住致命破綻的機會。','標記目前鎖定的獵物，使隊伍更容易對其造成有效傷害。','以流動氣流環繞隊伍，減輕敵方攻擊造成的壓力。'],
 ['以晨光祝福全隊，讓生命力在戰鬥中持續回流。','將聖光集中在最危急的隊友身上，形成強力庇護。','向全隊獻上祈願，鼓舞眾人的攻擊意志。']
];

const AFFIX_RANK=['普通','精良','稀有','傳說'];
