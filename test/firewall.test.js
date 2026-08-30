import test from 'node:test';import assert from 'node:assert/strict';
import {MINT_PUBLIC_SELECTOR,decodeSeaDropPublicCalldata,validateIntent,validateSeaDropPublicIntent} from '../packages/core/src/intent-firewall.js';
import {SEADROP_V1,OPENSEA_FEE_RECIPIENT} from '../packages/core/src/chains.js';
import {wordAddress,wordUint} from '../packages/core/src/hex.js';
const nft='0x1111111111111111111111111111111111111111',wallet='0x2222222222222222222222222222222222222222';
function data(q=2){return MINT_PUBLIC_SELECTOR+wordAddress(nft)+wordAddress(OPENSEA_FEE_RECIPIENT)+wordAddress('0x0000000000000000000000000000000000000000')+wordUint(q);}
test('generic intent accepts exact target/selector/value',()=>{const tx={chainId:8453,to:SEADROP_V1,data:data(),value:'100'};assert.equal(validateIntent({chainId:8453,allowedTargets:[SEADROP_V1],allowedSelectors:[MINT_PUBLIC_SELECTOR],maxValueWei:'100'},tx).ok,true);});
test('generic intent rejects target substitution',()=>assert.throws(()=>validateIntent({chainId:8453,allowedTargets:[SEADROP_V1]},{chainId:8453,to:nft,data:'0x',value:'0'}),/not authorised/));
test('opaque plan cannot use AUTO',()=>assert.throws(()=>validateIntent({chainId:1,allowedTargets:[nft],verification:'opaque',mode:'AUTO'},{chainId:1,to:nft,data:'0x12345678',value:'0'}),/cannot run unattended/));
test('SeaDrop decoder binds NFT, fee and quantity',()=>{const x=decodeSeaDropPublicCalldata(data(3));assert.equal(x.nftContract.toLowerCase(),nft);assert.equal(x.feeRecipient.toLowerCase(),OPENSEA_FEE_RECIPIENT.toLowerCase());assert.equal(x.quantity,3);});
test('SeaDrop intent rejects calldata NFT substitution',()=>{const tx={chainId:8453,to:SEADROP_V1,data:data(1),value:'10',nftContract:nft,recipient:wallet,quantity:1};assert.throws(()=>validateSeaDropPublicIntent({...tx,nftContract:'0x3333333333333333333333333333333333333333',payer:wallet,allowedTargets:[SEADROP_V1],maxValueWei:'10'},tx),/NFT contract mismatch/);});
