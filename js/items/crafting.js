/* Immediate crafting; BOSS recipes keep their existing implementation. */
(()=>{
 const LIMIT=1e9;let section='materials',amount=1,busy=false;
 const recipe=()=>currentCraftingRecipe();
 function quote(n=amount){const r=recipe(),h=playerHero(),max=Math.max(0,Math.min(Math.floor((h?.dust||0)/r.dust),Math.floor((h?.ore||0)/r.ore),Math.floor((LIMIT-(h?.materials?.['以太鍛鐵']||0))/r.quantity)));return {max,n,dust:r.dust*n,ore:r.ore*n,output:r.quantity*n,ok:Number.isSafeInteger(n)&&n>0&&n<=max};}
 globalThis.craftingQuote=quote;
 globalThis.setCraftingSection=v=>{if(!['materials','boss'].includes(v))return;section=v;render();};
 globalThis.setCraftingAmount=v=>{const n=v==='max'?quote().max:Number(v);amount=Number.isSafeInteger(n)&&n>=1?n:1;render();};
 globalThis.craftEtherIron=function(n=amount){
  if(busy||!party||!state)return false;const q=quote(Number(n));if(!q.ok){toast('材料不足、製作數量無效或產物庫存已達上限');return false;}
  busy=true;const h=playerHero(),before={dust:h.dust,ore:h.ore,materials:{...h.materials},inventory:globalThis.EmberwildItems?.snapshot()};
  try{h.dust-=q.dust;h.ore-=q.ore;h.materials['以太鍛鐵']=(h.materials['以太鍛鐵']||0)+q.output;if(save()!==true)throw Error('製作結果未能儲存，材料已還原');}
  catch(e){if(before.inventory)EmberwildItems.restore(before.inventory);h.dust=before.dust;h.ore=before.ore;for(const k of Object.keys(h.materials))delete h.materials[k];Object.assign(h.materials,before.materials);toast(e.message);return false;}finally{busy=false;}
  render();toast('製作完成：以太鍛鐵 ×'+q.output);return true;
 };
 globalThis.craftingView=function(){
  const tabs=`<div class="actions" role="group" aria-label="製作分類">${[['materials','素材製作'],['boss','BOSS 裝備製作']].map(([id,label])=>`<button type="button" aria-pressed="${section===id}" class="${section===id?'primary':''}" onclick="setCraftingSection('${id}')">${label}</button>`).join('')}</div>`;
  if(section==='boss')return tabs+bossCraftView();const r=recipe(),q=quote();
  return heading('CRAFTING / 製作','素材製作')+tabs+`<section class="panel crafting-materials"><h2>以太鍛鐵</h2>${itemSlotHTML('material','以太鍛鐵',{count:materialCount('以太鍛鐵'),context:'inventory'})}<p>將粉塵與鍛鐵凝聚為高階強化材料，即時完成。</p><p>每次需要：粉塵 ×${r.dust} ＋ 鍛鐵 ×${r.ore} → 以太鍛鐵 ×${r.quantity}</p><p>持有粉塵 ${materialCount('粉塵').toLocaleString()} · 鍛鐵 ${materialCount('鍛鐵').toLocaleString()} · 可製作 ${q.max.toLocaleString()} 次</p><label>製作數量 <input aria-label="製作數量" type="number" min="1" max="${Math.max(1,q.max)}" value="${amount}" onchange="setCraftingAmount(this.value)"></label><button type="button" onclick="setCraftingAmount('max')" ${q.max?'':'disabled'}>最大數量</button><p aria-live="polite">總消耗：粉塵 ×${q.dust} ＋ 鍛鐵 ×${q.ore} · 預計產出：以太鍛鐵 ×${q.output}</p><div class="actions"><button type="button" onclick="craftEtherIron(1)" ${quote(1).ok?'':'disabled'}>製作 1 次</button><button type="button" class="primary" onclick="craftEtherIron()" ${q.ok?'':'disabled'}>製作 ${amount} 次</button></div></section>`;
 };
})();
