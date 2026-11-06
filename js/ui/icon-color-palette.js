/* Shared named icon colors. Template IDs remain stable when labels or colors change. */
(function(root){
 const HEX=/^#[0-9a-fA-F]{6}$/,ID=/^[a-z][a-z0-9_-]{0,39}$/,copy=x=>structuredClone(x);let active=[];
 const uses=doc=>[...(Array.isArray(doc.inventoryIcons)?doc.inventoryIcons:[]).map(row=>({row,label:row.kind+' · '+row.key})),...(Array.isArray(doc.skillIcons)?doc.skillIcons:[]).map(row=>({row,label:'自製圖示 · '+row.name}))];
 function issues(doc){
  const rows=doc.iconColorTemplates,errors=[],ids=new Set();
  if(rows!==undefined&&(!Array.isArray(rows)||rows.length>200))return ['色彩模板必須是最多 200 筆的陣列'];
  for(const row of rows||[]){if(!row||typeof row.id!=='string'||!ID.test(row.id)||ids.has(row.id)||typeof row.name!=='string'||!row.name.trim()||row.name.length>40||!HEX.test(row.color))errors.push('色彩模板的 ID、名稱或色碼無效，ID 不可重複');if(row)ids.add(row.id);}
  for(const {row,label}of uses(doc))if(row?.colorTemplateId!==undefined&&(typeof row.colorTemplateId!=='string'||!ids.has(row.colorTemplateId)))errors.push('色彩模板引用不存在：'+label);
  return errors;
 }
 function validate(doc){const errors=issues(doc);if(errors.length)throw Error(errors.join('\n'));return doc.iconColorTemplates===undefined?undefined:copy(doc.iconColorTemplates);}
 function use(rows){active=Array.isArray(rows)?rows.filter(r=>r&&HEX.test(r.color)):[];}
 function resolve(row,rows=active){return (Array.isArray(rows)?rows:[]).find(r=>r.id===row?.colorTemplateId)?.color||row?.color;}
 function remove(doc,id){const found=(doc.iconColorTemplates||[]).find(r=>r.id===id);if(!found)return;for(const {row}of uses(doc))if(row.colorTemplateId===id){if(row.kind)row.color=found.color;else row.appearance={...(row.appearance||{}),color:found.color};delete row.colorTemplateId;}doc.iconColorTemplates=doc.iconColorTemplates.filter(r=>r.id!==id);if(!doc.iconColorTemplates.length)delete doc.iconColorTemplates;}
 const api={VERSION:1,issues,validate,use,resolve,uses,remove};root.EmberwildIconColors=api;if(typeof module==='object'&&module.exports)module.exports=api;
})(globalThis);
