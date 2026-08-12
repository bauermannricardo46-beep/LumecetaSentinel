const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { createAnalyticsService } = require('./analytics');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(__dirname, '..');
const state = { apiKey:'', apiSecret:'', environment:'live', connectedAt:null, lastDashboard:null, instrumentCache:null, instrumentCacheAt:0, watchCache:new Map() };

function sendJson(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'GET,POST,OPTIONS'});res.end(JSON.stringify(body));}
function readBody(req){return new Promise((resolve,reject)=>{let data='';req.on('data',chunk=>{data+=chunk;if(data.length>32000)req.destroy();});req.on('end',()=>{try{resolve(data?JSON.parse(data):{});}catch{reject(new Error('Invalid JSON'));}});req.on('error',reject);});}
function tradingBase(){return state.environment==='demo'?'https://demo.trading212.com/api/v0':'https://live.trading212.com/api/v0';}
async function t212(pathname){
  if(!state.apiKey||!state.apiSecret){const e=new Error('Trading 212 is not connected.');e.status=401;throw e;}
  const credentials=Buffer.from(`${state.apiKey}:${state.apiSecret}`,'utf8').toString('base64');
  const response=await fetch(`${tradingBase()}${pathname}`,{method:'GET',headers:{Authorization:`Basic ${credentials}`,Accept:'application/json'}});
  const text=await response.text();let data;try{data=text?JSON.parse(text):null;}catch{data={raw:text};}
  if(!response.ok){const e=new Error(data?.message||data?.error||`Trading 212 returned HTTP ${response.status}`);e.status=response.status;e.details=data;throw e;}
  return data;
}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function normalizePosition(p){const wallet=p.walletImpact||{},instrument=p.instrument||{};const quantity=number(p.quantity),currentPrice=number(p.currentPrice),averagePrice=number(p.averagePricePaid);const currentValue=number(wallet.currentValue)||quantity*currentPrice;const totalCost=number(wallet.totalCost)||averagePrice*quantity;const pnl=number(wallet.unrealizedProfitLoss)||(currentValue-totalCost);return{ticker:instrument.ticker||'UNKNOWN',name:instrument.name||instrument.ticker||'Unknown instrument',isin:instrument.isin||null,currency:instrument.currency||wallet.currency||null,quantity,quantityAvailableForTrading:number(p.quantityAvailableForTrading),quantityInPies:number(p.quantityInPies),averagePrice,currentPrice,value:currentValue,cost:totalCost,pnl,pnlPercentage:totalCost?(pnl/totalCost)*100:0,fxResult:number(wallet.fxImpact),createdAt:p.createdAt||null,updatedAt:new Date().toISOString()};}
async function getDashboard(){
  const [summary,positions]=await Promise.all([t212('/equity/account/summary'),t212('/equity/positions')]);
  const items=Array.isArray(positions)?positions:(positions?.items||[]),normalized=items.map(normalizePosition),investments=summary?.investments||{},cashObject=summary?.cash||{};
  const portfolioValue=number(summary?.totalValue),invested=number(investments.currentValue),cash=number(cashObject.availableToTrade),unrealizedPnl=number(investments.unrealizedProfitLoss),realizedPnl=number(investments.realizedProfitLoss);
  return{connected:true,environment:state.environment,account:{id:summary?.id??null,currency:summary?.currency??null},cash:cashObject,investments,positions:normalized,summary:{portfolioValue,invested,cash,realizedPnl,unrealizedPnl,totalPnl:realizedPnl+unrealizedPnl},fetchedAt:new Date().toISOString(),stale:false};
}
async function yahooChart(symbol){
  const url=`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d&events=div%7Csplits&includeAdjustedClose=true`;
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'LumecetaSentinel/1.0'}});
  if(!response.ok) throw new Error(`Market data HTTP ${response.status}`);
  const json=await response.json(), result=json?.chart?.result?.[0]; if(!result) throw new Error('No market data');
  const ts=result.timestamp||[], quote=result.indicators?.quote?.[0]||{}, closes=quote.close||[], volumes=quote.volume||[],rows=[];
  for(let i=0;i<ts.length;i++){const close=number(closes[i]);if(close>0)rows.push({date:new Date(ts[i]*1000).toISOString().slice(0,10),close,volume:number(volumes[i])});}
  return rows;
}
function yahooSymbol(ticker){const raw=String(ticker||'').replace(/_EQ$/,'');if(/^BTC(?:_USD)?$/.test(raw))return 'BTC-USD';if(/^ETH(?:_USD)?$/.test(raw))return 'ETH-USD';const m=raw.match(/^(.*)_([A-Z]{2})$/);if(!m)return raw;const suffix={US:'',DE:'.DE',UK:'.L',FR:'.PA',NL:'.AS',IT:'.MI',ES:'.MC',CH:'.SW',JP:'.T',HK:'.HK',AU:'.AX',CA:'.TO',SE:'.ST',DK:'.CO',NO:'.OL',FI:'.HE',BE:'.BR',AT:'.VI',IE:'.IR'}[m[2]];return suffix===undefined?m[1]:`${m[1]}${suffix}`;}
function pctReturn(rows,days){if(rows.length<2)return 0;const a=rows[Math.max(0,rows.length-1-days)].close,b=rows.at(-1).close;return a>0?b/a-1:0;}
function mean(values){return values.length?values.reduce((a,b)=>a+b,0)/values.length:0;}
function stddev(values){if(values.length<2)return 0;const m=mean(values);return Math.sqrt(values.reduce((s,v)=>s+(v-m)**2,0)/(values.length-1));}
function sma(rows,days){const slice=rows.slice(-days);return mean(slice.map(r=>r.close));}
function rsi(rows,period=14){if(rows.length<=period)return 50;const changes=[];for(let i=1;i<rows.length;i++)changes.push(rows[i].close-rows[i-1].close);const recent=changes.slice(-period);let gains=0,losses=0;for(const c of recent){if(c>=0)gains+=c;else losses-=c;}if(losses===0)return gains>0?100:50;const rs=(gains/period)/(losses/period);return 100-100/(1+rs);}
function maxDrawdown(rows){let peak=0,dd=0;for(const r of rows){peak=Math.max(peak,r.close);if(peak>0)dd=Math.min(dd,r.close/peak-1);}return dd;}
function clamp(v,min,max){return Math.min(max,Math.max(min,v));}

function scoreMarket(rows){
  const returns=rows.slice(1).map((r,i)=>rows[i].close>0?r.close/rows[i].close-1:0).filter(Number.isFinite);
  const latest=rows.at(-1).close;
  const r5=pctReturn(rows,5),r20=pctReturn(rows,20),r60=pctReturn(rows,60),r120=pctReturn(rows,120),r252=pctReturn(rows,252);
  const sma20=sma(rows,20),sma50=sma(rows,50),sma200=sma(rows,200),rsi14=rsi(rows,14);
  const volatility=stddev(returns)*Math.sqrt(252),drawdown=maxDrawdown(rows);
  const recentVolume=mean(rows.slice(-20).map(r=>r.volume).filter(v=>v>0)),priorVolume=mean(rows.slice(-40,-20).map(r=>r.volume).filter(v=>v>0));
  const volumeRatio=priorVolume>0?recentVolume/priorVolume:1;
  const trendScore=clamp(50+(sma20?latest/sma20-1:0)*500+(sma50?latest/sma50-1:0)*300+(sma200?latest/sma200-1:0)*200,0,100);
  const acceleration=r20-r60/3;
  const rawMomentum=.45*r20+.30*r60+.15*r120+.10*acceleration;
  const momentumScore=Math.round(clamp(50+rawMomentum*150+(trendScore-50)*.35+(rsi14-50)*.15+clamp(volumeRatio-1,-1,1)*8,0,100));
  const risk=Math.round(clamp(volatility/.60*60+Math.abs(drawdown)/.40*40,0,100));
  const score=Math.round((momentumScore+(100-risk))/2);
  const signal=score>=75?'STRONG BUY':score>=60?'POSITIVE':score>=45?'NEUTRAL':score>=30?'CAUTION':'AVOID';
  const reasons=[];
  if(momentumScore>=65) reasons.push('starkes Momentum'); else if(momentumScore<=35) reasons.push('schwaches Momentum');
  if(trendScore>=65) reasons.push('Aufwärtstrend'); else if(trendScore<=35) reasons.push('Abwärtstrend');
  if(rsi14>=70) reasons.push('RSI überkauft'); else if(rsi14<=30) reasons.push('RSI überverkauft');
  if(volumeRatio>=1.25) reasons.push('Volumen bestätigt');
  if(risk>=70) reasons.push('hohes Risiko'); else if(risk<=30) reasons.push('niedriges Risiko');
  return{price:latest,dayChange:pctReturn(rows,1)*100,returns:{r5,r7:pctReturn(rows,7),r20,r30:pctReturn(rows,30),r60,r120,r252},momentum:momentumScore,risk,score,signal,trend:Math.round(trendScore),rsi14:Math.round(rsi14*10)/10,volumeRatio:Math.round(volumeRatio*100)/100,volatility,drawdown,acceleration,reasons};
}

async function getInstrumentAvailability(){
  if(!state.apiKey||!state.apiSecret)return new Map();
  if(state.instrumentCache&&Date.now()-state.instrumentCacheAt<30*60*1000)return state.instrumentCache;
  try{const data=await t212('/equity/metadata/instruments'),items=Array.isArray(data)?data:(data?.items||[]),map=new Map();for(const i of items){if(i?.ticker)map.set(String(i.ticker).toUpperCase(),i);}state.instrumentCache=map;state.instrumentCacheAt=Date.now();return map;}catch(_){return state.instrumentCache||new Map();}
}
async function getWatchlist(symbols,force=false){
  const clean=[...new Set(symbols.map(s=>String(s).trim().toUpperCase()).filter(Boolean))].slice(0,30);const key=`${state.environment}:${clean.join(',')}`;const cached=state.watchCache.get(key);if(!force&&cached&&Date.now()-cached.at<2*60*1000)return cached.data;
  const instruments=await getInstrumentAvailability();
  const items=await Promise.all(clean.map(async ticker=>{
    const instrument=instruments.get(ticker)||instruments.get(ticker.replace(/_EQ$/,''));
    try{const rows=await yahooChart(yahooSymbol(ticker));if(!rows.length)return{ticker,name:instrument?.name||ticker,missing:true,availableInTrading212:Boolean(instrument),score:null};const scored=scoreMarket(rows);return{ticker,name:instrument?.name||ticker,isin:instrument?.isin||null,...scored,availableInTrading212:Boolean(instrument),currency:instrument?.currency||null};}catch(_){return{ticker,name:instrument?.name||ticker,missing:true,availableInTrading212:Boolean(instrument),score:null};}
  }));
  items.sort((a,b)=>(b.score??-1)-(a.score??-1));items.forEach((item,index)=>{item.rank=item.score==null?null:index+1;item.rankEligible=Boolean(item.availableInTrading212&&item.score!=null);});
  const data={generatedAt:new Date().toISOString(),items};state.watchCache.set(key,{at:Date.now(),data});return data;
}
const analytics=createAnalyticsService({t212});

async function handle(req,res){
  if(req.method==='OPTIONS')return sendJson(res,204,{});
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/api/status'&&req.method==='GET')return sendJson(res,200,{connected:Boolean(state.apiKey&&state.apiSecret),environment:state.environment,connectedAt:state.connectedAt,hasLiveData:Boolean(state.lastDashboard)});
  if(url.pathname==='/api/connect'&&req.method==='POST'){
    try{const body=await readBody(req),apiKey=String(body.apiKey||'').trim(),apiSecret=String(body.apiSecret||'').trim(),environment=body.environment==='demo'?'demo':'live';if(!apiKey||!apiSecret)return sendJson(res,400,{error:'API Key und API Secret sind erforderlich.'});state.apiKey=apiKey;state.apiSecret=apiSecret;state.environment=environment;state.instrumentCache=null;state.watchCache.clear();try{const dashboard=await getDashboard();state.connectedAt=new Date().toISOString();state.lastDashboard=dashboard;return sendJson(res,200,{connected:true,environment,account:dashboard.account,summary:dashboard.summary,positions:dashboard.positions.length,fetchedAt:dashboard.fetchedAt,dashboard});}catch(error){state.apiKey='';state.apiSecret='';state.connectedAt=null;state.lastDashboard=null;return sendJson(res,error.status||502,{connected:false,error:error.message,trading212Status:error.status||null});}}catch(error){return sendJson(res,400,{error:error.message});}
  }
  if(url.pathname==='/api/dashboard'&&req.method==='GET'){
    try{const dashboard=await getDashboard();state.lastDashboard=dashboard;return sendJson(res,200,dashboard);}catch(error){if(error.status===429&&state.lastDashboard)return sendJson(res,200,{...state.lastDashboard,stale:true,warning:'Trading 212 rate limit reached; showing the last confirmed live snapshot.'});return sendJson(res,error.status||502,{connected:false,error:error.message,trading212Status:error.status||null});}
  }
  if(url.pathname==='/api/analytics'&&req.method==='GET'){
    try{const dashboard=state.lastDashboard||await getDashboard();state.lastDashboard=dashboard;const data=await analytics.get(dashboard.positions,url.searchParams.get('force')==='1');return sendJson(res,200,{connected:true,...data});}catch(error){return sendJson(res,error.status||502,{connected:false,error:error.message,trading212Status:error.status||null});}
  }
  if(url.pathname==='/api/watchlist'&&req.method==='GET'){
    try{const symbols=String(url.searchParams.get('symbols')||'').split(',');if(!symbols.filter(Boolean).length)return sendJson(res,400,{error:'Mindestens ein Ticker ist erforderlich.'});return sendJson(res,200,await getWatchlist(symbols,url.searchParams.get('force')==='1'));}catch(error){return sendJson(res,error.status||502,{error:error.message,trading212Status:error.status||null});}
  }
  if(url.pathname==='/api/rankings'&&req.method==='GET'){
    try{const symbols=String(url.searchParams.get('symbols')||'').split(',').filter(Boolean);if(!symbols.length)return sendJson(res,400,{error:'Mindestens ein Ticker ist erforderlich.'});const data=await getWatchlist(symbols,url.searchParams.get('force')==='1');const ranked=data.items.filter(x=>x.rankEligible).sort((a,b)=>(b.score??-1)-(a.score??-1)).map((x,i)=>({...x,rank:i+1}));return sendJson(res,200,{generatedAt:data.generatedAt,count:ranked.length,items:ranked});}catch(error){return sendJson(res,error.status||502,{error:error.message});}
  }
  if(url.pathname==='/api/disconnect'&&req.method==='POST'){state.apiKey='';state.apiSecret='';state.connectedAt=null;state.lastDashboard=null;state.instrumentCache=null;state.watchCache.clear();return sendJson(res,200,{connected:false});}
  return serveStatic(url.pathname,res);
}
function serveStatic(requestPath,res){const pathname=requestPath==='/'?'/index.html':requestPath;const file=path.resolve(ROOT,`.${pathname}`);if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile())return sendJson(res,404,{error:'Not found'});const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);}
const server=http.createServer((req,res)=>handle(req,res).catch(error=>sendJson(res,500,{error:error.message})));server.listen(PORT,'127.0.0.1',()=>console.log(`Lumeceta Sentinel running at http://127.0.0.1:${PORT}`));
