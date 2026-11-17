import { readFileSync } from 'node:fs';
import { transaction,insert,all,update } from './db.mjs';
export const catalogo = JSON.parse(readFileSync(new URL('./catalogo.json',import.meta.url),'utf8'));
export function importCatalog(db) {
  const key='catalogo-cafe-garagem-v1';
  if(db.prepare('SELECT 1 FROM _meta WHERE key=?').get(key))return 0;
  return transaction(db,()=>{
    let count=0;
    for(const item of catalogo) {
      const existing=all(db,'produtos').find(p=>p.id===item.id||p.nome.trim().toLocaleLowerCase('pt-BR')===item.nome.toLocaleLowerCase('pt-BR'));
      if(existing) { if(!existing.categoria)update(db,'produtos',existing.id,{categoria:item.categoria});continue; }
      insert(db,'produtos',{...item,tipo:'venda',ativo:true,modo_estoque:'revenda',unidade_medida:'un',quantidade_estoque:0,preco_custo:0});count++;
    }
    db.prepare('INSERT INTO _meta(key,value) VALUES (?,?)').run(key,new Date().toISOString());return count;
  });
}
