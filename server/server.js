const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { createAnalyticsService } = require('./analytics');

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(__dirname, '..');
const state = { apiKey:'', apiSecret:'', environment:'live', connectedAt:null, lastDashboard:null };

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

const analytics=createAnalyticsService({t212});

async function handle(req,res){
  if(req.method==='OPTIONS')return sendJson(res,204,{});
  const url=new URL(req.url,`http://${req.headers.host}`);
  if(url.pathname==='/api/status'&&req.method==='GET')return sendJson(res,200,{connected:Boolean(state.apiKey&&state.apiSecret),environment:state.environment,connectedAt:state.connectedAt,hasLiveData:Boolean(state.lastDashboard)});
  if(url.pathname==='/api/connect'&&req.method==='POST'){
    try{const body=await readBody(req),apiKey=String(body.apiKey||'').trim(),apiSecret=String(body.apiSecret||'').trim(),environment=body.environment==='demo'?'demo':'live';
      if(!apiKey||!apiSecret)return sendJson(res,400,{error:'API Key und API Secret sind erforderlich.'});
      state.apiKey=apiKey;state.apiSecret=apiSecret;state.environment=environment;
      try{
        const dashboard=await getDashboard();
        state.connectedAt=new Date().toISOString();state.lastDashboard=dashboard;
        return sendJson(res,200,{connected:true,environment,account:dashboard.account,summary:dashboard.summary,positions:dashboard.positions.length,fetchedAt:dashboard.fetchedAt,dashboard});
      }catch(error){state.apiKey='';state.apiSecret='';state.connectedAt=null;state.lastDashboard=null;return sendJson(res,error.status||502,{connected:false,error:error.message,trading212Status:error.status||null});}
    }catch(error){return sendJson(res,400,{error:error.message});}
  }
  if(url.pathname==='/api/dashboard'&&req.method==='GET'){
    try{
      const dashboard=await getDashboard();state.lastDashboard=dashboard;return sendJson(res,200,dashboard);
    }catch(error){
      if(error.status===429&&state.lastDashboard)return sendJson(res,200,{...state.lastDashboard,stale:true,warning:'Trading 212 rate limit reached; showing the last confirmed live snapshot.'});
      return sendJson(res,error.status||502,{connected:false,error:error.message,trading212Status:error.status||null});
    }
  }
  if(url.pathname==='/api/analytics'&&req.method==='GET'){
    try{
      const dashboard=state.lastDashboard||await getDashboard();
      state.lastDashboard=dashboard;
      const data=await analytics.get(dashboard.positions,url.searchParams.get('force')==='1');
      return sendJson(res,200,{connected:true,...data});
    }catch(error){return sendJson(res,error.status||502,{connected:false,error:error.message,trading212Status:error.status||null});}
  }
  if(url.pathname==='/api/disconnect'&&req.method==='POST'){state.apiKey='';state.apiSecret='';state.connectedAt=null;state.lastDashboard=null;return sendJson(res,200,{connected:false});}
  return serveStatic(url.pathname,res);
}

function serveStatic(requestPath,res){const pathname=requestPath==='/'?'/index.html':requestPath;const file=path.resolve(ROOT,`.${pathname}`);if(!file.startsWith(ROOT)||!fs.existsSync(file)||!fs.statSync(file).isFile())return sendJson(res,404,{error:'Not found'});const ext=path.extname(file);const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8'};res.writeHead(200,{'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(res);}
const server=http.createServer((req,res)=>handle(req,res).catch(error=>sendJson(res,500,{error:error.message})));
server.listen(PORT,'127.0.0.1',()=>console.log(`Lumeceta Sentinel running at http://127.0.0.1:${PORT}`));
