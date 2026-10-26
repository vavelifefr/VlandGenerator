// Browser URLs are rooted at the local server; shared JS/data stay outside Web.
export function webHref(href){
  if(!href||href.startsWith('#')||href.startsWith('/')||/^[a-z][a-z0-9+.-]*:/i.test(href))return href;
  const pathname=href.split(/[?#]/)[0];
  if(href.startsWith('Web/'))return '/'+href;
  if(pathname==='index.html')return '/Web/'+href;
  if(pathname.endsWith('.html')||href.startsWith('ui/'))return '/Web/HTML/'+href;
  return '/'+href;
}

export function rewriteWebLinks(html){
  return html.replace(/\b(href|src)="([^"]*)"/g,(_,attribute,href)=>attribute+'="'+webHref(href)+'"');
}
