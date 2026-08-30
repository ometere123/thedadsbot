import { normaliseAddress } from './hex.js';
const EVENTS=[
  {type:'event',name:'Transfer',inputs:[{indexed:true,name:'from',type:'address'},{indexed:true,name:'to',type:'address'},{indexed:true,name:'tokenId',type:'uint256'}]},
  {type:'event',name:'TransferSingle',inputs:[{indexed:true,name:'operator',type:'address'},{indexed:true,name:'from',type:'address'},{indexed:true,name:'to',type:'address'},{indexed:false,name:'id',type:'uint256'},{indexed:false,name:'value',type:'uint256'}]},
  {type:'event',name:'TransferBatch',inputs:[{indexed:true,name:'operator',type:'address'},{indexed:true,name:'from',type:'address'},{indexed:true,name:'to',type:'address'},{indexed:false,name:'ids',type:'uint256[]'},{indexed:false,name:'values',type:'uint256[]'}]}
];
const ZERO='0x0000000000000000000000000000000000000000';
export async function decodeMintTransfers(receipt,{nftContract,recipient}={}){
  const {decodeEventLog}=await import('viem');const nft=nftContract&&normaliseAddress(nftContract),wanted=recipient&&normaliseAddress(recipient),out=[];
  for(const log of receipt?.logs||[]){if(nft&&normaliseAddress(log.address)!==nft)continue;let d;try{d=decodeEventLog({abi:EVENTS,data:log.data,topics:log.topics,strict:true});}catch{continue;}const from=String(d.args.from||'').toLowerCase(),to=String(d.args.to||'').toLowerCase();if(from!==ZERO|| (wanted&&to!==wanted))continue;
    if(d.eventName==='Transfer')out.push({standard:'ERC721',contract:log.address,to,tokenId:d.args.tokenId.toString(),quantity:1});
    else if(d.eventName==='TransferSingle')out.push({standard:'ERC1155',contract:log.address,to,tokenId:d.args.id.toString(),quantity:Number(d.args.value)});
    else if(d.eventName==='TransferBatch')d.args.ids.forEach((id,i)=>out.push({standard:'ERC1155',contract:log.address,to,tokenId:id.toString(),quantity:Number(d.args.values[i])}));
  }return out;
}
export async function verifyMintPostcondition(receipt,{nftContract,recipient,minQuantity=1}={}){if(!receipt||Number(BigInt(receipt.status??0))!==1)throw new Error('transaction receipt is not successful');const transfers=await decodeMintTransfers(receipt,{nftContract,recipient});const minted=transfers.reduce((n,x)=>n+Number(x.quantity||0),0);if(minted<Number(minQuantity))throw new Error('receipt succeeded but intended NFT mint was not proven');return {ok:true,minted,transfers};}
