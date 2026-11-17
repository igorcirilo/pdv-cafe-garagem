import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,rmSync,readFileSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { openDatabase,insert,get,all,query } from '../db.mjs';
import { rpc } from '../operations.mjs';
import { createApp } from '../index.mjs';
import { snapshot,validateBackup,acquireLock,automaticBackup } from '../storage.mjs';
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'pdv-test-')),file=join(dir,'test.sqlite'),db=openDatabase(file);t.after(()=>{db.close();rmSync(dir,{recursive:true,force:true});});return {db,dir,file};}
function seed(db){const cash=insert(db,'controle_caixa',{fundo_inicial:100});const product=insert(db,'produtos',{nome:'Café',preco_venda:5,preco_custo:2,quantidade_estoque:10});return {cash,product};}
function sale(cash,product,extra={}){return {p_caixa_id:cash.id,p_identificacao_pedido:'Pedido teste',p_total:10,p_desconto:0,p_pagamentos:[{metodo:'PIX',valor:10}],p_atendente:'Teste',p_itens:[{produto_id:product.id,quantidade:2,preco_unitario:5,custo_unitario:2}],...extra};}
test('venda persiste, baixa estoque, credita banco e cancelamento estorna uma única vez',t=>{
 const {db}=fixture(t),{cash,product}=seed(db);const id=rpc(db,'registrar_venda',sale(cash,product));
 assert.equal(get(db,'produtos',product.id).quantidade_estoque,8);assert.equal(get(db,'conta_bancaria',1).saldo,10);
 assert.equal(get(db,'vendas',id).pagamentos[0].metodo,'PIX');
 rpc(db,'cancelar_venda',{p_venda_id:id,p_motivo:'Teste'});assert.equal(get(db,'produtos',product.id).quantidade_estoque,10);assert.equal(get(db,'conta_bancaria',1).saldo,0);
 assert.throws(()=>rpc(db,'cancelar_venda',{p_venda_id:id}),/já foi cancelada/);
});
test('falha no segundo item desfaz venda, primeiro item, movimentos e saldo',t=>{
 const {db}=fixture(t),{cash,product}=seed(db);const scarce=insert(db,'produtos',{nome:'Sem estoque',quantidade_estoque:0});
 const params=sale(cash,product,{p_total:15,p_pagamentos:[{metodo:'Dinheiro',valor:15}],p_itens:[{produto_id:product.id,quantidade:2,preco_unitario:5},{produto_id:scarce.id,quantidade:1,preco_unitario:5}]});
 assert.throws(()=>rpc(db,'registrar_venda',params),/Estoque insuficiente/);assert.equal(all(db,'vendas').length,0);assert.equal(all(db,'itens_venda').length,0);assert.equal(all(db,'movimentacoes_estoque').length,0);assert.equal(get(db,'produtos',product.id).quantidade_estoque,10);
});
test('valida pagamentos, total, caixa fechado e preserva venda se edição falhar',t=>{
 const {db}=fixture(t),{cash,product}=seed(db);
 assert.throws(()=>rpc(db,'registrar_venda',sale(cash,product,{p_pagamentos:[{metodo:'PIX',valor:9}]})),/pagamentos/);
 assert.throws(()=>rpc(db,'registrar_venda',sale(cash,product,{p_total:11,p_pagamentos:[{metodo:'PIX',valor:11}]})),/Total incompatível/);
 const id=rpc(db,'registrar_venda',sale(cash,product));
 assert.throws(()=>rpc(db,'editar_venda',{...sale(cash,product),p_venda_id:id,p_itens:[{produto_id:product.id,quantidade:200,preco_unitario:0.05}]}),/Estoque insuficiente/);
 assert.equal(get(db,'vendas',id).status,'Concluída');assert.equal(get(db,'conta_bancaria',1).saldo,10);
 const edited=rpc(db,'editar_venda',{...sale(cash,product),p_venda_id:id});assert.notEqual(edited,id);assert.equal(get(db,'produtos',product.id).quantidade_estoque,8);assert.equal(get(db,'conta_bancaria',1).saldo,10);
 db.prepare("UPDATE controle_caixa SET status='fechado'").run();assert.throws(()=>rpc(db,'registrar_venda',sale(cash,product)),/caixa aberto/);
});
test('produção sob demanda e em lote consomem insumos proporcionalmente e CMV recalcula',t=>{
 const {db}=fixture(t),{cash,product}=seed(db);const ing=insert(db,'insumos',{nome:'Grão',unidade_medida:'g',quantidade_estoque:100,custo_unitario:0.1});
 const base=insert(db,'receitas_base',{nome:'Base',unidade_medida:'g',rendimento_peso:10});insert(db,'receitas_base_itens',{receita_base_id:base.id,insumo_id:ing.id,qtd_usada:20});
 const sheet=insert(db,'fichas_tecnicas',{produto_venda_id:product.id,rendimento_porcoes:2});insert(db,'ficha_ingredientes',{ficha_id:sheet.id,receita_base_id:base.id,quantidade_utilizada:10});
 db.prepare("UPDATE produtos SET modo_estoque='producao_sob_demanda',quantidade_estoque=0 WHERE id=?").run(product.id);
 rpc(db,'recalcular_custos_cmv',{});assert.equal(get(db,'produtos',product.id).preco_custo,1);
 const id=rpc(db,'registrar_venda',sale(cash,product));assert.equal(get(db,'insumos',ing.id).quantidade_estoque,80);rpc(db,'cancelar_venda',{p_venda_id:id});assert.equal(get(db,'insumos',ing.id).quantidade_estoque,100);
 db.prepare("UPDATE produtos SET modo_estoque='producao_lote' WHERE id=?").run(product.id);
 rpc(db,'registrar_producao',{p_produto_id:product.id,p_quantidade:4,p_atendente:'Teste'});assert.equal(get(db,'produtos',product.id).quantidade_estoque,4);assert.equal(get(db,'insumos',ing.id).quantidade_estoque,60);
 rpc(db,'registrar_venda',sale(cash,product));assert.equal(get(db,'produtos',product.id).quantidade_estoque,2);assert.equal(get(db,'insumos',ing.id).quantidade_estoque,60);
});
test('compra de insumo, lote misto, prazo, baixa e estorno financeiro',t=>{
 const {db}=fixture(t),{cash,product}=seed(db),supplier=insert(db,'fornecedores',{nome:'Fornecedor'}),ing=insert(db,'insumos',{nome:'Leite',unidade_medida:'l'});
 rpc(db,'registrar_compra_insumo',{p_insumo_id:ing.id,p_fornecedor_id:supplier.id,p_quantidade_estoque:5,p_valor_total:20,p_custo_unitario:4,p_gerar_conta_pagar:true,p_data_vencimento:'2026-12-01',p_atendente:'Teste'});
 assert.equal(get(db,'insumos',ing.id).quantidade_estoque,5);let account=all(db,'contas_pagar')[0];
 rpc(db,'baixar_conta_pagar',{p_conta_id:account.id,p_valor:20,p_pagamentos:[{metodo:'PIX',valor:15},{metodo:'Dinheiro',valor:5}],p_caixa_id:cash.id});assert.equal(get(db,'conta_bancaria',1).saldo,-15);
 rpc(db,'cancelar_conta_pagar',{p_conta_id:account.id,p_caixa_id:cash.id});assert.equal(get(db,'conta_bancaria',1).saldo,0);assert.equal(get(db,'insumos',ing.id).quantidade_estoque,5);
 const lot={p_lote_id:'123',p_fornecedor_id:supplier.id,p_itens:[{tipo_item:'produto',produto_id:product.id,quantidade_estoque:2,preco_custo:2,preco_venda:5,valor_linha:4},{tipo_item:'insumo',insumo_id:ing.id,quantidade_estoque:1,preco_custo:4,valor_linha:4}],p_total:8,p_pagamentos_imediatos:[{metodo:'PIX',valor:3}],p_valor_prazo:5,p_data_vencimento:'2026-12-01',p_caixa_id:cash.id,p_atendente:'Teste'};
 rpc(db,'registrar_compra_lote_insumos',lot);assert.equal(get(db,'produtos',product.id).quantidade_estoque,12);assert.equal(get(db,'insumos',ing.id).quantidade_estoque,6);assert.equal(get(db,'conta_bancaria',1).saldo,-3);
 assert.throws(()=>rpc(db,'registrar_compra_lote_insumos',lot),/já foi registrado/);
 const before=all(db,'contas_pagar').length;assert.throws(()=>rpc(db,'registrar_compra_lote_insumos',{...lot,p_lote_id:'bad',p_total:99}),/totalizam/);assert.equal(get(db,'produtos',product.id).quantidade_estoque,12);assert.equal(all(db,'contas_pagar').length,before);
});
test('ajustes não deixam estoque negativo e fechamento de comanda é atômico',t=>{
 const {db}=fixture(t),{cash,product}=seed(db);
 assert.throws(()=>rpc(db,'registrar_ajuste_estoque',{p_produto_id:product.id,p_quantidade:11,p_tipo_movimento:'Saída - Perda'}),/Estoque insuficiente/);
 rpc(db,'registrar_ajuste_estoque',{p_produto_id:product.id,p_quantidade:1,p_tipo_movimento:'Entrada - Reposição'});assert.equal(get(db,'produtos',product.id).quantidade_estoque,11);
 const comanda=insert(db,'comandas',{identificacao:'Mesa 1'});insert(db,'itens_comanda',{comanda_id:comanda.id,produto_id:product.id,quantidade:2,preco_unitario:5});
 rpc(db,'registrar_venda',sale(cash,product,{p_comanda_id:comanda.id}));assert.equal(get(db,'comandas',comanda.id).status,'fechada');assert.throws(()=>rpc(db,'registrar_venda',sale(cash,product,{p_comanda_id:comanda.id})),/já fechada/);
});
test('consultas suportam relacionamentos aninhados, filtros, contagem, paginação e proteção de nomes',t=>{
 const {db}=fixture(t),{cash,product}=seed(db);rpc(db,'registrar_venda',sale(cash,product));
 const result=query(db,{table:'vendas',columns:'*, itens_venda (quantidade, produtos (nome))',filters:[{field:'status',op:'neq',value:'Cancelada'}],orders:[{field:'data_venda',ascending:false}],limit:1});
 assert.equal(result.count,1);assert.equal(result.data[0].itens_venda[0].produtos.nome,'Café');
 const movements=query(db,{table:'movimentacoes_estoque',columns:'id, produtos!inner(nome)',filters:[{field:'produtos.tipo',op:'eq',value:'venda'}]});assert.equal(movements.data.length,1);
 assert.throws(()=>query(db,{table:'_users'}),/Tabela inválida/);assert.throws(()=>query(db,{table:'produtos',columns:'nome; DROP TABLE produtos'}),/Campo inválido/);assert.throws(()=>query(db,{table:'produtos',action:'delete'}),/Filtro obrigatório/);
});
test('backup valida integridade e retenção automática mantém somente 30 cópias',t=>{
 const {db,dir}=fixture(t);seed(db);
 const backups=join(dir,'backups');for(let i=0;i<31;i++)automaticBackup(db,backups);
 const {readdirSync}=awaitImportFs;assert.equal(readdirSync(backups).length,30);
 const file=snapshot(db,backups);assert.doesNotThrow(()=>validateBackup(file));const invalid=join(dir,'bad.sqlite');writeFileSync(invalid,'invalid');assert.throws(()=>validateBackup(invalid));
 const release=acquireLock(dir);assert.throws(()=>acquireLock(dir),/já está aberto/);release();
});
import * as awaitImportFs from 'node:fs';
test('HTTP: acesso direto, persistência, backup/restauração, reinício e proteção local',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'pdv-http-'));let app=createApp({directory:dir,port:0,catalog:false});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
 t.after(async()=>{if(app.server.listening){app.server.close();await once(app.server,'close');}rmSync(dir,{recursive:true,force:true});});
 let base=`http://127.0.0.1:${app.server.address().port}`;
 const call=async(path,p,extra={})=>{const response=await fetch(base+'/api/'+path,{method:p===undefined?'GET':'POST',headers:{...(p===undefined?{}:{'Content-Type':'application/json'}),...extra},body:p===undefined?undefined:JSON.stringify(p)});return {response,result:await response.json()};};
 assert.equal((await call('query',{table:'produtos'})).response.status,200);
 assert.equal((await call('query',{table:'produtos'}, {Origin:'https://evil.example'})).response.status,403);
 const badHostStatus=await new Promise((resolve,reject)=>{const req=httpRequest(base+'/api/query',{method:'POST',headers:{Host:'evil.example','Content-Type':'application/json'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end(JSON.stringify({table:'produtos'}));});assert.equal(badHostStatus,403);
 assert.equal((await call('query',{table:'_users'})).response.status,400);
 assert.equal((await call('auth/login',{email:'anything'})).response.status,404);
 const saved=await call('query',{table:'produtos',action:'insert',values:{nome:'Persistente',quantidade_estoque:4},single:'required'});assert.equal(saved.result.error,null);
 const response=await fetch(base+'/api/backup',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,200);const backup=Buffer.from(await response.arrayBuffer());assert.equal(backup.subarray(0,15).toString(),'SQLite format 3');
 await call('query',{table:'produtos',action:'update',values:{nome:'Alterado'},filters:[{field:'id',op:'eq',value:saved.result.data.id}]});
 let restore=await fetch(base+'/api/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:'bad'});assert.equal(restore.status,400);assert.equal((await call('query',{table:'produtos'})).result.data[0].nome,'Alterado');
 restore=await fetch(base+'/api/restore',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:backup});assert.equal(restore.status,200);
 assert.equal((await call('query',{table:'produtos'})).result.data[0].nome,'Persistente');
 app.server.close();await once(app.server,'close');app=createApp({directory:dir,port:0,catalog:false});app.server.listen(0,'127.0.0.1');await once(app.server,'listening');base=`http://127.0.0.1:${app.server.address().port}`;
 assert.equal((await call('query',{table:'produtos'})).result.data[0].quantidade_estoque,4);
});
