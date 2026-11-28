// Mailbox behavior still needs pending attachments even though creation no longer sends starter mail.
// Opt in only in mailbox tests; the game and creation tests use the normal empty mailbox.
function installLegacyStarterMail(r){
 r.run(`{const base=start;start=function(job,...args){
  const result=base.call(this,job,...args);
  const rows=__EMBERWILD_STARTER_PACK.rows(job).map(row=>{
   if(row.type!=='catalogue')return row;
   if(row.kind==='equipment'){
    const ref=row.key.split(':').slice(1).map(Number),g=createEquipmentShopGear('equipment_lv1','job'+ref[0]+'-slot'+ref[1]+'-form'+ref[2]);
    return {type:'gear',gear:g,name:equipmentDisplayName(g),quantity:row.quantity};
   }
   if(row.kind==='token'){const g=createCompanionToken(row.key);return {type:'gear',gear:g,name:g.name,quantity:row.quantity};}
   if(row.kind==='item'&&row.key.startsWith('companion-ticket-'))return {type:'companionTicket',companionId:Number(row.key.slice(17)),name:row.name,quantity:row.quantity};
   return row;
  });
  for(let i=0;i<rows.length;i+=6){const id=++party.mailbox.serial;party.mailbox.messages.push({id,rewardKey:'starter-'+job+'-'+id,subject:'信箱測試附件',body:'測試資料',at:Date.now(),read:false,claimed:false,attachments:rows.slice(i,i+6)});}
  save();return result;
 };}`);
 return r;
}
module.exports={installLegacyStarterMail};
