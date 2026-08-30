import { assertAddress, assertHex, normaliseAddress, readWord, wordToAddress, wordToBigInt } from './hex.js';
import { SEADROP_V1 } from './chains.js';

export const MINT_PUBLIC_SELECTOR='0x161ac21f';
export class IntentViolation extends Error{constructor(message,field='intent'){super(message);this.name='IntentViolation';this.field=field;}}
function req(ok,msg,field){if(!ok) throw new IntentViolation(msg,field);}

export function decodeSeaDropPublicCalldata(data){
  assertHex(data,'calldata'); req(data.slice(0,10).toLowerCase()===MINT_PUBLIC_SELECTOR,'not SeaDrop mintPublic calldata','data');
  const args=`0x${data.slice(10)}`;
  return {nftContract:wordToAddress(readWord(args,0)),feeRecipient:wordToAddress(readWord(args,1)),minterIfNotPayer:wordToAddress(readWord(args,2)),quantity:Number(wordToBigInt(readWord(args,3)))};
}

export function validateIntent(intent,tx){
  req(intent&&tx,'intent and transaction are required');
  req(Number.isSafeInteger(Number(intent.chainId))&&Number(intent.chainId)>0,'invalid intended chain','chainId');
  req(Number(tx.chainId)===Number(intent.chainId),'chain mismatch','chainId');
  assertAddress(tx.to,'transaction target'); assertHex(tx.data||'0x','calldata');
  const value=BigInt(tx.value??0); req(value>=0n,'negative transaction value','value');
  const allowedTargets=new Set((intent.allowedTargets||[]).map(normaliseAddress)); req(allowedTargets.size>0,'no authorised targets configured','allowedTargets');
  req(allowedTargets.has(normaliseAddress(tx.to)),'transaction target is not authorised','to');
  if(intent.allowedSelectors?.length){const selector=(tx.data||'0x').slice(0,10).toLowerCase();req(intent.allowedSelectors.map(x=>x.toLowerCase()).includes(selector),'calldata selector is not authorised','data');}
  if(intent.maxValueWei!=null) req(value<=BigInt(intent.maxValueWei),'transaction value exceeds cap','value');
  if(intent.minValueWei!=null) req(value>=BigInt(intent.minValueWei),'transaction value below expected floor','value');
  if(intent.deadline!=null) req(Math.floor(Date.now()/1000)<=Number(intent.deadline),'intent expired','deadline');
  if(intent.quantity!=null){req(Number.isInteger(Number(intent.quantity))&&Number(intent.quantity)>0,'invalid quantity','quantity');req(Number(intent.quantity)<=Number(intent.maxQuantity??intent.quantity),'quantity exceeds configured limit','quantity');}
  if(intent.verification==='opaque') req(intent.mode!=='AUTO','opaque API transaction cannot run unattended','mode');
  return Object.freeze({ok:true,verification:intent.verification||'verified',tx:{...tx},intent:{...intent}});
}

export function validateSeaDropPublicIntent(intent,tx){
  validateIntent({...intent,allowedTargets:intent.allowedTargets?.length?intent.allowedTargets:[SEADROP_V1],allowedSelectors:[MINT_PUBLIC_SELECTOR],verification:'deterministic'},tx);
  req(normaliseAddress(tx.to)===normaliseAddress(intent.seadrop||SEADROP_V1),'unexpected SeaDrop target','to');
  const decoded=decodeSeaDropPublicCalldata(tx.data);
  req(normaliseAddress(decoded.nftContract)===normaliseAddress(intent.nftContract),'NFT contract mismatch','nftContract');
  req(Number(decoded.quantity)===Number(intent.quantity),'mint quantity mismatch','quantity');
  if(intent.feeRecipient) req(normaliseAddress(decoded.feeRecipient)===normaliseAddress(intent.feeRecipient),'fee recipient mismatch','feeRecipient');
  if(intent.recipient){ const zero='0x0000000000000000000000000000000000000000'; const effective=normaliseAddress(decoded.minterIfNotPayer)===zero?normaliseAddress(intent.payer||intent.recipient):normaliseAddress(decoded.minterIfNotPayer); req(effective===normaliseAddress(intent.recipient),'mint recipient mismatch','recipient'); }
  return {ok:true,decoded,verification:'deterministic'};
}
