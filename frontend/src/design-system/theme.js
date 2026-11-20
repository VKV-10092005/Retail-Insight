export const THEME_KEY='ri.theme';
export const normalizeTheme=v=>['light','dark','system'].includes(v)?v:'light';
export const resolveTheme=(v,dark)=>{
 const preference=normalizeTheme(v);
 return preference==='system'?(dark?'dark':'light'):preference;
};
export function applyTheme(v,dark,root=document.documentElement){
 const theme=resolveTheme(v,dark);
 root.dataset.theme=theme;
 root.dataset.themePreference=normalizeTheme(v);
 root.style.colorScheme=theme;
  root.ownerDocument.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme==='dark'?'#0B1120':'#F8FAFC');
 return theme;
}




