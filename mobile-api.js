(() => {
  const KEY = 'lumeceta.apiBase';
  const isCapacitor = location.protocol === 'capacitor:';
  const defaultBase = isCapacitor ? 'http://10.0.2.2:8787/api' : '/api';
  const normalize = value => String(value || '').trim().replace(/\/$/, '');
  const stored = localStorage.getItem(KEY);
  let base = normalize(stored || defaultBase);
  window.LumecetaMobile = { getApiBase: () => base, setApiBase: value => { base = normalize(value) || defaultBase; localStorage.setItem(KEY, base); } };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    let url = typeof input === 'string' ? input : input?.url;
    if (url && url.startsWith('/api')) {
      const target = base === '/api' ? url : `${base}${url.slice(4)}`;
      if (typeof input === 'string') return originalFetch(target, init);
      return originalFetch(new Request(target, input), init);
    }
    return originalFetch(input, init);
  };

  function inject() {
    if (document.getElementById('mobile-api-btn')) return;
    const actions = document.querySelector('.top-actions');
    if (!actions) return setTimeout(inject, 300);
    const button = document.createElement('button');
    button.id = 'mobile-api-btn'; button.className = 'icon-btn'; button.title = 'Backend'; button.textContent = '⌁';
    actions.insertBefore(button, actions.firstChild);
    const modal = document.createElement('div'); modal.className = 'modal-backdrop'; modal.id = 'mobile-api-modal';
    modal.innerHTML = `<div class="connection-modal card"><button class="modal-close" id="mobile-api-close">×</button><div class="muted">APP CONNECTION</div><h2>Sentinel Backend</h2><p class="modal-copy">Die Android-App enthält die Oberfläche. Der Trading-212-Bridge-Server läuft auf deinem PC. Beide Geräte müssen im selben Netzwerk sein.</p><label>Backend URL<input id="mobile-api-input" value="${base === '/api' ? '' : base}" placeholder="http://192.168.178.50:8787/api"></label><div class="security-note">Beispiel für dein Heimnetz: http://DEINE-PC-IP:8787/api</div><div style="display:flex;gap:8px;margin-top:14px"><button class="primary-btn" id="mobile-api-save">Speichern & neu laden</button><button class="icon-btn" id="mobile-api-reset">Reset</button></div></div>`;
    document.body.appendChild(modal);
    button.onclick = () => { modal.classList.add('open'); document.getElementById('mobile-api-input').value = base === '/api' ? '' : base; };
    document.getElementById('mobile-api-close').onclick = () => modal.classList.remove('open');
    document.getElementById('mobile-api-reset').onclick = () => { localStorage.removeItem(KEY); location.reload(); };
    document.getElementById('mobile-api-save').onclick = () => { LumecetaMobile.setApiBase(document.getElementById('mobile-api-input').value); location.reload(); };
  }
  window.addEventListener('DOMContentLoaded', inject); setTimeout(inject, 500);
})();
