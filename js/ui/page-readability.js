/* Reading pages use the main column's scroll instead of shrinking nested panels. */
(()=>{
  function labelledModeTables(html){
    return html.replace(/<table\b[^>]*class="[^"]*\bmode-table\b[^"]*"[^>]*>[\s\S]*?<\/table>/g,table=>{
      const labels=[...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(match=>match[1].replace(/<[^>]+>/g,''));
      return table.replace(/<tbody>([\s\S]*?)<\/tbody>/,(_,body)=>'<tbody>'+body.replace(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g,(_,row)=>{
        let column=0;
        return '<tr>'+row.replace(/<td\b([^>]*)>/g,(_,attributes)=>`<td${attributes} data-reading-label="${esc(labels[column++]||'')}">`)+'</tr>';
      })+'</tbody>');
    });
  }

  const characterBase=characterView;
  characterView=function(){
    const html=characterBase().replace(/<p class="speed-description">[\s\S]*?<\/p>/,'');
    return `<div class="readability-page character-reading-page">${html}</div>`;
  };

  const wornBase=wornEquipmentView;
  wornEquipmentView=function(){
    let html=wornBase();
    const singlePlayer=(html.match(/class="worn-character-item\b/g)||[]).length===1;
    if(singlePlayer){
      html=html.replace(/<section\b[^>]*class="panel worn-character-pane"[^>]*>[\s\S]*?<\/section>/,'');
      html=html.replace('class="panel worn-member worn-detail-pane"','class="panel worn-member worn-detail-pane worn-player-equipment"');
    }
    return `<div class="readability-page worn-reading-page${singlePlayer?' worn-single-player':''}">${html}</div>`;
  };

  const bossBase=bossCraftView;
  bossCraftView=function(){return `<div class="readability-page boss-reading-page">${bossBase()}</div>`;};

  const guideBase=guideView;
  guideView=function(){
    let html=labelledModeTables(guideBase());
    const header=html.match(/<div class="heading"><div><div class="eyebrow">[\s\S]*?<\/h1><\/div>(?:<span\b[^>]*>[\s\S]*?<\/span>)?<\/div>/)?.[0];
    if(header)html=header+html.replace(header,'');
    return `<div class="readability-page guide-reading-page">${html}</div>`;
  };

  if(state)render();
})();
