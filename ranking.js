(() => {
  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;

  function parseCards() {
    return [...document.querySelectorAll('#watch-grid .watch-item')].map(card => {
      const ticker = card.querySelector('.ticker')?.textContent?.trim() || '';
      const name = card.querySelector('strong')?.textContent?.trim() || ticker;
      const scoreNodes = card.querySelectorAll('.watch-scores b');
      const score = num(scoreNodes[0]?.textContent);
      const momentum = num(scoreNodes[1]?.textContent);
      const risk = num(scoreNodes[2]?.textContent);
      const available = (card.querySelector('.watch-meta')?.textContent || '').includes('Trading 212');
      const signal = card.querySelector('.watch-meta span:first-child')?.textContent?.trim() || '—';
      const price = card.querySelector('.watch-price')?.textContent?.trim() || '—';
      return { card, ticker, name, score, momentum, risk, available, signal, price };
    }).filter(x => x.ticker);
  }

  function category(asset) {
    if (asset.score == null) return 'nodata';
    if (!asset.available) return 'unverified';
    if (asset.score >= 75 && asset.risk < 60) return 'top';
    if (asset.score >= 55) return 'watch';
    return 'avoid';
  }

  function render() {
    const grid = document.getElementById('watch-grid');
    if (!grid) return;
    const assets = parseCards();
    let panel = document.getElementById('asset-ranking');
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'asset-ranking';
      panel.className = 'ranking-panel';
      grid.parentNode.insertBefore(panel, grid);
    }

    const ranked = assets.filter(a => a.score != null && a.available).sort((a,b) => b.score - a.score);
    const top = ranked.filter(a => category(a) === 'top');
    const watch = ranked.filter(a => category(a) === 'watch');
    const avoid = ranked.filter(a => category(a) === 'avoid');
    const unavailable = assets.filter(a => !a.available || a.score == null);
    const winner = ranked[0];

    const row = (a, index) => `<div class="ranking-row"><span class="ranking-rank">#${index + 1}</span><div class="ranking-main"><strong>${esc(a.ticker)}</strong><span>${esc(a.name)}</span></div><div class="ranking-score"><b>${a.score ?? '—'}</b><small>Sentinel</small></div><div class="ranking-score"><b>${a.momentum ?? '—'}</b><small>Momentum</small></div><div class="ranking-score"><b>${a.risk ?? '—'}</b><small>Risk</small></div><span class="ranking-signal">${esc(a.signal)}</span></div>`;

    panel.innerHTML = `<div class="ranking-head"><div><div class="muted">SENTINEL RANKING</div><h2>Asset-Prioritäten</h2><p>Automatische Priorisierung der Watchlist anhand von Sentinel Score, Momentum, Risiko und verifizierter Trading-212-Verfügbarkeit.</p></div><span class="pill">${ranked.length} RANKED</span></div>
      <div class="ranking-highlight">${winner ? `<span class="ranking-highlight-icon">◆</span><div><small>HÖCHSTE PRIORITÄT</small><strong>${esc(winner.ticker)} · Sentinel ${winner.score}</strong><span>Momentum ${winner.momentum} · Risiko ${winner.risk} · ${esc(winner.signal)}</span></div>` : `<span class="ranking-highlight-icon">◌</span><div><small>KEINE TOP-OPPORTUNITY</small><strong>Aktuell kein verifiziertes Asset über der Top-Schwelle.</strong><span>Die Engine wartet auf eine Kombination aus starkem Momentum und kontrolliertem Risiko.</span></div>`}</div>
      <div class="ranking-columns">
        <div class="ranking-group ranking-top"><div class="ranking-group-title"><span>🟢</span><strong>TOP OPPORTUNITY</strong><small>${top.length}</small></div>${top.length ? top.map((a,i)=>row(a, ranked.indexOf(a))).join('') : '<div class="ranking-empty">Keine Assets erfüllen aktuell Sentinel ≥ 75 und Risiko &lt; 60.</div>'}</div>
        <div class="ranking-group ranking-watch"><div class="ranking-group-title"><span>🟡</span><strong>WATCH</strong><small>${watch.length}</small></div>${watch.length ? watch.map((a,i)=>row(a, ranked.indexOf(a))).join('') : '<div class="ranking-empty">Keine Assets im Watch-Bereich.</div>'}</div>
        <div class="ranking-group ranking-avoid"><div class="ranking-group-title"><span>🔴</span><strong>AVOID / HIGH RISK</strong><small>${avoid.length}</small></div>${avoid.length ? avoid.map((a,i)=>row(a, ranked.indexOf(a)).replace('ranking-row','ranking-row ranking-row-danger')).join('') : '<div class="ranking-empty">Keine Assets in der AVOID-Zone.</div>'}</div>
      </div>
      ${unavailable.length ? `<div class="ranking-footnote">${unavailable.length} Asset(s) werden nicht gerankt, weil Markt-/Trading-212-Daten fehlen oder die Verfügbarkeit nicht verifiziert ist.</div>` : ''}`;
  }

  function init() {
    render();
    const grid = document.getElementById('watch-grid');
    if (grid) new MutationObserver(() => render()).observe(grid, { childList: true, subtree: true });
    setInterval(render, 3000);
  }

  setTimeout(init, 500);
})();
