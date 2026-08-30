const SEADROP='0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';
export const OPENSEA_FEE_RECIPIENT='0x0000a26b00c1F0DF003000390027140000fAa719';
const GET_PUBLIC='0xbc6a629c';
const GET_FEES='0x68632274';
const MINT_PUBLIC='0x161ac21f';
const ERC721_TRANSFER='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const CHAINS=new Map([
  [1,'Ethereum'],[8453,'Base'],[4663,'Robinhood Chain'],[46630,'Robinhood Testnet'],
  [42161,'Arbitrum One'],[10,'Optimism'],[137,'Polygon'],[7777777,'Zora'],
]);

export const BUILT_IN_CHAINS=[
  ['Ethereum','1'],['Base','8453'],['Robinhood','4663'],['Arbitrum','42161'],
  ['Optimism','10'],['Polygon','137'],['Zora','7777777'],['Custom EVM','registry'],
];

function provider(){
  if(!window.ethereum)throw new Error('No injected EVM wallet detected. Install or open an injected wallet such as MetaMask or Rabby.');
  return window.ethereum;
}

export async function request(method,params=[]){return provider().request({method,params});}
export function hasInjectedWallet(){return Boolean(window.ethereum);}
export function chainName(id){return CHAINS.get(Number(id))||`EVM ${id}`;}
export function shortAddress(value){return value?`${value.slice(0,6)}…${value.slice(-4)}`:'Not connected';}

function address(value){
  if(!/^0x[0-9a-fA-F]{40}$/.test(value||''))throw new Error('Invalid EVM address');
  return value;
}
function strip(value){return value.replace(/^0x/,'');}
function wordAddress(value){return strip(address(value)).toLowerCase().padStart(64,'0');}
function wordUint(value){return BigInt(value).toString(16).padStart(64,'0');}
function readWord(hex,index){
  const raw=strip(hex);
  const value=raw.slice(index*64,(index+1)*64);
  if(value.length!==64)throw new Error('Short ABI response');
  return value;
}
function wordBig(hex,index){return BigInt(`0x${readWord(hex,index)}`);}
function wordAddr(hex,index){return `0x${readWord(hex,index).slice(24)}`;}
function callData(selector,target){return selector+wordAddress(target);}
function decodeAddressArray(hex){
  const offset=Number(wordBig(hex,0)/32n);
  const length=Number(wordBig(hex,offset));
  const values=[];
  for(let i=0;i<length;i++)values.push(wordAddr(hex,offset+1+i));
  return values;
}

export function formatEth(wei){
  const value=BigInt(wei||0);
  const whole=value/1000000000000000000n;
  const fraction=(value%1000000000000000000n).toString().padStart(18,'0').slice(0,6).replace(/0+$/,'');
  return `${whole}${fraction?`.${fraction}`:''} ETH`;
}

export async function walletSnapshot({requestAccounts=false}={}){
  const accounts=await request(requestAccounts?'eth_requestAccounts':'eth_accounts');
  if(!accounts?.[0])return {account:null,chainId:null,block:null};
  const [chainHex,blockHex]=await Promise.all([request('eth_chainId'),request('eth_blockNumber').catch(()=>null)]);
  return {account:accounts[0],chainId:Number(BigInt(chainHex)),block:blockHex?Number(BigInt(blockHex)):null};
}

export async function buildPublicMintPlan({account,nftContract,quantity,feeRecipient}){
  if(!account)throw new Error('Connect an injected wallet first');
  const nft=address(nftContract?.trim());
  const q=Number(quantity);
  if(!Number.isInteger(q)||q<1||q>100)throw new Error('Quantity must be an integer from 1 to 100');
  const requestedFee=address((feeRecipient||OPENSEA_FEE_RECIPIENT).trim());
  const chainId=Number(BigInt(await request('eth_chainId')));
  const code=await request('eth_getCode',[SEADROP,'latest']);
  if(!code||code==='0x'||code==='0x0')throw new Error('Canonical SeaDrop has no deployed code on this chain');

  const [dropRaw,feesRaw]=await Promise.all([
    request('eth_call',[{to:SEADROP,data:callData(GET_PUBLIC,nft)},'latest']),
    request('eth_call',[{to:SEADROP,data:callData(GET_FEES,nft)},'latest']),
  ]);
  const drop={
    mintPrice:wordBig(dropRaw,0),
    startTime:Number(wordBig(dropRaw,1)),
    endTime:Number(wordBig(dropRaw,2)),
    maxPerWallet:Number(wordBig(dropRaw,3)),
    feeBps:Number(wordBig(dropRaw,4)),
    restricted:wordBig(dropRaw,5)!==0n,
    fees:decodeAddressArray(feesRaw),
  };
  let fee=requestedFee;
  if(drop.restricted&&!drop.fees.some(x=>x.toLowerCase()===fee.toLowerCase())){
    if(!drop.fees.length)throw new Error('Fee recipients are restricted but none were returned');
    fee=drop.fees[0];
  }
  if(drop.maxPerWallet&&q>drop.maxPerWallet)throw new Error(`Quantity exceeds the public stage max of ${drop.maxPerWallet}`);
  const data=MINT_PUBLIC+wordAddress(nft)+wordAddress(fee)+wordAddress('0x0000000000000000000000000000000000000000')+wordUint(q);
  const value=drop.mintPrice*BigInt(q);
  const now=Math.floor(Date.now()/1000);
  const stage=now<drop.startTime?'UPCOMING':drop.endTime&&now>drop.endTime?'ENDED':'OPEN';
  let simulation='Not run';
  if(stage==='OPEN'){
    await request('eth_call',[{from:account,to:SEADROP,data,value:`0x${value.toString(16)}`} ,'pending']);
    simulation='Passed';
  }else if(stage==='UPCOMING')simulation='Armed; simulation waits for opening';
  else simulation='Blocked; stage ended';
  return {verification:'deterministic',chainId,to:SEADROP,nft,fee,quantity:q,data,value,drop,stage,simulation,createdAt:new Date().toISOString()};
}

function verifyErc721Mint(receipt,nft,recipient,min){
  if(BigInt(receipt.status||0)!==1n)throw new Error('Transaction reverted');
  const to=recipient.toLowerCase();
  const contract=nft.toLowerCase();
  const rows=(receipt.logs||[]).filter(log=>{
    const topics=log.topics||[];
    return log.address?.toLowerCase()===contract&&topics[0]?.toLowerCase()===ERC721_TRANSFER&&
      topics[1]==='0x'+'0'.repeat(64)&&topics[2]&&(`0x${topics[2].slice(-40)}`).toLowerCase()===to&&topics[3];
  }).map(log=>({tokenId:BigInt(log.topics[3]).toString()}));
  if(rows.length<min)throw new Error('Receipt succeeded but the intended ERC-721 mint was not proven');
  return {ok:true,minted:rows.length,tokens:rows};
}

async function waitReceipt(hash){
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const receipt=await request('eth_getTransactionReceipt',[hash]);
    if(receipt)return receipt;
    await new Promise(resolve=>setTimeout(resolve,800));
  }
  throw new Error('Receipt timeout; the transaction may still be pending');
}

export async function sendPublicMintPlan({plan,account,onStatus=()=>{}}){
  if(!plan)throw new Error('Build and review a plan first');
  const currentChain=Number(BigInt(await request('eth_chainId')));
  if(currentChain!==plan.chainId)throw new Error('Wallet chain changed after planning');
  if(plan.stage!=='OPEN')throw new Error(`Mint stage is ${plan.stage}`);
  onStatus('Re-simulating immediately before signature');
  await request('eth_call',[{from:account,to:plan.to,data:plan.data,value:`0x${plan.value.toString(16)}`} ,'pending']);
  const gas=await request('eth_estimateGas',[{from:account,to:plan.to,data:plan.data,value:`0x${plan.value.toString(16)}`}]);
  onStatus('Waiting for wallet signature');
  const txHash=await request('eth_sendTransaction',[{from:account,to:plan.to,data:plan.data,value:`0x${plan.value.toString(16)}`,gas}]);
  onStatus(`Broadcast ${txHash}. Waiting for inclusion and NFT proof`);
  const receipt=await waitReceipt(txHash);
  const proof=verifyErc721Mint(receipt,plan.nft,account,plan.quantity);
  return {txHash,receiptStatus:receipt.status,proof};
}

function resolveAgentOrigin(){
  const raw=import.meta.env.VITE_AGENT_URL||'http://127.0.0.1:47831';
  try{
    const url=new URL(raw);
    const loopback=['127.0.0.1','localhost','::1','[::1]'].includes(url.hostname);
    if(!loopback||url.protocol!=='http:')throw new Error('agent URL must be local loopback HTTP');
    return url.origin;
  }catch{
    console.warn('Ignoring unsafe VITE_AGENT_URL; using loopback default');
    return 'http://127.0.0.1:47831';
  }
}
export const AGENT_ORIGIN=resolveAgentOrigin();

async function agentFetch(path,init){
  const response=await fetch(`${AGENT_ORIGIN}${path}`,{cache:'no-store',...init});
  let body={};
  try{body=await response.json();}catch{}
  if(!response.ok)throw new Error(body.error||`Local agent returned HTTP ${response.status}`);
  return body;
}
export async function agentHealth(){return agentFetch('/health');}
export async function agentDrops({type='upcoming',chain=''}){
  const url=new URL(`${AGENT_ORIGIN}/opensea/drops`);
  url.searchParams.set('type',type);
  if(chain.trim())url.searchParams.set('chains',chain.trim());
  const response=await fetch(url,{cache:'no-store'});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'Discovery failed');
  return body.drops||body.results||body.data||[];
}
