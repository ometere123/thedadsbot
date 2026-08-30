export class RpcError extends Error {
  constructor(message,{url,method,cause}={}){ super(message); this.name='RpcError'; this.url=url; this.method=method; this.cause=cause; }
}
export class RpcQuorumError extends RpcError {
  constructor(message,observations=[]){ super(message); this.name='RpcQuorumError'; this.observations=observations; }
}

let requestId=1;
export async function rpcCall(url,method,params=[],{timeoutMs=6000}={}){
  if(!/^https?:\/\//i.test(String(url||''))) throw new RpcError('RPC URL must be http(s)',{url,method});
  const ctrl=new AbortController(); const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:requestId++,method,params}),signal:ctrl.signal,redirect:'error'});
    if(!r.ok) throw new RpcError(`RPC HTTP ${r.status}`,{url,method});
    const body=await r.json(); if(body.error) throw new RpcError(body.error.message || `RPC error ${body.error.code}`,{url,method});
    return body.result;
  }catch(error){ if(error instanceof RpcError) throw error; throw new RpcError(error?.name==='AbortError'?'RPC timeout':String(error?.message||error),{url,method,cause:error}); }
  finally{ clearTimeout(timer); }
}

export async function quorumRead(urls,method,params=[],{minAgree,timeoutMs=6000,normalise=v=>JSON.stringify(v)}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))]; if(!unique.length) throw new RpcQuorumError('no RPC endpoints configured');
  const required=Math.max(1,Math.min(Number(minAgree || Math.min(2,unique.length)),unique.length));
  const started=performance.now();
  const settled=await Promise.allSettled(unique.map(async url=>{ const t=performance.now(); const value=await rpcCall(url,method,params,{timeoutMs}); return {url,value,latencyMs:performance.now()-t}; }));
  const observations=settled.map((r,i)=>r.status==='fulfilled'?{ok:true,...r.value}:{ok:false,url:unique[i],error:String(r.reason?.message||r.reason)});
  const groups=new Map(); for(const row of observations.filter(x=>x.ok)){ const key=normalise(row.value); const list=groups.get(key)||[]; list.push(row); groups.set(key,list); }
  const winner=[...groups.values()].sort((a,b)=>b.length-a.length)[0]||[];
  if(winner.length<required) throw new RpcQuorumError(`RPC quorum not reached for ${method}`,observations);
  return {value:winner[0].value,required,agreeing:winner.map(x=>x.url),observations,elapsedMs:performance.now()-started};
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

// Race Mode prepares the exact JSON body before launch so T=0 has no encoding,
// hashing, signing or JSON serialisation work left to do.
export function prepareRawBroadcast(rawTx,{id=1}={}){
  if(!/^0x[0-9a-f]+$/i.test(String(rawTx||'')))throw new Error('raw transaction must be hex');
  return Object.freeze({rawTx,body:JSON.stringify({jsonrpc:'2.0',method:'eth_sendRawTransaction',params:[rawTx],id})});
}

function knownTxError(message=''){
  const text=String(message).toLowerCase();
  return text.includes('already known')||text.includes('already exists')||text.includes('known transaction');
}

async function postPrepared(url,body,{timeoutMs,expectedHash,index,launchPerf,launchEpochMs}){
  if(!/^https?:\/\//i.test(String(url||'')))throw new RpcError('RPC URL must be http(s)',{url,method:'eth_sendRawTransaction'});
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeoutMs);const startedPerf=performance.now();
  try{
    const response=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body,signal:ctrl.signal,redirect:'error',keepalive:true});
    const acceptedPerf=performance.now();let json={};try{json=await response.json();}catch{}
    if(!response.ok)throw new RpcError(`RPC HTTP ${response.status}`,{url,method:'eth_sendRawTransaction'});
    if(json.result){
      const hash=String(json.result);if(expectedHash&&hash.toLowerCase()!==String(expectedHash).toLowerCase())throw new RpcError('RPC returned conflicting transaction hash',{url,method:'eth_sendRawTransaction'});
      return {url,index,accepted:true,hash,latencyMs:acceptedPerf-startedPerf,acceptedMsFromDispatch:acceptedPerf-launchPerf,acceptedEpochMs:launchEpochMs+(acceptedPerf-launchPerf)};
    }
    const message=json?.error?.message||'RPC returned no transaction hash';
    if(expectedHash&&knownTxError(message))return {url,index,accepted:true,hash:expectedHash,alreadyKnown:true,latencyMs:acceptedPerf-startedPerf,acceptedMsFromDispatch:acceptedPerf-launchPerf,acceptedEpochMs:launchEpochMs+(acceptedPerf-launchPerf)};
    throw new RpcError(message,{url,method:'eth_sendRawTransaction'});
  }catch(error){
    if(error instanceof RpcError)throw error;
    throw new RpcError(error?.name==='AbortError'?'RPC timeout':String(error?.message||error),{url,method:'eth_sendRawTransaction',cause:error});
  }finally{clearTimeout(timer);}
}

// Starts every request synchronously in one event-loop turn and returns before
// waiting on any network response. firstAccepted resolves as soon as one RPC
// confirms it accepted the exact signed bytes; allSettled is for later telemetry.
export function blastPreparedRaw(urls,prepared,{expectedHash,timeoutMs=3500}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))];if(!unique.length)throw new RpcQuorumError('no broadcast RPCs configured');
  const body=typeof prepared==='string'?prepareRawBroadcast(prepared).body:prepared?.body;if(!body)throw new Error('prepared broadcast body required');
  const launchEpochMs=Date.now(),launchPerf=performance.now();
  const tasks=unique.map((url,index)=>postPrepared(url,body,{timeoutMs,expectedHash,index,launchPerf,launchEpochMs}));
  const dispatchDurationMs=performance.now()-launchPerf;
  const firstAccepted=Promise.any(tasks).catch(async error=>{
    const rows=await Promise.allSettled(tasks);throw new RpcQuorumError('all transaction broadcasts failed',rows.map((row,i)=>({url:unique[i],ok:row.status==='fulfilled',error:row.status==='rejected'?String(row.reason?.message||row.reason):undefined})),{cause:error});
  });
  const allSettled=Promise.allSettled(tasks).then(rows=>rows.map((row,i)=>row.status==='fulfilled'?row.value:{url:unique[i],index:i,accepted:false,error:String(row.reason?.message||row.reason)}));
  return {launchEpochMs,launchPerf,dispatchDurationMs,firstAccepted,allSettled};
}

// Warm exactly the write path. Some sequencer/write endpoints reject read
// methods, so an intentionally-invalid raw transaction is used and the response
// is ignored; the goal is to establish DNS/TCP/TLS/HTTP state before launch.
export async function warmRpcConnections(urls,{timeoutMs=800}={}){
  const unique=[...new Set((urls||[]).filter(Boolean))];
  const body=JSON.stringify({jsonrpc:'2.0',method:'eth_sendRawTransaction',params:['0x00'],id:1});
  const rows=await Promise.allSettled(unique.map(async url=>{const t=performance.now();const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),timeoutMs);try{await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body,signal:ctrl.signal,redirect:'error',keepalive:true});return {url,ok:true,latencyMs:performance.now()-t};}catch(error){return {url,ok:false,error:String(error?.message||error),latencyMs:performance.now()-t};}finally{clearTimeout(timer);}}));
  return rows.map((row,i)=>row.status==='fulfilled'?row.value:{url:unique[i],ok:false,error:String(row.reason?.message||row.reason)});
}
