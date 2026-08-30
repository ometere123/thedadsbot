#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import {
  benchmarkRpcs, buildMintTransaction, buildPublicMintPlan, chainByKey, classifyOpenSeaPlan,
  createInstantApiKey, defaultRaceGasLimit, executePlanWithPrivateKey, getDrop, getEligibility,
  launchPreparedRaceTransaction, listChains, listDrops, loadVault, prepareRaceTransaction,
  readPublicDrop, redactVault, rpcUrlsFor, saveVault, waitUntilEpoch, warmRpcConnections
} from '../../core/src/index.js';

const DATA_DIR=path.resolve('.data');
const AUTH_FILE=path.join(DATA_DIR,'opensea-auth.json');
const KEY_FILE=path.join(DATA_DIR,'opensea-api.json');

function out(value){console.log(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2));}
function flag(args,name,def){const i=args.indexOf(name);return i>=0?(args[i+1]??true):def;}
function has(args,name){return args.includes(name);}
function cleanArgs(args){const skip=new Set();for(let i=0;i<args.length;i++)if(args[i].startsWith('--')){skip.add(i);if(args[i+1]&&!args[i+1].startsWith('--'))skip.add(i+1);}return args.filter((_,i)=>!skip.has(i));}
function csv(value){return String(value||'').split(',').map(x=>x.trim()).filter(Boolean);}
async function hidden(prompt){return new Promise(resolve=>{const stdin=process.stdin,stdout=process.stdout;stdout.write(prompt);let value='';if(!stdin.isTTY){const rl=readline.createInterface({input:stdin});rl.once('line',x=>{rl.close();resolve(x.trim());});return;}stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');const onData=c=>{if(c==='\r'||c==='\n'){stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);stdout.write('\n');resolve(value);}else if(c==='\u0003'){process.exit(130);}else if(c==='\u007f')value=value.slice(0,-1);else value+=c;};stdin.on('data',onData);});}
async function prompt(question){const rl=readline.createInterface({input:process.stdin,output:process.stdout});return new Promise(r=>rl.question(question,a=>{rl.close();r(a.trim());}));}
async function savePrivateJson(file,data){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,JSON.stringify(data,(_,v)=>typeof v==='bigint'?v.toString():v,2),{mode:0o600});try{await fs.chmod(file,0o600);}catch{}}
async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function getApiKey(){if(process.env.OPENSEA_API_KEY)return process.env.OPENSEA_API_KEY;try{const d=await readJson(KEY_FILE);return d.apiKey||d.api_key||d.key||d.token;}catch{return undefined;}}
async function getWalletJwt(){if(process.env.OPENSEA_WALLET_JWT)return process.env.OPENSEA_WALLET_JWT;try{return (await readJson(AUTH_FILE)).accessToken;}catch{return undefined;}}
async function openVault(file){const password=await hidden('Vault password: ');return loadVault(file,password);}
async function walletFromVault(file,index=0){const vault=await openVault(file);const w=(vault.wallets||[])[Number(index)];if(!w?.privateKey)throw new Error(`wallet ${index} not found in vault`);return w;}
async function deriveAddress(privateKey){const {privateKeyToAccount}=await import('viem/accounts');return privateKeyToAccount(privateKey).address;}
function weiArg(v,name){if(v==null)return undefined;try{return BigInt(v);}catch{throw new Error(`${name} must be integer wei`);}}
function intArg(v,name,{min=0,max=Number.MAX_SAFE_INTEGER}={}){const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error(`${name} must be an integer from ${min} to ${max}`);return n;}
function help(){console.log(`TheDadBot CLI

  thedadbot doctor
  thedadbot chains
  thedadbot rpc benchmark <chain|url1,url2,...>

  thedadbot vault create [file]
  thedadbot vault add [file]
  thedadbot vault list [file]

  thedadbot opensea key
  thedadbot opensea auth [vault]
  thedadbot opensea drops [upcoming|featured|recently_minted] [chain]
  thedadbot opensea drop <slug>
  thedadbot opensea eligibility <slug>
  thedadbot opensea mint-plan <slug> <chain> <nft> <quantity> <minter>

  thedadbot plan seadrop <chain> <nft> <quantity> [--recipient 0x...] [--fee-recipient 0x...]
  thedadbot mint seadrop <chain> <nft> <quantity> [--vault file] [--wallet 0] [--auto] [--wait]
      [--max-mint-wei N] [--max-gas-wei N] [--max-total-wei N] [--reserve-wei N]

  thedadbot race seadrop <chain> <nft> <quantity> [--vault file] [--wallet 0]
      --max-gas-wei N --max-total-wei N [--max-mint-wei N] [--reserve-wei N]
      [--gas-limit N] [--fee-multiplier-bps 12500] [--priority-multiplier-bps 12500]
      [--tx-max-fee-wei N] [--tx-priority-fee-wei N]
      [--arm-ms 3000] [--warm-lead-ms 600] [--launch-offset-ms 0] [--spin-ms 4]
      [--rpc url1,url2] [--broadcast-rpc url1,url2] [--report .data/race-last.json]

Race Mode is deterministic SeaDrop only. It signs shortly before launch and holds the exact raw tx so T=0 only performs parallel broadcast.
Private keys are never accepted as command arguments or .env values.`);}

async function cmdDoctor(){const rows=[];for(const c of listChains()){const urls=rpcUrlsFor(c);if(!urls.length){rows.push({chain:c.name,id:c.id,status:'no RPC configured'});continue;}const bench=await benchmarkRpcs(urls,{timeoutMs:3500});rows.push({chain:c.name,id:c.id,best:bench.find(x=>x.ok)||bench[0]});}out({product:'TheDadBot',node:process.version,agentPort:Number(process.env.THEDADBOT_AGENT_PORT||47831),chains:rows,openseaApiKey:Boolean(await getApiKey()),walletJwt:Boolean(await getWalletJwt())});}

async function cmdVault(args){
  const action=args[1],file=args[2]||'wallets.enc.json';
  if(action==='create'){
    const password=await hidden('New vault password (12+ chars): '),pk=await hidden('Private key to encrypt (never stored in .env): '),address=await deriveAddress(pk),label=(await prompt(`Label [${address.slice(0,10)}]: `))||'wallet-1';
    await saveVault(file,{version:1,createdAt:new Date().toISOString(),wallets:[{label,address,privateKey:pk,enabled:true}]},password);console.log(`Created encrypted vault ${file}; ${address} added.`);return;
  }
  if(action==='add'){
    const password=await hidden('Vault password: '),payload=await loadVault(file,password),pk=await hidden('Private key to encrypt (never stored in .env): '),address=await deriveAddress(pk),label=(await prompt(`Label [${address.slice(0,10)}]: `))||`wallet-${(payload.wallets||[]).length+1}`;
    payload.wallets=payload.wallets||[];payload.wallets.push({label,address,privateKey:pk,enabled:true});await saveVault(file,payload,password);console.log(`Updated encrypted vault ${file}; ${address} added.`);return;
  }
  if(action==='list'){const payload=await openVault(file);return out(redactVault(payload));}
  throw new Error('vault command must be create, add or list');
}

async function cmdOpenSea(args){const action=args[1],apiKey=await getApiKey();if(action==='key'){const response=await createInstantApiKey();const value=response.api_key||response.apiKey||response.key||response.token;if(!value)throw new Error('OpenSea returned an unrecognised instant-key response');await savePrivateJson(KEY_FILE,{apiKey:value,createdAt:new Date().toISOString(),rawMetadata:Object.fromEntries(Object.entries(response).filter(([k])=>!['api_key','apiKey','key','token'].includes(k)))});console.log(`OpenSea key saved with private file permissions at ${KEY_FILE}.`);return;}
 if(action==='auth'){if(!apiKey)throw new Error('create/configure an OpenSea API key first');const file=args[2]||'wallets.enc.json',w=await walletFromVault(file,0);const [{Wallet},{OpenSeaAuth}]=await Promise.all([import('ethers'),import('@opensea/sdk')]);const signer=new Wallet(w.privateKey);const auth=new OpenSeaAuth();const token=await auth.authenticate(signer,{scopes:['read:eligibility']});await savePrivateJson(AUTH_FILE,{accessToken:token.accessToken,createdAt:new Date().toISOString(),address:w.address,scope:'read:eligibility'});console.log(`Wallet-scoped OpenSea JWT saved at ${AUTH_FILE}. The private key was not stored.`);return;}
 if(action==='drops')return out(await listDrops({type:args[2]||'upcoming',chains:args[3]?[args[3]]:[],apiKey}));
 if(action==='drop')return out(await getDrop(args[2],{apiKey}));
 if(action==='eligibility')return out(await getEligibility(args[2],{apiKey,token:await getWalletJwt()}));
 if(action==='mint-plan'){const [, ,slug,chainInput,nft,quantity,minter]=args;const chain=chainByKey(chainInput);if(!chain)throw new Error('unknown chain');const apiPayload=await buildMintTransaction(slug,{minter,quantity:Number(quantity),apiKey});return out({apiPayload,plan:classifyOpenSeaPlan({apiPayload,chainId:chain.id,nftContract:nft,recipient:minter,quantity:Number(quantity)})});}
 throw new Error('unknown opensea command');}

async function planSeaDrop(chainInput,nft,quantity,{recipient,feeRecipient,rpcUrls}={}){const chain=chainByKey(chainInput);if(!chain)throw new Error(`unknown chain ${chainInput}`);const urls=rpcUrls?.length?rpcUrls:rpcUrlsFor(chain);if(!urls.length)throw new Error(`${chain.name}: configure at least one RPC in ${chain.env}`);const drop=await readPublicDrop(urls,nft);const plan=buildPublicMintPlan({chainId:chain.id,nftContract:nft,quantity:Number(quantity),drop,feeRecipient,recipient,payer:recipient});return {chain,urls,drop,plan};}

async function cmdPlan(args){if(args[1]!=='seadrop')throw new Error('only plan seadrop is currently deterministic');const pos=cleanArgs(args);const [, ,chain,nft,quantity]=pos;const x=await planSeaDrop(chain,nft,quantity,{recipient:flag(args,'--recipient'),feeRecipient:flag(args,'--fee-recipient')});return out({chain:x.chain,drop:x.drop,plan:x.plan});}

async function cmdMint(args){
  if(args[1]!=='seadrop')throw new Error('use OpenSea mint-plan for non-public/opaque drop stages');const pos=cleanArgs(args);const [, ,chainInput,nft,quantity]=pos;
  const vaultFile=flag(args,'--vault','wallets.enc.json'),walletIndex=Number(flag(args,'--wallet',0)),auto=has(args,'--auto'),w=await walletFromVault(vaultFile,walletIndex);
  let x=await planSeaDrop(chainInput,nft,quantity,{recipient:w.address});const start=x.drop.startTime||0,now=Math.floor(Date.now()/1000);
  if(start>now){console.log(`Stage opens ${new Date(start*1000).toISOString()}. Warming RPCs now.`);out(await benchmarkRpcs(x.urls));if(!has(args,'--wait'))throw new Error('stage is not open; pass --wait to remain armed until launch');await waitUntilEpoch(start*1000,{spinMs:0});x=await planSeaDrop(chainInput,nft,quantity,{recipient:w.address,rpcUrls:x.urls});}
  if(x.plan.stageStatus!=='OPEN')throw new Error(`stage is ${x.plan.stageStatus}; SAFE execution requires OPEN`);
  if(auto&&(flag(args,'--max-gas-wei')==null||flag(args,'--max-total-wei')==null))throw new Error('AUTO requires --max-gas-wei and --max-total-wei; --max-mint-wei defaults to the validated mint value');
  const limits={maxMintValueWei:weiArg(flag(args,'--max-mint-wei',x.plan.value),'max mint'),maxNetworkFeeWei:weiArg(flag(args,'--max-gas-wei'),'max gas'),maxTotalSpendWei:weiArg(flag(args,'--max-total-wei'),'max total'),balanceReserveWei:weiArg(flag(args,'--reserve-wei',0),'reserve')};
  let confirmed=auto;if(!auto){console.log('Validated deterministic plan:');out({chain:x.chain.name,target:x.plan.to,nft:x.plan.nftContract,quantity:x.plan.quantity,valueWei:x.plan.value,verification:x.plan.verification});confirmed=(await prompt('Type MINT to sign and broadcast: '))==='MINT';}
  const result=await executePlanWithPrivateKey({privateKey:w.privateKey,plan:{...x.plan,recipient:w.address,payer:w.address},rpcUrls:x.urls,limits,mode:auto?'AUTO':'CONFIRM',confirmed});out(result);
}

async function cmdRace(args){
  if(args[1]!=='seadrop')throw new Error('Race Mode currently supports deterministic SeaDrop public stages only');
  const pos=cleanArgs(args),[, ,chainInput,nft,quantityRaw]=pos,quantity=intArg(quantityRaw,'quantity',{min:1,max:100});
  const chain=chainByKey(chainInput);if(!chain)throw new Error(`unknown chain ${chainInput}`);
  const vaultFile=flag(args,'--vault','wallets.enc.json'),walletIndex=intArg(flag(args,'--wallet',0),'wallet index'),w=await walletFromVault(vaultFile,walletIndex);
  const configured=csv(flag(args,'--rpc')).length?csv(flag(args,'--rpc')):rpcUrlsFor(chain);if(!configured.length)throw new Error(`${chain.name}: configure RPCs before racing`);
  console.log(`Benchmarking ${configured.length} RPC endpoint(s) for ${chain.name}...`);
  const bench=await benchmarkRpcs(configured,{timeoutMs:2500}),healthy=bench.filter(x=>x.ok&&Number(x.chainId)===Number(chain.id));
  if(!healthy.length)throw new Error('no healthy RPC matched the target chain');
  const readRpcs=healthy.map(x=>x.url),explicitBroadcast=csv(flag(args,'--broadcast-rpc')),broadcastRpcs=explicitBroadcast.length?explicitBroadcast:readRpcs;
  out({raceRpcOrder:healthy.map(x=>({url:x.url,latencyMs:x.latencyMs,headLag:x.headLag}))});

  const maxGas=flag(args,'--max-gas-wei'),maxTotal=flag(args,'--max-total-wei');if(maxGas==null||maxTotal==null)throw new Error('Race Mode requires --max-gas-wei and --max-total-wei');
  const armMs=intArg(flag(args,'--arm-ms',3000),'arm ms',{min:750,max:15000}),warmLeadMs=intArg(flag(args,'--warm-lead-ms',600),'warm lead ms',{min:0,max:3000});
  const launchOffsetMs=intArg(flag(args,'--launch-offset-ms',0),'launch offset ms',{min:0,max:5000}),spinMs=intArg(flag(args,'--spin-ms',4),'spin ms',{min:0,max:10});
  const feeMultiplierBps=intArg(flag(args,'--fee-multiplier-bps',12500),'fee multiplier bps',{min:10000,max:50000}),priorityMultiplierBps=intArg(flag(args,'--priority-multiplier-bps',12500),'priority multiplier bps',{min:10000,max:50000});
  const gasLimitFlag=flag(args,'--gas-limit'),gasLimit=gasLimitFlag==null?defaultRaceGasLimit(quantity):weiArg(gasLimitFlag,'gas limit');

  // Resolve once to learn the launch, then deliberately re-read and rebuild only
  // inside the short arming window so price/recipient state is not signed hours early.
  let x=await planSeaDrop(chainInput,nft,quantity,{recipient:w.address,rpcUrls:readRpcs});
  if(x.plan.stageStatus==='ENDED')throw new Error('mint stage already ended');
  while(x.plan.stageStatus==='UPCOMING'&&x.plan.startTime*1000-Date.now()>armMs){
    const armAt=x.plan.startTime*1000-armMs;console.log(`FCFS stage ${new Date(x.plan.startTime*1000).toISOString()}; sleeping until ${armMs}ms arming window.`);
    await waitUntilEpoch(armAt,{spinMs:0});x=await planSeaDrop(chainInput,nft,quantity,{recipient:w.address,rpcUrls:readRpcs});if(x.plan.stageStatus==='ENDED')throw new Error('mint stage ended while arming');
  }

  const limits={maxMintValueWei:weiArg(flag(args,'--max-mint-wei',x.plan.value),'max mint'),maxNetworkFeeWei:weiArg(maxGas,'max gas'),maxTotalSpendWei:weiArg(maxTotal,'max total'),balanceReserveWei:weiArg(flag(args,'--reserve-wei',0),'reserve')};
  const prepared=await prepareRaceTransaction({
    privateKey:w.privateKey,plan:{...x.plan,recipient:w.address,payer:w.address},rpcUrls:readRpcs,limits,gasLimit,
    feeMultiplierBps,priorityMultiplierBps,maxFeePerGasWei:weiArg(flag(args,'--tx-max-fee-wei'),'tx max fee'),maxPriorityFeePerGasWei:weiArg(flag(args,'--tx-priority-fee-wei'),'tx priority fee'),
    maxPreparedAgeMs:Math.max(15000,armMs+7000)
  });
  const target=Math.max(Date.now(),prepared.plan.startTime*1000+launchOffsetMs);
  console.log('RACE ARMED — raw transaction is signed locally and held. Nothing expensive remains at T=0.');
  out({wallet:prepared.account,txHash:prepared.txHash,fingerprint:prepared.fingerprint,target:new Date(target).toISOString(),nonce:prepared.nonce,gasLimit:prepared.gasLimit,maxFeePerGas:prepared.maxFeePerGas,maxPriorityFeePerGas:prepared.maxPriorityFeePerGas,simulation:prepared.simulation,broadcastRpcs});

  await warmRpcConnections(broadcastRpcs,{timeoutMs:800});
  if(warmLeadMs&&target-Date.now()>warmLeadMs+300){await waitUntilEpoch(target-warmLeadMs,{spinMs:0});await warmRpcConnections(broadcastRpcs,{timeoutMs:Math.min(250,Math.max(80,warmLeadMs-100))});}
  const result=await launchPreparedRaceTransaction({prepared,broadcastRpcUrls:broadcastRpcs,triggerAtEpochMs:target,spinMs,launchOffsetMs:0});
  const report=flag(args,'--report',path.join(DATA_DIR,'race-last.json'));await savePrivateJson(report,{createdAt:new Date().toISOString(),chain:x.chain,bench:healthy,txHash:result.hash,telemetry:result.telemetry,broadcasts:result.broadcasts,post:result.post});
  console.log(`Race report saved to ${report}`);out(result);
}

const args=process.argv.slice(2);try{
  if(!args.length||has(args,'--help')||has(args,'-h'))help();
  else if(args[0]==='doctor')await cmdDoctor();
  else if(args[0]==='chains')out(listChains());
  else if(args[0]==='rpc'&&args[1]==='benchmark'){const input=args[2];const chain=chainByKey(input);const urls=chain?rpcUrlsFor(chain):csv(input);out(await benchmarkRpcs(urls));}
  else if(args[0]==='vault')await cmdVault(args);
  else if(args[0]==='opensea')await cmdOpenSea(args);
  else if(args[0]==='plan')await cmdPlan(args);
  else if(args[0]==='mint')await cmdMint(args);
  else if(args[0]==='race')await cmdRace(args);
  else help();
}catch(e){console.error(`${e.name||'Error'}: ${e.message}`);process.exitCode=1;}
