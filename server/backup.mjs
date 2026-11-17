import { join } from 'node:path';
import { dataDir,acquireLock,snapshot } from './storage.mjs';
import { openDatabase } from './db.mjs';
const release=acquireLock(dataDir);let db;
try{db=openDatabase(join(dataDir,'pdv.sqlite'));console.log('Backup criado:',snapshot(db,join(dataDir,'backups')));}
finally{db?.close();release();}
