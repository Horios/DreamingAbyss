/* Toasts raised while a modal dialog is open (for example the wishing lake's full-bag warning) must not hide
   behind the dialog or at the bottom of the page. They join the top layer as a manual popover above the
   dialog and sit in the lower middle of that dialog. Without an open dialog the toast keeps its page position. */
(()=>{
  const base=toast,styled=['position','inset','left','top','right','bottom','margin','transform','maxWidth','display'];
  const openDialog=()=>{const list=[...(document.querySelectorAll?.('dialog[open]')||[])];return list.filter(d=>{try{return d.matches(':modal');}catch{return true;}}).at(-1)||null;};
  function reset(el){
    try{if(el.matches?.(':popover-open'))el.hidePopover();}catch{}
    el.removeAttribute?.('popover');for(const key of styled)if(key!=='display')el.style[key]='';
  }
  function place(el,dialog){
    if(typeof el.showPopover!=='function')return;
    el.setAttribute('popover','manual');
    // Re-entering the top layer puts the toast above the dialog opened most recently.
    try{if(el.matches(':popover-open'))el.hidePopover();el.showPopover();}catch{return;}
    const r=dialog.getBoundingClientRect();
    Object.assign(el.style,{position:'fixed',inset:'auto',right:'auto',bottom:'auto',margin:'0',left:(r.left+r.width/2)+'px',top:(r.top+r.height*.72)+'px',transform:'translate(-50%,-50%)',maxWidth:Math.max(200,r.width-32)+'px'});
  }
  toast=function(...args){
    const out=base.apply(this,args),el=$('toast');
    if(el)try{const dialog=openDialog();if(dialog)place(el,dialog);else reset(el);}catch{}
    return out;
  };
})();
