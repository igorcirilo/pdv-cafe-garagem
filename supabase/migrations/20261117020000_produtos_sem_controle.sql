-- Novo modo de estoque "sem_controle": itens preparados na hora (cafés, lanches, sobremesas...)
-- são vendidos sem checar nem baixar estoque. Revenda (bebidas, salgados) continua controlando.

alter table pdv.produtos drop constraint produtos_modo_estoque_check;
alter table pdv.produtos add constraint produtos_modo_estoque_check
  check (modo_estoque in ('revenda', 'sem_controle', 'producao_sob_demanda', 'producao_lote'));

-- Venda: itens sem controle não geram movimentação de estoque.
-- (Corpo idêntico ao da migration inicial, exceto o ramo 'sem_controle'.)
create or replace function pdv_priv.sale(p jsonb) returns text language plpgsql set search_path = ''
as $$
declare
  total double precision; descon double precision; pay pdv_priv.pagto; it jsonb; subtotal double precision := 0;
  v_venda text; prod pdv.produtos; comanda text := pdv_priv.texto(p ->> 'p_comanda_id'); st text; d jsonb;
begin
  perform pdv_priv.open_cash(p ->> 'p_caixa_id');
  total := pdv_priv.positive(p -> 'p_total');
  descon := pdv_priv.num(p -> 'p_desconto');
  perform pdv_priv.req(jsonb_typeof(p -> 'p_itens') = 'array' and jsonb_array_length(p -> 'p_itens') > 0, 'A venda deve possuir itens');
  pay := pdv_priv.payments(p -> 'p_pagamentos', total);
  for it in select value from jsonb_array_elements(p -> 'p_itens') loop
    subtotal := subtotal + pdv_priv.positive(it -> 'quantidade') * pdv_priv.num(it -> 'preco_unitario');
    perform pdv_priv.num(pdv_priv.ou_zero(it -> 'custo_unitario'));
  end loop;
  perform pdv_priv.req(pdv_priv.cents(subtotal - descon) = pdv_priv.cents(total), 'Total incompatível com os itens e o desconto');
  if comanda is not null then
    select status into st from pdv.comandas where id = comanda;
    if not found then raise exception 'Registro não encontrado: comandas'; end if;
    perform pdv_priv.req(st = 'aberta', 'Comanda já fechada');
  end if;
  insert into pdv.vendas (caixa_id, identificacao_pedido, total, desconto, atendente, status, pagamentos, metodo_pagamento,
                          valor_pix, valor_dinheiro, valor_cartao_credito, valor_cartao_debito)
  values (p ->> 'p_caixa_id', p ->> 'p_identificacao_pedido', total, descon, p ->> 'p_atendente', 'Concluída', p -> 'p_pagamentos',
          pay.methods, pay.pix, pay.cash, pay.credit, pay.debit)
  returning id into v_venda;
  for it in select value from jsonb_array_elements(p -> 'p_itens') loop
    select * into prod from pdv.produtos where id = it ->> 'produto_id';
    if not found then raise exception 'Registro não encontrado: produtos'; end if;
    perform pdv_priv.req(coalesce(prod.ativo, false) and prod.tipo = 'venda', 'Produto inativo ou inválido');
    insert into pdv.itens_venda (venda_id, produto_id, quantidade, preco_unitario, custo_unitario)
    values (v_venda, prod.id, (it ->> 'quantidade')::double precision, (it ->> 'preco_unitario')::double precision,
            (pdv_priv.ou_zero(it -> 'custo_unitario') #>> '{}')::double precision);
    d := jsonb_build_object('venda_id', v_venda, 'tipo_movimento', 'Saída - Venda',
                            'motivo', 'Venda ' || coalesce(p ->> 'p_identificacao_pedido', 'undefined'), 'atendente', p ->> 'p_atendente');
    if prod.modo_estoque = 'sem_controle' then
      null; -- preparado na hora: não controla estoque
    elsif prod.modo_estoque = 'producao_sob_demanda' then
      perform pdv_priv.consume(prod.id, (it ->> 'quantidade')::double precision, d || '{"tipo_movimento":"Saída - Produção"}');
    else
      perform pdv_priv.movement('produtos', prod.id, -(it ->> 'quantidade')::double precision, d);
    end if;
  end loop;
  perform pdv_priv.bank(pay.bank);
  if comanda is not null then update pdv.comandas set status = 'fechada' where id = comanda; end if;
  return v_venda;
end $$;

-- Catálogo: tudo que não é Bebidas nem Salgados passa a ser "sem controle",
-- apenas para produtos ainda intocados (estoque zero, sem ficha técnica, modo revenda).
update pdv.produtos p set modo_estoque = 'sem_controle'
 where p.modo_estoque = 'revenda'
   and coalesce(p.categoria, '') not in ('Bebidas', 'Salgados')
   and coalesce(p.quantidade_estoque, 0) = 0
   and not exists (select 1 from pdv.fichas_tecnicas f where f.produto_venda_id = p.id);
