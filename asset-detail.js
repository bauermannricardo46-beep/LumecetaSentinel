(() => {
  const API = '/api';
  const eur = v => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(Number(v)||0);
  const pct = v => `${Number(v)>=0?'+':''}${(Number(v)||0).toFixed(2)}%`;
  const scoreLabel = s => s>=70?'STRONG':s>=55?'POSITIVE':s>=40?'NEUTRAL':s>=25?'CAUTION':'WEAK';
  const signalColor = s => s>=70?'var(--good)':s>=55?'var(--accent2)':s>=40?'var(--warn)':'var(--bad)';
  function showView(name){
    document.querySelectorAll('.view').forEach(v=>v.classList.remove('active-view'));
    const target=document.getElementById(`view-${name}`); if(target)target.classList.add('active-view');
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
    if(name!=='asset')document.getElementById('page-title').textContent=name==='watchlist'?'Watchlist':name;
    history.replaceState(null,'',name==='asset'?'#asset':`#${name}`);
  }
  window.showLumecetaView=showView;
  function mount(){
    const main=document.querySelector('.main'); if(!main||document.getElementById('view-asset'))return;
    const section=document.createElement('section'); section.id='view-asset'; section.className='view';
    section.innerHTML=`<div class="asset-detail-view"><div class="asset-detail-top"><button id="asset-back" class="asset-back">← Zur Watchlist</button><span id="asset-updated" class="muted"></span></div><section class="card asset-price-card"><div><div id="asset-symbol" class="asset-symbol">ASSET</div><h2 id="asset-name" class="asset-name">Asset</h2></div><div><span id="asset-price" class="asset-price">—</span><span id="asset-day" class="asset-day muted">—</span></div><span id="asset-verified" class="asset-verified">—</span></section><div class="asset-score-grid"><article class="asset-score-card"><small>Sentinel Score</small><strong id="asset-score">—</strong><span id="asset-score-label">—</span></article><article class="asset-score-card"><small>Momentum</small><strong id="asset-momentum">—</strong><span id="asset-momentum-label">—</span></article><article class="asset-score-card"><small>Risk</small><strong id="asset-risk">—</strong><span id="asset-risk-label">—</span></article></div><div class="asset-detail-grid"><section class="card"><div class="section-head"><div><div class="muted">PERFORMANCE</div><h2>Historical returns</h2></div><span class="pill">REAL MARKET DATA</span></div><div id="asset-returns" class="asset-returns"></div><div class="asset-bars" id="asset-bars"></div></section><section class="card"><div class="section-head"><div><div class="muted">SENTINEL</div><h2>Current signal</h2></div></div><div id="asset-signal" class="asset-signal-banner"></div><div class="asset-detail-note" id="asset-note"></div></section></div><section class="card"><div class="section-head"><div><div class="muted">ANALYSIS</div><h2>How Lumeceta reads this asset</h2></div></div><p id="asset-method" class="asset-method"></p></section></div>`;
    main.appendChild(section);
    document.getElementById('asset-back').addEventListener('click',()=>showView('watchlist'));
  }
  async function openAsset(ticker){
    mount(); showView('asset'); document.getElementById('page-title').textContent=ticker;
    document.getElementById('asset-note').textContent='Asset-Daten werden geladen…';
    try{
      const r=await fetch(`${API}/watchlist?symbols=${encodeURIComponent(ticker)}&force=1`),d=await r.json(); if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
      const a=(d.items||[])[0]; if(!a)throw new Error('Asset nicht gefunden.'); render(a,d.generatedAt);
    }catch(e){document.getElementById('asset-note').textContent=e.message;}
  }
  function render(a,generatedAt){
    document.getElementById('asset-symbol').textContent=a.ticker||'ASSET';
    document.getElementById('asset-name').textContent=a.name||a.ticker||'Asset';
    document.getElementById('asset-price').textContent=a.price?eur(a.price):'—';
    document.getElementById('asset-day').textContent=a.dayChange==null?'—':pct(a.dayChange);
    document.getElementById('asset-day').className=`asset-day ${Number(a.dayChange)>=0?'positive':'negative'}`;
    const verified=document.getElementById('asset-verified'); verified.textContent=a.availableInTrading212?'✓ Trading 212 verifiziert':'— Trading 212 nicht verifiziert'; verified.className=`asset-verified ${a.availableInTrading212?'ok':''}`;
    document.getElementById('asset-score').textContent=a.score??'—'; document.getElementById('asset-score-label').textContent=a.score==null?'UNVERIFIED':scoreLabel(Number(a.score));
    document.getElementById('asset-momentum').textContent=a.momentum??'—'; document.getElementById('asset-momentum-label').textContent=a.momentum==null?'NO DATA':scoreLabel(Number(a.momentum));
    document.getElementById('asset-risk').textContent=a.risk??'—'; document.getElementById('asset-risk-label').textContent=a.risk==null?'NO DATA':(Number(a.risk)>=75?'HIGH':Number(a.risk)>=50?'MEDIUM':'LOW');
    const s=Number(a.score||0),signal=document.getElementById('asset-signal'); signal.innerHTML=`<i class="asset-signal-dot" style="color:${signalColor(s)};background:${signalColor(s)}"></i><div><strong>${scoreLabel(s)}</strong><br><span>Sentinel ${a.score??'—'} · Momentum ${a.momentum??'—'} · Risk ${a.risk??'—'}</span></div>`;
    document.getElementById('asset-note').textContent=a.availableInTrading212?'Dieses Asset ist in den Trading-212-Instrumentmetadaten verifiziert.':'Trading-212-Verfügbarkeit konnte für dieses Asset aktuell nicht verifiziert werden. Lumeceta wertet es deshalb nicht als bestätigte Gelegenheit.';
    document.getElementById('asset-method').textContent='Sentinel kombiniert Momentum und Risiko. Momentum basiert auf gewichteten 7-/30-/1-Jahres-Renditen. Risiko berücksichtigt historische Volatilität und maximalen Drawdown. Die Scores sind Analyseindikatoren und keine Anlageempfehlung.';
    const ret=a.returns||{}; document.getElementById('asset-returns').innerHTML=[['7 Tage',ret.r7],['30 Tage',ret.r30],['1 Jahr',ret.r252]].map(([label,v])=>`<div class="asset-return"><small>${label}</small><strong class="${Number(v)>=0?'positive':'negative'}">${v==null?'—':pct(Number(v)*100)}</strong></div>`).join('');
    const risk=Number(a.risk||0),momentum=Number(a.momentum||0),score=Number(a.score||0); document.getElementById('asset-bars').innerHTML=[['Momentum',momentum],['Sentinel',score],['Risk',risk]].map(([label,v])=>`<div class="asset-bar-row"><span>${label}</span><div class="asset-bar-track"><i style="width:${Math.max(0,Math.min(100,v))}%"></i></div><b>${a.score==null?'—':v}</b></div>`).join('');
    document.getElementById('asset-updated').textContent=generatedAt?`Updated ${new Date(generatedAt).toLocaleTimeString('de-DE')}`:'';
  }
  document.addEventListener('click',e=>{const card=e.target.closest('.watch-item'); if(card&&!e.target.closest('.remove-watch')){const ticker=card.querySelector('.ticker')?.textContent?.trim();if(ticker)openAsset(ticker);}});
  window.openLumecetaAsset=openAsset; mount();
})();
