'use strict';
window.RoukyTheme=(()=>{
 const key='rouky-theme-v1',media=window.matchMedia('(prefers-color-scheme: dark)');let choice='system';
 try{const saved=localStorage.getItem(key);if(['light','dark','system'].includes(saved))choice=saved}catch{}
 function apply(){const dark=choice==='dark'||choice==='system'&&media.matches;document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';document.dispatchEvent(new CustomEvent('rouky:theme',{detail:{choice,dark}}));}
 function set(value){if(!['light','dark','system'].includes(value))return;choice=value;try{localStorage.setItem(key,value)}catch{}apply()}
 media.addEventListener?.('change',()=>{if(choice==='system')apply()});apply();return{set,get:()=>choice};
})();
