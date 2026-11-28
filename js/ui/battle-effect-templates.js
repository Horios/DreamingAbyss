/* Reusable visual effect templates for class basic attacks and skill casts.
   Pure presentation data and pure resolvers: never mutates combat state or RNG. */
(()=>{
 'use strict';
 const hexToRgb=hex=>{
  const clean=String(hex||'').replace('#','');
  if(clean.length!==6)return '255,121,111';
  return [0,2,4].map(i=>parseInt(clean.slice(i,i+2),16)).join(',');
 };
 const tone=(color,accent)=>Object.freeze({color,rgb:hexToRgb(color),accent:accent||color,accentRgb:hexToRgb(accent||color)});

 // Semantic category fallbacks (used by persistent layers and neutral status events).
 const CATEGORY_PALETTES=Object.freeze({
  damage:tone('#ff796f','#b8c2cf'),
  buff:tone('#f4d58b','#fff4cc'),
  shield:tone('#f2f5ff','#b8ccf8'),
  recovery:tone('#87efad','#e2ffef'),
  debuff:tone('#c495f0','#ecd8ff')
 });

 // Element palettes shared by Mage basic attacks and elemental skills.
 const ELEMENT_PALETTES=Object.freeze({
  physical:tone('#ff796f','#b8c2cf'),
  fire:tone('#ff6a3d','#ffd166'),
  ice:tone('#5cc8ff','#dff6ff'),
  lightning:tone('#ffd94a','#c5a3ff'),
  wind:tone('#48e0b8','#c9fff0'),
  light:tone('#f7cf52','#fff7d1'),
  shadow:tone('#b980ff','#e8ccff'),
  arcane:tone('#8b80ff','#d6d0ff')
 });

 // Class signature visual themes:
 // 0 戰士: 紅、灰 | 1 法師: 依元素著色 | 2 弓箭手: 鮮綠色 | 3 牧師: 金色聖光
 const CLASS_PALETTES=Object.freeze({
  0:tone('#ff796f','#b8c2cf'),
  1:ELEMENT_PALETTES.arcane,
  2:tone('#39e56d','#c8ffa8'),
  3:tone('#f7cf52','#fff7d1')
 });

 function normalizeElement(element){
  if(!element)return null;
  const key=String(element).toLowerCase();
  if(key==='thunder')return 'lightning';
  return Object.prototype.hasOwnProperty.call(ELEMENT_PALETTES,key)?key:null;
 }

 function elementPalette(element,fallback='arcane'){
  const key=normalizeElement(element);
  return ELEMENT_PALETTES[key]||ELEMENT_PALETTES[fallback]||CATEGORY_PALETTES.damage;
 }

 function classPalette(job,element){
  if(job===0){
   const el=normalizeElement(element);
   if(el&&el!=='physical')return tone(ELEMENT_PALETTES[el].color,CLASS_PALETTES[0].accent);
   return CLASS_PALETTES[0];
  }
  if(job===1){
   const el=normalizeElement(element);
   return elementPalette(el&&el!=='physical'?el:'arcane','arcane');
  }
  if(job===2){
   const el=normalizeElement(element);
   if(el&&el!=='physical'&&el!=='wind')return tone(CLASS_PALETTES[2].color,ELEMENT_PALETTES[el].accent);
   return CLASS_PALETTES[2];
  }
  if(job===3){
   const el=normalizeElement(element);
   if(el==='shadow')return ELEMENT_PALETTES.shadow;
   return CLASS_PALETTES[3];
  }
  return elementPalette(element,'physical');
 }

 // Shared 64x64 luminous SVG glyph artwork (consistent stroke-width/caps/glow language).
 const ELEMENT_ART=Object.freeze({
  fire:{
   basic:'<path d="M32 6C42 23 52 25 48 43C44 57 19 59 15 43C10 29 25 28 25 16L32 27Z" fill="currentColor" fill-opacity=".35" stroke="currentColor" stroke-width="2"/><path d="M32 28Q44 45 31 53Q20 46 32 28Z" fill="var(--fx-accent)" fill-opacity=".8" stroke="var(--fx-accent)" stroke-width="1.4"/><path d="M11 16L6 8M52 15L58 7M54 42L61 46" stroke="var(--fx-accent)" stroke-width="1.8"/>',
   blast:'<circle cx="32" cy="34" r="22" stroke="currentColor" stroke-width="1.6" stroke-dasharray="6 4"/><path d="M32 4C44 21 56 26 51 45C46 60 18 60 13 45C8 27 22 24 23 12L32 25Z" fill="currentColor" fill-opacity=".38" stroke="currentColor" stroke-width="2"/><path d="M32 24Q47 44 32 54Q17 44 32 24Z" fill="var(--fx-accent)" fill-opacity=".85" stroke="var(--fx-accent)" stroke-width="1.4"/><path d="M8 14L4 6M56 14L60 6M7 48L2 52M57 48L62 52" stroke="var(--fx-accent)" stroke-width="2"/>'
  },
  ice:{
   basic:'<path d="M32 5L43 24L32 58L21 24Z" fill="currentColor" fill-opacity=".28" stroke="currentColor" stroke-width="2"/><path d="M32 12L38 25L32 48L26 25Z" fill="var(--fx-accent)" fill-opacity=".65" stroke="var(--fx-accent)" stroke-width="1.2"/><path d="M6 28L20 38L11 54ZM52 26L60 41L46 54Z" stroke="currentColor" stroke-width="1.8"/><path d="M6 15L16 20M51 9L46 18" stroke="var(--fx-accent)" stroke-width="1.7"/>',
   blast:'<path d="M32 4V60M8 18L56 46M56 18L8 46" stroke="currentColor" stroke-width="2"/><path d="M32 14L46 23V41L32 50L18 41V23Z" fill="currentColor" fill-opacity=".24" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M26 9L32 15L38 9M26 55L32 49L38 55M10 25L18 24L15 16M54 39L46 40L49 48" stroke="var(--fx-accent)" stroke-width="1.7"/>'
  },
  lightning:{
   basic:'<path d="M41 4L16 33L32 30L22 60L51 23L34 26Z" fill="currentColor" fill-opacity=".42" stroke="currentColor" stroke-width="2"/><path d="M37 11L23 30L35 28L27 51" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M9 10L15 19M51 47L59 55M8 46L15 41" stroke="var(--fx-accent)" stroke-width="1.8"/>',
   blast:'<circle cx="32" cy="32" r="24" stroke="var(--fx-accent)" stroke-width="1.5" stroke-dasharray="5 5"/><path d="M42 3L14 33L31 30L20 61L52 23L34 26Z" fill="currentColor" fill-opacity=".48" stroke="currentColor" stroke-width="2"/><path d="M10 14L20 20L14 28M54 38L44 43L50 53" stroke="var(--fx-accent)" stroke-width="1.9"/>'
  },
  wind:{
   basic:'<path d="M8 22Q28 8 52 18Q36 25 18 28" stroke="currentColor" stroke-width="2.4"/><path d="M6 38Q30 22 57 34Q38 43 16 45" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2.2"/><path d="M15 52Q36 42 54 50" stroke="var(--fx-accent)" stroke-width="1.9"/><path d="M44 12L55 17L47 24M48 28L58 34L49 40" stroke="var(--fx-accent)" stroke-width="1.6"/>',
   blast:'<path d="M12 42Q6 20 28 11Q52 6 56 28Q58 50 34 54Q16 56 16 37Q16 22 33 22Q45 22 43 34" stroke="currentColor" stroke-width="2.4"/><path d="M6 26Q28 10 56 18M9 50Q34 40 58 46" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M28 6L35 12L27 16M35 58L28 53L36 48" stroke="var(--fx-accent)" stroke-width="1.6"/>'
  },
  light:{
   basic:'<circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="1.8" opacity=".75"/><path d="M32 5L37 26L58 32L37 38L32 59L27 38L6 32L27 26Z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="2"/><path d="M32 14L35 29L50 32L35 35L32 50L29 35L14 32L29 29Z" fill="var(--fx-accent)" stroke="var(--fx-accent)" stroke-width="1.2"/>',
   blast:'<circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="2"/><path d="M32 3L38 25L61 32L38 39L32 61L26 39L3 32L26 25Z" fill="currentColor" fill-opacity=".36" stroke="var(--fx-accent)" stroke-width="1.8"/><circle cx="32" cy="32" r="9" fill="var(--fx-accent)" fill-opacity=".65" stroke="currentColor" stroke-width="1.5"/>'
  },
  shadow:{
   basic:'<path d="M44 12A22 22 0 1 0 48 50A17 17 0 1 1 44 12Z" fill="currentColor" fill-opacity=".38" stroke="currentColor" stroke-width="2"/><path d="M18 46Q34 32 52 16" stroke="var(--fx-accent)" stroke-width="2"/><path d="M11 19L19 25M48 44L56 51M24 56L28 48" stroke="var(--fx-accent)" stroke-width="1.7"/>',
   blast:'<circle cx="32" cy="32" r="22" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2" stroke-dasharray="8 4"/><path d="M44 11A22 22 0 1 0 48 51A16 16 0 1 1 44 11Z" fill="currentColor" fill-opacity=".42" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M14 50L50 14M16 18L26 28M38 36L50 48" stroke="var(--fx-accent)" stroke-width="1.8"/>'
  },
  arcane:{
   basic:'<circle cx="32" cy="32" r="21" stroke="currentColor" stroke-width="1.8"/><path d="M32 6L37 26L58 32L37 38L32 58L27 38L6 32L27 26Z" fill="currentColor" fill-opacity=".28" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="32" r="7" fill="var(--fx-accent)" fill-opacity=".55" stroke="var(--fx-accent)" stroke-width="1.5"/><path d="M15 15L20 20M49 15L44 20M15 49L20 44M49 49L44 44" stroke="var(--fx-accent)" stroke-width="1.6"/>',
   blast:'<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="1.8" stroke-dasharray="6 3"/><polygon points="32,7 54,45 10,45" fill="currentColor" fill-opacity=".14" stroke="var(--fx-accent)" stroke-width="1.6"/><polygon points="32,57 54,19 10,19" fill="currentColor" fill-opacity=".14" stroke="currentColor" stroke-width="1.6"/><circle cx="32" cy="32" r="8" fill="var(--fx-accent)" fill-opacity=".65" stroke="var(--fx-accent)" stroke-width="1.4"/>'
  }
 });

 const ELEMENT_GLYPH=Object.freeze({
  fire:'fx-flame',
  ice:'fx-shatter',
  lightning:'fx-electric',
  wind:'fx-gale',
  light:'fx-holy',
  shadow:'fx-void',
  arcane:'fx-arcane'
 });

 // Built-in universal skill & attack effect templates.
 const registry=new Map();

 function registerTemplate(id,spec){
  if(!id||typeof id!=='string'||!spec||typeof spec!=='object')throw TypeError('Invalid battle effect template');
  const normalized={
   id,
   name:spec.name||id,
   description:spec.description||'',
   defaultCategory:spec.defaultCategory||'damage',
   variants:Object.freeze([...(spec.variants||['basic'])]),
   projectile:spec.projectile||'none',
   motion:spec.motion||'fx-ring',
   glyph:spec.glyph||'fx-impact',
   palette:typeof spec.palette==='function'?spec.palette:()=>CATEGORY_PALETTES[spec.defaultCategory||'damage'],
   svg:typeof spec.svg==='function'?spec.svg:()=>'',
   castSvg:typeof spec.castSvg==='function'?spec.castSvg:null,
   attackSvg:typeof spec.attackSvg==='function'?spec.attackSvg:null
  };
  registry.set(id,Object.freeze(normalized));
  return normalized;
 }

 // 1. 斬擊技能模板（亦為戰士普攻基準：紅＋鋼鐵灰）
 registerTemplate('slash',{
  name:'斬擊技能',
  description:'戰士普通攻擊與近戰斬擊／重劈／橫掃技能模板，以紅色弧光與鋼鐵灰劍鋒呈現。',
  defaultCategory:'damage',
  variants:['basic','heavy','aoe'],
  projectile:'none',
  motion:'fx-ring',
  glyph:v=>v==='heavy'||v==='aoe'?'fx-slash-heavy':'fx-slash',
  palette:ctx=>classPalette(0,ctx?.element),
  svg:(variant)=>{
   if(variant==='aoe'){
    return '<path d="M5 42Q32 8 59 38Q32 23 5 42Z" fill="currentColor" stroke="currentColor" stroke-width="2"/><path d="M7 48Q32 22 57 45" stroke="var(--fx-accent)" stroke-width="2.4"/><path d="M14 54Q32 35 50 52" stroke="var(--fx-accent)" stroke-width="1.6" opacity=".8"/><path d="M32 10V4M13 18L8 12M51 18L56 12" stroke="var(--fx-accent)" stroke-width="1.8"/>';
   }
   if(variant==='heavy'){
    return '<path d="M8 50Q19 10 55 11Q31 21 8 50Z" fill="currentColor" stroke="currentColor" stroke-width="2"/><path d="M13 13Q36 22 54 51Q33 34 13 13Z" fill="var(--fx-accent)" fill-opacity=".42" stroke="var(--fx-accent)" stroke-width="2"/><path d="M9 54L55 9" stroke="var(--fx-accent)" stroke-width="2.4"/><path d="M15 56L56 17M42 7L49 3M57 24L62 21" stroke="var(--fx-accent)" stroke-width="1.6"/>';
   }
   // Default warrior basic attack: original iconic slash crescent enhanced with steel-gray edge & glints.
   return '<path d="M9 49Q20 9 55 12Q30 20 9 49Z" fill="currentColor" stroke="currentColor" stroke-width="2"/><path d="M10 53L53 10" stroke="var(--fx-accent)" stroke-width="2.4"/><path d="M16 55Q32 28 57 18" stroke="var(--fx-accent)" stroke-width="1.5" opacity=".85"/><path d="M46 8L52 4M55 21L61 19M7 42L3 45" stroke="var(--fx-accent)" stroke-width="1.7"/>';
  },
  attackSvg:()=>'<path d="M12 46Q24 14 52 15" stroke="currentColor" stroke-width="3"/><path d="M15 51L53 13" stroke="var(--fx-accent)" stroke-width="2.2"/><path d="M43 10L54 11L53 22" stroke="var(--fx-accent)" stroke-width="2"/>',
  castSvg:()=>'<path d="M10 47Q24 12 54 14" stroke="currentColor" stroke-width="2.6"/><path d="M14 52L54 12" stroke="var(--fx-accent)" stroke-width="2"/><circle cx="32" cy="32" r="24" stroke="var(--fx-accent)" stroke-width="1.4" stroke-dasharray="6 4"/>'
 });

 // 2. 箭矢技能模板（弓箭手普攻與箭術技能：鮮綠色）
 registerTemplate('arrow',{
  name:'箭矢技能',
  description:'弓箭手普通攻擊與穿刺／狙擊／連射／箭雨技能模板，以鮮綠色疾風箭矢與箭形彈道呈現。',
  defaultCategory:'damage',
  variants:['basic','snipe','multi'],
  projectile:'arrow',
  motion:'fx-ring',
  glyph:v=>v==='multi'?'fx-volley':'fx-pierce',
  palette:ctx=>classPalette(2,ctx?.element),
  svg:(variant)=>{
   if(variant==='multi'){
    return '<path d="M6 40L39 11M14 52L49 21M24 58L57 29" stroke="currentColor" stroke-width="2.2"/><path d="M30 11L41 9L39 20Z" fill="currentColor" stroke="var(--fx-accent)" stroke-width="1.3"/><path d="M40 21L51 19L49 30Z" fill="currentColor" stroke="var(--fx-accent)" stroke-width="1.3"/><path d="M48 29L59 27L57 38Z" fill="currentColor" stroke="var(--fx-accent)" stroke-width="1.3"/><path d="M6 34L12 36L11 42M14 46L20 48L19 54M24 52L30 54L29 60" stroke="var(--fx-accent)" stroke-width="1.5"/>';
   }
   if(variant==='snipe'){
    return '<circle cx="38" cy="24" r="14" stroke="var(--fx-accent)" stroke-width="1.5" stroke-dasharray="5 3"/><path d="M38 6V12M38 36V42M20 24H26M50 24H56" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M6 55L53 10" stroke="currentColor" stroke-width="2.8"/><path d="M39 10L56 7L52 24L46 17Z" fill="currentColor" stroke="var(--fx-accent)" stroke-width="1.6"/><path d="M8 45L17 47L15 56" stroke="var(--fx-accent)" stroke-width="1.8"/>';
   }
   return '<path d="M8 52L51 13" stroke="currentColor" stroke-width="2.4"/><path d="M37 12L54 10L51 27L45 19Z" fill="currentColor" stroke="var(--fx-accent)" stroke-width="1.6"/><path d="M7 42L17 44L15 54M13 37L23 39L21 49" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M22 25Q34 17 44 13M26 43Q39 34 49 23" stroke="var(--fx-accent)" stroke-width="1.4" opacity=".8"/>';
  },
  attackSvg:()=>'<path d="M18 11Q48 32 18 53" stroke="currentColor" stroke-width="2.6"/><path d="M18 11L12 32L18 53" stroke="var(--fx-accent)" stroke-width="1.5"/><path d="M12 32H54M44 25L55 32L44 39" stroke="var(--fx-accent)" stroke-width="2.2"/>',
  castSvg:()=>'<path d="M18 11Q48 32 18 53" stroke="currentColor" stroke-width="2.4"/><circle cx="34" cy="32" r="20" stroke="var(--fx-accent)" stroke-width="1.5" stroke-dasharray="5 4"/><path d="M14 32H54M45 26L55 32L45 38" stroke="var(--fx-accent)" stroke-width="2"/>'
 });

 // 3. 聖光技能模板（牧師普攻與神聖攻擊／審判／光牢技能：金色聖光）
 registerTemplate('holy',{
  name:'聖光技能',
  description:'牧師普通攻擊與聖光／審判／光牢技能模板，以金色聖光星芒與降臨光柱呈現。',
  defaultCategory:'damage',
  variants:['basic','smite','prison'],
  projectile:'holy',
  motion:'fx-ring',
  glyph:'fx-holy',
  palette:()=>CLASS_PALETTES[3],
  svg:(variant)=>{
   if(variant==='prison'){
    return '<ellipse cx="32" cy="14" rx="21" ry="6" stroke="currentColor" stroke-width="2"/><ellipse cx="32" cy="51" rx="21" ry="6" stroke="currentColor" stroke-width="2"/><path d="M14 16V49M26 19V54M38 19V54M50 16V49" stroke="var(--fx-accent)" stroke-width="2.2"/><path d="M32 23L35 32L44 35L35 38L32 47L29 38L20 35L29 32Z" fill="var(--fx-accent)" fill-opacity=".5" stroke="currentColor" stroke-width="1.4"/>';
   }
   if(variant==='smite'){
    return '<path d="M23 4H41L38 56H26Z" fill="currentColor" fill-opacity=".22" stroke="none"/><path d="M26 4V52M38 4V52M32 3V59" stroke="var(--fx-accent)" stroke-width="2"/><ellipse cx="32" cy="49" rx="22" ry="8" stroke="currentColor" stroke-width="2"/><path d="M32 14L37 27L51 31L37 35L32 48L27 35L13 31L27 27Z" fill="var(--fx-accent)" fill-opacity=".5" stroke="currentColor" stroke-width="1.8"/>';
   }
   return '<circle cx="32" cy="32" r="20" stroke="currentColor" stroke-width="1.8" opacity=".78"/><path d="M32 5L37 26L58 32L37 38L32 59L27 38L6 32L27 26Z" fill="currentColor" fill-opacity=".3" stroke="currentColor" stroke-width="2"/><path d="M32 14L35 29L50 32L35 35L32 50L29 35L14 32L29 29Z" fill="var(--fx-accent)" stroke="var(--fx-accent)" stroke-width="1.2"/><path d="M16 16L22 22M48 16L42 22M16 48L22 42M48 48L42 42" stroke="var(--fx-accent)" stroke-width="1.6"/>';
  },
  attackSvg:()=>'<circle cx="32" cy="32" r="22" stroke="currentColor" stroke-width="2"/><path d="M32 8V56M12 32H52" stroke="var(--fx-accent)" stroke-width="2.2"/><circle cx="32" cy="32" r="7" fill="var(--fx-accent)" fill-opacity=".5" stroke="currentColor" stroke-width="1.8"/>',
  castSvg:()=>'<circle cx="32" cy="32" r="24" stroke="currentColor" stroke-width="2"/><path d="M32 6L36 27L57 32L36 37L32 58L28 37L7 32L28 27Z" fill="var(--fx-accent)" fill-opacity=".3" stroke="var(--fx-accent)" stroke-width="1.6"/>'
 });

 // 4. 元素技能模板（法師普攻與所有火／冰／雷／風／光／暗／奧術元素技能）
 registerTemplate('elemental',{
  name:'元素技能',
  description:'法師普通攻擊與各類元素法術通用模板，依元素（火／冰／雷／風／光／暗／奧術）自動切換色盤、紋樣與動畫。',
  defaultCategory:'damage',
  variants:['basic','blast'],
  projectile:'orb',
  motion:'fx-ring',
  glyph:(_v,ctx)=>{
   const el=normalizeElement(ctx?.element);
   return ELEMENT_GLYPH[el&&el!=='physical'?el:'arcane']||'fx-arcane';
  },
  palette:ctx=>{
   const el=normalizeElement(ctx?.element);
   return elementPalette(el&&el!=='physical'?el:'arcane','arcane');
  },
  svg:(variant,ctx)=>{
   const el=normalizeElement(ctx?.element);
   const set=ELEMENT_ART[el&&el!=='physical'?el:'arcane']||ELEMENT_ART.arcane;
   return variant==='blast'?set.blast:set.basic;
  },
  attackSvg:()=>'<circle cx="32" cy="32" r="22" stroke="currentColor" stroke-width="1.8"/><path d="M32 7L38 26L57 32L38 38L32 57L26 38L7 32L26 26Z" fill="var(--fx-accent)" fill-opacity=".35" stroke="var(--fx-accent)" stroke-width="1.6"/><circle cx="32" cy="32" r="6" fill="currentColor"/>',
  castSvg:()=>'<circle cx="32" cy="32" r="25" stroke="currentColor" stroke-width="2" stroke-dasharray="7 3"/><circle cx="32" cy="32" r="15" stroke="var(--fx-accent)" stroke-width="1.6"/><path d="M32 5V14M32 50V59M5 32H14M50 32H59" stroke="var(--fx-accent)" stroke-width="2"/>'
 });

 // 5. 護盾技能模板
 registerTemplate('shield',{
  name:'護盾技能',
  description:'護盾、壁壘、冰霜護幕與神聖庇護等防禦技能模板，保留晶白護盾主色並融入元素／職業邊緣高光。',
  defaultCategory:'shield',
  variants:['basic','barrier'],
  projectile:'none',
  motion:'fx-ring',
  glyph:'fx-shield',
  palette:ctx=>{
   const el=normalizeElement(ctx?.element);
   if(el&&el!=='physical')return tone(CATEGORY_PALETTES.shield.color,ELEMENT_PALETTES[el].color);
   if(ctx?.job===0)return tone(CATEGORY_PALETTES.shield.color,CLASS_PALETTES[0].accent);
   if(ctx?.job===3)return tone(CATEGORY_PALETTES.shield.color,CLASS_PALETTES[3].color);
   return CATEGORY_PALETTES.shield;
  },
  svg:(variant)=>{
   if(variant==='barrier'){
    return '<path d="M32 4L55 13V32Q53 50 32 60Q11 50 9 32V13Z" fill="currentColor" fill-opacity=".18" stroke="currentColor" stroke-width="2.2"/><path d="M32 11L48 18V32Q46 45 32 52Q18 45 16 32V18Z" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M32 19V44M21 31H43" stroke="var(--fx-accent)" stroke-width="1.8"/>';
   }
   return '<path d="M32 5L54 13V31Q53 49 32 59Q11 49 10 31V13Z" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="2"/><path d="M32 12L46 18V31Q45 43 32 51" stroke="var(--fx-accent)" stroke-width="2"/>';
  },
  castSvg:()=>'<path d="M32 6L53 14V32Q51 49 32 58Q13 49 11 32V14Z" fill="currentColor" fill-opacity=".14" stroke="var(--fx-accent)" stroke-width="2"/>'
 });

 // 6. 重擊／衝擊技能模板
 registerTemplate('impact',{
  name:'重擊／衝擊技能',
  description:'物理重擊、震盪衝擊與嘲諷震波技能模板，以紅灰雙層震波表現打擊力道。',
  defaultCategory:'damage',
  variants:['basic','heavy'],
  projectile:'none',
  motion:'fx-ring',
  glyph:'fx-impact-heavy',
  palette:ctx=>classPalette(ctx?.job??0,ctx?.element),
  svg:(variant)=>{
   if(variant==='heavy'){
    return '<circle cx="32" cy="32" r="22" stroke="var(--fx-accent)" stroke-width="2" stroke-dasharray="7 4"/><path d="M32 6L38 22L56 17L43 31L57 46L39 41L32 58L25 41L7 46L21 31L8 17L26 22Z" fill="currentColor" fill-opacity=".38" stroke="currentColor" stroke-width="1.9"/><circle cx="32" cy="32" r="8" fill="var(--fx-accent)" fill-opacity=".65" stroke="var(--fx-accent)" stroke-width="1.5"/>';
   }
   return '<path d="M32 10L37 24L53 20L42 32L53 45L37 40L32 54L27 40L11 45L22 32L11 20L27 24Z" fill="currentColor" fill-opacity=".32" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="32" r="19" stroke="var(--fx-accent)" stroke-width="1.6" opacity=".8"/>';
  }
 });

 // 7. 治療／恢復技能模板
 registerTemplate('heal',{
  name:'治療技能',
  description:'單體與群體治療、持續恢復、生命汲取與藥水恢復模板，牧師與光屬治療會融合金色聖光高光。',
  defaultCategory:'recovery',
  variants:['basic','aoe','regen','drain'],
  projectile:'none',
  motion:'fx-ring',
  glyph:v=>v==='regen'?'fx-pulse':'fx-rise',
  palette:ctx=>{
   if(ctx?.job===3||normalizeElement(ctx?.element)==='light')return tone(CATEGORY_PALETTES.recovery.color,CLASS_PALETTES[3].color);
   return CATEGORY_PALETTES.recovery;
  },
  svg:(variant)=>{
   if(variant==='aoe'){
    return '<circle cx="32" cy="32" r="26" stroke="var(--fx-accent)" stroke-width="1.8" opacity=".75"/><path d="M28 15H36V25H46V33H36V43H28V33H18V25H28Z" fill="currentColor" stroke="var(--fx-accent)" stroke-width="1.4"/><path d="M12 49V40M52 49V40M22 57V50M42 57V50" stroke="var(--fx-accent)" stroke-width="1.9"/>';
   }
   return '<path d="M28 17H36V26H45V34H36V43H28V34H19V26H28Z" fill="currentColor" stroke="none"/><path d="M10 49V42M52 47V37M21 58V52M43 57V51" stroke="var(--fx-accent)" stroke-width="1.8"/><circle cx="32" cy="32" r="27" stroke="var(--fx-accent)" opacity=".55"/>';
  },
  castSvg:()=>'<circle cx="32" cy="32" r="24" stroke="var(--fx-accent)" stroke-width="1.8"/><path d="M29 19H35V29H45V35H35V45H29V35H19V29H29Z" fill="currentColor" fill-opacity=".45" stroke="currentColor" stroke-width="1.5"/>'
 });

 // 8. 陷阱／控制技能模板
 registerTemplate('trap',{
  name:'陷阱／控制技能',
  description:'繩索陷阱、冰凍陷阱、變形術與各類控制技模板，依職業或元素切換捕縛與符文樣式。',
  defaultCategory:'debuff',
  variants:['basic','snare','freeze','polymorph'],
  projectile:'none',
  motion:'fx-ring',
  glyph:v=>v==='freeze'?'fx-shatter':'fx-contract',
  palette:ctx=>{
   const el=normalizeElement(ctx?.element);
   if(el==='ice')return ELEMENT_PALETTES.ice;
   if(ctx?.job===2&&(!el||el==='physical'||el==='wind'))return CLASS_PALETTES[2];
   if(ctx?.job===3&&el==='light')return CLASS_PALETTES[3];
   return CATEGORY_PALETTES.debuff;
  },
  svg:(variant)=>{
   if(variant==='polymorph'){
    return '<path d="M12 42Q4 23 23 14Q44 4 53 26Q61 48 39 53Q21 57 20 38Q19 22 35 24Q47 26 40 37Q36 43 31 37" stroke="currentColor" stroke-width="2.2"/><path d="M8 10V20M3 15H13M50 48V60M44 54H56" stroke="var(--fx-accent)" stroke-width="1.8"/>';
   }
   if(variant==='freeze')return ELEMENT_ART.ice.blast;
   return '<circle cx="32" cy="32" r="22" stroke="currentColor" stroke-width="2" stroke-dasharray="6 4"/><path d="M14 20L24 28L18 39M50 20L40 28L46 39M22 49L32 41L42 49M22 15L32 23L42 15" stroke="var(--fx-accent)" stroke-width="2"/><circle cx="32" cy="32" r="5" fill="currentColor"/>';
  }
 });

 // 9. 增益／戰吼技能模板
 registerTemplate('buff',{
  name:'增益技能',
  description:'戰吼、守護誓言、奧術共鳴、鷹眼指引與光明祈願等隊伍增益技能模板。',
  defaultCategory:'buff',
  variants:['basic'],
  projectile:'none',
  motion:'fx-ring',
  glyph:'fx-rise',
  palette:()=>CATEGORY_PALETTES.buff,
  svg:()=>'<path d="M13 48V23M7 29L13 22L19 29M32 54V9M25 17L32 9L39 17M51 48V23M45 29L51 22L57 29" stroke="currentColor" stroke-width="2.1"/><circle cx="23" cy="38" r="2.2" fill="var(--fx-accent)" stroke="none"/><circle cx="42" cy="35" r="2.2" fill="var(--fx-accent)" stroke="none"/>'
 });

 // 10. 減益／削弱技能模板
 registerTemplate('debuff',{
  name:'減益技能',
  description:'破甲怒吼、獵手標記、時間凝滯與苦痛蔓延等減益削弱技能模板。',
  defaultCategory:'debuff',
  variants:['basic'],
  projectile:'none',
  motion:'fx-ring',
  glyph:'fx-sink',
  palette:()=>CATEGORY_PALETTES.debuff,
  svg:()=>'<path d="M6 16Q32 4 58 16M12 30Q32 18 52 30M20 44Q32 36 44 44" stroke="currentColor" stroke-width="2"/><path d="M32 31V55M25 47L32 55L39 47" stroke="var(--fx-accent)" stroke-width="2.2"/>'
 });

 // Auxiliary feedback glyphs (status/shield/evade/resist/cast).
 const FEEDBACK_SVG=Object.freeze({
  absorb:'<ellipse cx="32" cy="32" rx="27" ry="23"/><circle cx="32" cy="32" r="15" stroke="var(--fx-accent)"/><path d="M23 32H41M32 23V41" stroke="var(--fx-accent)"/>',
  break:'<path d="M22 8L28 23L12 21ZM39 7L53 19L36 24ZM8 34L24 30L18 51ZM39 31L57 39L45 55ZM28 43L36 47L30 61Z" fill="currentColor" fill-opacity=".6"/>',
  evade:'<path d="M7 18H30M3 32H23M7 46H30"/><path d="M35 14L51 32L35 50" stroke="var(--fx-accent)" stroke-width="2.4"/>',
  resist:'<path d="M32 5L53 13V32Q50 48 32 58Q14 48 11 32V13Z"/><path d="M21 31L29 39L44 23" stroke="var(--fx-accent)" stroke-width="2.4"/>',
  cast:'<circle cx="32" cy="32" r="25"/><path d="M13 13L20 20M51 13L44 20M13 51L20 44M51 51L44 44" stroke="var(--fx-accent)"/>'
 });

 function resolveSkillTemplate(ctx={}){
  const explicit=ctx.fxTemplate||ctx.template||ctx.skill?.fxTemplate||ctx.skill?.meta?.fxTemplate;
  const el=normalizeElement(ctx.element);
  const job=Number.isInteger(ctx.job)?ctx.job:Number.isInteger(ctx.source?.job)?ctx.source.job:null;
  const name=String(ctx.skillName||ctx.skill?.name||ctx.skill?.[0]||'');
  const effect=String(ctx.effect||ctx.skill?.effect||ctx.skill?.kind||ctx.skill?.[5]||'');
  const target=String(ctx.targetMode||ctx.skill?.target||ctx.skill?.meta?.target||'');
  const isAoE=target==='enemies'||target==='allies'||/魔爆|火球|隕星|新星|箭雨|裂地|光牢|癒合|橫掃/.test(name);

  if(explicit&&registry.has(explicit)){
   return {template:explicit,variant:ctx.variant||(isAoE?'aoe':'basic'),element:el,job};
  }

  // Effect-first resolution for non-damage utility skills.
  if(effect==='shield'||effect==='shieldLowest')return {template:'shield',variant:ctx.actionKind==='skill'?'barrier':'basic',element:el,job};
  if(effect==='heal'||effect==='regen'||effect==='revive')return {template:'heal',variant:effect==='regen'?'regen':isAoE?'aoe':'basic',element:el,job};
  if(effect==='polymorph'||effect==='summonMorphTrap')return {template:'trap',variant:'polymorph',element:el,job};
  if(effect==='summonFreezeTrap'||effect==='freeze'||effect==='frost')return {template:'trap',variant:'freeze',element:el||'ice',job};
  if(/陷阱/.test(name))return {template:'trap',variant:'snare',element:el,job};
  if(effect==='tauntRage')return {template:'impact',variant:'heavy',element:el||'physical',job};
  if(effect==='fear')return {template:'debuff',variant:'basic',element:el||'shadow',job};

  // Offensive / skill attack templates.
  if(job===2||ctx.ranged||/箭|射|狙擊/.test(name)){
   const variant=/雨|連射/.test(name)||isAoE?'multi':/狙擊|穿透/.test(name)?'snipe':'basic';
   return {template:'arrow',variant,element:el,job:job??2};
  }
  if(job===0&&(/斬|刃|劈|劍|裁決|追擊/.test(name)||el==='physical'||!el)){
   if(/重擊/.test(name)&&!/浴血/.test(name))return {template:'impact',variant:'heavy',element:el||'physical',job:0};
   const variant=isAoE?'aoe':ctx.actionKind==='skill'?'heavy':'basic';
   return {template:'slash',variant,element:el||'physical',job:0};
  }
  if(/斬|刃|劈|劍/.test(name)){
   return {template:'slash',variant:isAoE?'aoe':'heavy',element:el||'physical',job};
  }
  if((job===3&&el!=='shadow')||el==='light'||/聖光|聖印|黎明|光牢|神聖/.test(name)){
   const variant=/光牢/.test(name)?'prison':ctx.actionKind==='skill'||/審判|聖印|黎明|聖光/.test(name)?'smite':'basic';
   return {template:'holy',variant,element:'light',job:job??3};
  }
  if(/重擊|撞擊|震盪/.test(name)){
   return {template:'impact',variant:'heavy',element:el||'physical',job};
  }
  if(job===1||(el&&el!=='physical')){
   return {template:'elemental',variant:isAoE?'blast':'basic',element:el&&el!=='physical'?el:'arcane',job};
  }
  if(['attack','power','guard','critical','nextActiveDamage','advanceNextRound'].includes(effect))return {template:'buff',variant:'basic',element:el,job};
  if(['weaken','fracture','vulnerable','damageAmp','followup','dotAttack','dotMaxHp','slow','skillSlow','dispel'].includes(effect))return {template:'debuff',variant:'basic',element:el,job};
  return {template:el==='physical'?'slash':'impact',variant:'basic',element:el,job};
 }

 function resolveAttack(ctx={}){
  const el=normalizeElement(ctx.element);
  const job=Number.isInteger(ctx.job)?ctx.job:Number.isInteger(ctx.source?.job)?ctx.source.job:null;

  // 1. Hero basic attacks: distinct signature per class.
  if(ctx.actionKind==='basic'&&job!==null){
   if(job===0){
    const type=el&&el!=='physical'?el:'slash';
    return {type,template:'slash',variant:'basic',element:el||'physical',job:0};
   }
   if(job===1){
    const activeEl=el&&el!=='physical'?el:'arcane';
    const type=activeEl==='arcane'?'magic':activeEl;
    return {type,template:'elemental',variant:'basic',element:activeEl,job:1};
   }
   if(job===2){
    const type=el&&el!=='physical'?el:'ranged';
    return {type,template:'arrow',variant:'basic',element:el||'physical',job:2};
   }
   if(job===3){
    const type=el&&el!=='physical'?el:'light';
    const tpl=el&&el!=='physical'&&el!=='light'?'elemental':'holy';
    return {type,template:tpl,variant:'basic',element:el&&el!=='physical'?el:'light',job:3};
   }
  }

  // 2. Skill attacks: route through the universal skill template resolver.
  if(ctx.actionKind==='skill'||ctx.actionKind==='support'||ctx.fxTemplate||ctx.template){
   const resolved=resolveSkillTemplate(ctx);
   let type;
   if(el&&el!=='physical')type=el;
   else if(resolved.template==='arrow')type='ranged';
   else if(resolved.template==='holy')type='light';
   else if(resolved.template==='elemental')type=resolved.element&&resolved.element!=='arcane'?resolved.element:'magic';
   else if(resolved.template==='impact')type='impact';
   else type=el==='physical'?'slash':'impact';
   return {type,...resolved};
  }

  // 3. Direct damage hits (e.g. enemy basics, procs without skill wrapper, direct resolveHit calls).
  if(el&&el!=='physical'){
   if(el==='light')return {type:'light',template:'holy',variant:'basic',element:'light',job};
   return {type:el,template:'elemental',variant:'basic',element:el,job};
  }
  if(ctx.ranged)return {type:'ranged',template:'arrow',variant:'basic',element:'physical',job:job??2};
  if(el==='physical')return {type:'slash',template:'slash',variant:'basic',element:'physical',job};
  return {type:'impact',template:'impact',variant:'basic',element:null,job};
 }

 function resolveVisual(event={}){
  const type=event.type||'magic';
  const category=event.category||'damage';
  const el=normalizeElement(event.element||(ELEMENT_PALETTES[type]?type:null));
  const job=Number.isInteger(event.job)?event.job:null;

  // Persistent/feedback non-template types.
  if(type==='hit')return {template:'hit',variant:'basic',element:el,job,...CATEGORY_PALETTES.damage,svg:'',glyph:'fx-impact',motion:'fx-hit',projectile:'none'};
  if(type==='absorb'||type==='shield-impact')return {template:'shield',variant:'absorb',element:el,job,...CATEGORY_PALETTES.shield,svg:FEEDBACK_SVG.absorb,glyph:'fx-ripple',motion:'fx-ring',projectile:'none'};
  if(type==='break')return {template:'shield',variant:'break',element:el,job,...CATEGORY_PALETTES.shield,svg:FEEDBACK_SVG.break,glyph:'fx-shatter',motion:'fx-ring',projectile:'none'};
  if(type==='dissolve')return {template:'shield',variant:'dissolve',element:el,job,...CATEGORY_PALETTES.shield,svg:registry.get('shield').svg('basic',event),glyph:'fx-dissolve',motion:'fx-ring',projectile:'none'};
  if(type==='evade')return {template:'evade',variant:'basic',element:el,job,...CATEGORY_PALETTES.shield,svg:FEEDBACK_SVG.evade,glyph:'fx-evade',motion:'fx-ring',projectile:'none'};
  if(type==='resist')return {template:'resist',variant:'basic',element:el,job,...CATEGORY_PALETTES.shield,svg:FEEDBACK_SVG.resist,glyph:'fx-impact',motion:'fx-ring',projectile:'none'};
  if(type==='critical')return {template:'impact',variant:'heavy',element:el,job,...(job!==null?classPalette(job,el):CATEGORY_PALETTES.damage),svg:registry.get('impact').svg('heavy',event),glyph:'fx-shatter',motion:'fx-ring',projectile:'none'};
  if(type==='dot')return {template:'elemental',variant:'basic',element:el||'arcane',job,...CATEGORY_PALETTES.damage,svg:ELEMENT_ART.arcane.basic,glyph:'fx-pulse',motion:'fx-ring',projectile:'none'};

  // Cast / basic attack wind-up on the acting unit.
  if(type==='attack'||type==='cast'){
   const tplId=event.template&&(registry.has(event.template)?event.template:null)||(job===0?'slash':job===1?'elemental':job===2?'arrow':job===3?'holy':null);
   const tpl=tplId?registry.get(tplId):null;
   let colors;
   if(type==='attack'){
    colors=tpl?tpl.palette({element:el,job}):(job!==null?classPalette(job,el):CATEGORY_PALETTES.damage);
   }else{
    // Cast glow respects utility categories (recovery/shield/buff/debuff) while damage casts showcase class/element identity.
    colors=category==='damage'&&tpl?tpl.palette({element:el,job}):CATEGORY_PALETTES[category]||CATEGORY_PALETTES.buff;
   }
   const svg=type==='attack'
    ?(tpl?.attackSvg?.({element:el,job})||tpl?.svg?.('basic',{element:el,job})||FEEDBACK_SVG.cast)
    :(tpl?.castSvg?.({element:el,job})||FEEDBACK_SVG.cast);
   const glyph=type==='attack'?(tplId==='slash'?'fx-slash':tplId==='arrow'?'fx-pierce':tplId==='holy'?'fx-holy':'fx-pulse'):'fx-pulse';
   return {template:tplId||type,variant:event.variant||'basic',element:el,job,...colors,svg,glyph,motion:'fx-ring',projectile:'none'};
  }

  // Standard template lookup.
  let tplId=event.template&&registry.has(event.template)?event.template:null;
  if(!tplId){
   if(type==='slash')tplId='slash';
   else if(type==='ranged')tplId='arrow';
   else if(type==='light')tplId='holy';
   else if(['fire','ice','lightning','wind','shadow','magic'].includes(type))tplId='elemental';
   else if(type==='impact')tplId='impact';
   else if(type==='shield')tplId='shield';
   else if(['heal','regen','potion','drain'].includes(type))tplId='heal';
   else if(['polymorph','freeze','frost'].includes(type))tplId='trap';
   else if(['buff','rage'].includes(type))tplId='buff';
   else if(['debuff','skip','fear','tauntRage'].includes(type))tplId='debuff';
   else tplId='elemental';
  }
  const tpl=registry.get(tplId);
  const variant=event.variant||(type==='regen'?'regen':type==='drain'?'drain':type==='polymorph'?'polymorph':type==='freeze'||type==='frost'?'freeze':'basic');
  const ctx={element:el||(type==='magic'?'arcane':ELEMENT_PALETTES[type]?type:null),job,category,type,variant};
  const colors=tpl.palette(ctx);
  const glyph=typeof tpl.glyph==='function'?tpl.glyph(variant,ctx):tpl.glyph;
  const svg=tpl.svg(variant,ctx);
  const projectile=typeof tpl.projectile==='function'?tpl.projectile(variant,ctx):tpl.projectile;
  return {template:tpl.id,variant,element:ctx.element,job,...colors,svg,glyph,motion:tpl.motion,projectile};
 }

 function listTemplates(){
  return [...registry.values()].map(t=>({id:t.id,name:t.name,description:t.description,defaultCategory:t.defaultCategory,variants:[...t.variants],projectile:t.projectile}));
 }

 globalThis.EmberwildBattleEffectTemplates=Object.freeze({
  CATEGORY_PALETTES,
  ELEMENT_PALETTES,
  CLASS_PALETTES,
  normalizeElement,
  elementPalette,
  classPalette,
  resolveSkillTemplate,
  resolveAttack,
  resolveVisual,
  registerTemplate,
  getTemplate:id=>registry.get(id)||null,
  listTemplates,
  get ids(){return Object.freeze([...registry.keys()]);}
 });
})();