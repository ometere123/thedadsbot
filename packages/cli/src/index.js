#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import {
  benchmarkRpcs, buildMintTransaction, buildPublicMintPlan, chainByKey, classifyOpenSeaPlan,
  createInstantApiKey, executePlanWithPrivateKey, getDrop, getEligibility, listChains, listDrops,
  loadVault, readPublicDrop, redactVault, rpcUrlsFor, saveVault
} from '../../core/src/index.js';

const DATA_DIR=path.resolve('.data');
const AUTH_FILE=path.join(DATA_DIR,'opensea-auth.json');
const KEY_FILE=path.join(DATA_DIR,'opensea-api.json');
const ZERO='0x0000000000000000000000000000000000000000';

function out(value){console.log(JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2));}
function flag(args,name,def){const i=args.indexOf(name);return i>=0?(args[i+1]??true):def;}
function has(args,name){return args.includes(name);}
function cleanArgs(args){const skip=new Set();for(let i=0;i<args.length;i++)if(args[i].startsWith('--')){skip.add(i);if(args[i+1]&&!args[i+1].startsWith('--'))skip.add(i+1);}return args.filter((_,i)=>!skip.has(i));}
async function hidden(prompt){return new Promise(resolve=>{const stdin=process.stdin,stdout=process.stdout;stdout.write(prompt);let value='';if(!stdin.isTTY){const rl=readline.createInterface({input:stdin});rl.once('line',x=>{rl.close();resolve(x.trim());});return;}stdin.setRawMode(true);stdin.resume();stdin.setEncoding('utf8');const onData=c=>{if(c==='\r'||c==='\n'){stdin.setRawMode(false);stdin.pause();stdin.off('data',onData);stdout.write('\n');resolve(value);}else if(c==='\u0003'){process.exit(130);}else if(c==='\u007f'){value=value.slice(0,-1);}else value+=c;};stdin.on('data',onData);});}
async function prompt(question){const rl=readline.createInterface({input:process.stdin,output:process.stdout});return new Promise(r=>rl.question(question,a=>{rl.close();r(a.trim());}));}
async function savePrivateJson(file,data){await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});await fs.writeFile(file,JSON.stringify(data,null,2),{mode:0o600});try{await fs.chmod(file,0o600);}catch{}}
async function readJson(file){return JSON.parse(await fs.readFile(file,'utf8'));}
async function getApiKey(){if(process.env.OPENSEA_API_KEY)return process.env.OPENSEA_API_KEY;try{const d=await readJson(KEY_FILE);return d.apiKey||d.api_key||d.key||d.token;}catch{return undefined;}}
async function getWalletJwt(){if(process.env.OPENSEA_WALLET_JWT)return process.env.OPENSEA_WALLET_JWT;try{return (await readJson(AUTH_FILE)).accessToken;}catch{return undefined;}}
async function openVault(file){const password=await hidden('Vault password: ');return loadVault(file,password);}
async function walletFromVault(file,index=0){const vault=await openVault(file);const w=(vault.wallets||[])[Number(index)];if(!w?.privateKey)throw new Error(`wallet ${index} not found in vault`);return w;}
async function deriveAddress(privateKey){const {privateKeyToAccount}=await import('viem/accounts');return privateKeyToAccount(privateKey).address;}
function weiArg(v,name){if(v==null)return undefined;try{return BigInt(v);}catch{throw new Error(`${name} must be integer wei`);}}
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
  thedadbot mint seadrop <chain> <nft> <quantity> [--vault file] [--wallet 0] [--auto]
      [--max-mint-wei N] [--max-gas-wei N] [--max-total-wei N] [--reserve-wei N]

Private keys are never accepted as command arguments or .env values.`);}

async function cmdDoctor(){const rows=[];for(const c of listChains()){const urls=rpcUrlsFor(c);if(!urls.length){rows.push({chain:c.name,id:c.id,status:'no RPC configured'});continue;}const bench=await benchmarkRpcs(urls,{timeoutMs:3500});rows.push({chain:c.name,id:c.id,best:bench.find(x=>x.ok)||bench[0]});}out({product:'TheDadBot',node:process.version,agentPort:Number(process.env.THEDADBOT_AGENT_PORT||47831),chains:rows,openseaApiKey:Boolean(await getApiKey()),walletJwt:Boolean(await getWalletJwt())});}

async function cmdVault(args){const action=args[1],file=args[2]||'wallets.enc.json';if(action==='create'||action==='add'){let payload={version:1,createdAt:new Date().toISOString(),wallets:[]},password;if(action==='add'){password=await hidden('Vault password: ');payload=await loadVault(file,password);}else password=await hidden('New vault password (12+ chars): ');const pk=await hidden('Private key to encrypt (never stored in .env): ');const address=await deriveAddress(pk);const label=(await prompt(`Label [${address.slice(0,10)}]: `))||`wallet-${payload.wallets.length+1}`;payload.wallets.push({label,address,privateKey:pk,enabled:true});await saveVault(file,payload,password);console.log(`${action==='create'?'Created':'Updated'} encrypted vault ${file}; ${address} added.`);return;}if(action==='list'){const payload=await openVault(file);return out(redactVault(payload));}throw new Error('vault command must be create, add or list');}

async function cmdOpenSea(args){const action=args[1],apiKey=await getApiKey();if(action==='key'){const response=await createInstantApiKey();const value=response.api_key||response.apiKey||response.key||response.token;if(!value)throw new Error('OpenSea returned an unrecognised instant-key response');await savePrivateJson(KEY_FILE,{apiKey:value,createdAt:new Date().toISOString(),rawMetadata:Object.fromEntries(Object.entries(response).filter(([k])=>!['api_key','apiKey','key','token'].includes(k)))});console.log(`OpenSea key saved with private file permissions at ${KEY_FILE}.`);return;}
 if(action==='auth'){if(!apiKey)throw new Error('create/configure an OpenSea API key first');const file=args[2]||'wallets.enc.json',w=await walletFromVault(file,0);const [{Wallet},{OpenSeaAuth}]=await Promise.all([import('ethers'),import('@opensea/sdk')]);const signer=new Wallet(w.privateKey);const auth=new OpenSeaAuth();const token=await auth.authenticate(signer,{scopes:['read:eligibility']});await savePrivateJson(AUTH_FILE,{accessToken:token.accessToken,createdAt:new Date().toISOString(),address:w.address,scope:'read:eligibility'});console.log(`Wallet-scoped OpenSea JWT saved at ${AUTH_FILE}. The private key was not stored.`);return;}
 if(action==='drops'){return out(await listDrops({type:args[2]||'upcoming',chains:args[3]?[args[3]]:[],apiKey}));}
 if(action==='drop'){return out(await getDrop(args[2],{apiKey}));}
 if(action==='eligibility'){return out(await getEligibility(args[2],{apiKey,token:await getWalletJwt()}));}
 if(action==='mint-plan'){const [, ,slug,chainInput,nft,quantity,minter]=args;const chain=chainByKey(chainInput);if(!chain)throw new Error('unknown chain');const apiPayload=await buildMintTransaction(slug,{minter,quantity:Number(quantity),apiKey});return out({apiPayload,plan:classifyOpenSeaPlan({apiPayload,chainId:chain.id,nftContract:nft,recipient:minter,quantity:Number(quantity)})});}
 throw new Error('unknown opensea command');}

async function planSeaDrop(chainInput,nft,quantity,{recipient,feeRecipient}={}){const chain=chainByKey(chainInput);if(!chain)throw new Error(`unknown chain ${chainInput}`);const urls=rpcUrlsFor(chain);if(!urls.length)throw new Error(`${chain.name}: configure at least one RPC in ${chain.env}`);const drop=await readPublicDrop(urls,nft);const plan=buildPublicMintPlan({chainId:chain.id,nftContract:nft,quantity:Number(quantity),drop,feeRecipient,recipient,payer:recipient});return {chain,urls,drop,plan};}

async function cmdPlan(args){if(args[1]!=='seadrop')throw new Error('only plan seadrop is currently deterministic');const pos=cleanArgs(args);const [, ,chain,nft,quantity]=pos;const x=await planSeaDrop(chain,nft,quantity,{recipient:flag(args,'--recipient'),feeRecipient:flag(args,'--fee-recipient')});return out({chain:x.chain,drop:x.drop,plan:x.plan});}

async function cmdMint(args){if(args[1]!=='seadrop')throw new Error('use OpenSea mint-plan for non-public/opaque drop stages');const pos=cleanArgs(args);const [, ,chainInput,nft,quantity]=pos;const vaultFile=flag(args,'--vault','wallets.enc.json'),walletIndex=Number(flag(args,'--wallet',0)),auto=has(args,'--auto');const w=await walletFromVault(vaultFile,walletIndex);const x=await planSeaDrop(chainInput,nft,quantity,{recipient:w.address});const start=x.drop.startTime||0,now=Math.floor(Date.now()/1000);if(start>now){const ms=(start-now)*1000;console.log(`Stage opens ${new Date(start*1000).toISOString()}. Warming RPCs now; calldata is already fixed.`);out(await benchmarkRpcs(x.urls));if(!has(args,'--wait'))throw new Error('stage is not open; pass --wait to remain armed until launch');while(Date.now()<start*1000-350)await new Promise(r=>setTimeout(r,Math.min(1000,start*1000-Date.now())));}
 if(auto&&(flag(args,'--max-gas-wei')==null||flag(args,'--max-total-wei')==null))throw new Error('AUTO requires --max-gas-wei and --max-total-wei; --max-mint-wei defaults to the validated mint value');
 const limits={maxMintValueWei:weiArg(flag(args,'--max-mint-wei',x.plan.value),'max mint'),maxNetworkFeeWei:weiArg(flag(args,'--max-gas-wei'),'max gas'),maxTotalSpendWei:weiArg(flag(args,'--max-total-wei'),'max total'),balanceReserveWei:weiArg(flag(args,'--reserve-wei',0),'reserve')};
 let confirmed=auto;if(!auto){console.log('Validated deterministic plan:');out({chain:x.chain.name,target:x.plan.to,nft:x.plan.nftContract,quantity:x.plan.quantity,valueWei:x.plan.value,verification:x.plan.verification});confirmed=(await prompt('Type MINT to sign and broadcast: '))==='MINT';}
 const result=await executePlanWithPrivateKey({privateKey:w.privateKey,plan:{...x.plan,recipient:w.address,payer:w.address},rpcUrls:x.urls,limits,mode:auto?'AUTO':'CONFIRM',confirmed});out(result);}

const args=process.argv.slice(2);try{if(!args.length||has(args,'--help')||has(args,'-h'))help();else if(args[0]==='doctor')await cmdDoctor();else if(args[0]==='chains')out(listChains());else if(args[0]==='rpc'&&args[1]==='benchmark'){const input=args[2];const chain=chainByKey(input);const urls=chain?rpcUrlsFor(chain):String(input||'').split(',').filter(Boolean);out(await benchmarkRpcs(urls));}else if(args[0]==='vault')await cmdVault(args);else if(args[0]==='opensea')await cmdOpenSea(args);else if(args[0]==='plan')await cmdPlan(args);else if(args[0]==='mint')await cmdMint(args);else help();}catch(e){console.error(`${e.name||'Error'}: ${e.message}`);process.exitCode=1;}
