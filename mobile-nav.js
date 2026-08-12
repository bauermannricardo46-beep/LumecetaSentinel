(() => {
  const items = [
    ['overview','⌂','Overview'],
    ['portfolio','◫','Portfolio'],
    ['watchlist','◉','Watchlist'],
    ['signals','⌁','Signals']
  ];

  function inject(){
    if(document.getElementById('mobile-bottom-nav')) return;
    const nav=document.createElement('nav');
    nav.id='mobile-bottom-nav';
    nav.className='mobile-bottom-nav';
    nav.setAttribute('aria-label','Hauptnavigation');
    nav.innerHTML=items.map(([view,icon,label])=>`<button type="button" data-mobile-view="${view}" aria-label="${label}"><span class="mobile-nav-icon">${icon}</span><span class="mobile-nav-label">${label}</span></button>`).join('');
    document.body.appendChild(nav);

    nav.querySelectorAll('[data-mobile-view]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const view=btn.dataset.mobileView;
        if(typeof window.showLumecetaView==='function') window.showLumecetaView(view);
        else location.hash=view;
      });
    });

    window.addEventListener('lumeceta:viewchange',e=>setActive(e.detail?.view));
    setActive(location.hash.slice(1)||'overview');
  }

  function setActive(view){
    document.querySelectorAll('[data-mobile-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mobileView===view));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',inject); else inject();
})();
