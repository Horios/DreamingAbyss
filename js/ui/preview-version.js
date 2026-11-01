/* Preview-only badge: the deployed source owns its own visible version. */
(()=>{
 'use strict';
 const banner=document.getElementById('preview-build-banner');
 if(!banner)return;
 fetch('data/preview-version.json?at='+Date.now(),{cache:'no-store'})
  .then(response=>{if(!response.ok)throw Error('preview version unavailable');return response.json();})
  .then(data=>{
   if(!/^v\d+\.\d{3}$/.test(data.version))throw Error('invalid preview version');
   banner.textContent='測試版本 '+data.version;
   document.title='測試版 '+data.version+'｜'+document.title.replace(/^測試版(?:\s+v\d+\.\d{3})?\s*[｜|]\s*/, '');
  })
  .catch(error=>console.warn('無法讀取測試版版本號',error));
})();
