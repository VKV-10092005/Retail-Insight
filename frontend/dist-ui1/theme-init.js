/* Presentation-only UI1 bootstrap. Runs before CSS/React. No API or account access. */
(function(){
 var preference='system',blocked=false;
 try{var saved=localStorage.getItem('ri.theme');if(['light','dark','system'].indexOf(saved)>=0)preference=saved;}catch(e){blocked=true;}
 var dark=false;try{dark=window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){}
 var theme=preference==='system'?(dark?'dark':'light'):preference,root=document.documentElement;
 root.dataset.theme=theme;root.dataset.themePreference=preference;root.dataset.themeStorage=blocked?'blocked':'available';
 root.style.colorScheme=theme;
 var meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.setAttribute('content',theme==='dark'?'#080D1B':'#F6F8FC');
}());
