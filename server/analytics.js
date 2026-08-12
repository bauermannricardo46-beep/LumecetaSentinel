const CACHE_TTL_MS = 5 * 60 * 1000;
const HISTORY_DAYS = 365;
const MAX_HISTORY_PAGES = 12;

function n(v) { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function dateKey(date) { return new Date(date).toISOString().slice(0, 10); }

function yahooSymbol(ticker) {
  const raw = String(ticker || '').replace(/_EQ$/, '');
  if (/^BTC(?:_USD)?$/.test(raw)) return 'BTC-USD';
  if (/^ETH(?:_USD)?$/.test(raw)) return 'ETH-USD';
  const m = raw.match(/^(.*)_([A-Z]{2})$/);
  if (!m) return raw;
  const suffix = {US:'',DE:'.DE',UK:'.L',FR:'.PA',NL:'.AS',IT:'.MI',ES:'.MC',CH:'.SW',JP:'.T',HK:'.HK',AU:'.AX',CA:'.TO',SE:'.ST',DK:'.CO',NO:'.OL',FI:'.HE',BE:'.BR',AT:'.VI',IE:'.IR'}[m[2]];
  return suffix === undefined ? m[1] : `${m[1]}${suffix}`;
}

async function yahooChart(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&events=div%7Csplits&includeAdjustedClose=true`;
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'LumecetaSentinel/1.0' } });
  if (!response.ok) throw new Error(`Market data HTTP ${response.status} for ${symbol}`);
  const json = await response.json();
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || `No market data for ${symbol}`);
  const timestamps = result.timestamp || [], closes = result.indicators?.quote?.[0]?.close || [], rows = [];
  for (let i = 0; i < timestamps.length; i++) { const close = n(closes[i]); if (close > 0) rows.push({ date: dateKey(timestamps[i] * 1000), close }); }
  return { symbol, rows };
}

function apiPath(nextPagePath) {
  if (!nextPagePath) return null;
  const marker = '/api/v0';
  const index = nextPagePath.indexOf(marker);
  return index >= 0 ? nextPagePath.slice(index + marker.length) : nextPagePath;
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

function priceOnOrBefore(rows, date) { for (let i = rows.length - 1; i >= 0; i--) if (rows[i].date <= date) return rows[i].close; return 0; }
function stddev(values) { if (values.length < 2) return 0; const mean = values.reduce((a,b) => a+b, 0) / values.length; return Math.sqrt(values.reduce((s,v) => s + (v-mean) ** 2, 0) / (values.length-1)); }
function returnFor(rows, days) { if (rows.length < 2) return 0; const end = rows[rows.length-1].close, start = rows[Math.max(0, rows.length-1-days)].close; return start ? end/start - 1 : 0; }
function maxDrawdown(rows) { let peak = 0, dd = 0; for (const r of rows) { peak = Math.max(peak, r.value); if (peak > 0) dd = Math.min(dd, r.value/peak - 1); } return dd; }

function calculateAnalytics({ positions, priceSeries, portfolioHistory, transactions }) {
  const total = positions.reduce((s,p) => s + n(p.value), 0) || 1;
  const weights = Object.fromEntries(positions.map(p => [p.ticker, n(p.value)/total]));
  const assetSignals = positions.map(p => {
    const s = priceSeries[p.ticker];
    if (!s?.length) return { ticker:p.ticker, weight:weights[p.ticker]||0, momentum:null, volatility:null, drawdown:null };
    const returns = s.slice(1).map((r,i) => r.close/s[i].close-1).filter(Number.isFinite);
    const volatility = stddev(returns) * Math.sqrt(252), r20 = returnFor(s,20), r60 = returnFor(s,60), r120 = returnFor(s,120), momentum = .5*r20 + .3*r60 + .2*r120;
    let peak=0, drawdown=0; for (const r of s) { peak=Math.max(peak,r.close); if(peak) drawdown=Math.min(drawdown,r.close/peak-1); }
    return { ticker:p.ticker, weight:weights[p.ticker]||0, momentum, volatility, drawdown, returns:{r20,r60,r120} };
  });
  const weightedVol = assetSignals.reduce((s,a)=>s+(a.volatility||0)*a.weight,0), weightedMomentum = assetSignals.reduce((s,a)=>s+(a.momentum||0)*a.weight,0), maxWeight = Math.max(...Object.values(weights),0);
  const concentrationRisk = clamp((maxWeight-.2)/.6,0,1)*35, volatilityRisk = clamp(weightedVol/.55,0,1)*30, drawdownRisk = clamp(Math.abs(maxDrawdown(portfolioHistory))/.35,0,1)*20, momentumRisk = clamp(-weightedMomentum/.25,0,1)*15;
  const riskScore = Math.round(clamp(concentrationRisk+volatilityRisk+drawdownRisk+momentumRisk,0,100)), momentumScore = Math.round(clamp(50+weightedMomentum*120,0,100));
  const deposits = transactions.filter(t=>String(t.type).toUpperCase()==='DEPOSIT').reduce((s,t)=>s+Math.max(0,n(t.amount)),0), withdrawals = transactions.filter(t=>String(t.type).toUpperCase()==='WITHDRAW').reduce((s,t)=>s+Math.max(0,n(t.amount)),0);
  return { generatedAt:new Date().toISOString(), periodDays:HISTORY_DAYS, history:portfolioHistory, cashFlows:{deposits,withdrawals,net:deposits-withdrawals}, risk:{score:riskScore,label:riskScore>=70?'HIGH':riskScore>=45?'MODERATE':'LOW',concentration:Math.round(concentrationRisk/35*100),volatility:Math.round(volatilityRisk/30*100),drawdown:Math.round(drawdownRisk/20*100),momentumDrag:Math.round(momentumRisk/15*100)}, momentum:{score:momentumScore,label:momentumScore>=65?'POSITIVE':momentumScore<=35?'NEGATIVE':'NEUTRAL',weightedReturn20d:weightedMomentum,assets:assetSignals}, methodology:'Risk = concentration + annualized realized volatility + historical max drawdown + negative momentum penalty. Momentum = weighted 20/60/120-day price returns. Historical value is reconstructed from Trading 212 fills and daily market closes; no simulated prices are used.' };
}

async function buildAnalytics({t212,positions}) {
  const now=Date.now(), startMs=now-HISTORY_DAYS*86400000;
  const [orders,transactions]=await Promise.all([paginateHistory(t212,'/equity/history/orders',startMs),paginateHistory(t212,'/equity/history/transactions',startMs)]);
  const holdingHistory=buildHoldingsHistory(orders,startMs), tickers=new Set([...positions.map(p=>p.ticker),...holdingHistory.active]), priceSeries={};
  const results=await Promise.all([...tickers].map(async ticker=>{ try { return [ticker,(await yahooChart(yahooSymbol(ticker))).rows]; } catch(_) { return [ticker,null]; } }));
  for(const [ticker,series] of results) if(series?.length) priceSeries[ticker]=series;
  const dates=[], cursor=new Date(startMs); cursor.setUTCHours(0,0,0,0); const end=new Date(); end.setUTCHours(0,0,0,0);
  while(cursor<=end){ dates.push(dateKey(cursor)); cursor.setUTCDate(cursor.getUTCDate()+1); }
  const holdings=new Map(holdingHistory.initial), txs=transactions.filter(t=>t.dateTime||t.date).map(t=>({...t,date:t.dateTime||t.date})).sort((a,b)=>new Date(a.date)-new Date(b.date)), cash={value:0};
  for(const t of txs) if(new Date(t.date).getTime()<startMs) cash.value+=n(t.amount);
  const history=[];
  for(const date of dates){
    for(const e of holdingHistory.dailyEvents.get(date)||[]) holdings.set(e.ticker,(holdings.get(e.ticker)||0)+e.quantity);
    for(const t of txs) if(dateKey(t.date)===date) cash.value+=n(t.amount);
    let invested=0; for(const [ticker,qty] of holdings){ if(Math.abs(qty)<1e-9) continue; const rows=priceSeries[ticker]; if(rows) invested+=qty*priceOnOrBefore(rows,date); }
    history.push({date,value:Math.max(0,invested+cash.value),investedValue:Math.max(0,invested),cash:cash.value});
  }
  const analytics=calculateAnalytics({positions,priceSeries,portfolioHistory:history,transactions:txs});
  analytics.dataQuality={marketSource:'Yahoo Finance chart endpoint (daily closes)',tradingSource:'Trading 212 historical orders + transactions',symbols:Object.fromEntries([...tickers].map(t=>[t,yahooSymbol(t)])),reconstructedDays:history.filter(x=>x.investedValue>0).length,missingPriceTickers:[...tickers].filter(t=>!priceSeries[t])};
  return analytics;
}

function createAnalyticsService({t212}){ let cache=null,running=null; return { async get(positions,force=false){ if(!force&&cache&&Date.now()-cache.at<CACHE_TTL_MS) return cache.data; if(running) return running; running=buildAnalytics({t212,positions}).then(data=>{cache={at:Date.now(),data};return data;}).finally(()=>{running=null;}); return running; } }; }
module.exports={createAnalyticsService};
