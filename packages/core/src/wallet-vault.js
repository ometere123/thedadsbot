import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const N=1<<17,R=8,P=1;
function derive(password,salt){return crypto.scryptSync(password,salt,32,{N,R,P,maxmem:256*1024*1024});}
function scrub(buf){try{buf?.fill?.(0);}catch{}}
export async function saveVault(file,payload,password){
  if(String(password).length<12) throw new Error('vault password must be at least 12 characters');
  const salt=crypto.randomBytes(16),iv=crypto.randomBytes(12),key=derive(password,salt),clear=Buffer.from(JSON.stringify(payload));
  try{const cipher=crypto.createCipheriv('aes-256-gcm',key,iv);const encrypted=Buffer.concat([cipher.update(clear),cipher.final()]);const tag=cipher.getAuthTag();const doc={version:1,kdf:{name:'scrypt',N,R,P},cipher:'aes-256-gcm',salt:salt.toString('base64'),iv:iv.toString('base64'),tag:tag.toString('base64'),data:encrypted.toString('base64')};await fs.mkdir(path.dirname(path.resolve(file)),{recursive:true,mode:0o700});await fs.writeFile(file,JSON.stringify(doc,null,2),{mode:0o600,flag:'w'});try{await fs.chmod(file,0o600);}catch{}return doc;}finally{scrub(key);scrub(clear);}
}
export async function loadVault(file,password){const doc=JSON.parse(await fs.readFile(file,'utf8'));if(doc.version!==1||doc.kdf?.name!=='scrypt'||doc.cipher!=='aes-256-gcm')throw new Error('unsupported vault format');const key=derive(password,Buffer.from(doc.salt,'base64'));let clear;try{const dec=crypto.createDecipheriv('aes-256-gcm',key,Buffer.from(doc.iv,'base64'));dec.setAuthTag(Buffer.from(doc.tag,'base64'));clear=Buffer.concat([dec.update(Buffer.from(doc.data,'base64')),dec.final()]);return JSON.parse(clear.toString('utf8'));}finally{scrub(key);scrub(clear);}}
export function redactVault(payload){return {wallets:(payload.wallets||[]).map(({privateKey,...w})=>({...w,hasPrivateKey:Boolean(privateKey)})),createdAt:payload.createdAt};}
