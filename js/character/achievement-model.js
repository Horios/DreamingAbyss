/* Shared achievement identities, staged goals and player-save validation. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.EmberwildAchievements=api;})(globalThis,function(){
  const copy=x=>JSON.parse(JSON.stringify(x)),STEP=50,MAX=1000;
  const id=(map,kind,count=0)=>`region-${map}-${kind}${kind==='open'?'':'-'+count}`;
  function parse(value){const m=typeof value==='string'&&value.match(/^region-(0|[1-9]\d{0,2})-(open|elite|boss)(?:-(\d+))?$/);if(!m)return null;const count=Number(m[3]||0);if(m[2]==='open'?!!m[3]:count<STEP||count>MAX||count%STEP!==0||m[3]!==String(count))return null;return {mapIndex:Number(m[1]),kind:m[2],count};}
  function catalog(maps){return (maps||[]).flatMap((m,i)=>{
    const row=(kind,count=0)=>({id:id(i,kind,count),mapIndex:i,kind,count,name:kind==='open'?`開啟${m.name}`:`${m.name} · 擊敗${kind==='elite'?'菁英':'BOSS'} ${count} 隻`});
    const out=[row('open')];for(const kind of ['elite','boss']){
      if(kind==='elite'&&(m.mapType==='final'||m.eliteEnabled===false)||kind==='boss'&&m.mapType!=='final'&&m.bossEnabled===false)continue;
      for(let n=STEP;n<=MAX;n+=STEP)out.push(row(kind,n));
    }return out;
  });}
  function defaults(){return {version:3,eliteKills:{},bossKills:{},completed:[],readCompleted:[],rewardCompanions:[],tickets:{}};}
  const counter=raw=>raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length<=1000&&Object.entries(raw).every(([k,v])=>/^(0|[1-9]\d{0,2})$/.test(k)&&Number.isSafeInteger(v)&&v>=0&&v<=1e12);
  const partnerCounter=raw=>raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length<=512&&Object.entries(raw).every(([k,v])=>/^[1-9]\d{1,9}$/.test(k)&&Number(k)<=1e9&&Number.isSafeInteger(v)&&v>=0&&v<=1e9);
  function validateState(raw){
    if(raw===undefined)return undefined;
    const fail=()=>{throw Error('成就與招募券存檔無效');};
    if(!raw||![1,2,3].includes(raw.version)||!counter(raw.eliteKills)||!counter(raw.bossKills)||!Array.isArray(raw.completed)||raw.completed.length>41000||new Set(raw.completed).size!==raw.completed.length||raw.completed.some(x=>!parse(x))||!Array.isArray(raw.rewardCompanions)||raw.rewardCompanions.length>512||new Set(raw.rewardCompanions).size!==raw.rewardCompanions.length||raw.rewardCompanions.some(id=>!Number.isInteger(id)||id<10||id>1e9)||!partnerCounter(raw.tickets))fail();
    if(raw.version===1){
      if(!Number.isSafeInteger(raw.noticeSerial)||raw.noticeSerial<0||raw.noticeSerial>1e12||!Array.isArray(raw.notifications)||raw.notifications.length>100)fail();
      const ids=new Set();for(const n of raw.notifications){if(!n||!Number.isSafeInteger(n.id)||n.id<1||n.id>raw.noticeSerial||ids.has(n.id)||typeof n.title!=='string'||n.title.length>200||typeof n.text!=='string'||n.text.length>500||!Number.isSafeInteger(n.at)||n.at<0||typeof n.seen!=='boolean')fail();ids.add(n.id);}
    }
    const completeIds=new Set(raw.completed);
    if(raw.version===3&&(!Array.isArray(raw.readCompleted)||raw.readCompleted.length>41000||new Set(raw.readCompleted).size!==raw.readCompleted.length||raw.readCompleted.some(id=>!completeIds.has(id))))fail();
    return {version:3,readCompleted:raw.version===3?[...raw.readCompleted]:[...raw.completed],eliteKills:copy(raw.eliteKills),bossKills:copy(raw.bossKills),completed:[...raw.completed],rewardCompanions:[...raw.rewardCompanions],tickets:copy(raw.tickets)};
  }
  function numberReminderDefaults(){return {mailbox:true,achievements:true,equipment:true,quests:true};}
  function validateNumberReminders(raw){const defaults=numberReminderDefaults();if(raw===undefined)return defaults;if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.entries(raw).some(([k,v])=>!Object.hasOwn(defaults,k)||typeof v!=='boolean'))throw Error('數字提醒設定無效');return {...defaults,...raw};}
  function mailboxDefaults(){return {version:1,serial:0,messages:[]};}
  function validateMailbox(raw){
    if(raw===undefined)return mailboxDefaults();
    const fail=()=>{throw Error('信箱存檔無效');};
    if(!raw||raw.version!==1||!Number.isSafeInteger(raw.serial)||raw.serial<0||raw.serial>1e12||!Array.isArray(raw.messages))fail();
    const ids=new Set(),keys=new Set();
    for(const m of raw.messages){
      if(!m||!Number.isSafeInteger(m.id)||m.id<1||m.id>raw.serial||ids.has(m.id)||typeof m.rewardKey!=='string'||!/^(?:companion-[1-9]\d{1,9}|starter-[0-3]-[1-9]\d*)$/.test(m.rewardKey)||keys.has(m.rewardKey)||typeof m.subject!=='string'||!m.subject.trim()||m.subject.length>100||typeof m.body!=='string'||m.body.length>1000||!Number.isSafeInteger(m.at)||m.at<0||typeof m.read!=='boolean'||typeof m.claimed!=='boolean'||m.claimed&&!m.read||!Array.isArray(m.attachments)||m.attachments.length<1||m.attachments.length>6)fail();
      for(const item of m.attachments){
        if(!item||!Number.isSafeInteger(item.quantity)||item.quantity<1||item.quantity>1e9||typeof item.name!=='string'||!item.name.trim()||item.name.length>200)fail();
        if(item.type==='companionTicket'){
          if(!Number.isInteger(item.companionId)||item.companionId<10||item.companionId>1e9||m.rewardKey.startsWith('companion-')&&m.rewardKey!=='companion-'+item.companionId)fail();
        }else if(item.type==='catalogue'){
          if(!['item','material','gem'].includes(item.kind)||typeof item.key!=='string'||!item.key||item.key.length>100||/[<>]/.test(item.key)||['__proto__','constructor','prototype'].includes(item.key)||item.kind==='gem'&&!['0','1','2'].includes(item.key))fail();
        }else if(item.type==='gear'){
          if(!item.gear||typeof item.gear.id!=='string'||!Number.isInteger(item.gear.plus)||item.gear.plus<0)fail();
        }else fail();
        if(m.rewardKey.startsWith('companion-')&&(item.type!=='companionTicket'||m.attachments.length!==1))fail();
      }
      ids.add(m.id);keys.add(m.rewardKey);
    }
    return copy(raw);
  }
  function migrate(raw,legacy){return validateState(raw)??{...defaults(),eliteKills:copy(legacy?.eliteKills||{})};}
  function conditions(ids,maps){
    if(!Array.isArray(ids)||ids.length<1||ids.length>128||new Set(ids).size!==ids.length||ids.some(x=>!parse(x)))throw Error('夥伴綁定成就無效');
    if(maps){const valid=new Set(catalog(maps).map(x=>x.id));if(ids.some(id=>!valid.has(id)))throw Error('夥伴綁定成就不存在或無法達成');}
    return [...ids];
  }
  return {STEP,MAX,id,parse,catalog,defaults,validateState,migrate,conditions,mailboxDefaults,validateMailbox,numberReminderDefaults,validateNumberReminders};
});
