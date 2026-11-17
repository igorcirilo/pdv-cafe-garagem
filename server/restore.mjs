import { resolve,join } from 'node:path';
import { dataDir,acquireLock,validateBackup,snapshot,installBackup } from './storage.mjs';
import { openDatabase } from './db.mjs';
if(!process.argv[2]){console.error('Uso: npm run restore -- "C:\\caminho\\backup.sqlite"');process.exit(1);}
const source=resolve(process.argv[2]);validateBackup(source);
const release=acquireLock(dataDir);let db;
try{const target=join(dataDir,'pdv.sqlite');db=openDatabase(target);snapshot(db,join(dataDir,'backups'),'antes-restauracao');db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();db=null;installBackup(source,target);console.log('Backup restaurado. Abra o PDV.');}
finally{db?.close();release();}
