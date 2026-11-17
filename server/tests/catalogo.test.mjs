import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase,insert,get,update,all } from '../db.mjs';
import { importCatalog,catalogo } from '../catalogo.mjs';
import { validateBackup,snapshot } from '../storage.mjs';
test('catálogo tem 30 produtos e 8 categorias com preços da foto; importar novamente preserva edições',t=>{
 const dir=mkdtempSync(join(tmpdir(),'garagem-'));const db=openDatabase(join(dir,'db.sqlite'));t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 assert.equal(catalogo.length,30);assert.equal(new Set(catalogo.map(p=>p.categoria)).size,8);
 assert.equal(importCatalog(db),30);assert.equal(all(db,'produtos').length,30);
 assert.equal(all(db,'produtos').find(p=>p.nome==='Expresso duplo').preco_venda,8.9);
 assert.equal(all(db,'produtos').find(p=>p.nome==='Misto quente').preco_venda,19);
 assert.equal(all(db,'produtos').find(p=>p.nome==='Água com gás').preco_venda,3.5);
 assert.ok(all(db,'produtos').every(p=>p.quantidade_estoque===0&&p.preco_custo===0));
 update(db,'produtos',catalogo[0].id,{preco_venda:12});assert.equal(importCatalog(db),0);assert.equal(get(db,'produtos',catalogo[0].id).preco_venda,12);
});
test('catálogo respeita produto existente, saldo, estoque e preço; banco antigo e backup continuam válidos',t=>{
 const dir=mkdtempSync(join(tmpdir(),'garagem-update-'));const file=join(dir,'db.sqlite');let db=openDatabase(file);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
 const old=insert(db,'produtos',{nome:'Expresso simples',preco_venda:17,quantidade_estoque:9});update(db,'conta_bancaria',1,{saldo:123});
 db.exec('ALTER TABLE produtos DROP COLUMN categoria');const backup=snapshot(db,dir);assert.doesNotThrow(()=>validateBackup(backup));db.close();db=openDatabase(file);
 assert.equal(importCatalog(db),29);assert.equal(all(db,'produtos').length,30);const product=get(db,'produtos',old.id);
 assert.equal(product.preco_venda,17);assert.equal(product.quantidade_estoque,9);assert.equal(product.categoria,'Cafés');assert.equal(get(db,'conta_bancaria',1).saldo,123);
});
