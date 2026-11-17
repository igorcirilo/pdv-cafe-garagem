import { spawn } from 'node:child_process';
const api=spawn(process.execPath,['server/index.mjs'],{stdio:'inherit',env:{...process.env,PDV_DEV:'1'}});
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1'],{stdio:'inherit'});
function stop(){api.kill();vite.kill();}
process.on('SIGINT',stop);process.on('SIGTERM',stop);api.on('exit',()=>vite.kill());vite.on('exit',()=>api.kill());
