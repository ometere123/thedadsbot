import { validateSeaDropPublicIntent } from './intent-firewall.js';
import { enforceSpendLimits } from './spend-limits.js';
import { blastPreparedRaw, prepareRawBroadcast, rpcCall } from './rpc.js';
import { verifyMintPostcondition } from './postconditions.js';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const ZERO='0x0000000000000000000000000000000000000000';

export function defaultRaceGasLimit(quantity=1){
  const q=Number(quantity);if(!Number.isInteger(q)||q<1)throw new Error('race quantity must be a positive integer');
  const estimate=1000000n+BigInt(q-1)*300000n;
  return estimate>6000000n?6000000n:estimate;
}

export function assertRacePlan(plan){
  if(!plan)throw new Error('race plan required');
  if(plan.adapter!=='seadrop-v1-public'||plan.verification!=='deterministic')throw new Error('Race Mode only accepts deterministic SeaDrop public plans');
  if(plan.stageStatus==='ENDED')throw new Error('Race Mode refuses an ended mint stage');
  if(!Number.isFinite(Number(plan.startTime))||Number(plan.startTime)<=0)throw new Error('Race Mode requires an on-chain start time');
  validateSeaDropPublicIntent({...plan,mode:'AUTO',seadrop:plan.to,payer:plan.payer||plan.recipient},plan);
  return true;
}

export function validateRaceLimits(limits={}){
  for(const key of ['maxMintValueWei','maxNetworkFeeWei','maxTotalSpendWei'])if(limits[key]==null)throw new Error(`Race Mode requires explicit ${key}`);
  const out={...limits};for(const key of ['maxMintValueWei','maxNetworkFeeWei','maxTotalSpendWei','balanceReserveWei'])if(out[key]!=null)out[key]=BigInt(out[key]);
  return out;
}

function bps(value,multiplierBps){return (BigInt(value)*BigInt(multiplierBps)+9999n)/10000n;}
function sameAddress(a,b){return String(a||'').toLowerCase()===String(b||'').toLowerCase();}

export async function prepareRaceTransaction({
  privateKey,plan,rpcUrls,limits,gasLimit,feeMultiplierBps=12500,priorityMultiplierBps=12500,
  maxFeePerGasWei,maxPriorityFeePerGasWei,maxPreparedAgeMs=15000,simulateIfOpen=true
}){
  assertRacePlan(plan);const safeLimits=validateRaceLimits(limits);
  const urls=[...new Set((rpcUrls||[]).filter(Boolean))];if(!urls.length)throw new Error('Race Mode requires at least one RPC');
  const [{privateKeyToAccount},{createPublicClient,http,keccak256,toHex}]=await Promise.all([import('viem/accounts'),import('viem')]);
  const account=privateKeyToAccount(privateKey),primary=urls[0];
  if(plan.recipient&&!sameAddress(plan.recipient,account.address))throw new Error('Race Mode recipient must be the signing wallet for public SeaDrop');
  if(plan.payer&&!sameAddress(plan.payer,account.address))throw new Error('Race Mode payer must be the signing wallet');
  const client=createPublicClient({transport:http(primary)});
  const needFees=maxFeePerGasWei==null||maxPriorityFeePerGasWei==null;
  const [chainId,nonce,balance,fees]=await Promise.all([
    client.getChainId(),
    client.getTransactionCount({address:account.address,blockTag:'pending'}),
    client.getBalance({address:account.address,blockTag:'pending'}),
    needFees?client.estimateFeesPerGas():Promise.resolve(null),
  ]);
  if(Number(chainId)!==Number(plan.chainId))throw new Error('Race Mode primary RPC chain mismatch');

  const value=BigInt(plan.value||0);let simulation='SKIPPED_UPCOMING';
  if(plan.stageStatus==='OPEN'&&simulateIfOpen){await client.call({account:account.address,to:plan.to,data:plan.data,value});simulation='PASSED';}

  let finalGas;
  if(gasLimit!=null)finalGas=BigInt(gasLimit);
  else if(plan.stageStatus==='OPEN'){
    const estimated=await client.estimateGas({account:account.address,to:plan.to,data:plan.data,value});finalGas=(estimated*125n+99n)/100n;
  }else finalGas=defaultRaceGasLimit(plan.quantity);
  if(finalGas<=21000n)throw new Error('Race Mode gas limit is implausibly low');

  const networkMax=fees?.maxFeePerGas??fees?.gasPrice;
  const networkPriority=fees?.maxPriorityFeePerGas??0n;
  const finalMaxFee=maxFeePerGasWei!=null?BigInt(maxFeePerGasWei):bps(networkMax,feeMultiplierBps);
  const finalPriority=maxPriorityFeePerGasWei!=null?BigInt(maxPriorityFeePerGasWei):bps(networkPriority,priorityMultiplierBps);
  if(finalMaxFee<=0n)throw new Error('Race Mode max fee per gas must be positive');
  if(finalPriority>finalMaxFee)throw new Error('Race Mode priority fee cannot exceed max fee per gas');

  const spend=enforceSpendLimits({mintValueWei:value,gasLimit:finalGas,maxFeePerGasWei:finalMaxFee,balanceWei:balance,limits:safeLimits});
  const rawTx=await account.signTransaction({chainId:Number(plan.chainId),to:plan.to,data:plan.data,value,nonce,gas:finalGas,maxFeePerGas:finalMaxFee,maxPriorityFeePerGas:finalPriority,type:'eip1559'});
  const txHash=keccak256(rawTx),preparedBroadcast=prepareRawBroadcast(rawTx);
  const fingerprint=keccak256(toHex(JSON.stringify({chainId:plan.chainId,to:plan.to,data:plan.data,value:String(plan.value),nftContract:plan.nftContract,recipient:account.address,quantity:plan.quantity,startTime:plan.startTime,endTime:plan.endTime||0,nonce,gas:String(finalGas),maxFeePerGas:String(finalMaxFee),maxPriorityFeePerGas:String(finalPriority)})));
  const preparedAtEpochMs=Date.now();
  return {
    kind:'thedadbot-race-v1',account:account.address,txHash,rawTx,preparedBroadcast,fingerprint,preparedAtEpochMs,maxPreparedAgeMs:Number(maxPreparedAgeMs),
    nonce,gasLimit:finalGas,maxFeePerGas:finalMaxFee,maxPriorityFeePerGas:finalPriority,simulation,spend,
    plan:{...plan,recipient:account.address,payer:account.address},rpcUrls:urls,
  };
}

// Uses a monotonic clock for the countdown, then a tiny final spin to avoid the
// coarse timer jitter that matters in FCFS launches. The spin is bounded.
export async function waitUntilEpoch(targetEpochMs,{spinMs=4}={}){
  const target=Number(targetEpochMs);if(!Number.isFinite(target))throw new Error('invalid race trigger time');
  const startEpoch=Date.now(),startPerf=performance.now(),targetPerf=startPerf+(target-startEpoch),spin=Math.max(0,Math.min(10,Number(spinMs)||0));
  while(true){
    const remaining=targetPerf-performance.now();if(remaining<=0)break;
    if(remaining>30){await sleep(Math.max(1,remaining-15));continue;}
    if(remaining>spin+1){await sleep(Math.max(0,remaining-spin));continue;}
    while(performance.now()<targetPerf){}break;
  }
  const actualEpochMs=Date.now();return {targetEpochMs:target,actualEpochMs,driftMs:actualEpochMs-target};
}

export async function waitForReceiptAny(rpcUrls,txHash,{timeoutMs=120000,pollMs=100,perCallTimeoutMs=1000}={}){
  const urls=[...new Set((rpcUrls||[]).filter(Boolean))].slice(0,4);if(!urls.length)throw new Error('receipt polling requires an RPC');
  const deadline=Date.now()+Number(timeoutMs);
  while(Date.now()<deadline){
    const rows=await Promise.allSettled(urls.map(url=>rpcCall(url,'eth_getTransactionReceipt',[txHash],{timeoutMs:perCallTimeoutMs})));
    for(let i=0;i<rows.length;i++)if(rows[i].status==='fulfilled'&&rows[i].value)return {receipt:rows[i].value,url:urls[i],index:i,observedAtEpochMs:Date.now()};
    await sleep(pollMs);
  }
  throw new Error('receipt timeout; transaction may still be pending');
}

export async function launchPreparedRaceTransaction({
  prepared,broadcastRpcUrls,triggerAtEpochMs,launchOffsetMs=0,spinMs=4,broadcastTimeoutMs=3500,receiptTimeoutMs=120000
}){
  if(prepared?.kind!=='thedadbot-race-v1'||!prepared.preparedBroadcast||!prepared.txHash)throw new Error('valid prepared Race Mode transaction required');
  assertRacePlan(prepared.plan);
  const offset=Number(launchOffsetMs);if(!Number.isFinite(offset)||offset<0||offset>5000)throw new Error('launch offset must be between 0 and 5000 ms');
  const stageEpochMs=Number(prepared.plan.startTime)*1000;
  const target=triggerAtEpochMs==null?Math.max(Date.now(),stageEpochMs+offset):Number(triggerAtEpochMs);
  if(target-prepared.preparedAtEpochMs>prepared.maxPreparedAgeMs)throw new Error('prepared Race Mode signature is too old; re-arm closer to launch');
  const urls=[...new Set((broadcastRpcUrls||prepared.rpcUrls||[]).filter(Boolean))];if(!urls.length)throw new Error('Race Mode requires broadcast RPCs');
  const trigger=await waitUntilEpoch(target,{spinMs});

  // Hot path: all expensive work is already complete. This call starts all
  // prepared eth_sendRawTransaction requests before waiting for any response.
  const blast=blastPreparedRaw(urls,prepared.preparedBroadcast,{expectedHash:prepared.txHash,timeoutMs:broadcastTimeoutMs});
  const first=await blast.firstAccepted;
  const receiptInputs=[first.url,...urls.filter(url=>url!==first.url)];
  const receiptPromise=waitForReceiptAny(receiptInputs,prepared.txHash,{timeoutMs:receiptTimeoutMs});
  const [broadcasts,receiptSeen]=await Promise.all([blast.allSettled,receiptPromise]);
  const post=await verifyMintPostcondition(receiptSeen.receipt,{nftContract:prepared.plan.nftContract,recipient:prepared.plan.recipient||prepared.account,minQuantity:prepared.plan.quantity||1});
  const blockNumber=receiptSeen.receipt?.blockNumber?Number(BigInt(receiptSeen.receipt.blockNumber)):null;
  return {
    status:'CONFIRMED',hash:prepared.txHash,spend:prepared.spend,broadcasts,receipt:receiptSeen.receipt,post,
    telemetry:{
      preparedAtEpochMs:prepared.preparedAtEpochMs,stageStartEpochMs:stageEpochMs,targetEpochMs:target,triggerActualEpochMs:trigger.actualEpochMs,triggerDriftMs:trigger.driftMs,
      dispatchStartedEpochMs:blast.launchEpochMs,dispatchMsFromTarget:blast.launchEpochMs-target,localDispatchDurationMs:blast.dispatchDurationMs,
      firstAcceptedRpcIndex:first.index,firstAcceptedEpochMs:first.acceptedEpochMs,firstAcceptedMsFromTarget:first.acceptedEpochMs-target,firstRpcLatencyMs:first.latencyMs,
      receiptObservedEpochMs:receiptSeen.observedAtEpochMs,receiptObservedMsFromTarget:receiptSeen.observedAtEpochMs-target,receiptRpcIndex:receiptSeen.index,blockNumber,
      fingerprint:prepared.fingerprint,nonce:prepared.nonce,gasLimit:String(prepared.gasLimit),maxFeePerGas:String(prepared.maxFeePerGas),maxPriorityFeePerGas:String(prepared.maxPriorityFeePerGas),simulation:prepared.simulation,
    },
  };
}

export { ZERO as RACE_ZERO_ADDRESS };
