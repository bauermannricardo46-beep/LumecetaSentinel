(() => {
  const items = [
    ['overview','⌂','Overview'],
    ['portfolio','◫','Portfolio'],
    ['watchlist','◉','Watchlist'],
    ['signals','⌁','Signals']
  ];

  function applyMobileViewportClass(){
    const ua=navigator.userAgent||'';
    const isAndroid=/Android/i.test(ua);
    const isMobile=/Android|iPhone|iPad|iPod|Mobile/i.test(ua) || window.matchMedia('(pointer:coarse)').matches;
    document.documentElement.classList.toggle('mobile-device',isMobile);
    document.body.classList.toggle('android-webview',isAndroid);
  }

  function inject(){
    applyMobileViewportClass();
    if(document.getElementById('mobile-bottom-nav')) return;
    const nav=document.createElement('nav');
    nav.id='mobile-bottom-nav';
    nav.className='mobile-bottom-nav';
    nav.setAttribute('aria-label','Hauptnavigation');
    nav.innerHTML=items.map(([view,icon,label])=>`<button type="button" data-mobile-view="${view}" aria-label="${label}"><span class="mobile-nav-icon">${icon}</span><span class="mobile-nav-label">${label}</span></button>`).join('');
    document.body.appendChild(nav);

    nav.querySelectorAll('[data-mobile-view]').forEach(btn=>{
      btn.addEventListener('click',(event)=>{
        event.preventDefault();
        event.stopPropagation();
        const view=btn.dataset.mobileView;
        if(typeof window.showLumecetaView==='function') window.showLumecetaView(view);
        else location.hash=view;
        setActive(view);
      },{passive:false});
    });

    window.addEventListener('lumeceta:viewchange',e=>setActive(e.detail?.view));
    window.addEventListener('hashchange',()=>setActive(location.hash.slice(1)||'overview'));
    window.addEventListener('resize',applyMobileViewportClass,{passive:true});
    setActive(location.hash.slice(1)||'overview');
  }

  function setActive(view){
    document.querySelectorAll('[data-mobile-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mobileView===view));
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',inject); else inject();
})();
