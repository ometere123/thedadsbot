import { validateIntent, validateSeaDropPublicIntent } from './intent-firewall.js';
import { enforceSpendLimits } from './spend-limits.js';
import { broadcastRaw, rpcCall } from './rpc.js';
import { verifyMintPostcondition } from './postconditions.js';

export async function executePlanWithPrivateKey({privateKey,plan,rpcUrls,limits={},mode='CONFIRM',confirmed=false}){
  if(mode==='WATCH')return {status:'SKIPPED',reason:'watch mode never signs'};
  if(plan.adapter==='seadrop-v1-public'&&plan.stageStatus&&plan.stageStatus!=='OPEN')throw new Error(`SeaDrop stage is ${plan.stageStatus}; execution requires OPEN`);
  if(mode==='AUTO'&&(limits.maxMintValueWei==null||limits.maxNetworkFeeWei==null||limits.maxTotalSpendWei==null))throw new Error('AUTO mode requires explicit max mint, max network fee, and max total spend limits');
  if(mode==='CONFIRM'&&!confirmed)return {status:'SKIPPED',reason:'explicit confirmation required'};
  const policy={...plan,mode}; if(plan.verification==='deterministic'&&plan.adapter==='seadrop-v1-public')validateSeaDropPublicIntent({...policy,seadrop:plan.to,payer:plan.payer||plan.recipient},plan);else validateIntent(policy,plan);
  const {privateKeyToAccount}=await import('viem/accounts'); const {createPublicClient,http}=await import('viem');
  const account=privateKeyToAccount(privateKey); const primary=rpcUrls[0]; if(!primary)throw new Error('at least one RPC is required'); const client=createPublicClient({transport:http(primary)});
  const chainId=await client.getChainId(); if(Number(chainId)!==Number(plan.chainId))throw new Error('primary RPC chain mismatch');
  const value=BigInt(plan.value||0); await client.call({account:account.address,to:plan.to,data:plan.data,value});
  const [nonce,fees,balance,gas]=await Promise.all([client.getTransactionCount({address:account.address,blockTag:'pending'}),client.estimateFeesPerGas(),client.getBalance({address:account.address,blockTag:'pending'}),client.estimateGas({account:account.address,to:plan.to,data:plan.data,value})]);
  const maxFeePerGas=fees.maxFeePerGas??fees.gasPrice; if(maxFeePerGas==null)throw new Error('fee data unavailable'); const gasLimit=(gas*120n+99n)/100n;
  const spend=enforceSpendLimits({mintValueWei:value,gasLimit,maxFeePerGasWei:maxFeePerGas,balanceWei:balance,limits});
  const raw=await account.signTransaction({chainId:Number(plan.chainId),to:plan.to,data:plan.data,value,nonce,gas:gasLimit,maxFeePerGas,maxPriorityFeePerGas:fees.maxPriorityFeePerGas??0n,type:'eip1559'});
  const broadcasts=await broadcastRaw(rpcUrls,raw); const hash=broadcasts[0].hash;
  let receipt=null;const deadline=Date.now()+120000;while(Date.now()<deadline){receipt=await rpcCall(primary,'eth_getTransactionReceipt',[hash],{timeoutMs:5000});if(receipt)break;await new Promise(r=>setTimeout(r,500));}if(!receipt)throw new Error('receipt timeout; transaction may still be pending');
  const post=await verifyMintPostcondition(receipt,{nftContract:plan.nftContract,recipient:plan.recipient||account.address,minQuantity:plan.quantity||1});
  return {status:'CONFIRMED',hash,spend,broadcasts,receipt,post};
}
