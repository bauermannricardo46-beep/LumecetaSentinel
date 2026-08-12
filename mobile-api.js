(() => {
  const KEY = 'lumeceta.apiBase';
  const isCapacitor = !!window.Capacitor || location.protocol === 'capacitor:';
  const isAndroid = /Android/i.test(navigator.userAgent || '');
  const defaultBase = isCapacitor && isAndroid ? 'http://10.0.2.2:8787/api' : '/api';
  const normalize = value => String(value || '').trim().replace(/\/$/, '');
  const stored = localStorage.getItem(KEY);
  let base = normalize(stored || defaultBase);

  window.LumecetaMobile = {
    getApiBase: () => base,
    setApiBase: value => {
      base = normalize(value) || defaultBase;
      localStorage.setItem(KEY, base);
    },
    isNativeHttp: () => isCapacitor && isAndroid
  };

  // Capacitor 8 includes CapacitorHttp in @capacitor/core. It is enabled in
  // capacitor.config.ts, so the patched fetch uses Android's native HTTP
  // stack instead of the WebView networking layer. This removes the
  // "Failed to fetch" / CORS failure seen in the APK.
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
    button.id = 'mobile-api-btn';
    button.className = 'icon-btn';
    button.title = 'Backend-Verbindung';
    button.setAttribute('aria-label', 'Backend-Verbindung');
    button.textContent = '⌁';
    actions.insertBefore(button, actions.firstChild);

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.id = 'mobile-api-modal';
    modal.innerHTML = `<div class="connection-modal card">
      <button class="modal-close" id="mobile-api-close">×</button>
      <div class="muted">APP CONNECTION</div>
      <h2>Sentinel Backend</h2>
      <p class="modal-copy">Die Android-App verbindet sich über den nativen Android-Netzwerkstack mit deinem Lumeceta-Backend auf dem PC. WebView/CORS wird dabei nicht verwendet.</p>
      <label>Backend URL<input id="mobile-api-input" value="${base === '/api' ? '' : base}" placeholder="http://192.168.178.50:8787/api" inputmode="url" autocomplete="off"></label>
      <div class="security-note">PC und Smartphone müssen im selben Netzwerk sein. Am PC muss der Lumeceta-Server auf Port 8787 erreichbar sein.</div>
      <div id="mobile-api-status" class="connect-error"></div>
      <div style="display:flex;gap:8px;margin-top:14px">
        <button class="primary-btn" id="mobile-api-test">Verbindung testen</button>
        <button class="icon-btn" id="mobile-api-reset" title="Zurücksetzen">↺</button>
      </div>
    </div>`;
    document.body.appendChild(modal);

    const input = document.getElementById('mobile-api-input');
    const status = document.getElementById('mobile-api-status');
    const open = () => {
      modal.classList.add('open');
      input.value = base === '/api' ? '' : base;
      status.classList.remove('show', 'error');
      status.textContent = '';
      setTimeout(() => input.focus(), 80);
    };
    const close = () => modal.classList.remove('open');

    button.addEventListener('click', open);
    document.getElementById('mobile-api-close').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });

    document.getElementById('mobile-api-reset').addEventListener('click', () => {
      localStorage.removeItem(KEY);
      base = defaultBase;
      input.value = base;
      status.className = 'connect-error show';
      status.textContent = 'Backend-Adresse zurückgesetzt.';
    });

    document.getElementById('mobile-api-test').addEventListener('click', async () => {
      const value = normalize(input.value);
      if (!value) {
        status.className = 'connect-error show';
        status.textContent = 'Bitte die Backend-URL eintragen.';
        return;
      }
      const testButton = document.getElementById('mobile-api-test');
      testButton.disabled = true;
      testButton.textContent = 'Teste…';
      status.className = 'connect-error show';
      status.textContent = 'Verbinde…';
      try {
        const response = await originalFetch(`${value}/status`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store'
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        base = value;
        localStorage.setItem(KEY, base);
        status.className = 'connect-error show success';
        status.textContent = data.connected ? 'Backend erreichbar · Trading 212 bereits verbunden ✓' : 'Backend erreichbar ✓';
      } catch (error) {
        status.className = 'connect-error show error';
        status.textContent = `Backend nicht erreichbar: ${error?.message || 'Netzwerkfehler'}`;
      } finally {
        testButton.disabled = false;
        testButton.textContent = 'Verbindung testen';
      }
    });
  }

  window.addEventListener('DOMContentLoaded', inject);
  setTimeout(inject, 500);
})();
