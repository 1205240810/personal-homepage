import {build} from 'esbuild';
import {writeFileSync} from 'node:fs';
const result=await build({entryPoints:['src/ai.worker.ts'],bundle:true,minify:true,write:false,format:'iife',target:'es2022'});
writeFileSync('src/worker-source.ts',`export const workerSource=${JSON.stringify(result.outputFiles[0].text)};\n`);
