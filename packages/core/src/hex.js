export const ADDRESS_RE=/^0x[0-9a-fA-F]{40}$/;
export const DATA_RE=/^0x(?:[0-9a-fA-F]{2})*$/;
export function assertAddress(v,label='address'){ if(!ADDRESS_RE.test(String(v||''))) throw new Error(`invalid ${label}`); return String(v); }
export function assertHex(v,label='hex'){ if(!DATA_RE.test(String(v||''))) throw new Error(`invalid ${label}`); return String(v); }
export function strip0x(v){ return String(v).replace(/^0x/,''); }
export function wordAddress(address){ assertAddress(address); return strip0x(address).toLowerCase().padStart(64,'0'); }
export function wordUint(value){ const n=BigInt(value); if(n<0n) throw new Error('negative uint'); return n.toString(16).padStart(64,'0'); }
export function readWord(hex,index){ const raw=strip0x(assertHex(hex)); const start=index*64; if(raw.length<start+64) throw new Error('ABI response too short'); return raw.slice(start,start+64); }
export function wordToBigInt(word){ return BigInt(`0x${word}`); }
export function wordToAddress(word){ return `0x${word.slice(24)}`; }
export function addressTopic(address){ return `0x${wordAddress(address)}`; }
export function normaliseAddress(address){ return assertAddress(address).toLowerCase(); }
