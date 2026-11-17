import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync, readFileSync, copyFileSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { schema } from './db.mjs';
// fileURLToPath is necessary for Windows paths with spaces and non-ASCII characters.
import { fileURLToPath } from 'node:url';
export const projectDir=fileURLToPath(new URL('..',import.meta.url));
export const dataDir=resolve(process.env.PDV_DATA_DIR||join(projectDir,'dados'));
export function acquireLock(directory) {
  mkdirSync(directory,{recursive:true});const file=join(directory,'pdv.lock');
  try {writeFileSync(file,String(process.pid),{flag:'wx'});}
  catch(err) {
    if(err.code!=='EEXIST')throw err;
    const pid=Number(readFileSync(file,'utf8'));let alive=false;
    try {if(pid>0){process.kill(pid,0);alive=true;}}catch(e){if(e.code==='EPERM')alive=true;}
    if(alive)throw Error('O PDV já está aberto. Feche-o antes de continuar.');
    unlinkSync(file);writeFileSync(file,String(process.pid),{flag:'wx'});
  }
  return ()=>{try{unlinkSync(file);}catch{ /* already released */ }};
}
export function snapshot(db,directory,prefix='backup') {
  mkdirSync(directory,{recursive:true});
  const file=join(directory,`${prefix}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,8)}.sqlite`);
  db.prepare('VACUUM INTO ?').run(file);
  const copy=new DatabaseSync(file);try{copy.exec('PRAGMA journal_mode=DELETE;');}finally{copy.close();}
  return file;
}
export function validateBackup(file) {
  const db=new DatabaseSync(file,{readOnly:true});
  try {
    if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('Backup corrompido');
    if(db.prepare("SELECT value FROM _meta WHERE key='application'").get()?.value!=='village-cafe-local' || db.prepare('PRAGMA user_version').get().user_version!==1)throw Error('Backup de outro aplicativo ou versão');
    for(const [table,fields] of Object.entries(schema)) {
      const cols=db.prepare(`PRAGMA table_info("${table}")`).all().map(r=>r.name);
      if(Object.keys(fields).some(k=>!(table==='produtos'&&k==='categoria')&&!cols.includes(k)))throw Error('Estrutura de backup incompatível');
    }
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Backup com referências inválidas');
  } finally {db.close();}
}
export function installBackup(file,destination) {
  // Called with exclusive ownership of the DB and after closing its connection.
  const temp=destination+'.restore-'+randomUUID();copyFileSync(file,temp);
  try {
    const db=new DatabaseSync(temp);try{db.exec('PRAGMA journal_mode=DELETE;');}finally{db.close();}
    for(const suffix of ['-wal','-shm'])if(existsSync(destination+suffix))unlinkSync(destination+suffix);
    renameSync(temp,destination);
  }finally{if(existsSync(temp))unlinkSync(temp);}
}
export function automaticBackup(db,directory) {
  snapshot(db,directory,'automatico');
  const files=readdirSync(directory).filter(f=>f.startsWith('automatico-')&&f.endsWith('.sqlite')).sort().reverse();
  for(const file of files.slice(30))unlinkSync(join(directory,file));
}
