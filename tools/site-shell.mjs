export function header(base="./",active="home") {
 const destinations=[["home","Home",base],["deliveries","Delivery desk",base+"deliveries/"],["driver","Drivers",base+"driver/"],["dispatcher","Dispatcher",base+"dispatcher/"],["operations","Operations",base+"operations/"]];
 return `<!-- f24-header:start -->
<div class="f24-status-bar"><span><i class="f24-status-dot" aria-hidden="true"></i>Franks24 Dispatch · Service preview</span><a href="${base}deliveries/policies.html">Launch &amp; policy status ↗</a></div>
<header class="f24-header"><a class="brand f24-brand" href="${base}" aria-label="Franks24 home"><svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 7h27l-5 8H17v5h13l-5 8h-8v9H7z" fill="currentColor"/><path d="m26 30 8-13v13z" fill="currentColor"/></svg><span>Franks24<small>DISPATCH</small></span></a><button class="f24-menu" type="button" aria-expanded="false" aria-controls="f24-navigation" aria-label="Toggle navigation">Menu<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg></button><nav class="f24-nav" id="f24-navigation" aria-label="Main navigation">${destinations.map(([id,label,url])=>`<a href="${url}"${id===active?' aria-current="page"':''}>${label}</a>`).join("")}</nav></header>
<!-- f24-header:end -->`;
}
export function footer(base="./") {
 return `<!-- f24-footer:start -->
<footer class="f24-footer"><div class="f24-footer-top"><div><a class="f24-footer-brand" href="${base}">franks24<small>DISPATCH</small></a><p>Good things, on the move.</p></div><nav aria-label="Policies and support"><a href="${base}legal/delivery-terms.html">Terms &amp; conditions</a><a href="${base}legal/delivery-privacy.html">Privacy notice</a><a href="${base}legal/delivery-data.html">Data ownership &amp; use</a><a href="${base}deliveries/policies.html">Delivery policy drafts</a><a href="${base}deliveries/#account-panel">Privacy requests</a></nav></div><div class="f24-footer-bottom"><span>© 2026 Franks24 · Dispatch is a Franks24 service.</span><span>Policies are drafts pending operator and legal review.</span><a href="#main">Back to content ↑</a></div></footer>
<!-- f24-footer:end -->`;
}
export function headAssets(base="./") {
 return `<!-- f24-assets:start -->
<meta name="theme-color" content="#182b22"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&amp;family=Space+Grotesk:wght@400;500;600;700&amp;display=swap" rel="stylesheet"><link rel="stylesheet" href="${base}assets/site-shell.css"><script type="module" src="${base}assets/site-shell.js"></script>
<!-- f24-assets:end -->`;
}
