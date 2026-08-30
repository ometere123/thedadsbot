import http from 'node:http';
import https from 'node:https';

export class RpcError extends Error {
  constructor(message,{url,method,cause}={}){ super(message); this.name='RpcError'; this.url=url; this.method=method; this.cause=cause; }
}
export class RpcQuorumError extends RpcError {
  constructor(message,observations=[]){ super(message); this.name='RpcQuorumError'; this.observations=observations; }
}

let requestId=1;
export async function rpcCall(url,method,params=[],{timeoutMs=6000,signal}={}){
  if(!/^https?:\/\//i.test(String(url||''))) throw new RpcError('RPC URL must be http(s)',{url,method});
  const ctrl=new AbortController();let timedOut=false;
  const onAbort=()=>ctrl.abort(signal?.reason);if(signal){if(signal.aborted)ctrl.abort(signal.reason);else signal.addEventListener('abort',onAbort,{once:true});}
  const timer=setTimeout(()=>{timedOut=true;ctrl.abort();},timeoutMs);
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId++,method,params}),signal:ctrl.signal,redirect:'error'});
    if(!r.ok) throw new RpcError(`RPC HTTP ${r.status}`,{url,method});
    const body=await r.json(); if(body.error) throw new RpcError(body.error.message || `RPC error ${body.error.code}`,{url,method});
    return body.result;
  }catch(error){ if(error instanceof RpcError) throw error; throw new RpcError(error?.name==='AbortError'?(timedOut?'RPC timeout':'RPC cancelled'):String(error?.message||error),{url,method,cause:error}); }
  finally{ clearTimeout(timer);if(signal)signal.removeEventListener('abort',onAbort); }
}

export async function quorumRead(urls,method,params=[],{minAgree,timeoutMs=6000,normalise=v=>JSON.stringify(v)}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))]; if(!unique.length) throw new RpcQuorumError('no RPC endpoints configured');
  const required=Math.max(1,Math.min(Number(minAgree || Math.min(2,unique.length)),unique.length));
  const started=performance.now(),master=new AbortController(),observations=[],groups=new Map();
  let completed=0,finished=false;
  return new Promise((resolve,reject)=>{
    const failIfImpossible=()=>{
      if(finished)return;const remaining=unique.length-completed,maxGroup=Math.max(0,...[...groups.values()].map(rows=>rows.length));
      if(maxGroup+remaining<required){finished=true;master.abort();reject(new RpcQuorumError(`RPC quorum not reached for ${method}`,[...observations]));}
    };
    unique.forEach(url=>{
      const t=performance.now();
      rpcCall(url,method,params,{timeoutMs,signal:master.signal}).then(value=>{
        if(finished)return;completed++;const row={ok:true,url,value,latencyMs:performance.now()-t};observations.push(row);
        let key;try{key=normalise(value);}catch(error){row.ok=false;row.error=`normalise failed: ${error.message}`;failIfImpossible();return;}
        const list=groups.get(key)||[];list.push(row);groups.set(key,list);
        if(list.length>=required){finished=true;const result={value:list[0].value,required,agreeing:list.map(x=>x.url),observations:[...observations],elapsedMs:performance.now()-started};master.abort();resolve(result);return;}
        failIfImpossible();
      }).catch(error=>{
        if(finished)return;completed++;observations.push({ok:false,url,error:String(error?.message||error),latencyMs:performance.now()-t});failIfImpossible();
      });
    });
  });
}

export async function benchmarkRpcs(urls,{timeoutMs=5000}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))];
  const rows=await Promise.all(unique.map(async url=>{
    const started=performance.now();
    try{ const [chainId,block]=await Promise.all([rpcCall(url,'eth_chainId',[],{timeoutMs}),rpcCall(url,'eth_blockNumber',[],{timeoutMs})]); return {url,ok:true,chainId:Number(BigInt(chainId)),block:Number(BigInt(block)),latencyMs:Number((performance.now()-started).toFixed(1))}; }
    catch(error){ return {url,ok:false,error:String(error.message),latencyMs:Number((performance.now()-started).toFixed(1))}; }
  }));
  const bestBlock=Math.max(0,...rows.filter(x=>x.ok).map(x=>x.block));
  return rows.map(x=>x.ok?{...x,headLag:bestBlock-x.block}:x).sort((a,b)=>(a.ok===b.ok?0:a.ok?-1:1)||(a.headLag??1e9)-(b.headLag??1e9)||a.latencyMs-b.latencyMs);
}

export async function broadcastRaw(urls,rawTx,{timeoutMs=5000}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))]; if(!unique.length) throw new RpcQuorumError('no broadcast RPCs configured');
  const settled=await Promise.allSettled(unique.map(async url=>{const t=performance.now();const hash=await rpcCall(url,'eth_sendRawTransaction',[rawTx],{timeoutMs});return {url,hash,latencyMs:performance.now()-t};}));
  const accepted=settled.filter(x=>x.status==='fulfilled').map(x=>x.value);
  if(!accepted.length) throw new RpcQuorumError('all transaction broadcasts failed',settled.map((r,i)=>({url:unique[i],ok:r.status==='fulfilled',error:r.status==='rejected'?String(r.reason?.message||r.reason):undefined})));
  const hashes=new Set(accepted.map(x=>String(x.hash).toLowerCase())); if(hashes.size!==1) throw new RpcQuorumError('RPCs returned conflicting transaction hashes',accepted);
  return accepted;
}

// Race Mode has its own explicit persistent HTTP/1.1 pools. Warming and firing
// use the same Agent instance, so a healthy endpoint can reuse the exact socket
// whose DNS/TCP/TLS setup was paid before launch.
const raceAgents=new Map();
function raceAgent(url){
  const parsed=new URL(url),key=`${parsed.protocol}//${parsed.host}`;let agent=raceAgents.get(key);if(agent)return agent;
  const options={keepAlive:true,keepAliveMsecs:15000,maxSockets:32,maxFreeSockets:16,scheduling:'lifo'};
  agent=parsed.protocol==='https:'?new https.Agent(options):new http.Agent(options);raceAgents.set(key,agent);return agent;
}
function racePost(url,body,{timeoutMs=3500}={}){
  return new Promise((resolve,reject)=>{
    let parsed;try{parsed=new URL(url);}catch(error){reject(new RpcError('invalid RPC URL',{url,method:'eth_sendRawTransaction',cause:error}));return;}
    if(!['http:','https:'].includes(parsed.protocol)){reject(new RpcError('RPC URL must be http(s)',{url,method:'eth_sendRawTransaction'}));return;}
    const lib=parsed.protocol==='https:'?https:http,startedPerf=performance.now();
    const req=lib.request(parsed,{method:'POST',agent:raceAgent(url),headers:{'content-type':'application/json','content-length':Buffer.byteLength(body),'connection':'keep-alive'}},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
        const endedPerf=performance.now(),text=Buffer.concat(chunks).toString('utf8');let json={};try{json=text?JSON.parse(text):{};}catch{}
        if((res.statusCode||500)>=400){reject(new RpcError(`RPC HTTP ${res.statusCode}`,{url,method:'eth_sendRawTransaction'}));return;}
        resolve({json,latencyMs:endedPerf-startedPerf,reusedSocket:Boolean(req.reusedSocket),endedPerf});
      });
    });
    // Small JSON-RPC writes should leave immediately instead of waiting for Nagle batching.
    // This is applied to both warmed and newly-created sockets and remains local-only.
    req.on('socket',socket=>{if(typeof socket.setNoDelay==='function')socket.setNoDelay(true);});
    req.setTimeout(timeoutMs,()=>req.destroy(new RpcError('RPC timeout',{url,method:'eth_sendRawTransaction'})));
    req.on('error',error=>reject(error instanceof RpcError?error:new RpcError(String(error?.message||error),{url,method:'eth_sendRawTransaction',cause:error})));
    req.end(body);
  });
}

// Prepare both the signed bytes and exact RPC body before T=0.
export function prepareRawBroadcast(rawTx,{id=1}={}){
  if(!/^0x[0-9a-f]+$/i.test(String(rawTx||'')))throw new Error('raw transaction must be hex');
  return Object.freeze({rawTx,body:JSON.stringify({jsonrpc:'2.0',method:'eth_sendRawTransaction',params:[rawTx],id})});
}

function knownTxError(message=''){
  const text=String(message).toLowerCase();
  return text.includes('already known')||text.includes('already exists')||text.includes('known transaction');
}

async function postPrepared(url,body,{timeoutMs,expectedHash,index,launchPerf,launchEpochMs}){
  const startedPerf=performance.now(),response=await racePost(url,body,{timeoutMs}),acceptedPerf=response.endedPerf,json=response.json;
  if(json.result){
    const hash=String(json.result);if(expectedHash&&hash.toLowerCase()!==String(expectedHash).toLowerCase())throw new RpcError('RPC returned conflicting transaction hash',{url,method:'eth_sendRawTransaction'});
    return {url,index,accepted:true,hash,reusedSocket:response.reusedSocket,latencyMs:acceptedPerf-startedPerf,acceptedMsFromDispatch:acceptedPerf-launchPerf,acceptedEpochMs:launchEpochMs+(acceptedPerf-launchPerf)};
  }
  const message=json?.error?.message||'RPC returned no transaction hash';
  if(expectedHash&&knownTxError(message))return {url,index,accepted:true,hash:expectedHash,alreadyKnown:true,reusedSocket:response.reusedSocket,latencyMs:acceptedPerf-startedPerf,acceptedMsFromDispatch:acceptedPerf-launchPerf,acceptedEpochMs:launchEpochMs+(acceptedPerf-launchPerf)};
  throw new RpcError(message,{url,method:'eth_sendRawTransaction'});
}

// Starts every request synchronously in one event-loop turn and returns before
// waiting on any response. Inclusion latency is therefore independent of the
// slowest endpoint. firstAccepted and allSettled exist only for telemetry/UX.
export function blastPreparedRaw(urls,prepared,{expectedHash,timeoutMs=3500}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))];if(!unique.length)throw new RpcQuorumError('no broadcast RPCs configured');
  const body=typeof prepared==='string'?prepareRawBroadcast(prepared).body:prepared?.body;if(!body)throw new Error('prepared broadcast body required');
  const launchEpochMs=Date.now(),launchPerf=performance.now();
  const tasks=unique.map((url,index)=>postPrepared(url,body,{timeoutMs,expectedHash,index,launchPerf,launchEpochMs}));
  const dispatchDurationMs=performance.now()-launchPerf;
  const firstAccepted=Promise.any(tasks).catch(async()=>{const rows=await Promise.allSettled(tasks);throw new RpcQuorumError('all transaction broadcasts failed',rows.map((row,i)=>({url:unique[i],ok:row.status==='fulfilled',error:row.status==='rejected'?String(row.reason?.message||row.reason):undefined})));});
  const allSettled=Promise.allSettled(tasks).then(rows=>rows.map((row,i)=>row.status==='fulfilled'?row.value:{url:unique[i],index:i,accepted:false,error:String(row.reason?.message||row.reason)}));
  return {launchEpochMs,launchPerf,dispatchDurationMs,firstAccepted,allSettled};
}

// Warm the same write method through the same persistent Agents. An invalid raw
// tx is intentional: write-only sequencer endpoints still establish a socket.
export async function warmRpcConnections(urls,{timeoutMs=800}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))],body=JSON.stringify({jsonrpc:'2.0',method:'eth_sendRawTransaction',params:['0x00'],id:1});
  const rows=await Promise.allSettled(unique.map(async url=>{const started=performance.now();try{const row=await racePost(url,body,{timeoutMs});return {url,ok:true,reusedSocket:row.reusedSocket,latencyMs:performance.now()-started};}catch(error){return {url,ok:false,error:String(error?.message||error),latencyMs:performance.now()-started};}}));
  return rows.map((row,i)=>row.status==='fulfilled'?row.value:{url:unique[i],ok:false,error:String(row.reason?.message||row.reason)});
}
