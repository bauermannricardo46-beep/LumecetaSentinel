const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(__dirname, '..');
const state = { apiKey: '', apiSecret: '', environment: 'live', connectedAt: null };

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 32_000) req.destroy();
    });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function tradingBase() {
  return state.environment === 'demo' ? 'https://demo.trading212.com/api/v0' : 'https://live.trading212.com/api/v0';
}

async function t212(pathname, options = {}) {
  if (!state.apiKey || !state.apiSecret) throw new Error('Trading 212 is not connected.');
  const credentials = Buffer.from(`${state.apiKey}:${state.apiSecret}`, 'utf8').toString('base64');
  const response = await fetch(`${tradingBase()}${pathname}`, {
    method: options.method || 'GET',
    headers: { Authorization: `Basic ${credentials}`, Accept: 'application/json' },
    body: options.body
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    const error = new Error(data?.message || data?.error || `Trading 212 returned HTTP ${response.status}`);
    error.status = response.status;
    error.details = data;
    throw error;
  }
  return { data, headers: response.headers };
}

function firstNumber(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function normalizePosition(p) {
  const quantity = firstNumber(p.quantity, p.qty);
  const averagePrice = firstNumber(p.averagePrice, p.averagePricePaid, p.avgPrice);
  const currentPrice = firstNumber(p.currentPrice, p.price, p.marketPrice);
  const ppl = firstNumber(p.ppl, p.profitLoss, p.unrealizedProfitLoss);
  const value = firstNumber(p.currentValue, p.marketValue, p.value, quantity * currentPrice);
  return { ticker: p.ticker || p.symbol || p.instrument?.ticker || 'UNKNOWN', quantity, averagePrice, currentPrice, value, ppl, raw: p };
}

async function getDashboard() {
  const [cashResult, summaryResult, positionsResult, infoResult] = await Promise.all([
    t212('/equity/account/cash'),
    t212('/equity/account/summary'),
    t212('/equity/positions'),
    t212('/equity/account/info')
  ]);

  const cash = cashResult.data || {};
  const accountSummary = summaryResult.data || {};
  const rawPositions = Array.isArray(positionsResult.data) ? positionsResult.data : (positionsResult.data?.items || []);
  const positions = rawPositions.map(normalizePosition);
  const cashValue = firstNumber(cash.free, cash.freeCash, cash.availableToTrade, cash.total, cash.cash);
  const invested = positions.reduce((sum, p) => sum + p.value, 0);
  const summaryValue = firstNumber(accountSummary.totalValue, accountSummary.total, accountSummary.portfolioValue);
  const portfolioValue = summaryValue || (cashValue + invested);
  const ppl = firstNumber(accountSummary.unrealizedProfitLoss, accountSummary.ppl, positions.reduce((sum, p) => sum + p.ppl, 0));

  return {
    connected: true,
    environment: state.environment,
    account: infoResult.data || {},
    cash,
    accountSummary,
    positions,
    summary: { portfolioValue, invested, cash: cashValue, pnl: ppl },
    fetchedAt: new Date().toISOString()
  };
}

async function handle(req, res) {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api/status' && req.method === 'GET') {
    return sendJson(res, 200, { connected: Boolean(state.apiKey && state.apiSecret), environment: state.environment, connectedAt: state.connectedAt });
  }

  if (url.pathname === '/api/connect' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const apiKey = String(body.apiKey || '').trim();
      const apiSecret = String(body.apiSecret || '').trim();
      const environment = body.environment === 'demo' ? 'demo' : 'live';
      if (!apiKey || !apiSecret) return sendJson(res, 400, { error: 'API Key und API Secret sind erforderlich.' });
      state.apiKey = apiKey;
      state.apiSecret = apiSecret;
      state.environment = environment;
      try {
        const dashboard = await getDashboard();
        state.connectedAt = new Date().toISOString();
        return sendJson(res, 200, { connected: true, environment, account: dashboard.account, summary: dashboard.summary });
      } catch (error) {
        state.apiKey = '';
        state.apiSecret = '';
        state.connectedAt = null;
        return sendJson(res, error.status || 502, { connected: false, error: error.message, details: error.details || null });
      }
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/dashboard' && req.method === 'GET') {
    try { return sendJson(res, 200, await getDashboard()); }
    catch (error) { return sendJson(res, error.status || 502, { connected: false, error: error.message }); }
  }

  if (url.pathname === '/api/disconnect' && req.method === 'POST') {
    state.apiKey = '';
    state.apiSecret = '';
    state.connectedAt = null;
    return sendJson(res, 200, { connected: false });
  }

  return serveStatic(url.pathname, res);
}

function serveStatic(requestPath, res) {
  const pathname = requestPath === '/' ? '/index.html' : requestPath;
  const file = path.resolve(ROOT, `.${pathname}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return sendJson(res, 404, { error: 'Not found' });
  const ext = path.extname(file);
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8' };
  res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => handle(req, res).catch(error => sendJson(res, 500, { error: error.message })));
server.listen(PORT, '127.0.0.1', () => console.log(`Lumeceta Sentinel running at http://127.0.0.1:${PORT}`));
