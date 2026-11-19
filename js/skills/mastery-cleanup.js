
(()=>{
const masterySinglePageBase=singlePagePanel;
singlePagePanel=function(page,title,view){
  return masterySinglePageBase(page,title,view).replace(/ · 技能點 \d+/g,'').replace(/技能點 \d+ · /g,'');
};
if(state)render();
})();
