(() => {
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const pct = v => `${Number(v) >= 0 ? '+' : ''}${(Number(v || 0) * 100).toFixed(1)}%`;
  const num = v => Number.isFinite(Number(v)) ? Number(v) : 0;

  async function load() {
    try {
      const response = await fetch('/api/analytics', { headers: { Accept: 'application/json' } });
      if (!response.ok) return;
      const data = await response.json();
      render(data);
    } catch (_) {}
  }

  function render(data) {
    const risk = data.risk || {}, momentum = data.momentum || {}, sentinel = data.sentinel || {}, performance = data.performance || {};
    const riskScore = num(risk.score), momentumScore = num(momentum.score), sentinelScore = num(sentinel.score);

    const riskScoreEl = document.getElementById('risk-score');
    const riskLabelEl = document.getElementById('risk-label');
    if (riskScoreEl) riskScoreEl.textContent = riskScore;
    if (riskLabelEl) riskLabelEl.textContent = `${risk.label || '—'} · REAL DATA`;

    const overviewSignal = document.querySelector('#view-overview .signal-row');
    if (overviewSignal) {
      overviewSignal.innerHTML = `<div class="signal-icon ${sentinelScore >= 60 ? 'positive-bg' : sentinelScore < 40 ? 'negative-bg' : 'neutral-bg'}">◈</div><div><strong>Sentinel ${sentinelScore}/100 · ${esc(sentinel.signal || 'NEUTRAL')}</strong><p>Risk ${riskScore}/100 · Momentum ${momentumScore}/100 · Confidence ${num(sentinel.confidence)}% · echte Daten.</p></div><span class="signal-score">LIVE</span>`;
    }

    const signals = document.getElementById('view-signals');
    if (signals) {
      let detail = document.getElementById('engine-live-detail');
      if (!detail) {
        const card = signals.querySelector('.card');
        if (card) {
          detail = document.createElement('div');
          detail.id = 'engine-live-detail';
          card.insertBefore(detail, card.querySelector('#asset-signals') || card.lastElementChild);
        }
      }
      if (detail) {
        detail.className = 'engine-live-detail';
        detail.innerHTML = `<div class="engine-live-grid">
          <div class="engine-live-stat"><small>SENTINEL SCORE</small><strong>${sentinelScore}</strong><span>${esc(sentinel.signal || 'NEUTRAL')}</span></div>
          <div class="engine-live-stat"><small>MOMENTUM</small><strong>${momentumScore}</strong><span>${esc(momentum.label || 'NEUTRAL')}</span></div>
          <div class="engine-live-stat"><small>RISK</small><strong>${riskScore}</strong><span>${esc(risk.label || 'LOW')}</span></div>
          <div class="engine-live-stat"><small>CONFIDENCE</small><strong>${num(sentinel.confidence)}%</strong><span>${num(momentum.coverage * 100).toFixed(0)}% asset coverage</span></div>
        </div>
        <div class="engine-live-factors">
          <div><span>Concentration</span><b>${num(risk.concentration)}/100</b></div>
          <div><span>Volatility</span><b>${num(risk.volatility)}/100</b></div>
          <div><span>Drawdown</span><b>${num(risk.drawdown)}/100</b></div>
          <div><span>Downside deviation</span><b>${num(risk.downside)}/100</b></div>
          <div><span>Asset risk</span><b>${num(risk.assetRisk)}/100</b></div>
          <div><span>Momentum drag</span><b>${num(risk.momentumDrag)}/100</b></div>
        </div>`;
      }

      const assets = document.getElementById('asset-signals');
      if (assets && Array.isArray(momentum.assets)) {
        assets.innerHTML = momentum.assets.map(asset => `<div class="asset-signal">
          <div><b>${esc(asset.ticker)}</b><span>${(num(asset.weight) * 100).toFixed(1)}% weight</span></div>
          <div><small>Momentum</small><strong>${asset.momentumScore == null ? '—' : num(asset.momentumScore)}</strong></div>
          <div><small>Risk</small><strong>${asset.risk == null ? '—' : num(asset.risk)}</strong></div>
          <div><small>RSI</small><strong>${asset.rsi14 == null ? '—' : num(asset.rsi14)}</strong></div>
          <div><small>Trend</small><strong>${asset.trend?.score == null ? '—' : num(asset.trend.score)}</strong></div>
          <div class="asset-bar"><i style="width:${Math.max(0, Math.min(100, num(asset.momentumScore)))}%"></i></div>
          <span class="asset-signal-label">${esc(asset.signal || 'NO DATA')}</span>
        </div>`).join('') || '<div class="empty-state">Keine Asset-Marktserien verfügbar.</div>';
      }

      const method = document.getElementById('engine-method');
      if (method) method.textContent = data.methodology || '';
    }

    const factors = document.getElementById('portfolio-factors');
    if (factors) {
      factors.innerHTML = `<div class="factor"><small>Concentration</small><b>${num(risk.concentration)}/100</b></div><div class="factor"><small>Volatility</small><b>${num(risk.volatility)}/100</b></div><div class="factor"><small>Drawdown</small><b>${num(risk.drawdown)}/100</b></div><div class="factor"><small>Downside</small><b>${num(risk.downside)}/100</b></div><div class="factor"><small>Momentum</small><b>${momentumScore}/100</b></div><div class="factor"><small>30D performance</small><b>${pct(performance.return30d)}</b></div>`;
    }
  }

  setTimeout(load, 800);
  setInterval(load, 60000);
})();
