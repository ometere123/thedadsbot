import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {assertRacePlan,blastPreparedRaw,broadcastRpcUrlsFor,buildPublicMintPlan,defaultRaceGasLimit,prepareRaceTransaction,prepareRawBroadcast,validateRaceLimits,waitUntilEpoch} from '../packages/core/src/index.js';

const NFT='0x1111111111111111111111111111111111111111';
const WALLET='0x2222222222222222222222222222222222222222';
const FEE='0x0000a26b00c1F0DF003000390027140000fAa719';

function futurePlan(recipient=WALLET){return buildPublicMintPlan({chainId:8453,nftContract:NFT,quantity:1,recipient,payer:recipient,drop:{mintPrice:1000n,startTime:Math.floor(Date.now()/1000)+30,endTime:0,maxTotalMintableByWallet:2,feeBps:0,restrictFeeRecipients:false,allowedFeeRecipients:[]},feeRecipient:FEE});}

async function rpcServer(delayMs,hash){
  const server=http.createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;const json=JSON.parse(body);assert.equal(json.method,'eth_sendRawTransaction');setTimeout(()=>{res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:json.id,result:hash}));},delayMs);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {port}=server.address();return {server,url:`http://127.0.0.1:${port}`};
}

async function stateRpcServer(){
  const server=http.createServer(async(req,res)=>{let text='';for await(const chunk of req)text+=chunk;const json=JSON.parse(text);let result;
    if(json.method==='eth_chainId')result='0x2105';
    else if(json.method==='eth_getTransactionCount')result='0x0';
    else if(json.method==='eth_getBalance')result='0xde0b6b3a7640000';
    else {res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:json.id,error:{code:-32601,message:`unsupported ${json.method}`}}));return;}
    res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({jsonrpc:'2.0',id:json.id,result}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const {port}=server.address();return {server,url:`http://127.0.0.1:${port}`};
}

test('Race Mode accepts deterministic upcoming SeaDrop plan',()=>{const plan=futurePlan();assert.equal(plan.stageStatus,'UPCOMING');assert.equal(assertRacePlan(plan),true);});

test('Race Mode rejects missing explicit spend ceilings',()=>{assert.throws(()=>validateRaceLimits({maxMintValueWei:1n}),/maxNetworkFeeWei/);});

test('Race gas envelope grows with quantity and remains capped',()=>{assert.equal(defaultRaceGasLimit(1),1000000n);assert.ok(defaultRaceGasLimit(3)>defaultRaceGasLimit(1));assert.equal(defaultRaceGasLimit(100),6000000n);});

test('Race Mode combines private write RPCs, official low-latency routes and normal RPC fallbacks',()=>{
  const env={BASE_RPCS:'https://read-one.example,https://read-two.example',BASE_BROADCAST_RPCS:'https://write-one.example/key, https://write-two.example/key'};
  const base=broadcastRpcUrlsFor('base',env);
  for(const url of ['https://write-one.example/key','https://write-two.example/key','https://mainnet-preconf.base.org','https://read-one.example','https://read-two.example','https://mainnet.base.org'])assert.ok(base.includes(url),`${url} missing`);
  const baseDefault=broadcastRpcUrlsFor('base',{});assert.ok(baseDefault.includes('https://mainnet-preconf.base.org'));assert.ok(baseDefault.includes('https://mainnet.base.org'));
  const robinhood=broadcastRpcUrlsFor('robinhood',{});assert.ok(robinhood.includes('https://sequencer.mainnet.chain.robinhood.com'));assert.ok(robinhood.includes('https://rpc.mainnet.chain.robinhood.com'));
});

test('Race Mode prepares and signs the exact deterministic transaction before launch',async t=>{
  const privateKey='0x'+'11'.repeat(32),[{privateKeyToAccount},{parseTransaction}]=await Promise.all([import('viem/accounts'),import('viem')]),account=privateKeyToAccount(privateKey),rpc=await stateRpcServer();t.after(()=>rpc.server.close());
  const plan=futurePlan(account.address),prepared=await prepareRaceTransaction({privateKey,plan,rpcUrls:[rpc.url],limits:{maxMintValueWei:1000n,maxNetworkFeeWei:2000000000000000n,maxTotalSpendWei:2000000000001000n,balanceReserveWei:0n},gasLimit:1000000n,maxFeePerGasWei:1000000000n,maxPriorityFeePerGasWei:100000000n});
  const safeSerialised=JSON.stringify(prepared,(_,v)=>typeof v==='bigint'?v.toString():v);
  assert.equal(prepared.account.toLowerCase(),account.address.toLowerCase());assert.equal(prepared.simulation,'SKIPPED_UPCOMING');assert.match(prepared.txHash,/^0x[0-9a-f]{64}$/i);assert.ok(!safeSerialised.includes(privateKey.slice(2)));
  const tx=parseTransaction(prepared.rawTx);assert.equal(tx.to.toLowerCase(),plan.to.toLowerCase());assert.equal(tx.data,plan.data);assert.equal(tx.value,1000n);assert.equal(tx.nonce,0);assert.equal(tx.gas,1000000n);assert.equal(tx.maxFeePerGas,1000000000n);assert.equal(tx.maxPriorityFeePerGas,100000000n);
});

test('prepared broadcaster resolves on first accepting RPC while all broadcasts continue',async t=>{
  const hash='0x'+'ab'.repeat(32),fast=await rpcServer(10,hash),slow=await rpcServer(90,hash);t.after(()=>fast.server.close());t.after(()=>slow.server.close());
  const prepared=prepareRawBroadcast('0x01'),blast=blastPreparedRaw([slow.url,fast.url],prepared,{expectedHash:hash,timeoutMs:1000});
  const first=await blast.firstAccepted;assert.equal(first.url,fast.url);assert.equal(first.hash,hash);const all=await blast.allSettled;assert.equal(all.filter(x=>x.accepted).length,2);assert.ok(blast.dispatchDurationMs<100);
});

test('high-resolution trigger never fires materially before target',async()=>{const target=Date.now()+25;const result=await waitUntilEpoch(target,{spinMs:2});assert.ok(result.actualEpochMs>=target-1);assert.ok(result.driftMs<150);});
