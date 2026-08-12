const views = ['overview','portfolio','watchlist','signals'];
const titles = {overview:'Overview', portfolio:'Portfolio', watchlist:'Watchlist', signals:'Signals'};
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
  setTimeout(() => toast.classList.remove('show'), 2200);
};

const formatEUR = value => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(value) || 0);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function setConnection(connected) {
  const label = document.getElementById('connection-label');
  const dot = document.querySelector('.status-dot');
  if (label) label.textContent = connected ? 'Trading 212 connected' : 'Not connected';
  if (dot) dot.classList.toggle('offline', !connected);
  const button = document.getElementById('connect-btn');
  if (button) button.textContent = connected ? 'Trading 212 ✓' : 'Connect Trading 212';
}

function ensureLivePortfolioTable() {
  const table = document.querySelector('#view-portfolio .table');
  if (!table || document.getElementById('live-positions')) return;
  table.innerHTML = '<div class="table-head"><span>Asset</span><span>Value</span><span>P/L</span><span>Weight</span></div><div id="live-positions"></div>';
}

function updateDashboard(data) {
  if (!data?.summary) return;
  document.getElementById('portfolio-value').textContent = formatEUR(data.summary.portfolioValue);
  const pnl = Number(data.summary.pnl || 0);
  document.getElementById('portfolio-change').innerHTML = `${pnl >= 0 ? '+' : ''}${formatEUR(pnl)} <span>(live P/L)</span>`;
  const metrics = document.querySelectorAll('#view-overview .metric strong');
  if (metrics[0]) metrics[0].textContent = formatEUR(data.summary.invested);
  if (metrics[1]) metrics[1].textContent = formatEUR(data.summary.cash);
  if (metrics[2]) metrics[2].textContent = `${pnl >= 0 ? '+' : ''}${formatEUR(pnl)}`;
  renderPositions(data.positions || []);
}

function renderPositions(positions) {
  ensureLivePortfolioTable();
  const rows = document.getElementById('live-positions');
  if (!rows) return;
  rows.innerHTML = '';
  const total = positions.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  positions.forEach(p => {
    const row = document.createElement('div');
    row.className = 'table-row';
    const weight = total ? (Number(p.value) / total * 100) : 0;
    const ppl = Number(p.pnl || 0);
    row.innerHTML = `<span><b>${escapeHtml(p.ticker)}</b><small>${Number(p.quantity || 0).toFixed(4)} units</small></span><span>${formatEUR(p.value)}</span><span class="${ppl >= 0 ? 'positive' : 'negative'}">${ppl >= 0 ? '+' : ''}${formatEUR(ppl)}</span><span>${weight.toFixed(1)}%</span>`;
    rows.appendChild(row);
  });
  if (!positions.length) rows.innerHTML = '<div class="empty-state">Keine offenen Positionen gefunden.</div>';
}

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function refreshDashboard(showMessage = false) {
  try {
    const data = await api('/dashboard');
    updateDashboard(data);
    setConnection(true);
    if (showMessage) showToast('Trading 212 Daten aktualisiert ✓');
  } catch (error) {
    setConnection(false);
    if (showMessage) showToast(error.message, true);
  }
}

function injectConnectionUI() {
  const topActions = document.querySelector('.top-actions');
  if (!topActions || document.getElementById('connect-btn')) return;
  const button = document.createElement('button');
  button.id = 'connect-btn';
  button.className = 'connect-btn';
  button.textContent = 'Connect Trading 212';
  topActions.insertBefore(button, topActions.firstChild);

  const modal = document.createElement('div');
  modal.id = 'connection-modal';
  modal.className = 'modal-backdrop';
  modal.innerHTML = `<div class="connection-modal card"><button id="modal-close" class="modal-close">×</button><div class="muted">LIVE INTEGRATION</div><h2>Trading 212 verbinden</h2><p class="modal-copy">Deine API-Zugangsdaten werden nur an den lokalen Lumeceta-Server übertragen. Sie werden nicht ins GitHub-Repository geschrieben.</p><form id="connect-form"><label>Environment<select id="environment"><option value="live">Live · echtes Konto</option><option value="demo">Demo · Paper Trading</option></select></label><label>API Key<input id="api-key" autocomplete="off" required placeholder="Trading 212 API Key"></label><label>API Secret<input id="api-secret" type="password" autocomplete="new-password" required placeholder="Trading 212 API Secret"></label><div id="connect-error" class="connect-error"></div><button id="submit-connect" class="primary-btn modal-submit" type="submit">Verbinden & testen</button></form><div class="security-note">🔐 Secret bleibt im laufenden lokalen Backend und wird niemals im Frontend gespeichert.</div></div>`;
  document.body.appendChild(modal);

  const open = () => modal.classList.add('open');
  const close = () => modal.classList.remove('open');
  button.addEventListener('click', open);
  modal.querySelector('#modal-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  modal.querySelector('#connect-form').addEventListener('submit', async e => {
    e.preventDefault();
    const submit = document.getElementById('submit-connect');
    const errorBox = document.getElementById('connect-error');
    errorBox.classList.remove('show');
    submit.disabled = true;
    submit.textContent = 'Verbinde…';
    try {
      const data = await api('/connect', { method: 'POST', body: JSON.stringify({ apiKey: document.getElementById('api-key').value.trim(), apiSecret: document.getElementById('api-secret').value.trim(), environment: document.getElementById('environment').value }) });
      updateDashboard(data);
      setConnection(true);
      close();
      showToast('Trading 212 erfolgreich verbunden ✓');
      document.getElementById('api-key').value = '';
      document.getElementById('api-secret').value = '';
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add('show');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Verbinden & testen';
    }
  });
}

document.getElementById('refresh').addEventListener('click', () => refreshDashboard(true));
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'overview'));

ensureLivePortfolioTable();
injectConnectionUI();
showView(location.hash.slice(1) || 'overview');

(async () => {
  try {
    const status = await api('/status');
    setConnection(status.connected);
    if (status.connected) await refreshDashboard(false);
  } catch (_) {
    setConnection(false);
  }
})();
