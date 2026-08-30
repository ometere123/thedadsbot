export class NonceManager{
  #next=new Map(); #locks=new Map();
  seed(address,pendingNonce){const key=String(address).toLowerCase();const n=Number(pendingNonce);if(!Number.isSafeInteger(n)||n<0)throw new Error('invalid nonce');this.#next.set(key,Math.max(this.#next.get(key)??0,n));return this.#next.get(key);}
  reserve(address){const key=String(address).toLowerCase();if(!this.#next.has(key))throw new Error('nonce manager must be seeded from pending nonce');const n=this.#next.get(key);this.#next.set(key,n+1);this.#locks.set(`${key}:${n}`,{address:key,nonce:n,at:Date.now()});return n;}
  release(address,nonce,{reuse=false}={}){const key=String(address).toLowerCase();this.#locks.delete(`${key}:${nonce}`);if(reuse&&this.#next.get(key)===Number(nonce)+1)this.#next.set(key,Number(nonce));}
  snapshot(){return {next:Object.fromEntries(this.#next),reservations:[...this.#locks.values()]};}
}
