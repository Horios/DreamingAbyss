/* Loaded last. A balance update that is turned down (the team is exploring or fighting) must change nothing.
   The refusal comes from deep inside the applyBalanceConfig chain, after the outer modules have already taken the new
   document. When that happens the document that was running is offered again: the outer modules take it back and the
   inner ones, which never changed, refuse it the same way. An invalid document still throws from its own validator. */
(()=>{
 const base=applyBalanceConfig;
 applyBalanceConfig=function(input,options){
  const unsafe=!!party&&!!globalThis.__EMBERWILD_TEAMS?.busy?.(),running=unsafe?exportableBalance():null;
  const out=base(input,options);
  if(out===false&&running)base(running,{persist:false});
  return out;
 };
})();
