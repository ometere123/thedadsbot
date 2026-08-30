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
