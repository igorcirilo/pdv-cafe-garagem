import { all, get, insert, update, transaction, now, today } from './db.mjs';
const requireValue = (condition, message) => { if (!condition) throw Error(message); };
const num = (value, min=0) => { requireValue(typeof value==='number' && Number.isFinite(value) && value>=min,'Valor numérico inválido'); return value; };
const positive = value => { num(value); requireValue(value>0,'A quantidade ou valor deve ser maior que zero'); return value; };
const cents = value => Math.round(value*100);
const methods = ['Dinheiro','PIX','Cartão de Crédito','Cartão de Débito','Transferência'];
function payments(items,total) {
  requireValue(Array.isArray(items),'Pagamentos inválidos');
  const result = {cash:0,bank:0,methods:[],pix:0,credit:0,debit:0};let sum=0;
  for(const item of items) {
    positive(item.valor);requireValue(methods.includes(item.metodo),'Método de pagamento inválido');
    requireValue(Math.abs(item.valor*100-cents(item.valor))<0.000001,'Pagamento deve ter no máximo duas casas decimais');
    sum+=cents(item.valor); result.methods.push(item.metodo);
    if(item.metodo==='Dinheiro')result.cash+=item.valor;else result.bank+=item.valor;
    if(['PIX','Transferência'].includes(item.metodo))result.pix+=item.valor;
    if(item.metodo==='Cartão de Crédito')result.credit+=item.valor;
    if(item.metodo==='Cartão de Débito')result.debit+=item.valor;
  }
  requireValue(sum===cents(num(total)),'Os pagamentos devem totalizar o valor da operação');
  result.methods=[...new Set(result.methods)].sort().join(' + ');return result;
}
function need(db,table,id) { const row=get(db,table,id);requireValue(row,`Registro não encontrado: ${table}`);return row; }
function openCash(db,id) { requireValue(get(db,'controle_caixa',id)?.status==='aberto','É necessário um caixa aberto'); }
function bank(db,delta) { const row=need(db,'conta_bancaria',1);update(db,'conta_bancaria',1,{saldo:Math.round((row.saldo+delta)*100)/100}); }
function movement(db,table,id,delta,details) {
  num(Math.abs(delta));const row=need(db,table,id), stock=(row.quantidade_estoque||0)+delta;
  requireValue(stock>=-1e-9,'Estoque insuficiente');update(db,table,id,{quantidade_estoque:Math.max(0,stock)});
  insert(db,'movimentacoes_estoque',{[table==='insumos'?'insumo_id':'produto_id']:id,quantidade:delta,...details});
}
function consume(db,productId,quantity,details) {
  const sheet=all(db,'fichas_tecnicas').find(r=>r.produto_venda_id===productId);
  requireValue(sheet && sheet.rendimento_porcoes>0,'Produto sem ficha técnica ou rendimento válido');
  const items=all(db,'ficha_ingredientes').filter(r=>r.ficha_id===sheet.id);
  requireValue(items.length,'A ficha técnica precisa ter ingredientes');
  for(const item of items) {
    const qty=quantity/positive(sheet.rendimento_porcoes)*positive(item.quantidade_utilizada);
    if(item.insumo_id)movement(db,'insumos',item.insumo_id,-qty,details);
    else if(item.produto_ingrediente_id)movement(db,'produtos',item.produto_ingrediente_id,-qty,details);
    else if(item.receita_base_id) {
      const base=need(db,'receitas_base',item.receita_base_id);positive(base.rendimento_peso);
      const ingredients=all(db,'receitas_base_itens').filter(r=>r.receita_base_id===base.id);
      requireValue(ingredients.length,'Receita-base sem ingredientes');
      for(const ing of ingredients) movement(db,'insumos',ing.insumo_id,-qty/base.rendimento_peso*positive(ing.qtd_usada),details);
    } else throw Error('Ingrediente sem origem');
  }
}
function recalculate(db) {
  for(const item of all(db,'receitas_base_itens')) update(db,'receitas_base_itens',item.id,{custo_calculado:item.qtd_usada*(need(db,'insumos',item.insumo_id).custo_unitario||0)});
  for(const base of all(db,'receitas_base')) {
    const total=all(db,'receitas_base_itens').filter(r=>r.receita_base_id===base.id).reduce((s,r)=>s+(r.custo_calculado||0),0);
    update(db,'receitas_base',base.id,{custo_total:total,custo_por_unidade:base.rendimento_peso>0?total/base.rendimento_peso:0});
  }
  for(const item of all(db,'ficha_ingredientes')) {
    const cost=item.insumo_id?need(db,'insumos',item.insumo_id).custo_unitario:item.receita_base_id?need(db,'receitas_base',item.receita_base_id).custo_por_unidade:need(db,'produtos',item.produto_ingrediente_id).preco_custo;
    update(db,'ficha_ingredientes',item.id,{custo_calculado:item.quantidade_utilizada*(cost||0)});
  }
  for(const sheet of all(db,'fichas_tecnicas')) {
    const total=all(db,'ficha_ingredientes').filter(r=>r.ficha_id===sheet.id).reduce((s,r)=>s+(r.custo_calculado||0),0);
    update(db,'fichas_tecnicas',sheet.id,{custo_total:total});
    update(db,'produtos',sheet.produto_venda_id,{preco_custo:sheet.rendimento_porcoes>0?total/sheet.rendimento_porcoes:0});
  }
}
function sale(db,p) {
  openCash(db,p.p_caixa_id);positive(p.p_total);num(p.p_desconto);
  requireValue(Array.isArray(p.p_itens)&&p.p_itens.length,'A venda deve possuir itens');
  const pay=payments(p.p_pagamentos,p.p_total);
  let subtotal=0;
  for(const item of p.p_itens) {positive(item.quantidade);num(item.preco_unitario);num(item.custo_unitario??0);subtotal+=item.quantidade*item.preco_unitario;}
  requireValue(cents(subtotal-p.p_desconto)===cents(p.p_total),'Total incompatível com os itens e o desconto');
  if(p.p_comanda_id) requireValue(need(db,'comandas',p.p_comanda_id).status==='aberta','Comanda já fechada');
  const row=insert(db,'vendas',{caixa_id:p.p_caixa_id,identificacao_pedido:p.p_identificacao_pedido,total:p.p_total,desconto:p.p_desconto,atendente:p.p_atendente,status:'Concluída',pagamentos:p.p_pagamentos,metodo_pagamento:pay.methods,valor_pix:pay.pix,valor_dinheiro:pay.cash,valor_cartao_credito:pay.credit,valor_cartao_debito:pay.debit});
  for(const item of p.p_itens) {
    const product=need(db,'produtos',item.produto_id);requireValue(product.ativo&&product.tipo==='venda','Produto inativo ou inválido');
    insert(db,'itens_venda',{venda_id:row.id,produto_id:item.produto_id,quantidade:item.quantidade,preco_unitario:item.preco_unitario,custo_unitario:item.custo_unitario??0});
    const details={venda_id:row.id,tipo_movimento:'Saída - Venda',motivo:`Venda ${p.p_identificacao_pedido}`,atendente:p.p_atendente};
    if(product.modo_estoque==='producao_sob_demanda')consume(db,product.id,item.quantidade,{...details,tipo_movimento:'Saída - Produção'});
    else movement(db,'produtos',product.id,-item.quantidade,details);
  }
  bank(db,pay.bank);
  if(p.p_comanda_id)update(db,'comandas',p.p_comanda_id,{status:'fechada'});
  return row.id;
}
function cancelSale(db,p) {
  const row=need(db,'vendas',p.p_venda_id);requireValue(row.status!=='Cancelada','Esta venda já foi cancelada');
  const movements=all(db,'movimentacoes_estoque').filter(r=>r.venda_id===row.id && r.quantidade<0);
  for(const mov of movements)movement(db,mov.insumo_id?'insumos':'produtos',mov.insumo_id||mov.produto_id,-mov.quantidade,{venda_id:row.id,tipo_movimento:'Entrada - Estorno Venda',motivo:p.p_motivo||'Cancelamento de venda',atendente:row.atendente});
  bank(db,-(row.valor_pix+row.valor_cartao_credito+row.valor_cartao_debito));
  update(db,'vendas',row.id,{status:'Cancelada',cancelada_em:now(),motivo_cancelamento:p.p_motivo||'Cancelamento de venda'});
}
function expense(db,pay,caixa,description,reverse=false) {
  if(pay.cash) {openCash(db,caixa);insert(db,'movimentacoes_caixa',{caixa_id:caixa,tipo:reverse?'suprimento':'despesa',valor:pay.cash,descricao:description});}
  bank(db,reverse?pay.bank:-pay.bank);
}
function purchaseAccount(db,p,total,immediate,description) {
  if(immediate>0) {
    const pay=payments(p.p_pagamentos_imediatos,immediate);
    expense(db,pay,p.p_caixa_id,`Pago: ${description}`);
    insert(db,'contas_pagar',{descricao:description+' (Pag. Imediato)',fornecedor_id:p.p_fornecedor_id,valor:immediate,valor_original:immediate,data_vencimento:today(),data_pagamento:today(),status:'Pago',metodo_pagamento:pay.methods,pagamentos:p.p_pagamentos_imediatos});
  }
  const deferred=p.p_valor_prazo||0;
  if(deferred>0) {requireValue(/^\d{4}-\d{2}-\d{2}$/.test(p.p_data_vencimento),'Informe a data de vencimento');insert(db,'contas_pagar',{descricao:description+' (A Prazo)',fornecedor_id:p.p_fornecedor_id,valor:deferred,valor_original:deferred,data_vencimento:p.p_data_vencimento,status:'Pendente'});}
  requireValue(cents(immediate+deferred)===cents(total),'Total da compra inválido');
}
export function rpc(db,name,p) {
  return transaction(db,()=>{
    switch(name) {
      case 'registrar_venda':return sale(db,p);
      case 'cancelar_venda':cancelSale(db,p);break;
      case 'editar_venda': {const old=need(db,'vendas',p.p_venda_id);requireValue(old.status==='Concluída','Venda concluída não encontrada');cancelSale(db,{p_venda_id:old.id,p_motivo:'Venda substituída por edição'});return sale(db,{...p,p_caixa_id:old.caixa_id});}
      case 'registrar_producao': {
        positive(p.p_quantidade);const product=need(db,'produtos',p.p_produto_id);
        requireValue(product.ativo&&product.tipo==='venda'&&product.modo_estoque==='producao_lote','Produto não configurado para produção em lote');
        const details={atendente:p.p_atendente,motivo:p.p_motivo||'Produção em lote',tipo_movimento:'Saída - Produção'};
        consume(db,product.id,p.p_quantidade,details);movement(db,'produtos',product.id,p.p_quantidade,{...details,tipo_movimento:'Entrada - Produção'});break;
      }
      case 'registrar_ajuste_estoque':case 'registrar_ajuste_insumo': {
        positive(p.p_quantidade);requireValue(typeof p.p_tipo_movimento==='string'&&p.p_tipo_movimento.trim(),'Tipo de ajuste inválido');
        const table=name==='registrar_ajuste_insumo'?'insumos':'produtos';
        movement(db,table,p.p_insumo_id||p.p_produto_id,(/Saída|Negativa/.test(p.p_tipo_movimento)?-1:1)*p.p_quantidade,{tipo_movimento:p.p_tipo_movimento,motivo:p.p_motivo||'Ajuste manual',atendente:p.p_atendente});break;
      }
      case 'recalcular_custos_cmv':recalculate(db);break;
      case 'registrar_compra_insumo': {
        positive(p.p_quantidade_estoque);positive(p.p_valor_total);num(p.p_custo_unitario);
        const ing=need(db,'insumos',p.p_insumo_id),supplier=need(db,'fornecedores',p.p_fornecedor_id);
        movement(db,'insumos',ing.id,p.p_quantidade_estoque,{tipo_movimento:'Entrada - Compra',motivo:`Nota Fornecedor: ${supplier.nome}`,atendente:p.p_atendente});
        update(db,'insumos',ing.id,{custo_unitario:p.p_custo_unitario,preco_total_pago:p.p_valor_total});
        purchaseAccount(db,{...p,p_valor_prazo:p.p_gerar_conta_pagar?p.p_valor_total:0,p_pagamentos_imediatos:p.p_gerar_conta_pagar?[]:[{metodo:p.p_metodo_pagamento,valor:p.p_valor_total}]},p.p_valor_total,p.p_gerar_conta_pagar?0:p.p_valor_total,`Compra Insumo: ${ing.nome}`);recalculate(db);break;
      }
      case 'registrar_compra_lote_insumos': {
        requireValue(typeof p.p_lote_id==='string'&&p.p_lote_id.trim(),'Identificador de lote inválido');positive(p.p_total);num(p.p_valor_prazo);
        if(p.p_fornecedor_id)need(db,'fornecedores',p.p_fornecedor_id);
        requireValue(Array.isArray(p.p_itens)&&p.p_itens.length,'Lote sem itens');
        const reason=`Abastecimento via Lote [LOTE-${p.p_lote_id}]`;
        requireValue(!all(db,'movimentacoes_estoque').some(r=>r.motivo===reason),'Este lote já foi registrado');let total=0;
        for(const item of p.p_itens) {
          requireValue(['produto','insumo'].includes(item.tipo_item),'Tipo de item inválido');positive(item.quantidade_estoque);num(item.preco_custo);positive(item.valor_linha);total+=item.valor_linha;
          const table=item.tipo_item==='insumo'?'insumos':'produtos',id=item.insumo_id||item.produto_id;
          const itemRow=need(db,table,id);if(table==='produtos')requireValue(itemRow.tipo==='venda'&&itemRow.modo_estoque==='revenda','Produto não é de revenda');
          movement(db,table,id,item.quantidade_estoque,{tipo_movimento:'Entrada - Compra Lote',motivo:reason,atendente:p.p_atendente});
          update(db,table,id,table==='insumos'?{custo_unitario:item.preco_custo,preco_total_pago:item.valor_linha}:{preco_custo:item.preco_custo,preco_venda:num(item.preco_venda??0)});
        }
        requireValue(cents(total)===cents(p.p_total),'Os itens não totalizam o valor do lote');
        const immediate=(p.p_pagamentos_imediatos||[]).reduce((s,r)=>s+num(r.valor),0);
        purchaseAccount(db,p,p.p_total,immediate,`Compra Lote [LOTE-${p.p_lote_id}]`);recalculate(db);break;
      }
      case 'baixar_conta_pagar': {
        const account=need(db,'contas_pagar',p.p_conta_id);requireValue(account.status==='Pendente','A conta já foi baixada');positive(p.p_valor);
        const pay=payments(p.p_pagamentos,p.p_valor);expense(db,pay,p.p_caixa_id,`Pago: ${account.descricao}`);
        update(db,'contas_pagar',account.id,{status:'Pago',valor:p.p_valor,valor_original:account.valor_original||account.valor,data_pagamento:today(),metodo_pagamento:pay.methods,pagamentos:p.p_pagamentos});break;
      }
      case 'cancelar_conta_pagar': {
        const account=need(db,'contas_pagar',p.p_conta_id);requireValue(account.status!=='Cancelada','Esta conta já foi cancelada');
        if(account.status==='Pago')expense(db,payments(account.pagamentos,account.valor),p.p_caixa_id,`Estorno de despesa: ${account.descricao}`,true);
        update(db,'contas_pagar',account.id,{status:'Cancelada',cancelada_em:now(),motivo_cancelamento:p.p_motivo||'Cancelamento pelo financeiro'});break;
      }
      default:throw Error('Operação não reconhecida');
    }
    return null;
  });
}
