#!/usr/bin/env node
import http from 'node:http';
import {blastPreparedRaw,prepareRawBroadcast,warmRpcConnections} from '../packages/core/src/index.js';

const hash='0x'+'ab'.repeat(32),iterations=Number(process.argv[2]||50),serverCount=4;
const servers=[];
for(let i=0;i<serverCount;i++){
  const server=http.createServer(async(req,res)=>{for await(const _ of req){}res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:1,result:hash}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));servers.push(server);
}
const urls=servers.map(server=>`http://127.0.0.1:${server.address().port}`),prepared=prepareRawBroadcast('0x01');
await warmRpcConnections(urls,{timeoutMs:500});
const rows=[];
for(let i=0;i<iterations;i++){
  const blast=blastPreparedRaw(urls,prepared,{expectedHash:hash,timeoutMs:1000}),first=await blast.firstAccepted;await blast.allSettled;
  rows.push({dispatchMs:blast.dispatchDurationMs,firstAcceptMs:first.acceptedMsFromDispatch,reusedSocket:first.reusedSocket});
}
for(const server of servers)await new Promise(resolve=>server.close(resolve));
function percentile(values,p){const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.min(sorted.length-1,Math.floor((sorted.length-1)*p))];}
const dispatch=rows.map(x=>x.dispatchMs),accept=rows.map(x=>x.firstAcceptMs);
console.log(JSON.stringify({kind:'local-hot-path-regression-benchmark',iterations,endpoints:serverCount,dispatch:{medianMs:percentile(dispatch,.5),p95Ms:percentile(dispatch,.95),maxMs:Math.max(...dispatch)},firstAccept:{medianMs:percentile(accept,.5),p95Ms:percentile(accept,.95),maxMs:Math.max(...accept)},reusedSocketRate:rows.filter(x=>x.reusedSocket).length/rows.length,note:'Loopback benchmark only. It does not prove real-network superiority over another tool; use the same machine/RPCs/drop for comparative claims.'},null,2));
