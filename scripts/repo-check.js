import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const required=[
  'README.md','SECURITY.md','.env.example','apps/dashboard/index.html','apps/dashboard/vite.config.js',
  'apps/dashboard/src/main.jsx','apps/dashboard/src/App.jsx','apps/dashboard/src/lib/engine.js',
  'packages/core/src/intent-firewall.js','packages/cli/src/index.js','packages/agent/src/server.js',
  'contracts/src/DelegatedMintWallet.sol'
];
for(const f of required)if(!fs.existsSync(f)){console.error(`missing required file: ${f}`);process.exit(1);}

const skip=new Set(['node_modules','.git','dist','out','cache','broadcast']);
const js=[];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(skip.has(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else if(p.endsWith('.js'))js.push(p);}}
walk('.');
for(const file of js){const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(r.status!==0){console.error(`syntax check failed: ${file}\n${r.stderr}`);process.exit(1);}}
console.log(`repo check: ${required.length}/${required.length} required surfaces; ${js.length} JavaScript files syntax-clean; JSX is validated by the Vite production build`);
