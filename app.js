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
const formatPct = value => `${Number(value) >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)}%`;

function setConnection(connected) {
  const label = document.getElementById('connection-label');
  const dot = document.querySelector('.status-dot');
  if (label) label.textContent = connected ? 'Trading 212 connected' : 'Not connected';
  if (dot) dot.classList.toggle('offline', !connected);
  const button = document.getElementById('connect-btn');
  if (button) button.textContent = connected ? 'Trading 212 ✓' : 'Connect Trading 212';
}

function updateDashboard(data) {
  if (!data?.summary) return;
  document.getElementById('portfolio-value').textContent = formatEUR(data.summary.portfolioValue);
  document.getElementById('portfolio-change').innerHTML = `${data.summary.pnl >= 0 ? '+' : ''}${formatEUR(data.summary.pnl)} <span>(live P/L)</span>`;
  const metrics = document.querySelectorAll('#view-overview .metric strong');
  if (metrics[0]) metrics[0].textContent = formatEUR(data.summary.invested);
  if (metrics[1]) metrics[1].textContent = formatEUR(data.summary.cash);
  if (metrics[2]) metrics[2].textContent = formatEUR(data.summary.pnl);
  renderPositions(data.positions || []);
}

function renderPositions(positions) {
  const rows = document.getElementById('live-positions');
  if (!rows) return;
  rows.innerHTML = '';
  const total = positions.reduce((sum, p) => sum + (Number(p.value) || 0), 0);
  positions.forEach(p => {
    const row = document.createElement('div');
    row.className = 'table-row';
    const weight = total ? (Number(p.value) / total * 100) : 0;
    row.innerHTML = `<span><b>${escapeHtml(p.ticker)}</b><small>${Number(p.quantity).toFixed(4)} units</small></span><span>${formatEUR(p.value)}</span><span class="${p.ppl >= 0 ? 'positive' : 'negative'}">${formatEUR(p.ppl)}</span><span>${weight.toFixed(1)}%</span>`;
    rows.appendChild(row);
  });
  if (!positions.length) rows.innerHTML = '<div class="empty-state">Keine offenen Positionen gefunden.</div>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
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
    if (showMessage) showToast(error.message, true);
  }
}

const modal = document.getElementById('connection-modal');
const openModal = () => modal?.classList.add('open');
const closeModal = () => modal?.classList.remove('open');

document.getElementById('connect-btn')?.addEventListener('click', openModal);
document.getElementById('modal-close')?.addEventListener('click', closeModal);
document.getElementById('cancel-connect')?.addEventListener('click', closeModal);
modal?.addEventListener('click', e => { if (e.target === modal) closeModal(); });

document.getElementById('connect-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const button = document.getElementById('submit-connect');
  button.disabled = true;
  button.textContent = 'Verbinde…';
  try {
    const data = await api('/connect', {
      method: 'POST',
      body: JSON.stringify({
        apiKey: document.getElementById('api-key').value.trim(),
        apiSecret: document.getElementById('api-secret').value.trim(),
        environment: document.getElementById('environment').value
      })
    });
    updateDashboard(data);
    setConnection(true);
    closeModal();
    showToast('Trading 212 erfolgreich verbunden ✓');
    document.getElementById('connect-form').reset();
  } catch (error) {
    const errorBox = document.getElementById('connect-error');
    errorBox.textContent = error.message;
    errorBox.classList.add('show');
  } finally {
    button.disabled = false;
    button.textContent = 'Verbinden & testen';
  }
});

document.getElementById('refresh').addEventListener('click', () => refreshDashboard(true));
window.addEventListener('hashchange', () => showView(location.hash.slice(1) || 'overview'));
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
