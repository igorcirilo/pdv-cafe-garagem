import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase, query } from './db.mjs';
import { importCatalog } from './catalogo.mjs';
import { rpc } from './operations.mjs';
import { dataDir, projectDir, acquireLock, snapshot, validateBackup, installBackup, automaticBackup } from './storage.mjs';
const error=(message,status=400)=>Object.assign(Error(message),{status});
export function createApp({directory=dataDir,port=3210,catalog=true}={}) {
  const release=acquireLock(directory),dbFile=join(directory,'pdv.sqlite'),backupDir=join(directory,'backups');
  let db;try{db=openDatabase(dbFile);}catch(e){release();throw e;}
  let closed=false;
  function auto() { automaticBackup(db,backupDir); }
  try{auto();}catch(e){console.error('Falha no backup automático:',e.message);}
  try { if(catalog) importCatalog(db); } catch(e) { db.close(); release(); throw e; }
  const timer=setInterval(()=>{try{auto();}catch(e){console.error('Falha no backup automático:',e.message);}},60*60*1000);timer.unref();
  async function body(req,raw=false) {
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>(raw?100*1024*1024:2*1024*1024))throw error('Arquivo ou requisição muito grande',413);chunks.push(chunk);}
    const bytes=Buffer.concat(chunks);
    if(raw)return bytes;
    if(!req.headers['content-type']?.startsWith('application/json'))throw error('Use JSON',415);
    try{return JSON.parse(bytes.toString());}catch{throw error('JSON inválido');}
  }
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Frame-Options','DENY');res.setHeader('Cache-Control','no-store');
    const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try {
      const actualPort=server.address()?.port||port;
      const validHosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`];
      if(!validHosts.includes(req.headers.host))throw error('Host não permitido',403);
      if(req.headers.origin && ![`http://127.0.0.1:${actualPort}`,`http://localhost:${actualPort}`,...(process.env.PDV_DEV==='1'?['http://127.0.0.1:5173','http://localhost:5173']:[])].includes(req.headers.origin))throw error('Origem não permitida',403);
      const path=new URL(req.url,'http://localhost').pathname;
      if(path.startsWith('/api/')) {
        const route=path.slice(5);
        if(req.method==='POST'&&route==='query')return send(query(db,await body(req)));
        if(req.method==='POST'&&route==='rpc') {const p=await body(req);return send({data:rpc(db,p.name,p.args||{}),error:null});}
        if(req.method==='POST'&&route==='backup') {
          await body(req);const file=snapshot(db,backupDir);
          res.writeHead(200,{'Content-Type':'application/vnd.sqlite3','Content-Disposition':`attachment; filename="${file.split(/[\\/]/).pop()}"`});return res.end(readFileSync(file));
        }
        if(req.method==='POST'&&route==='restore') {
          const bytes=await body(req,true),temp=join(directory,`restore-${randomUUID()}.tmp`);writeFileSync(temp,bytes);
          try {
            validateBackup(temp);snapshot(db,backupDir,'antes-restauracao');
            db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
            try{installBackup(temp,dbFile);}finally{db=openDatabase(dbFile);}
            return send({data:{restored:true},error:null});
          }finally{unlinkSync(temp);}
        }
        throw error('Rota não encontrada',404);
      }
      if(req.method!=='GET')throw error('Método não permitido',405);
      const dist=join(projectDir,'dist'),decoded=decodeURIComponent(path),file=resolve(dist,'.'+decoded);
      if(file!==dist&&!file.startsWith(dist+sep))throw error('Caminho inválido',403);
      const target=existsSync(file)&&extname(file)?file:join(dist,'index.html');
      if(!existsSync(target))throw error('Interface não compilada. Execute INSTALAR.bat.',503);
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'};
      res.writeHead(200,{'Content-Type':types[extname(target)]||'application/octet-stream'});res.end(readFileSync(target));
    }catch(err){if(!res.headersSent)send({data:null,error:{message:err.message}},err.status||400);else res.end();}
  });
  function close() {if(closed)return;closed=true;clearInterval(timer);db.close();release();}
  server.on('close',close);
  return {server,close,get db(){return db;}};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=createApp({port:Number(process.env.PORT||3210)});
  app.server.on('error',err=>{console.error(err.code==='EADDRINUSE'?'Porta ocupada. Feche a outra instância do PDV.':err.message);app.close();process.exitCode=1;});
  app.server.listen(Number(process.env.PORT||3210),'127.0.0.1',()=>console.log(`PDV local: http://127.0.0.1:${app.server.address().port}\nDados: ${dataDir}\nFeche com Ctrl+C.`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>app.server.close(()=>process.exit()));
}
