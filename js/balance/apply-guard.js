/* Loaded last. A balance update is refused as a whole while the team is exploring or fighting: every module that wraps
   applyBalanceConfig sits inside this check, so none of them swaps to the new document when the update is turned down. */
(()=>{
 const base=applyBalanceConfig;
 applyBalanceConfig=function(input,options){
  if(party&&globalThis.__EMBERWILD_TEAMS&&!globalThis.__EMBERWILD_TEAMS.safe())return false;
  return base(input,options);
 };
})();
