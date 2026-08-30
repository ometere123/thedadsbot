export const SEADROP_V1 = '0x00005EA00Ac477B1030CE78506496e8C2dE24bf5';
export const OPENSEA_FEE_RECIPIENT = '0x0000a26b00c1F0DF003000390027140000fAa719';

const records = [
  { key:'ethereum', id:1, name:'Ethereum', currency:'ETH', explorer:'https://etherscan.io', env:'ETHEREUM_RPCS', opensea:'ethereum' },
  { key:'base', id:8453, name:'Base', currency:'ETH', explorer:'https://basescan.org', env:'BASE_RPCS', opensea:'base', defaultRpcs:['https://mainnet.base.org'], defaultBroadcastRpcs:['https://mainnet-preconf.base.org'] },
  { key:'robinhood', id:4663, name:'Robinhood Chain', currency:'ETH', explorer:'https://robinhoodchain.blockscout.com', env:'ROBINHOOD_RPCS', opensea:'robinhood', defaultRpcs:['https://rpc.mainnet.chain.robinhood.com'], defaultBroadcastRpcs:['https://sequencer.mainnet.chain.robinhood.com'] },
  { key:'robinhood-testnet', id:46630, name:'Robinhood Chain Testnet', currency:'ETH', explorer:'https://explorer.testnet.chain.robinhood.com', env:'ROBINHOOD_TESTNET_RPCS', defaultRpcs:['https://rpc.testnet.chain.robinhood.com'], defaultBroadcastRpcs:['https://sequencer.testnet.chain.robinhood.com'] },
  { key:'arbitrum', id:42161, name:'Arbitrum One', currency:'ETH', explorer:'https://arbiscan.io', env:'ARBITRUM_RPCS', opensea:'arbitrum' },
  { key:'optimism', id:10, name:'Optimism', currency:'ETH', explorer:'https://optimistic.etherscan.io', env:'OPTIMISM_RPCS', opensea:'optimism' },
  { key:'polygon', id:137, name:'Polygon', currency:'POL', explorer:'https://polygonscan.com', env:'POLYGON_RPCS', opensea:'matic' },
  { key:'zora', id:7777777, name:'Zora', currency:'ETH', explorer:'https://explorer.zora.energy', env:'ZORA_RPCS', opensea:'zora' }
];

export const CHAINS = Object.freeze(Object.fromEntries(records.map(x => [x.key, Object.freeze(x)])));
export function listChains(){ return Object.values(CHAINS); }
export function chainById(id){ return listChains().find(x => x.id === Number(id)); }
export function chainByKey(key){ return CHAINS[String(key).toLowerCase()] || chainById(key); }
export function rpcUrlsFor(chain, env=process.env){
  const c = typeof chain === 'object' ? chain : chainByKey(chain);
  if(!c) throw new Error(`unknown chain: ${chain}`);
  const custom = String(env[c.env] || '').split(',').map(x=>x.trim()).filter(Boolean);
  return [...new Set([...custom, ...(c.defaultRpcs || [])])];
}
export function broadcastRpcUrlsFor(chain, env=process.env){
  const c=typeof chain==='object'?chain:chainByKey(chain);if(!c)throw new Error(`unknown chain: ${chain}`);
  const key=String(c.env||'RPCS').replace(/_RPCS$/,'_BROADCAST_RPCS');
  const custom=String(env[key]||'').split(',').map(x=>x.trim()).filter(Boolean);
  return [...new Set([...custom,...(c.defaultBroadcastRpcs||[]),...rpcUrlsFor(c,env)])];
}
export function customChain({id,name='Custom EVM',currency='ETH',explorer='',rpcUrls=[],broadcastRpcUrls=[]}){
  if(!Number.isSafeInteger(Number(id)) || Number(id) <= 0) throw new Error('invalid custom chain id');
  return Object.freeze({key:`custom-${id}`,id:Number(id),name,currency,explorer,defaultRpcs:[...rpcUrls],defaultBroadcastRpcs:[...broadcastRpcUrls]});
}
