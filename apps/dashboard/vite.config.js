import {defineConfig} from 'vite';
import {fileURLToPath, URL} from 'node:url';

const root=fileURLToPath(new URL('.',import.meta.url));
const port=Number(process.env.THEDADBOT_DASHBOARD_PORT||4173);

export default defineConfig({
  root,
  server:{host:'127.0.0.1',port,strictPort:true},
  preview:{host:'127.0.0.1',port,strictPort:true},
  build:{outDir:'dist',emptyOutDir:true,target:'es2022',sourcemap:false},
});
