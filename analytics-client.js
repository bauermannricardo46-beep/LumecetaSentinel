const AnalyticsUI = (() => {
  const api = async (path) => {
    const r = await fetch(path, { headers: { Accept: 'application/json' } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `Analytics request failed (${r.status})`);
    return data;
  };
  const esc = (v) => String(v).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const pct = (v) => `${v >= 0 ? '+' : ''}${(Number(v) * 100).toFixed(1)}%`;

  function drawChart(history) {
    const wrap = document.querySelector('#view-overview .chart-wrap');
    if (!wrap || !history?.length) return;
    const points = history.filter(x => Number.isFinite(Number(x.value)) && Number(x.value) >= 0);
    if (points.length < 2) { wrap.innerHTML = '<div class="empty-state">Noch nicht genug historische Daten.</div>'; return; }
    const w=900,h=205,pad=8;
    const vals=points.map(x=>Number(x.value));
    const min=Math.min(...vals), max=Math.max(...vals), span=(max-min)||1;
    const xy=points.map((x,i)=>[pad+(i/(points.length-1))*(w-pad*2),h-pad-((x.value-min)/span)*(h-pad*2)]);
    const line=xy.map(([x,y])=>`${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    const area=`${pad},${h-pad} ${line} ${w-pad},${h-pad}`;
    const first=points[0], last=points[points.length-1];
    wrap.innerHTML=`<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Reconstructed portfolio history"><defs><linearGradient id="analyticsFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(155,108,255,.30)"/><stop offset="1" stop-color="rgba(155,108,255,0)"/></linearGradient></defs><polygon class="analytics-area" points="${area}"/><polyline class="analytics-line" points="${line}"/></svg><div class="chart-labels"><span>${esc(first.date)}</span><span>${esc(last.date)}</span></div><div class="chart-foot"><span>Start ${Number(first.value).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</span><span>Now ${Number(last.value).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</span></div>`;
  }

  function renderRisk(data) {
    const risk=data.risk||{};
    const score=document.getElementById('risk-score');
    const label=document.getElementById('risk-label');
    if(score) score.textContent=Number(risk.score ?? 0);
    if(label) label.textContent=`${risk.label||'—'} · REAL DATA`;
    const signal=document.querySelector('#view-signals .signal-detail');
    if(signal){
      const momentum=data.momentum||{};
      signal.innerHTML=`<span class="signal-score big">${Number(risk.score??0)}</span><div><h3>Risk ${esc(risk.label||'—')} · Momentum ${Number(momentum.score??0)}/100</h3><p>Concentration ${Number(risk.concentration??0)}/100 · Volatility ${Number(risk.volatility??0)}/100 · Drawdown ${Number(risk.drawdown??0)}/100 · Momentum ${esc(momentum.label||'—')}.</p></div>`;
    }
    const overviewSignal=document.querySelector('#view-overview .signal-row');
    if(overviewSignal){
      const momentum=data.momentum||{};
      overviewSignal.innerHTML=`<div class="signal-icon ${momentum.score>=65?'positive-bg':'neutral-bg'}">◈</div><div><strong>Risk ${Number(risk.score??0)}/100 · Momentum ${Number(momentum.score??0)}/100</strong><p>Risk: ${esc(risk.label||'—')} · Momentum: ${esc(momentum.label||'—')} · echte Markt- und Trading-212-Daten.</p></div><span class="signal-score">LIVE</span>`;
    }
  }

  function renderMeta(data){
    const hero=document.querySelector('#view-overview .chart-card .pill');
    if(hero) hero.textContent='1Y · REAL HISTORY';
    const details=document.querySelector('#view-signals .card');
    if(details && data.methodology){
      let box=details.querySelector('.analytics-method');
      if(!box){box=document.createElement('div');box.className='analytics-method';details.appendChild(box);}
      box.innerHTML=`<b>Engine methodology</b><span>${esc(data.methodology)}</span><small>Market source: ${esc(data.dataQuality?.marketSource||'—')} · Trading source: ${esc(data.dataQuality?.tradingSource||'—')}</small>`;
    }
  }

  async function refresh(force=false){
    try{
      const data=await api(`/api/analytics${force?'?force=1':''}`);
      drawChart(data.history);
      renderRisk(data);
      renderMeta(data);
      return data;
    }catch(error){
      const wrap=document.querySelector('#view-overview .chart-wrap');
      if(wrap && !wrap.querySelector('svg')) wrap.innerHTML=`<div class="empty-state">Historische Daten konnten noch nicht geladen werden: ${esc(error.message)}</div>`;
      return null;
    }
  }
  return { refresh };
})();

setTimeout(() => AnalyticsUI.refresh(false), 1200);
setInterval(() => AnalyticsUI.refresh(false), 60000);
document.getElementById('refresh')?.addEventListener('click', () => AnalyticsUI.refresh(true));
