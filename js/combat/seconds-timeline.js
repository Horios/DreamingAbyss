/* Phase 1 scheduling kernel. No game globals, wall clock, random source, damage
   formulas, rewards or balance defaults. The legacy runtime is not switched by
   loading this module. Time in public data is seconds; internal time is integer
   microseconds to make chunked/foreground/offline runs deterministic. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.EmberwildSecondsTimeline=api;
})(globalThis,function(){
  'use strict';
  const SCALE=1000000,VERSION=2;
  const copy=x=>JSON.parse(JSON.stringify(x,(_key,value)=>{
    if(typeof value==='number'&&!Number.isFinite(value))fail('non-finite JSON value');
    return value;
  }));
  const fail=message=>{throw new Error('Seconds timeline: '+message);};
  function number(n,label,min=0){
    if(typeof n!=='number'||!Number.isFinite(n)||n<min)fail(label+' invalid');
    return n;
  }
  function time(n,label='time'){
    const v=Math.round(number(n,label)*SCALE);
    if(!Number.isSafeInteger(v))fail(label+' out of range');
    return v;
  }
  const seconds=n=>n/SCALE;
  function positiveTime(n,label){const t=time(n,label);if(t<1)fail(label+' must be positive');return t;}
  function id(value,label){if(typeof value!=='string'||!value.length)fail(label+' invalid');return value;}
  function safeAdd(a,b){const result=a+b;if(!Number.isSafeInteger(result))fail('time overflow');return result;}
  function skillDefinition(s){
    id(s.id,'skill id');
    if(!['active','trigger'].includes(s.type))fail('skill type invalid');
    time(s.cooldownSeconds,'cooldownSeconds');number(s.mpCost,'mpCost');
    if(s.type==='active'){
      time(s.castSeconds,'castSeconds');time(s.actionCostSeconds,'actionCostSeconds');
      if(!Number.isSafeInteger(s.priority))fail('priority invalid');
    }
    if(s.initialReadyInSeconds!==undefined)time(s.initialReadyInSeconds,'initialReadyInSeconds');
    return copy(s);
  }
  class Timeline{
    constructor(config,actors=[],handlers={}){
      this.config=copy(config);positiveTime(config.minimumActionIntervalSeconds,'minimumActionIntervalSeconds');
      number(config.referenceSpeed,'referenceSpeed',Number.MIN_VALUE);
      this.handlers=handlers;this.now=0;this.serial=0;this.actors=[];this.statuses=[];
      this.executing=false;this.triggering=new Set();
      for(const actor of actors)this.addActor(actor);
    }
    interval(a){return positiveTime(Math.max(this.config.minimumActionIntervalSeconds,a.definition.baseIntervalSeconds*this.config.referenceSpeed/a.speed),'actor interval');}
    addActor(definition){
      if(this.executing)fail('cannot change roster inside event callback');
      const d=copy(definition);id(d.id,'actor id');
      if(this.actors.some(a=>a.definition.id===d.id))fail('duplicate actor id');
      positiveTime(d.baseIntervalSeconds,'baseIntervalSeconds');number(d.speed,'speed',Number.MIN_VALUE);
      number(d.maxMp,'maxMp');number(d.mp,'mp');number(d.mpRegenPerSecond,'mpRegenPerSecond');
      if(d.mp>d.maxMp)fail('MP exceeds maximum');
      if(!Array.isArray(d.skills))fail('skills missing');
      d.skills=d.skills.map(skillDefinition);for(const s of d.skills)if(s.type==='active')s.cooldownSeconds=Math.max(s.cooldownSeconds,this.config.minimumActionIntervalSeconds);
      if(new Set(d.skills.map(s=>s.id)).size!==d.skills.length)fail('duplicate skill id');
      const a={definition:d,speed:d.speed,alive:true,mp:d.mp,mpAt:this.now,mpCostMultiplier:1,actionAt:this.now,actionSpeedAt:this.now,actionFixedAt:this.now,basicAt:0,casting:null,ready:Object.create(null),retryAt:Object.create(null),readyArchive:Object.create(null)};
      a.basicAt=safeAdd(this.now,this.interval(a));
      for(const s of d.skills)a.ready[s.id]=safeAdd(this.now,time(s.initialReadyInSeconds??0));
      this.actors.push(a);return this.actor(d.id);
    }
    // Each encounter starts every listed actor's timers afresh: a full basic attack charge and each
    // skill's initial cooldown; nothing carries over from the previous encounter's cooldowns.
    resetEncounter(actorIds){
      if(this.executing)fail('cannot reset inside event callback');
      for(const actorId of actorIds){
        const a=this.find(actorId);a.casting=null;a.actionAt=a.actionSpeedAt=a.actionFixedAt=this.now;a.basicAt=safeAdd(this.now,this.interval(a));
        a.retryAt=Object.create(null);a.readyArchive=Object.create(null);for(const s of a.definition.skills)a.ready[s.id]=safeAdd(this.now,time(s.initialReadyInSeconds??0));
      }
    }
    find(actorId){return this.actors.find(a=>a.definition.id===actorId)||fail('unknown actor '+actorId);}
    syncActors(definitions){
      if(this.executing)fail('cannot change roster inside event callback');
      const checked=new Timeline(this.config,definitions),old=new Map(this.actors.map(a=>[a.definition.id,a]));
      this.actors=checked.actors.map(fresh=>{
        const a=old.get(fresh.definition.id);if(!a){fresh.mpAt=this.now;fresh.actionAt=fresh.actionSpeedAt=fresh.actionFixedAt=this.now;fresh.basicAt=safeAdd(this.now,this.interval(fresh));for(const s of fresh.definition.skills)fresh.ready[s.id]=safeAdd(this.now,time(s.initialReadyInSeconds??0));return fresh;}
        this.settleMana(a);const oldInterval=this.interval(a);a.definition=fresh.definition;a.speed=fresh.speed;a.mp=Math.min(a.mp,a.definition.maxMp);
        a.basicAt=safeAdd(this.now,Math.max(0,Math.round((a.basicAt-this.now)*this.interval(a)/oldInterval)));
        a.actionSpeedAt=safeAdd(this.now,Math.max(0,Math.round((a.actionSpeedAt-this.now)*this.interval(a)/oldInterval)));a.actionAt=Math.max(a.actionSpeedAt,a.actionFixedAt);
        const allReady={...a.readyArchive,...a.ready},ready=Object.create(null);for(const s of a.definition.skills)ready[s.id]=allReady[s.id]??safeAdd(this.now,time(s.initialReadyInSeconds??0));a.readyArchive=Object.fromEntries(Object.entries(allReady).filter(([id,at])=>!Object.hasOwn(ready,id)&&at>this.now));a.ready=ready;a.retryAt=Object.fromEntries(Object.entries(a.retryAt||{}).filter(([id])=>Object.hasOwn(ready,id)));
        if(a.casting&&!a.definition.skills.some(s=>s.id===a.casting.skillId))a.casting=null;
        return a;
      });
      const ids=new Set(definitions.map(a=>a.id));this.statuses=this.statuses.filter(s=>ids.has(s.actorId));
    }
    actor(actorId){
      const a=this.find(actorId);
      return {id:actorId,alive:a.alive,speed:a.speed,mp:this.mana(a,this.now),maxMp:a.definition.maxMp,
        intervalSeconds:seconds(this.interval(a)),actionReadyInSeconds:seconds(Math.max(0,a.actionAt-this.now)),
        basicReadyInSeconds:seconds(Math.max(0,a.basicAt-this.now)),casting:a.casting?{skillId:a.casting.skillId,remainingSeconds:seconds(Math.max(0,a.casting.at-this.now))}:null,
        skills:a.definition.skills.map(s=>({...copy(s),readyInSeconds:seconds(Math.max(0,a.ready[s.id]-this.now))}))};
    }
    mana(a,at){return a.alive?Math.min(a.definition.maxMp,a.mp+seconds(at-a.mpAt)*a.definition.mpRegenPerSecond):a.mp;}
    settleMana(a){a.mp=this.mana(a,this.now);a.mpAt=this.now;}
    setAlive(actorId,alive){
      if(typeof alive!=='boolean')fail('alive invalid');
      const a=this.find(actorId);this.settleMana(a);a.alive=alive;
      if(!alive)a.casting=null;
    }
    setMp(actorId,value){const a=this.find(actorId);number(value,'mp');if(value>a.definition.maxMp)fail('MP exceeds maximum');a.mp=value;a.mpAt=this.now;}
    setMaxMp(actorId,value){number(value,'maxMp',Number.MIN_VALUE);const a=this.find(actorId);this.settleMana(a);a.definition.maxMp=value;a.definition.mp=Math.min(a.definition.mp,value);a.mp=Math.min(a.mp,value);}
    setMpRegen(actorId,value){number(value,'mpRegenPerSecond');const a=this.find(actorId);this.settleMana(a);a.definition.mpRegenPerSecond=value;}
    setMpCostMultiplier(actorId,value){number(value,'mpCostMultiplier');this.find(actorId).mpCostMultiplier=value;}
    mpCost(a,s){return number(s.mpCost*a.mpCostMultiplier,'effective MP cost');}
    reduceCooldowns(actorId,secondsToReduce){
      const amount=time(secondsToReduce,'cooldown reduction'),a=this.find(actorId);
      for(const box of [a.ready,a.readyArchive])for(const key of Object.keys(box))box[key]=Math.max(this.now,box[key]-amount);
    }
    deferSkill(actorId,skillId,delaySeconds){const a=this.find(actorId);if(!Object.hasOwn(a.ready,skillId))fail('unknown skill');a.retryAt[skillId]=safeAdd(this.now,positiveTime(delaySeconds,'retry delay'));}
    setSpeed(actorId,value){
      number(value,'speed',Number.MIN_VALUE);const a=this.find(actorId),old=this.interval(a);
      a.speed=value;const next=this.interval(a);
      // Preserve the completed fraction of an in-progress basic attack charge.
      a.basicAt=safeAdd(this.now,Math.max(0,Math.round((a.basicAt-this.now)*next/old)));
      a.actionSpeedAt=safeAdd(this.now,Math.max(0,Math.round((a.actionSpeedAt-this.now)*next/old)));
      a.actionAt=Math.max(a.actionSpeedAt,a.actionFixedAt);
    }
    context(){return {timeSeconds:seconds(this.now),timeline:this};}
    controlled(a){return this.statuses.some(s=>s.actorId===a.definition.id&&s.preventsAction);}
    allowed(a,s,at){return !this.handlers.canUse||this.handlers.canUse(this.actor(a.definition.id),s,{...this.context(),timeSeconds:seconds(at)})!==false;}
    candidate(a){
      if(!a.alive||a.casting||this.controlled(a))return null;
      if(this.handlers.canAct&&this.handlers.canAct(this.actor(a.definition.id),this.context())===false)return null;
      const candidates=[],free=Math.max(this.now,a.actionAt);
      for(const [order,s] of a.definition.skills.entries()){
        if(s.type!=='active')continue;
        const cost=this.mpCost(a,s);if(cost>a.definition.maxMp)continue;
        let at=Math.max(free,a.ready[s.id],a.retryAt[s.id]||0);
        const missing=cost-this.mana(a,at);
        if(missing>0){
          if(a.definition.mpRegenPerSecond<=0)continue;
          at=safeAdd(at,Math.ceil(missing/a.definition.mpRegenPerSecond*SCALE));
        }
        if(this.allowed(a,s,at))candidates.push({at,skill:s,order});
      }
      // Instant skills preserve loadout order; basics keep their own deadline.
      candidates.push({at:Math.max(free,a.basicAt),skill:null,order:Infinity});
      candidates.sort((x,y)=>x.at-y.at||(x.skill===null?1:y.skill===null?-1:x.order-y.order));
      return candidates[0];
    }
    validateStatus(input){
      const s=copy(input);id(s.id,'status id');this.find(s.actorId);
      if(this.statuses.some(x=>x.id===s.id))fail('duplicate status id');
      if(s.durationSeconds!==null)positiveTime(s.durationSeconds,'durationSeconds');
      if(typeof s.preventsAction!=='boolean')fail('preventsAction missing');
      if(s.tickEverySeconds!==null)positiveTime(s.tickEverySeconds,'tickEverySeconds');
      if(s.tickPriority!==undefined&&(!Number.isSafeInteger(s.tickPriority)||s.tickPriority<0||s.tickPriority>99))fail('tickPriority invalid');
      return s;
    }
    addStatus(input){
      const s=this.validateStatus(input);
      s.until=s.durationSeconds===null?null:safeAdd(this.now,time(s.durationSeconds));
      s.next=s.tickEverySeconds===null?null:safeAdd(this.now,time(s.tickEverySeconds));
      this.statuses.push(s);if(s.preventsAction)this.interrupt(s.actorId);return copy(s);
    }
    removeStatus(statusId){const i=this.statuses.findIndex(s=>s.id===statusId);if(i>=0)this.statuses.splice(i,1);}
    interrupt(actorId){
      const a=this.find(actorId),cast=a.casting;if(!cast)return false;
      a.casting=null;this.emit('interrupt',{actorId,skillId:cast.skillId});return true;
    }
    // Trigger effects execute within their original event. They do not change
    // action/basic deadlines and cannot accidentally acquire an action cost.
    trigger(actorId,skillId){
      const a=this.find(actorId),s=a.definition.skills.find(s=>s.id===skillId&&s.type==='trigger');
      const key=JSON.stringify([actorId,skillId]);
      if(!s||!a.alive||this.triggering.has(key)||a.ready[s.id]>this.now||this.mana(a,this.now)<this.mpCost(a,s))return false;
      this.settleMana(a);a.mp-=this.mpCost(a,s);a.ready[s.id]=safeAdd(this.now,time(s.cooldownSeconds));
      this.triggering.add(key);
      try{this.emit('trigger',{actorId,skillId});return true;}finally{this.triggering.delete(key);}
    }
    emit(type,detail){
      const event={type,timeSeconds:seconds(this.now),serial:++this.serial,...detail};
      if(this.handlers.onEvent)this.handlers.onEvent(event,this);return event;
    }
    nextEvent(){
      const rows=[];
      for(const [order,s] of this.statuses.entries()){
        // Final periodic tick occurs before expiry, which occurs before actions.
        if(s.next!==null&&(s.until===null||s.next<=s.until))rows.push({at:s.next,priority:s.tickPriority??0,order,type:'statusTick',status:s});
        if(s.until!==null)rows.push({at:s.until,priority:100,order,type:'statusExpire',status:s});
      }
      for(const [order,a] of this.actors.entries()){
        if(!a.alive)continue;
        if(a.casting)rows.push({at:a.casting.at,priority:200,order,type:'castComplete',actor:a});
        else{const c=this.candidate(a);if(c)rows.push({...c,priority:300,order,type:'action',actor:a});}
      }
      rows.sort((a,b)=>a.at-b.at||a.priority-b.priority||a.order-b.order);
      return rows[0]||null;
    }
    execute(event){
      this.now=event.at;const a=event.actor,s=event.status;
      if(s){
        if(event.type==='statusTick')s.next=safeAdd(this.now,time(s.tickEverySeconds));
        else this.removeStatus(s.id);
        this.emit(event.type,{actorId:s.actorId,statusId:s.id,payload:copy(s.payload??null)});return;
      }
      if(event.type==='castComplete'){
        const skillId=a.casting.skillId;a.casting=null;
        this.emit('castComplete',{actorId:a.definition.id,skillId});return;
      }
      const skill=event.skill;
      if(this.handlers.beforeAction&&this.handlers.beforeAction(this.actor(a.definition.id),skill,this.context())===false){
        a.actionSpeedAt=safeAdd(this.now,this.interval(a));a.actionFixedAt=this.now;a.actionAt=a.actionSpeedAt;
        this.emit('blocked',{actorId:a.definition.id,skillId:skill?.id??null});return;
      }
      if(skill){
        this.settleMana(a);a.mp=Math.max(0,a.mp-this.mpCost(a,skill));
        a.ready[skill.id]=safeAdd(this.now,time(skill.cooldownSeconds));delete a.retryAt[skill.id];
        const cast=time(skill.castSeconds);
        a.actionSpeedAt=this.now;
        a.actionFixedAt=safeAdd(this.now,Math.max(time(skill.actionCostSeconds),cast));
        a.actionAt=Math.max(a.actionSpeedAt,a.actionFixedAt);
        if(cast)a.casting={skillId:skill.id,at:safeAdd(this.now,cast)};
        this.emit(cast?'castStart':'skill',{actorId:a.definition.id,skillId:skill.id});
      }else{
        a.basicAt=safeAdd(this.now,this.interval(a));
        this.emit('basic',{actorId:a.definition.id});
      }
    }
    advanceTo(targetSeconds,{maxEvents=100000}={}){
      if(this.executing)fail('reentrant advance');
      const target=time(targetSeconds);if(target<this.now)fail('cannot reverse time');
      if(!Number.isSafeInteger(maxEvents)||maxEvents<1)fail('maxEvents invalid');
      this.executing=true;let events=0;
      try{
        let next=this.nextEvent();
        while(next&&next.at<=target&&events<maxEvents){this.execute(next);events++;next=this.nextEvent();}
        const complete=!next||next.at>target;
        if(complete)this.now=target;
        return {complete,timeSeconds:seconds(this.now),events,nextEventSeconds:next?seconds(next.at):null};
      }finally{this.executing=false;}
    }
    snapshot(){return copy({version:VERSION,config:this.config,now:this.now,serial:this.serial,actors:this.actors,statuses:this.statuses});}
    static restore(snapshot,handlers={}){
      const s=copy(snapshot);
      if(![1,VERSION].includes(s.version)||!Array.isArray(s.actors)||!Array.isArray(s.statuses)||!Number.isSafeInteger(s.now)||s.now<0||!Number.isSafeInteger(s.serial)||s.serial<0)fail('snapshot invalid');
      const out=new Timeline(s.config,s.actors.map(a=>a.definition),handlers),ticks=(n,label)=>{if(!Number.isSafeInteger(n)||n<0)fail(label+' invalid');};
      for(const [i,a] of s.actors.entries()){
        const def=out.actors[i].definition;a.definition=def;
        number(a.speed,'speed',Number.MIN_VALUE);number(a.mp,'mp');if(a.mp>def.maxMp||typeof a.alive!=='boolean')fail('actor snapshot invalid');
        number(a.mpCostMultiplier,'mpCostMultiplier');
        for(const k of ['mpAt','actionAt','actionSpeedAt','actionFixedAt','basicAt'])ticks(a[k],k);
        if(a.actionAt!==Math.max(a.actionSpeedAt,a.actionFixedAt))fail('action lock invalid');
        if(a.mpAt>s.now||!a.ready||Array.isArray(a.ready))fail('actor clock invalid');
        if(Object.keys(a.ready).length!==def.skills.length)fail('cooldown keys invalid');
        for(const sk of def.skills)ticks(a.ready[sk.id],'cooldown');
        a.ready=Object.assign(Object.create(null),a.ready);a.readyArchive??={};if(!a.readyArchive||Array.isArray(a.readyArchive)||typeof a.readyArchive!=='object'||Object.keys(a.readyArchive).length>100000)fail('archived cooldowns invalid');for(const [key,at] of Object.entries(a.readyArchive)){id(key,'archived skill');if(Object.hasOwn(a.ready,key))fail('duplicate archived cooldown');ticks(at,'archived cooldown');}a.retryAt??={};for(const [id,at] of Object.entries(a.retryAt)){if(!Object.hasOwn(a.ready,id))fail('retry skill invalid');ticks(at,'retry clock');}if(s.version===1){a.actionSpeedAt=s.now;a.actionAt=Math.max(s.now,a.actionFixedAt);}
        if(a.casting){if(!a.alive||a.casting.at<s.now||!def.skills.some(sk=>sk.id===a.casting.skillId&&sk.type==='active'))fail('casting invalid');ticks(a.casting.at,'cast time');}
        out.actors[i]=a;
      }
      out.now=s.now;out.serial=s.serial;
      const ids=new Set();
      for(const status of s.statuses){
        if(ids.has(status.id))fail('duplicate status id');ids.add(status.id);
        // Reuse public validation without losing the original absolute deadline.
        out.validateStatus(status);
        for(const k of ['until','next'])if(status[k]!==null){ticks(status[k],k);if(status[k]<s.now)fail('expired status in snapshot');}
        if((status.until===null)!==(status.durationSeconds===null)||(status.next===null)!==(status.tickEverySeconds===null))fail('status deadline invalid');
        out.statuses.push(status);
      }
      return out;
    }
  }
  return {VERSION,Timeline,create:(config,actors,handlers)=>new Timeline(config,actors,handlers),restore:Timeline.restore};
});
