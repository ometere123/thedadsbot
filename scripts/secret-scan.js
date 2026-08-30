import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const skip=new Set(['.git','node_modules','out','cache','broadcast','.data']);
const patterns=[
  /(?:PRIVATE_KEY|WALLET_KEY|SPONSOR_KEY|SECRET_KEY)\s*[:=]\s*['\"]?0x[0-9a-fA-F]{64}\b/gi,
  /[\"](?:privateKey|private_key|walletKey|wallet_key)[\"]\s*:\s*[\"]0x[0-9a-fA-F]{64}[\"]/gi,
  /\b(?:seed phrase|mnemonic|seed)\s*[:=]\s*['\"][a-z]+(?:\s+[a-z]+){11,23}['\"]/gi,
  /\b(?:OPENSEA_API_KEY|API_KEY|ACCESS_TOKEN)\s*[:=]\s*['\"]?[A-Za-z0-9_\-.]{24,}\b/gi,
];
const allowFiles=new Set(['scripts/secret-scan.js','docs/threat-model.md','SECURITY.md']);
let hits=[];
function walk(dir){for(const ent of fs.readdirSync(dir,{withFileTypes:true})){if(skip.has(ent.name))continue;const p=path.join(dir,ent.name),rel=path.relative(root,p);if(ent.isDirectory())walk(p);else if(!allowFiles.has(rel)&&!/(?:\.(?:png|jpg|jpeg|gif|zip|ico|lock))$/i.test(p)){let s;try{s=fs.readFileSync(p,'utf8')}catch{continue}for(const re of patterns){re.lastIndex=0;if(re.test(s))hits.push(rel);}}}}
walk(root);
if(hits.length){console.error('Potential committed secret material:',[...new Set(hits)]);process.exit(1);}
console.log('secret scan: clean');
