const CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_DAYS = 365;
const MAX_HISTORY_PAGES = 12;

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function dateKey(date) { return new Date(date).toISOString().slice(0, 10); }
function mean(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0; }
function stddev(values) { if (values.length < 2) return 0; const m = mean(values); return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)); }
function annualizedVol(returns) { return stddev(returns) * Math.sqrt(252); }
function returnFor(rows, days) { if (rows.length < 2) return 0; const end = rows[rows.length - 1].close; const start = rows[Math.max(0, rows.length - 1 - days)].close; return start > 0 ? end / start - 1 : 0; }
function sma(rows, days) { const slice = rows.slice(-days); return slice.length ? mean(slice.map(r => r.close)) : 0; }
function maxDrawdownFrom(rows, field = 'close') { let peak = 0, dd = 0; for (const row of rows) { const value = n(row[field]); peak = Math.max(peak, value); if (peak > 0) dd = Math.min(dd, value / peak - 1); } return dd; }
function rsi(rows, period = 14) {
  if (rows.length <= period) return 50;
  const changes = [];
  for (let i = 1; i < rows.length; i++) changes.push(rows[i].close - rows[i - 1].close);
  const recent = changes.slice(-period);
  let gains = 0, losses = 0;
  for (const change of recent) { if (change >= 0) gains += change; else losses -= change; }
  if (losses === 0) return gains > 0 ? 100 : 50;
  const rs = (gains / period) / (losses / period);
  return 100 - (100 / (1 + rs));
}
function downsideDeviation(returns) {
  const negative = returns.filter(r => r < 0);
  return negative.length ? Math.sqrt(mean(negative.map(r => r * r))) * Math.sqrt(252) : 0;
}
function priceOnOrBefore(rows, date) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].date <= date) return rows[i].close; return 0; }
function apiPath(nextPagePath) {
  if (!nextPagePath) return null;
  const marker = '/api/v0';
  const index = nextPagePath.indexOf(marker);
  return index >= 0 ? nextPagePath.slice(index + marker.length) : nextPagePath;
}

function yahooSymbol(ticker) {
  const raw = String(ticker || '').replace(/_EQ$/, '');
  if (/^BTC(?:_USD)?$/.test(raw)) return 'BTC-USD';
  if (/^ETH(?:_USD)?$/.test(raw)) return 'ETH-USD';
  const m = raw.match(/^(.*)_([A-Z]{2})$/);
  if (!m) return raw;
  const suffix = { US:'', DE:'.DE', UK:'.L', FR:'.PA', NL:'.AS', IT:'.MI', ES:'.MC', CH:'.SW', JP:'.T', HK:'.HK', AU:'.AX', CA:'.TO', SE:'.ST', DK:'.CO', NO:'.OL', FI:'.HE', BE:'.BR', AT:'.VI', IE:'.IR' }[m[2]];
  return suffix === undefined ? m[1] : `${m[1]}${suffix}`;
}

async function yahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&events=div%7Csplits&includeAdjustedClose=true`;
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'LumecetaSentinel/1.0' } });
  if (!response.ok) throw new Error(`Market data HTTP ${response.status} for ${symbol}`);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || `No market data for ${symbol}`);
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const volumes = quote.volume || [];
  const rows = [];
  for (let i = 0; i < timestamps.length; i++) {
    const close = n(closes[i]);
    if (close > 0) rows.push({ date: dateKey(timestamps[i] * 1000), close, volume: n(volumes[i]) });
  }
  return { symbol, rows };
}

async function paginateHistory(t212, endpoint, stopDateMs) {
  const items = [];
  let path = `${endpoint}?limit=50`;
  for (let page = 0; page < MAX_HISTORY_PAGES && path; page++) {
    const data = await t212(path);
    const pageItems = Array.isArray(data) ? data : (data?.items || []);
    if (!pageItems.length) break;
    items.push(...pageItems);
    const dates = pageItems.map(item => new Date(item?.dateExecuted || item?.dateCreated || item?.dateModified || item?.dateTime || item?.fill?.filledAt || item?.order?.dateExecuted || 0).getTime()).filter(Number.isFinite);
    const oldest = dates.length ? Math.min(...dates) : 0;
    if (oldest && oldest < stopDateMs) break;
    path = apiPath(data?.nextPagePath);
  }
  return items;
}

function normalizeFill(item) {
  const fill = item?.fill || {}, order = item?.order || item || {};
  const ticker = order.ticker || order.instrument?.ticker || item.ticker;
  const qty = n(fill.quantity) || n(order.filledQuantity) || (n(order.filledValue) && n(order.fillPrice) ? Math.abs(n(order.filledValue) / n(order.fillPrice)) : 0);
  const price = n(fill.price) || n(order.fillPrice) || (n(order.filledValue) && n(order.filledQuantity) ? Math.abs(n(order.filledValue) / n(order.filledQuantity)) : 0);
  const side = String(order.side || '').toUpperCase();
  const filledAt = fill.filledAt || order.dateExecuted || order.dateModified || order.dateCreated || order.createdAt;
  return { ticker, quantity: side === 'SELL' ? -Math.abs(qty) : Math.abs(qty), price, date: filledAt };
}

function buildHoldingsHistory(orders, startMs) {
  const events = orders.map(normalizeFill).filter(e => e.ticker && e.date && Math.abs(e.quantity) > 0);
  events.sort((a, b) => new Date(a.date) - new Date(b.date));
  const initial = new Map(), dailyEvents = new Map(), active = new Set();
  for (const e of events) {
    const ms = new Date(e.date).getTime();
    if (ms < startMs) initial.set(e.ticker, (initial.get(e.ticker) || 0) + e.quantity);
    else { const key = dateKey(e.date); if (!dailyEvents.has(key)) dailyEvents.set(key, []); dailyEvents.get(key).push(e); }
  }
  for (const [ticker, q] of initial) if (Math.abs(q) > 1e-9) active.add(ticker);
  for (const e of events) active.add(e.ticker);
  return { initial, dailyEvents, active: [...active] };
}

function portfolioReturns(history) {
  const returns = [];
  for (let i = 1; i < history.length; i++) {
    const previous = n(history[i - 1].value), current = n(history[i].value);
    if (previous > 0 && current > 0) returns.push(current / previous - 1);
  }
  return returns;
}

function performanceFromHistory(history) {
  const valid = history.filter(x => n(x.value) > 0);
  if (valid.length < 2) return { return7d: 0, return30d: 0, return90d: 0, return1y: 0, maxDrawdown: 0, annualizedVolatility: 0, observations: valid.length };
  const valueReturn = days => {
    const end = n(valid.at(-1).value), start = n(valid[Math.max(0, valid.length - 1 - days)].value);
    return start > 0 ? end / start - 1 : 0;
  };
  const returns = portfolioReturns(valid);
  return {
    return7d: valueReturn(7), return30d: valueReturn(30), return90d: valueReturn(90), return1y: valueReturn(365),
    maxDrawdown: maxDrawdownFrom(valid, 'value'), annualizedVolatility: annualizedVol(returns), observations: valid.length
  };
}

function assetAnalytics(ticker, rows, weight) {
  if (!rows?.length) return { ticker, weight, dataPoints: 0, momentum: null, momentumScore: null, risk: null, signal: 'NO DATA' };
  const returns = rows.slice(1).map((r, i) => rows[i].close > 0 ? r.close / rows[i].close - 1 : 0).filter(Number.isFinite);
  const latest = rows.at(-1).close;
  const sma20 = sma(rows, 20), sma50 = sma(rows, 50), sma200 = sma(rows, 200);
  const r5 = returnFor(rows, 5), r20 = returnFor(rows, 20), r60 = returnFor(rows, 60), r120 = returnFor(rows, 120), r252 = returnFor(rows, 252);
  const rsi14 = rsi(rows, 14);
  const volatility = annualizedVol(returns);
  const drawdown = maxDrawdownFrom(rows);
  const volumeRecent = mean(rows.slice(-20).map(r => r.volume).filter(v => v > 0));
  const volumePrior = mean(rows.slice(-40, -20).map(r => r.volume).filter(v => v > 0));
  const volumeRatio = volumePrior > 0 ? volumeRecent / volumePrior : 1;
  const trendScore = clamp(50 + ((sma20 > 0 ? latest / sma20 - 1 : 0) * 500) + ((sma50 > 0 ? latest / sma50 - 1 : 0) * 300) + ((sma200 > 0 ? latest / sma200 - 1 : 0) * 200), 0, 100);
  const acceleration = r20 - r60 / 3;
  const rawMomentum = .45 * r20 + .30 * r60 + .15 * r120 + .10 * acceleration;
  const volumeBias = clamp(volumeRatio - 1, -1, 1);
  const momentumScore = Math.round(clamp(50 + rawMomentum * 150 + (trendScore - 50) * .35 + (rsi14 - 50) * .15 + volumeBias * 8, 0, 100));
  const assetRisk = Math.round(clamp(volatility / .60 * 60 + Math.abs(drawdown) / .40 * 40, 0, 100));
  const signalScore = Math.round((momentumScore + (100 - assetRisk)) / 2);
  const signal = signalScore >= 75 ? 'STRONG BUY' : signalScore >= 60 ? 'POSITIVE' : signalScore >= 45 ? 'NEUTRAL' : signalScore >= 30 ? 'CAUTION' : 'AVOID';
  return {
    ticker, weight, dataPoints: rows.length, price: latest,
    returns: { r5, r20, r60, r120, r252 },
    trend: { score: Math.round(trendScore), priceVsSma20: sma20 ? latest / sma20 - 1 : 0, priceVsSma50: sma50 ? latest / sma50 - 1 : 0, priceVsSma200: sma200 ? latest / sma200 - 1 : 0 },
    rsi14: Math.round(rsi14 * 10) / 10, volumeRatio: Math.round(volumeRatio * 100) / 100, acceleration,
    volatility, drawdown, risk: assetRisk, momentum: rawMomentum, momentumScore, signalScore, signal
  };
}

function calculateAnalytics({ positions, priceSeries, portfolioHistory, transactions }) {
  const total = positions.reduce((s, p) => s + Math.max(0, n(p.value)), 0) || 1;
  const weights = Object.fromEntries(positions.map(p => [p.ticker, Math.max(0, n(p.value)) / total]));
  const assets = positions.map(p => assetAnalytics(p.ticker, priceSeries[p.ticker], weights[p.ticker] || 0));
  const validAssets = assets.filter(a => a.momentumScore != null);
  const weightedMomentum = validAssets.reduce((s, a) => s + n(a.momentum) * a.weight, 0);
  const weightedMomentumScore = Math.round(validAssets.length ? validAssets.reduce((s, a) => s + a.momentumScore * a.weight, 0) / validAssets.reduce((s, a) => s + a.weight, 0) : 50);
  const weightedAssetRisk = validAssets.reduce((s, a) => s + a.risk * a.weight, 0);
  const historyReturns = portfolioReturns(portfolioHistory);
  const portfolioVol = annualizedVol(historyReturns);
  const portfolioDownside = downsideDeviation(historyReturns);
  const portfolioDrawdown = Math.abs(maxDrawdownFrom(portfolioHistory, 'value'));
  const maxWeight = Math.max(...Object.values(weights), 0);
  const concentration = clamp((maxWeight - .20) / .60, 0, 1) * 100;
  const volatility = clamp(portfolioVol / .60, 0, 1) * 100;
  const downside = clamp(portfolioDownside / .45, 0, 1) * 100;
  const drawdown = clamp(portfolioDrawdown / .40, 0, 1) * 100;
  const riskScore = Math.round(clamp(concentration * .25 + volatility * .35 + drawdown * .25 + downside * .15, 0, 100));
  const momentumDrag = clamp((50 - weightedMomentumScore) * 2, 0, 100);
  const sentinelScore = Math.round((weightedMomentumScore + (100 - riskScore)) / 2);
  const signal = sentinelScore >= 75 ? 'STRONG BUY' : sentinelScore >= 60 ? 'POSITIVE' : sentinelScore >= 45 ? 'NEUTRAL' : sentinelScore >= 30 ? 'CAUTION' : 'AVOID';
  const deposits = transactions.filter(t => String(t.type).toUpperCase() === 'DEPOSIT').reduce((s, t) => s + Math.max(0, n(t.amount)), 0);
  const withdrawals = transactions.filter(t => String(t.type).toUpperCase() === 'WITHDRAW').reduce((s, t) => s + Math.max(0, n(t.amount)), 0);
  const performance = performanceFromHistory(portfolioHistory);
  const coverage = assets.length ? validAssets.length / assets.length : 0;
  return {
    generatedAt: new Date().toISOString(), periodDays: HISTORY_DAYS, history: portfolioHistory,
    performance,
    cashFlows: { deposits, withdrawals, net: deposits - withdrawals },
    risk: {
      score: riskScore, label: riskScore >= 70 ? 'HIGH' : riskScore >= 45 ? 'MODERATE' : 'LOW',
      concentration: Math.round(concentration), volatility: Math.round(volatility), drawdown: Math.round(drawdown), downside: Math.round(downside),
      assetRisk: Math.round(weightedAssetRisk), momentumDrag: Math.round(momentumDrag), portfolioVolatility: portfolioVol, portfolioDownsideDeviation: portfolioDownside
    },
    momentum: {
      score: weightedMomentumScore, label: weightedMomentumScore >= 65 ? 'POSITIVE' : weightedMomentumScore <= 35 ? 'NEGATIVE' : 'NEUTRAL',
      weightedReturn20d: weightedMomentum, acceleration: validAssets.reduce((s, a) => s + a.acceleration * a.weight, 0), coverage, assets
    },
    sentinel: { score: sentinelScore, signal, confidence: Math.round(coverage * 100) },
    methodology: 'Risk combines portfolio concentration, annualized realized volatility, historical maximum drawdown and downside deviation. Momentum combines 20/60/120-day returns, trend versus moving averages, RSI, volume confirmation and momentum acceleration. Sentinel is the balance of Momentum and inverse Risk. Historical performance is reconstructed from Trading 212 fills/transactions and daily market closes; no simulated prices are used.'
  };
}

async function buildAnalytics({ t212, positions }) {
  const now = Date.now(), startMs = now - HISTORY_DAYS * 86400000;
  const [orders, transactions] = await Promise.all([
    paginateHistory(t212, '/equity/history/orders', startMs),
    paginateHistory(t212, '/equity/history/transactions', startMs)
  ]);
  const holdingHistory = buildHoldingsHistory(orders, startMs);
  const tickers = new Set([...positions.map(p => p.ticker), ...holdingHistory.active]);
  const priceSeries = {};
  const results = await Promise.all([...tickers].map(async ticker => {
    try { return [ticker, (await yahooChart(yahooSymbol(ticker))).rows]; }
    catch (_) { return [ticker, null]; }
  }));
  for (const [ticker, series] of results) if (series?.length) priceSeries[ticker] = series;

  const dates = [];
  const cursor = new Date(startMs); cursor.setUTCHours(0, 0, 0, 0);
  const end = new Date(); end.setUTCHours(0, 0, 0, 0);
  while (cursor <= end) { dates.push(dateKey(cursor)); cursor.setUTCDate(cursor.getUTCDate() + 1); }

  const holdings = new Map(holdingHistory.initial);
  const txs = transactions.filter(t => t.dateTime || t.date).map(t => ({ ...t, date: t.dateTime || t.date })).sort((a, b) => new Date(a.date) - new Date(b.date));
  const cash = { value: 0 };
  for (const t of txs) if (new Date(t.date).getTime() < startMs) cash.value += n(t.amount);
  const history = [];
  for (const date of dates) {
    for (const e of holdingHistory.dailyEvents.get(date) || []) holdings.set(e.ticker, (holdings.get(e.ticker) || 0) + e.quantity);
    for (const t of txs) if (dateKey(t.date) === date) cash.value += n(t.amount);
    let invested = 0;
    for (const [ticker, qty] of holdings) {
      if (Math.abs(qty) < 1e-9) continue;
      const rows = priceSeries[ticker];
      if (rows) invested += qty * priceOnOrBefore(rows, date);
    }
    history.push({ date, value: Math.max(0, invested + cash.value), investedValue: Math.max(0, invested), cash: cash.value });
  }

  const analytics = calculateAnalytics({ positions, priceSeries, portfolioHistory: history, transactions: txs });
  analytics.dataQuality = {
    marketSource: 'Yahoo Finance chart endpoint (daily closes + volume)',
    tradingSource: 'Trading 212 historical orders + transactions',
    symbols: Object.fromEntries([...tickers].map(t => [t, yahooSymbol(t)])),
    reconstructedDays: history.filter(x => x.investedValue > 0).length,
    missingPriceTickers: [...tickers].filter(t => !priceSeries[t])
  };
  return analytics;
}

function createAnalyticsService({ t212 }) {
  let cache = null, running = null;
  return {
    async get(positions, force = false) {
      if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
      if (running) return running;
      running = buildAnalytics({ t212, positions })
        .then(data => { cache = { at: Date.now(), data }; return data; })
        .finally(() => { running = null; });
      return running;
    }
  };
}

module.exports = { createAnalyticsService };
