import http from 'node:http';
import process from 'node:process';
import readline from 'node:readline';
import {
  Scheduler, benchmarkRpcs, buildMintTransaction, buildPublicMintPlan, chainById, classifyOpenSeaPlan,
  executePlanWithPrivateKey, getDrop, getEligibility, listChains, listDrops, loadVault,
  quorumRead, readPublicDrop, rpcUrlsFor, validateIntent
} from '../../core/src/index.js';

const port=Number(process.env.THEDADBOT_AGENT_PORT||47831),maxBody=256*1024;
const configuredOrigins=String(process.env.THEDADBOT_DASHBOARD_ORIGINS||'http://127.0.0.1:4173,http://localhost:4173').split(',').map(x=>x.trim()).filter(Boolean);
const origins=new Set(configuredOrigins),scheduler=new Scheduler();let unlockedVault=null;

async function hidden(prompt){return new Promise(resolve=>{const stdin=process.stdin,stdout=process.stdout;stdout.write(prompt);let value='';if(!stdin.isTTY){const rl=readline.createInterface({input:stdin});rl.once('line',x=>{rl.close();resolve(x.trim());});return;}stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');const onData=c=>{if(c==='\r'||c==='\n'){stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);stdout.write('\n');resolve(value);}else if(c==='\u0003')process.exit(130);else if(c==='\u007f')value=value.slice(0,-1);else value+=c;};stdin.on('data',onData);});}
if(process.env.THEDADBOT_VAULT){const password=await hidden(`Unlock ${process.env.THEDADBOT_VAULT} for local automation: `);unlockedVault=await loadVault(process.env.THEDADBOT_VAULT,password);console.log(`Unlocked ${(unlockedVault.wallets||[]).length} local wallet(s). Keys are not exposed over HTTP.`);}

function json(res,code,obj){res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(obj,(_,v)=>typeof v==='bigint'?v.toString():v));}
async function body(req){let text='';for await(const c of req){text+=c;if(text.length>maxBody)throw new Error('request too large');}const parsed=text?JSON.parse(text):{};const keys=Object.keys(parsed).join(' ').toLowerCase();const serial=JSON.stringify(parsed).toLowerCase();if(keys.includes('privatekey')||keys.includes('seedphrase')||keys.includes('mnemonic')||keys.includes('password')||serial.includes('seed phrase'))throw new Error('secrets are never accepted by the local HTTP API');return parsed;}
function cors(req,res){const origin=req.headers.origin;if(origin&&!origins.has(origin))return false;if(origin){res.setHeader('access-control-allow-origin',origin);res.setHeader('vary','Origin, Access-Control-Request-Private-Network');}if(req.headers['access-control-request-private-network']==='true')res.setHeader('access-control-allow-private-network','true');return true;}
function walletAt(index){if(!unlockedVault)throw new Error('agent vault is locked; restart with THEDADBOT_VAULT=path and unlock in the terminal');const w=(unlockedVault.wallets||[])[Number(index||0)];if(!w?.privateKey)throw new Error('wallet index not found');return w;}
async function addSeaDropJob(spec){if(!spec?.id||!spec?.at)throw new Error('job id and at are required');if(spec?.limits?.maxMintValueWei==null||spec?.limits?.maxNetworkFeeWei==null||spec?.limits?.maxTotalSpendWei==null)throw new Error('scheduled AUTO jobs require explicit maxMintValueWei, maxNetworkFeeWei, and maxTotalSpendWei');const wallet=walletAt(spec.walletIndex);const chain=chainById(spec.chainId);if(!chain)throw new Error('unknown chain id');const urls=(spec.rpcUrls||rpcUrlsFor(chain));if(!urls.length)throw new Error('no RPC URLs configured');scheduler.add({id:spec.id,at:spec.at,kind:'seadrop',walletIndex:Number(spec.walletIndex||0),chainId:chain.id,nftContract:spec.nftContract,quantity:Number(spec.quantity),run:async()=>{const drop=await readPublicDrop(urls,spec.nftContract);const plan=buildPublicMintPlan({chainId:chain.id,nftContract:spec.nftContract,quantity:Number(spec.quantity),drop,feeRecipient:spec.feeRecipient,recipient:wallet.address,payer:wallet.address});if(plan.stageStatus!=='OPEN')throw new Error(`scheduled mint fired while stage is ${plan.stageStatus}`);return executePlanWithPrivateKey({privateKey:wallet.privateKey,plan,rpcUrls:urls,limits:spec.limits||{},mode:'AUTO',confirmed:true});}});return spec.id;}
setInterval(()=>scheduler.tick().catch(e=>console.error('scheduler tick:',e.message)),250).unref();

const server=http.createServer(async(req,res)=>{if(!cors(req,res))return json(res,403,{error:'origin blocked'});if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'600'});return res.end();}
 try{const u=new URL(req.url,'http://local');
  if(req.method==='GET'&&u.pathname==='/health')return json(res,200,{ok:true,product:'TheDadBot',mode:'local-agent',version:'1.0.0',vaultUnlocked:Boolean(unlockedVault),walletCount:unlockedVault?.wallets?.length||0,keys:'never accepted over HTTP'});
  if(req.method==='GET'&&u.pathname==='/chains')return json(res,200,{chains:listChains()});
  if(req.method==='POST'&&u.pathname==='/policy/validate'){const b=await body(req);return json(res,200,validateIntent(b.intent,b.tx));}
  if(req.method==='POST'&&u.pathname==='/rpc/quorum'){const b=await body(req);return json(res,200,await quorumRead(b.urls,b.method,b.params||[],{minAgree:b.minAgree}));}
  if(req.method==='POST'&&u.pathname==='/rpc/benchmark'){const b=await body(req);return json(res,200,{rows:await benchmarkRpcs(b.urls)});}
  if(req.method==='GET'&&u.pathname==='/opensea/drops')return json(res,200,await listDrops({type:u.searchParams.get('type')||'upcoming',chains:(u.searchParams.get('chains')||'').split(',').filter(Boolean),limit:Number(u.searchParams.get('limit')||20)}));
  if(req.method==='GET'&&u.pathname.startsWith('/opensea/drop/'))return json(res,200,await getDrop(decodeURIComponent(u.pathname.split('/').pop())));
  if(req.method==='GET'&&u.pathname.startsWith('/opensea/eligibility/'))return json(res,200,await getEligibility(decodeURIComponent(u.pathname.split('/').pop())));
  if(req.method==='POST'&&u.pathname==='/opensea/mint-plan'){const b=await body(req);const apiPayload=await buildMintTransaction(b.slug,{minter:b.minter,quantity:b.quantity});return json(res,200,{apiPayload,plan:classifyOpenSeaPlan({apiPayload,chainId:b.chainId,nftContract:b.nftContract,recipient:b.minter,quantity:b.quantity,allowedTargets:b.allowedTargets||[]})});}
  if(req.method==='POST'&&u.pathname==='/seadrop/plan'){const b=await body(req);const drop=await readPublicDrop(b.rpcUrls,b.nftContract,{minAgree:b.minAgree});const plan=buildPublicMintPlan({chainId:b.chainId,nftContract:b.nftContract,quantity:b.quantity,drop,feeRecipient:b.feeRecipient,recipient:b.recipient,payer:b.payer});return json(res,200,{drop,plan});}
  if(req.method==='GET'&&u.pathname==='/jobs')return json(res,200,{jobs:scheduler.list()});
  if(req.method==='POST'&&u.pathname==='/jobs/seadrop'){const b=await body(req);await addSeaDropJob(b);return json(res,201,{ok:true,id:b.id,jobs:scheduler.list()});}
  if(req.method==='DELETE'&&u.pathname.startsWith('/jobs/'))return json(res,200,{ok:scheduler.cancel(decodeURIComponent(u.pathname.split('/').pop()))});
  return json(res,404,{error:'not found'});
 }catch(e){return json(res,400,{error:e.message,name:e.name});}
});
server.listen(port,'127.0.0.1',()=>console.log(`TheDadBot local agent: http://127.0.0.1:${port}`));
