(() => {
  const esc = v => String(v ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const pct = v => `${num(v) >= 0 ? '+' : ''}${num(v).toFixed(1)}%`;

  function getAssets() {
    return [...document.querySelectorAll('#watch-grid .watch-item')].map(card => {
      const ticker = card.querySelector('.ticker')?.textContent?.trim() || '';
      const name = card.querySelector('strong')?.textContent?.trim() || ticker;
      const scores = card.querySelectorAll('.watch-scores b');
      const score = num(scores[0]?.textContent), momentum = num(scores[1]?.textContent), risk = num(scores[2]?.textContent);
      const retText = card.querySelector('.watch-returns')?.textContent || '';
      const returns = [...retText.matchAll(/(7D|30D|1Y)\s*([+-]?[\d,.]+)%/g)].reduce((o,m) => (o[m[1]] = Number(m[2].replace(',','.')), o), {});
      const available = (card.querySelector('.watch-meta')?.textContent || '').includes('Trading 212');
      return { card, ticker, name, score, momentum, risk, returns, available };
    }).filter(a => a.ticker && a.available && a.score != null);
  }

  function verdict(a) {
    if (a.score >= 78 && a.risk <= 45 && a.momentum >= 65) return ['HIGH-CONVICTION','Starkes Signal bei kontrolliertem Risiko.'];
    if (a.score >= 68 && a.risk <= 60 && a.momentum >= 58) return ['GOOD ENTRY','Gutes Chance/Risiko-Profil, Einstieg technisch bestätigt.'];
    if (a.score >= 55 && a.momentum >= 50) return ['WATCH ENTRY','Trend intakt, aber noch kein ideales Einstiegsfenster.'];
    if (a.risk >= 70) return ['RISKY ENTRY','Risiko dominiert das aktuelle Signal.'];
    return ['WAIT','Aktuell fehlt ein überzeugender Entry-Trigger.'];
  }

  function reasons(a) {
    const r = [];
    if (a.momentum >= 70) r.push('starkes Momentum'); else if (a.momentum >= 55) r.push('positiver Trend'); else if (a.momentum < 40) r.push('schwaches Momentum');
    if (a.risk <= 35) r.push('niedriges Risiko'); else if (a.risk >= 70) r.push('hohe Volatilität'); else r.push('moderates Risiko');
    if (a.returns['30D'] > 5) r.push('30T-Trend bestätigt'); else if (a.returns['30D'] < -5) r.push('30T-Trend negativ');
    if (a.returns['1Y'] > 15) r.push('starke Jahresperformance');
    return r;
  }

  function render() {
    const grid = document.getElementById('watch-grid'); if (!grid) return;
    const assets = getAssets().sort((a,b) => b.score - a.score);
    let panel = document.getElementById('entry-analysis');
    if (!panel) { panel = document.createElement('section'); panel.id='entry-analysis'; panel.className='entry-panel card'; grid.parentNode.insertBefore(panel, grid); }
    if (!assets.length) { panel.innerHTML = '<div class="ranking-head"><div><div class="muted">ENTRY INTELLIGENCE</div><h2>Entry-Analyse</h2><p>Warte auf verifizierte Markt- und Trading-212-Daten.</p></div></div>'; return; }
    const best = assets[0], [label, text] = verdict(best), rs = reasons(best);
    panel.innerHTML = `<div class="section-head"><div><div class="muted">ENTRY INTELLIGENCE</div><h2>Warum jetzt – und warum nicht?</h2></div><span class="pill">${esc(label)}</span></div><div class="entry-hero"><div><small>BESTES AKTUELLES SETUP</small><strong>${esc(best.ticker)}</strong><span>${esc(best.name)}</span></div><div class="entry-verdict"><b>${esc(label)}</b><span>${esc(text)}</span></div></div><div class="entry-grid"><div><small>Sentinel</small><b>${best.score}/100</b></div><div><small>Momentum</small><b>${best.momentum}/100</b></div><div><small>Risk</small><b>${best.risk}/100</b></div><div><small>30 Tage</small><b>${pct(best.returns['30D'] ?? 0)}</b></div><div><small>1 Jahr</small><b>${pct(best.returns['1Y'] ?? 0)}</b></div></div><div class="entry-reasons">${rs.map(x=>`<span>◆ ${esc(x)}</span>`).join('')}</div><div class="entry-list"><div class="entry-list-head"><span>Asset</span><span>Entry Quality</span><span>Score</span><span>Risk</span></div>${assets.slice(0,8).map(a=>{const [v,t]=verdict(a);return `<button class="entry-row" data-ticker="${esc(a.ticker)}"><strong>${esc(a.ticker)}</strong><span>${esc(v)}</span><b>${a.score}</b><span>${a.risk}</span><small>${esc(t)}</small></button>`}).join('')}</div><div class="analytics-method"><b>ENTRY-LOGIK</b><span>Sentinel kombiniert Momentum, Risiko und Mehrperioden-Performance. Das ist eine technische Signalbewertung und keine Garantie für zukünftige Renditen.</span></div>`;
  }
  function init(){render(); const grid=document.getElementById('watch-grid'); if(grid)new MutationObserver(()=>render()).observe(grid,{childList:true,subtree:true}); setInterval(render,5000);}
  setTimeout(init,800);
})();
