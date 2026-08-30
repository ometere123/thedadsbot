import test from 'node:test';
import assert from 'node:assert/strict';
import {executePlanWithPrivateKey} from '../packages/core/src/execution-engine.js';

const plan={adapter:'seadrop-v1-public',verification:'deterministic',stageStatus:'UPCOMING',chainId:8453,to:'0x00005EA00Ac477B1030CE78506496e8C2dE24bf5',data:'0x161ac21f',value:'1',nftContract:'0x1111111111111111111111111111111111111111',recipient:'0x2222222222222222222222222222222222222222',quantity:1,allowedTargets:['0x00005EA00Ac477B1030CE78506496e8C2dE24bf5'],allowedSelectors:['0x161ac21f'],maxValueWei:'1'};

test('execution refuses non-open deterministic stage before signing',async()=>{await assert.rejects(()=>executePlanWithPrivateKey({privateKey:'0x00',plan,rpcUrls:['https://example.invalid'],limits:{maxMintValueWei:'1',maxNetworkFeeWei:'1',maxTotalSpendWei:'2'},mode:'AUTO',confirmed:true}),/requires OPEN/);});

test('AUTO requires explicit spend ceilings before signer import',async()=>{const open={...plan,stageStatus:'OPEN'};await assert.rejects(()=>executePlanWithPrivateKey({privateKey:'0x00',plan:open,rpcUrls:['https://example.invalid'],limits:{},mode:'AUTO',confirmed:true}),/requires explicit max mint/);});
