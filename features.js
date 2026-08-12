(() => {
  const API = '/api';
  const DEFAULT_WATCHLIST = ['VUAA_EQ','VWCE_EQ','SXR8_EQ','EUNL_EQ','BTC_USD'];
  const state = { watchlist: JSON.parse(localStorage.getItem('lumeceta.watchlist') || 'null') || DEFAULT_WATCHLIST, history: [], analytics: null, alerts: JSON.parse(localStorage.getItem('lumeceta.alerts') || '[]') };
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const n = v => Number.isFinite(Number(v)) ? Number(v) : 0;
  const eur = v => new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(n(v));
  const pct = v => `${n(v)>=0?'+':''}${n(v).toFixed(2)}%`;
  const saveWatch = () => localStorage.setItem('lumeceta.watchlist', JSON.stringify(state.watchlist));
  const saveAlerts = () => localStorage.setItem('lumeceta.alerts', JSON.stringify(state.alerts));
  async function api(path, options={}) { const r = await fetch(API + path, {...options,headers:{'Content-Type':'application/json',...(options.headers||{})}}); const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error || `Request failed (${r.status})`); return d; }

  function enhanceIndex() {
    const watch = document.getElementById('view-watchlist');
    if (watch) watch.innerHTML = `<section class="card intelligence-card"><div class="section-head"><div><div class="muted">WATCHLIST INTELLIGENCE</div><h2>Tracked assets</h2></div><span id="watch-count" class="pill">0 ASSETS</span></div><div class="watch-toolbar"><input id="watch-symbol" placeholder="Ticker hinzufügen · z. B. NVDA_US" autocomplete="off"><button id="watch-add" class="primary-btn">+ Hinzufügen</button><button id="watch-refresh" class="icon-btn" title="Watchlist aktualisieren">↻</button></div><div id="watch-error" class="connect-error"></div><div id="watch-grid" class="watch-grid"></div><div class="analytics-method"><b>LIVE MARKET INTELLIGENCE</b><span>Momentum, Volatilität und Drawdown werden aus echten täglichen Marktschlusskursen berechnet. Die Trading-212-Verfügbarkeit wird gegen die Instrument-Metadaten geprüft.</span></div></section>`;
    const overview = document.querySelector('#view-overview .chart-card');
    if (overview) {
      const head = overview.querySelector('.section-head');
      if (head) head.innerHTML = `<div><div class="muted">PERFORMANCE</div><h2>Portfolio-Verlauf</h2></div><div class="history-controls"><button data-range="7">7T</button><button data-range="30">1M</button><button data-range="90">3M</button><button data-range="180">6M</button><button class="active" data-range="365">1Y</button><button data-range="all">ALL</button></div>`;
      overview.insertAdjacentHTML('beforeend','<div id="history-stats" class="history-stats"></div>');
    }
    const signals = document.getElementById('view-signals');
    if (signals) signals.innerHTML = `<section class="card"><div class="section-head"><div><div class="muted">SENTINEL ENGINE</div><h2>Signals & Risk Intelligence</h2></div><span class="pill live">● REAL DATA</span></div><div id="engine-summary" class="engine-summary"></div><div id="asset-signals" class="asset-signals"></div><div class="analytics-method"><b>METHODOLOGY</b><span id="engine-method">Waiting for live analytics…</span></div></section><section class="card alerts-card"><div class="section-head"><div><div class="muted">MONITORING</div><h2>Alerts</h2></div><button id="add-alert" class="text-btn">+ Alert hinzufügen</button></div><div id="alerts-list" class="alerts-list"></div></section>`;
    const top = document.querySelector('.top-actions');
    if (top && !document.getElementById('alert-bell')) top.insertAdjacentHTML('afterbegin','<button id="alert-bell" class="icon-btn alert-bell" title="Alerts">♢<span id="alert-badge"></span></button>');
    bindFeatures();
  }

  function bindFeatures() {
    document.getElementById('watch-add')?.addEventListener('click', addWatch);
    document.getElementById('watch-symbol')?.addEventListener('keydown', e => { if(e.key==='Enter') addWatch(); });
    document.getElementById('watch-refresh')?.addEventListener('click', () => loadWatchlist(true));
    document.querySelectorAll('.history-controls button').forEach(b => b.addEventListener('click', () => { document.querySelectorAll('.history-controls button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); renderHistoryRange(b.dataset.range); }));
    document.getElementById('add-alert')?.addEventListener('click', addAlert);
    document.getElementById('alert-bell')?.addEventListener('click', () => { const el=document.getElementById('alerts-list'); if(el) { document.getElementById('view-signals')?.classList.add('active-view'); renderAlerts(); } });
  }

  function addWatch() {
    const input=document.getElementById('watch-symbol'), symbol=(input?.value||'').trim().toUpperCase();
    if(!symbol) return;
    if(!state.watchlist.includes(symbol)) state.watchlist.push(symbol);
    saveWatch(); input.value=''; loadWatchlist(true);
  }
  function removeWatch(symbol) { state.watchlist=state.watchlist.filter(x=>x!==symbol); saveWatch(); renderWatchlist([]); loadWatchlist(true); }

  async function loadWatchlist(force=false) {
    const grid=document.getElementById('watch-grid'); if(!grid) return;
    grid.innerHTML='<div class="empty-state">Live-Marktdaten werden geladen…</div>';
    try { const d=await api(`/watchlist?symbols=${encodeURIComponent(state.watchlist.join(','))}${force?'&force=1':''}`); renderWatchlist(d.items||[]); } catch(e) { grid.innerHTML=`<div class="empty-state">${esc(e.message)}</div>`; }
  }
  function scoreLabel(s){ return s>=70?'STRONG':s>=55?'POSITIVE':s>=40?'NEUTRAL':s>=25?'CAUTION':'WEAK'; }
  function renderWatchlist(items) {
    const grid=document.getElementById('watch-grid'); if(!grid) return;
    document.getElementById('watch-count').textContent=`${items.length} ASSETS`;
    if(!items.length){grid.innerHTML='<div class="empty-state">Keine gültigen Assets gefunden.</div>';return;}
    grid.innerHTML=items.map(x=>`<article class="watch-item ${x.missing?'watch-missing':''}"><div class="watch-top"><span class="ticker">${esc(x.ticker)}</span><button class="remove-watch" data-symbol="${esc(x.ticker)}">×</button></div><strong>${esc(x.name||x.ticker)}</strong><div class="watch-price">${x.price?eur(x.price):'—'} <span class="${n(x.dayChange)>=0?'positive':'negative'}">${pct(x.dayChange)}</span></div><div class="watch-scores"><div><small>Sentinel</small><b>${x.score ?? '—'}</b></div><div><small>Momentum</small><b>${x.momentum ?? '—'}</b></div><div><small>Risk</small><b>${x.risk ?? '—'}</b></div></div><div class="watch-meta"><span>${esc(scoreLabel(n(x.score)))}</span><span class="${x.availableInTrading212?'positive':'muted'}">${x.availableInTrading212?'✓ Trading 212':'— nicht verifiziert'}</span></div><div class="watch-returns"><span>7D ${pct(x.returns?.r7*100)}</span><span>30D ${pct(x.returns?.r30*100)}</span><span>1Y ${pct(x.returns?.r252*100)}</span></div></article>`).join('');
    grid.querySelectorAll('.remove-watch').forEach(b=>b.addEventListener('click',()=>removeWatch(b.dataset.symbol)));
  }

  function renderHistoryRange(range='365') {
    const h=state.history; if(!h.length) return;
    const count=range==='all'?h.length:Math.min(h.length,Number(range)||365); const slice=h.slice(-count); const wrap=document.querySelector('.chart-wrap'); if(!wrap) return;
    const vals=slice.map(x=>n(x.value)), min=Math.min(...vals), max=Math.max(...vals), span=max-min||1, w=900, height=210, pad=8;
    const pts=vals.map((v,i)=>`${pad+i/(vals.length-1||1)*(w-pad*2)},${height-pad-((v-min)/span)*(height-pad*2)}`).join(' ');
    wrap.innerHTML=`<svg viewBox="0 0 ${w} ${height}" preserveAspectRatio="none"><polyline points="${pts}" class="line" fill="none" vector-effect="non-scaling-stroke"/></svg><div class="chart-labels"><span>${esc(slice[0].date)}</span><span>${esc(slice[slice.length-1].date)}</span></div>`;
    const first=n(slice[0].value), last=n(slice[slice.length-1].value), change=first?(last/first-1)*100:0, peak=Math.max(...vals), dd=peak?(last/peak-1)*100:0;
    const stats=document.getElementById('history-stats'); if(stats) stats.innerHTML=`<div><small>PERIOD</small><b>${range==='all'?'ALL':range+' DAYS'}</b></div><div><small>CHANGE</small><b class="${change>=0?'positive':'negative'}">${pct(change)}</b></div><div><small>END VALUE</small><b>${eur(last)}</b></div><div><small>FROM PEAK</small><b class="${dd>=-5?'positive':'negative'}">${pct(dd)}</b></div>`;
  }

  function renderEngine(data) {
    state.analytics=data; state.history=data.history||[];
    const s=data.risk?.score ?? 0, m=data.momentum?.score ?? 0;
    const summary=document.getElementById('engine-summary');
    if(summary) summary.innerHTML=`<div class="engine-score"><span>Sentinel Score</span><strong>${Math.round((s+(100-Math.abs(50-m))/2)/2)}</strong><small>composite</small></div><div class="engine-score"><span>Risk</span><strong>${s}</strong><small>${esc(data.risk?.label)}</small></div><div class="engine-score"><span>Momentum</span><strong>${m}</strong><small>${esc(data.momentum?.label)}</small></div><div class="engine-score"><span>Concentration</span><strong>${data.risk?.concentration ?? '—'}</strong><small>risk factor</small></div>`;
    const assets=document.getElementById('asset-signals');
    if(assets) assets.innerHTML=(data.momentum?.assets||[]).map(a=>{const ms=a.momentum==null?null:Math.round(50+a.momentum*120); const risk=Math.round(Math.min(100,Math.max(0,(a.volatility||0)/.55*70+Math.abs(a.drawdown||0)/.35*30))); return `<div class="asset-signal"><div><b>${esc(a.ticker)}</b><span>${(a.weight*100).toFixed(1)}% weight</span></div><div><small>Momentum</small><strong>${ms??'—'}</strong></div><div><small>Risk</small><strong>${risk}</strong></div><div class="asset-bar"><i style="width:${Math.max(0,Math.min(100,ms??0))}%"></i></div></div>`}).join('') || '<div class="empty-state">Keine Asset-Marktserien verfügbar.</div>';
    const method=document.getElementById('engine-method'); if(method) method.textContent=data.methodology||'';
    renderHistoryRange(document.querySelector('.history-controls button.active')?.dataset.range||'365');
    runAlerts(data);
  }

  function renderAlerts() {
    const list=document.getElementById('alerts-list'); if(!list) return;
    if(!state.alerts.length){list.innerHTML='<div class="empty-state">Noch keine Alerts. Sentinel kann dich bei Risiko- oder Momentum-Schwellen warnen.</div>';updateBadge();return;}
    list.innerHTML=state.alerts.map((a,i)=>`<div class="alert-item"><div><b>${esc(a.type==='risk'?'Risk Alert':'Momentum Alert')}</b><span>${esc(a.symbol||'Portfolio')} · ${a.threshold}</span></div><button data-alert="${i}" class="remove-alert">×</button></div>`).join('');
    list.querySelectorAll('.remove-alert').forEach(b=>b.addEventListener('click',()=>{state.alerts.splice(Number(b.dataset.alert),1);saveAlerts();renderAlerts();})); updateBadge();
  }
  function updateBadge(){const b=document.getElementById('alert-badge'); if(b) b.textContent=state.alerts.length?state.alerts.length:'';}
  function addAlert(){
    const risk=prompt('Risk-Alert: Schwelle 0–100 eingeben (z. B. 60).'); if(risk!==null){const t=n(risk); if(t>0&&t<=100){state.alerts.push({type:'risk',threshold:t});saveAlerts();renderAlerts();return;}}
    const momentum=prompt('Momentum-Alert: Schwelle 0–100 eingeben (z. B. 70).'); if(momentum!==null){const t=n(momentum);if(t>0&&t<=100){state.alerts.push({type:'momentum',threshold:t});saveAlerts();renderAlerts();}}
  }
  function runAlerts(data){
    const triggered=[]; state.alerts.forEach(a=>{if(a.type==='risk'&&n(data.risk?.score)>=n(a.threshold))triggered.push(`Risk ${data.risk.score}/${a.threshold}`);if(a.type==='momentum'&&n(data.momentum?.score)>=n(a.threshold))triggered.push(`Momentum ${data.momentum.score}/${a.threshold}`);});
    if(triggered.length && window.showToast) window.showToast(`Sentinel Alert: ${triggered.join(' · ')}`); updateBadge();
  }

  const oldUpdateAnalytics=window.updateAnalytics;
  window.updateAnalytics=function(data){ if(oldUpdateAnalytics) oldUpdateAnalytics(data); renderEngine(data); };
  const oldShowView=window.showView;
  window.addEventListener('lumeceta:analytics',e=>renderEngine(e.detail));
  enhanceIndex();
  setTimeout(()=>{loadWatchlist(false); if(state.analytics) renderEngine(state.analytics); else fetch(`${API}/analytics`).then(r=>r.ok?r.json():null).then(d=>d&&renderEngine(d)).catch(()=>{}); renderAlerts();},50);
})();
