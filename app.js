const views = ['overview','portfolio','watchlist','signals'];
const titles = { overview: 'Overview', portfolio: 'Portfolio', watchlist: 'Watchlist', signals: 'Signals' };
const API = '/api';

const showView = (name) => {
  if (!views.includes(name)) return;
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active-view'));
  document.getElementById(`view-${name}`).classList.add('active-view');
  document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === name));
  document.getElementById('page-title').textContent = titles[name];
  history.replaceState(null, '', `#${name}`);
};

document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => showView(button.dataset.view)));
document.querySelectorAll('[data-view-target]').forEach(button => button.addEventListener('click', () => showView(button.dataset.viewTarget)));

const toast = document.getElementById('toast');
const showToast = (message, error = false) => {
  toast.textContent = message;
  toast.classList.toggle('error', error);
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
};

const formatEUR = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);
const formatNumber = (value, digits = 4) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: digits }).format(Number(value) || 0);
const signedEUR = value => `${Number(value) >= 0 ? '+' : ''}${formatEUR(value)}`;
const signedPercent = value => `${Number(value) >= 0 ? '+' : ''}${formatNumber(value, 2)}%`;

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }

function setConnection(connected, environment = 'live') {
  const label = document.getElementById('connection-label');
  const dot = document.querySelector('.status-dot');
  if (label) label.textContent = connected ? 'Trading 212 connected' : 'Not connected';
  if (dot) dot.classList.toggle('offline', !connected);
  const button = document.getElementById('connect-btn');
  if (button) button.textContent = connected ? 'Trading 212 ✓' : 'Connect Trading 212';
  const env = document.getElementById('account-environment');
  if (env) env.textContent = environment === 'demo' ? 'Trading 212 Demo' : 'Trading 212 Live';
}

function ensureLivePortfolioTable() {
  const table = document.querySelector('#view-portfolio .table');
  if (!table || document.getElementById('live-positions')) return;
  table.innerHTML = '<div class="table-head portfolio-head"><span>Asset</span><span>Value</span><span>P/L</span><span>Weight</span></div><div id="live-positions"></div>';
}

function clearDashboard(message = 'Keine Live-Daten verfügbar.') {
  const value = document.getElementById('portfolio-value');
  const change = document.getElementById('portfolio-change');
  if (value) value.textContent = '—';
  if (change) change.innerHTML = '— <span>(keine Live-Verbindung)</span>';
  document.querySelectorAll('#view-overview .metric strong').forEach(metric => { if (metric.id !== 'risk-score') metric.textContent = '—'; });
  const rows = document.getElementById('live-positions');
  if (rows) rows.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  const legend = document.getElementById('allocation-legend');
  if (legend) legend.innerHTML = '<div class="muted">Noch keine Live-Daten.</div>';
  const assetCount = document.getElementById('asset-count');
  if (assetCount) assetCount.innerHTML = '0<br><small>ASSETS</small>';
  const risk = document.getElementById('risk-score');
  if (risk) risk.textContent = '—';
}

function updateDashboard(data) {
  if (!data?.summary) return;
  const summary = data.summary;
  const unrealized = Number(summary.unrealizedPnl || 0);
  document.getElementById('portfolio-value').textContent = formatEUR(summary.portfolioValue);
  document.getElementById('portfolio-change').className = unrealized >= 0 ? 'positive' : 'negative';
  document.getElementById('portfolio-change').innerHTML = `${signedEUR(unrealized)} <span>(unrealized P/L)</span>`;
  const metrics = document.querySelectorAll('#view-overview .metric strong');
  if (metrics[0]) metrics[0].textContent = formatEUR(summary.invested);
  if (metrics[1]) metrics[1].textContent = formatEUR(summary.cash);
  if (metrics[2]) { metrics[2].textContent = signedEUR(unrealized); metrics[2].className = unrealized >= 0 ? 'positive' : 'negative'; }
  const subLabels = document.querySelectorAll('#view-overview .metric .muted:last-child');
  if (subLabels[2]) subLabels[2].textContent = 'unrealized P/L';
  renderPositions(data.positions || [], summary.portfolioValue);
  renderAllocation(data.positions || [], summary.cash, summary.portfolioValue);
  renderAccountMeta(data);
  if (data.stale) showToast('Trading 212 Snapshot zwischengespeichert · Rate Limit aktiv');
}

function renderPositions(positions, portfolioValue) {
  ensureLivePortfolioTable();
  const rows = document.getElementById('live-positions');
  if (!rows) return;
  rows.innerHTML = '';
  const total = Number(portfolioValue) || positions.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  positions.forEach(p => {
    const row = document.createElement('div'); row.className = 'table-row';
    const value = Number(p.value) || 0, weight = total ? value / total * 100 : 0, pnl = Number(p.pnl || 0);
    const name = p.name && p.name !== p.ticker ? p.name : '';
    row.innerHTML = `<span><b>${escapeHtml(p.ticker)}</b><small>${escapeHtml(name)}${name ? ' · ' : ''}${formatNumber(p.quantity)} units · avg ${formatEUR(p.averagePrice)}</small></span><span>${formatEUR(value)}<small>${formatEUR(p.currentPrice)} current</small></span><span class="${pnl >= 0 ? 'positive' : 'negative'}">${signedEUR(pnl)}<small>${signedPercent(p.pnlPercentage)}</small></span><span>${weight.toFixed(1)}%</span>`;
    rows.appendChild(row);
  });
  if (!positions.length) rows.innerHTML = '<div class="empty-state">Keine offenen Positionen bei Trading 212 gefunden.</div>';
}

function renderAllocation(positions, cash, totalValue) {
  const legend = document.getElementById('allocation-legend'), assetCount = document.getElementById('asset-count');
  if (!legend) return;
  const total = Number(totalValue) || 0;
  const entries = positions.map(p => ({ label: p.ticker, value: Number(p.value) || 0 }));
  if (cash > 0) entries.push({ label: 'Cash', value: Number(cash) });
  const visible = entries.filter(e => e.value > 0).sort((a, b) => b.value - a.value).slice(0, 5);
  legend.innerHTML = visible.length ? visible.map((e, i) => `<div><i class="dot d${(i % 4) + 1}"></i>${escapeHtml(e.label)} <b>${total ? (e.value / total * 100).toFixed(1) : '0.0'}%</b></div>`).join('') : '<div class="muted">Keine positiven Positionen.</div>';
  if (assetCount) assetCount.innerHTML = `${positions.length}<br><small>ASSETS</small>`;
}

function renderAccountMeta(data) {
  const env = document.getElementById('account-environment'), fetched = document.getElementById('last-updated');
  if (env) env.textContent = data.environment === 'demo' ? 'Trading 212 Demo' : 'Trading 212 Live';
  if (fetched && data.fetchedAt) fetched.textContent = `${data.stale ? 'Snapshot' : 'Updated'} ${new Date(data.fetchedAt).toLocaleTimeString('de-DE')}`;
}

function renderHistory(history) {
  const wrap = document.querySelector('.chart-wrap');
  if (!wrap || !history?.length) return;
  const values = history.map(x => Number(x.value) || 0), min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const width = 900, height = 210, pad = 8;
  const points = values.map((v,i) => `${pad + i/(values.length-1||1)*(width-pad*2)},${height-pad - ((v-min)/span)*(height-pad*2)}`).join(' ');
  wrap.innerHTML = `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-label="Historical portfolio performance"><polyline points="${points}" class="line" fill="none" vector-effect="non-scaling-stroke"/></svg><div class="chart-labels"><span>${escapeHtml(history[0].date)}</span><span>${escapeHtml(history[history.length-1].date)}</span></div>`;
}

function updateAnalytics(data) {
  if (!data) return;
  const risk = document.getElementById('risk-score'), label = document.getElementById('risk-label');
  if (risk) risk.textContent = String(data.risk?.score ?? '—');
  if (label) label.textContent = data.risk?.label || '—';
  renderHistory(data.history);
  const signal = document.querySelector('#view-signals .signal-detail');
  if (signal) signal.innerHTML = `<span class="signal-score big">${data.momentum?.score ?? '—'}</span><div><h3>Momentum · ${escapeHtml(data.momentum?.label || '—')}</h3><p>Gewichtetes 20/60/120-Tage-Momentum. Risk ${data.risk?.score ?? '—'}/100 · ${escapeHtml(data.risk?.label || '')}. ${escapeHtml(data.methodology || '')}</p></div>`;
  const overviewSignal = document.querySelector('#view-overview .signal-row');
  if (overviewSignal) overviewSignal.innerHTML = `<div class="signal-icon neutral-bg">◈</div><div><strong>Sentinel Engine</strong><p>Risk ${data.risk?.score ?? '—'}/100 · Momentum ${data.momentum?.score ?? '—'}/100 · ${escapeHtml(data.momentum?.label || '')}</p></div><span class="signal-score">${data.risk?.label || '—'}</span>`;
}

async function loadAnalytics(force = false) {
  try { const data = await api(`/analytics${force ? '?force=1' : ''}`); updateAnalytics(data); return data; }
  catch (error) { showToast(`Analytics: ${error.message}`, true); return null; }
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const suffix = data.trading212Status ? ` (Trading 212 HTTP ${data.trading212Status})` : '';
    throw new Error((data.error || `Request failed (${response.status})`) + suffix);
  }
  return data;
}

async function refreshDashboard(showMessage = false) {
  try {
    const data = await api('/dashboard');
    updateDashboard(data); setConnection(true, data.environment);
    if (showMessage) showToast('Echte Trading-212-Daten aktualisiert ✓');
    return data;
  } catch (error) {
    if (error.message.includes('429')) { showToast('Trading 212 Rate Limit · letzter Live-Snapshot bleibt erhalten', true); return null; }
    setConnection(false); clearDashboard(error.message);
    if (showMessage) showToast(error.message, true);
    return null;
  }
}

function injectConnectionUI() {
  const topActions = document.querySelector('.top-actions');
  if (!topActions || document.getElementById('connect-btn')) return;
  const button = document.createElement('button'); button.id = 'connect-btn'; button.className = 'connect-btn'; button.textContent = 'Connect Trading 212'; topActions.insertBefore(button, topActions.firstChild);
  const modal = document.createElement('div'); modal.id = 'connection-modal'; modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="connection-modal card"><button id="modal-close" class="modal-close">×</button><div class="muted">LIVE INTEGRATION</div><h2>Trading 212 verbinden</h2><p class="modal-copy">Die Zugangsdaten werden nur an den lokalen Lumeceta-Server übertragen. Sie werden nicht ins GitHub-Repository geschrieben.</p><form id="connect-form"><label>Environment<select id="environment"><option value="live">Live · echtes Konto</option><option value="demo">Demo · Paper Trading</option></select></label><label>API Key<input id="api-key" autocomplete="off" required placeholder="Trading 212 API Key"></label><label>API Secret<input id="api-secret" type="password" autocomplete="new-password" required placeholder="Trading 212 API Secret"></label><div id="connect-error" class="connect-error"></div><button id="submit-connect" class="primary-btn modal-submit" type="submit">Verbinden & testen</button></form><div class="security-note">🔐 Secret bleibt im laufenden lokalen Backend und wird niemals im Frontend gespeichert.</div></div>`;
  document.body.appendChild(modal);
  const open = () => modal.classList.add('open'), close = () => modal.classList.remove('open');
  button.addEventListener('click', open); modal.querySelector('#modal-close').addEventListener('click', close); modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#connect-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submit = document.getElementById('submit-connect'), errorBox = document.getElementById('connect-error');
    errorBox.classList.remove('show'); submit.disabled = true; submit.textContent = 'Verbinde…';
    try {
      const data = await api('/connect', { method:'POST', body:JSON.stringify({apiKey:document.getElementById('api-key').value.trim(),apiSecret:document.getElementById('api-secret').value.trim(),environment:document.getElementById('environment').value}) });
      updateDashboard(data.dashboard); setConnection(true, data.environment); close();
      showToast(`Trading 212 verbunden · ${data.positions} Positionen ✓`);
      document.getElementById('api-key').value = ''; document.getElementById('api-secret').value = '';
      setTimeout(() => loadAnalytics(false), 300);
    } catch (error) { errorBox.textContent = error.message; errorBox.classList.add('show'); }
    finally { submit.disabled = false; submit.textContent = 'Verbinden & testen'; }
  });
}

document.getElementById('refresh').addEventListener('click', async () => { await refreshDashboard(true); loadAnalytics(true); });
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'overview'));
ensureLivePortfolioTable(); injectConnectionUI(); showView(location.hash.slice(1) || 'overview');

(async () => {
  try {
    const status = await api('/status'); setConnection(status.connected, status.environment);
    if (status.connected) { await refreshDashboard(false); loadAnalytics(false); } else clearDashboard();
  } catch (_) { setConnection(false); clearDashboard(); }
})();

setInterval(() => refreshDashboard(false), 30_000);
