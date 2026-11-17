-- PDV Café Garagem — banco na nuvem (Supabase/Postgres).
-- Porta o antigo servidor SQLite local (server/db.mjs e server/operations.mjs).
-- Tudo fica no schema "pdv"; os auxiliares internos ficam em "pdv_priv", que não é exposto pela API.

create schema if not exists pdv;
create schema if not exists pdv_priv;

-- Datas gravadas como texto ISO em UTC, igual à versão local, para manter as comparações por texto do front-end.
create function pdv_priv.agora() returns text language sql stable
as $$ select to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $$;

create function pdv_priv.hoje() returns text language sql stable
as $$ select to_char(now() at time zone 'America/Sao_Paulo', 'YYYY-MM-DD') $$;

-- Ponto único de controle de acesso. Sem login por enquanto: libera tudo.
-- Para exigir login depois, troque o corpo por algo como: select auth.uid() = '<id do usuário do café>'::uuid
create function pdv.acesso_permitido() returns boolean language sql stable
as $$ select true $$;
create table pdv.comandas (
  "atendente" text,
  "created_at" text default pdv_priv.agora(),
  id text primary key default gen_random_uuid()::text,
  "identificacao" text not null,
  "nome_cliente" text,
  "status" text default 'aberta'
);
create table pdv.conta_bancaria (
  id integer primary key default 1,
  "saldo" double precision default 0
);
create table pdv.fornecedores (
  "contacto" text,
  id text primary key default gen_random_uuid()::text,
  "nome" text not null
);
create table pdv.contas_pagar (
  "cancelada_em" text,
  "created_at" text default pdv_priv.agora(),
  "data_pagamento" text,
  "data_vencimento" text not null,
  "descricao" text not null,
  "fornecedor_id" text,
  id text primary key default gen_random_uuid()::text,
  "metodo_pagamento" text,
  "motivo_cancelamento" text,
  "pagamentos" jsonb not null default '[]'::jsonb,
  "status" text default 'Pendente',
  "valor" double precision not null default 0,
  "valor_original" double precision default 0,
  foreign key ("fornecedor_id") references pdv.fornecedores("id") on delete restrict
);
create table pdv.controle_caixa (
  "data_abertura" text default pdv_priv.agora(),
  "data_fechamento" text,
  "fundo_inicial" double precision not null default 0,
  id text primary key default gen_random_uuid()::text,
  "status" text default 'aberto',
  "valor_informado_fechamento" double precision default 0
);
create table pdv.entradas (
  "data_entrada" text default pdv_priv.agora(),
  "fornecedor_id" text,
  id text primary key default gen_random_uuid()::text,
  "total_nota" double precision default 0,
  foreign key ("fornecedor_id") references pdv.fornecedores("id") on delete restrict
);
create table pdv.insumos (
  "created_at" text default pdv_priv.agora(),
  "custo_unitario" double precision default 0,
  "fator_correcao" double precision default 1,
  id text primary key default gen_random_uuid()::text,
  "nome" text not null,
  "preco_total_pago" double precision default 0,
  "qtd_embalagem" double precision default 1,
  "quantidade_estoque" double precision default 0,
  "unidade_medida" text not null default 'un',
  check (quantidade_estoque >= -0.000000001)
);
create table pdv.produtos (
  "ativo" boolean default true,
  "estoque_minimo" double precision default 0,
  "fator_correcao" double precision default 1,
  id text primary key default gen_random_uuid()::text,
  "nome" text not null,
  "preco_custo" double precision default 0,
  "preco_total_pago" double precision default 0,
  "preco_venda" double precision default 0,
  "qtd_embalagem" double precision default 1,
  "quantidade_estoque" double precision default 0,
  "modo_estoque" text not null default 'revenda',
  "tamanho" double precision default 0,
  "tipo" text not null default 'venda',
  "unidade_medida" text default 'un',
  "categoria" text,
  check (quantidade_estoque >= -0.000000001),
  check (modo_estoque in ('revenda','producao_sob_demanda','producao_lote'))
);
create table pdv.receitas_base (
  "created_at" text default pdv_priv.agora(),
  "custo_por_unidade" double precision default 0,
  "custo_total" double precision default 0,
  id text primary key default gen_random_uuid()::text,
  "nome" text not null,
  "rendimento_peso" double precision default 1,
  "unidade_medida" text not null default 'un'
);
create table pdv.fichas_tecnicas (
  "custo_total" double precision default 0,
  id text primary key default gen_random_uuid()::text,
  "margem_lucro_desejada" double precision default 0,
  "preco_sugerido" double precision default 0,
  "produto_venda_id" text,
  "rendimento_porcoes" double precision default 1,
  foreign key ("produto_venda_id") references pdv.produtos("id") on delete restrict
);
create table pdv.ficha_ingredientes (
  "custo_calculado" double precision default 0,
  "ficha_id" text,
  id text primary key default gen_random_uuid()::text,
  "insumo_id" text,
  "produto_ingrediente_id" text,
  "quantidade_utilizada" double precision not null default 0,
  "receita_base_id" text,
  "secao" text,
  foreign key ("insumo_id") references pdv.insumos("id") on delete restrict,
  foreign key ("produto_ingrediente_id") references pdv.produtos("id") on delete restrict,
  foreign key ("receita_base_id") references pdv.receitas_base("id") on delete restrict,
  foreign key ("ficha_id") references pdv.fichas_tecnicas("id") on delete restrict
);
create table pdv.fichas_produtos (
  "created_at" text default pdv_priv.agora(),
  "custo_por_porcao" double precision default 0,
  "custo_total_receita" double precision default 0,
  id text primary key default gen_random_uuid()::text,
  "produto_id" text,
  "rendimento_porcoes" double precision default 1
);
create table pdv.fichas_produtos_itens (
  "custo_calculado" double precision default 0,
  "ficha_produto_id" text,
  id text primary key default gen_random_uuid()::text,
  "insumo_id" text,
  "qtd_usada" double precision not null default 0,
  "receita_base_id" text
);
create table pdv.itens_comanda (
  "comanda_id" text,
  "created_at" text default pdv_priv.agora(),
  id text primary key default gen_random_uuid()::text,
  "preco_unitario" double precision not null default 0,
  "produto_id" text,
  "quantidade" double precision not null default 0,
  foreign key ("produto_id") references pdv.produtos("id") on delete restrict,
  foreign key ("comanda_id") references pdv.comandas("id") on delete cascade,
  check (quantidade > 0 and preco_unitario >= 0)
);
create table pdv.vendas (
  "atendente" text,
  "caixa_id" text,
  "cancelada_em" text,
  "data_venda" text default pdv_priv.agora(),
  "desconto" double precision default 0,
  id text primary key default gen_random_uuid()::text,
  "identificacao_pedido" text not null,
  "metodo_pagamento" text,
  "motivo_cancelamento" text,
  "pagamentos" jsonb not null default '[]'::jsonb,
  "status" text not null default 'Concluída',
  "total" double precision not null default 0,
  "valor_cartao_credito" double precision default 0,
  "valor_cartao_debito" double precision default 0,
  "valor_dinheiro" double precision default 0,
  "valor_pix" double precision default 0
);
create table pdv.itens_venda (
  "custo_unitario" double precision default 0,
  id text primary key default gen_random_uuid()::text,
  "preco_unitario" double precision not null default 0,
  "produto_id" text,
  "quantidade" double precision not null default 0,
  "venda_id" text,
  foreign key ("produto_id") references pdv.produtos("id") on delete restrict,
  foreign key ("venda_id") references pdv.vendas("id") on delete restrict,
  check (quantidade > 0 and preco_unitario >= 0)
);
create table pdv.movimentacoes_caixa (
  "caixa_id" text,
  "data_movimento" text not null default pdv_priv.agora(),
  "descricao" text,
  id text primary key default gen_random_uuid()::text,
  "tipo" text not null default 'venda',
  "valor" double precision not null default 0,
  foreign key ("caixa_id") references pdv.controle_caixa("id") on delete restrict
);
create table pdv.movimentacoes_estoque (
  "atendente" text,
  "created_at" text default pdv_priv.agora(),
  id text primary key default gen_random_uuid()::text,
  "insumo_id" text,
  "motivo" text,
  "produto_id" text,
  "quantidade" double precision not null default 0,
  "tipo_movimento" text not null,
  "venda_id" text,
  foreign key ("produto_id") references pdv.produtos("id") on delete restrict,
  foreign key ("insumo_id") references pdv.insumos("id") on delete restrict,
  foreign key ("venda_id") references pdv.vendas("id") on delete restrict
);
create table pdv.parametros_precificacao (
  "custos_fixos_pct" double precision default 0,
  id integer primary key default 1,
  "imposto_taxa_cartao_pct" double precision default 0,
  "margem_lucro_alvo_pct" double precision default 0
);
create table pdv.receitas_base_itens (
  "custo_calculado" double precision default 0,
  id text primary key default gen_random_uuid()::text,
  "insumo_id" text,
  "qtd_usada" double precision not null default 0,
  "receita_base_id" text,
  foreign key ("insumo_id") references pdv.insumos("id") on delete restrict,
  foreign key ("receita_base_id") references pdv.receitas_base("id") on delete restrict
);
-- ============================================================
-- Auxiliares (equivalentes a requireValue/num/positive/cents)
-- ============================================================
create function pdv_priv.req(cond boolean, msg text) returns void language plpgsql immutable
as $$ begin if cond is not true then raise exception using message = msg; end if; end $$;

create function pdv_priv.num(v jsonb, vmin double precision default 0) returns double precision language plpgsql immutable
as $$
declare x double precision;
begin
  if v is null or jsonb_typeof(v) <> 'number' then raise exception 'Valor numérico inválido'; end if;
  x := (v #>> '{}')::double precision;
  if x < vmin then raise exception 'Valor numérico inválido'; end if;
  return x;
end $$;

create function pdv_priv.num(x double precision, vmin double precision default 0) returns double precision language plpgsql immutable
as $$ begin
  if x is null or x < vmin then raise exception 'Valor numérico inválido'; end if;
  return x;
end $$;

create function pdv_priv.positive(v jsonb) returns double precision language plpgsql immutable
as $$ declare x double precision := pdv_priv.num(v);
begin perform pdv_priv.req(x > 0, 'A quantidade ou valor deve ser maior que zero'); return x; end $$;

create function pdv_priv.positive(v double precision) returns double precision language plpgsql immutable
as $$ declare x double precision := pdv_priv.num(v);
begin perform pdv_priv.req(x > 0, 'A quantidade ou valor deve ser maior que zero'); return x; end $$;

-- Math.round(x*100) do JavaScript (meio para cima).
create function pdv_priv.cents(x double precision) returns bigint language sql immutable
as $$ select floor(x * 100 + 0.5)::bigint $$;

-- Valor JSON ausente ou null vira 0 (equivale a "valor ?? 0").
create function pdv_priv.ou_zero(v jsonb) returns jsonb language sql immutable
as $$ select case when v is null or jsonb_typeof(v) = 'null' then '0'::jsonb else v end $$;

-- Texto "verdadeiro" no sentido do JavaScript (não nulo e não vazio).
create function pdv_priv.texto(v text) returns text language sql immutable
as $$ select nullif(v, '') $$;

create type pdv_priv.pagto as (cash double precision, bank double precision, pix double precision,
  credit double precision, debit double precision, methods text);

create function pdv_priv.payments(items jsonb, total double precision) returns pdv_priv.pagto language plpgsql
as $$
declare
  r pdv_priv.pagto := row(0, 0, 0, 0, 0, '');
  it jsonb; v double precision; m text; soma bigint := 0; ms text[] := '{}';
begin
  perform pdv_priv.req(jsonb_typeof(items) = 'array', 'Pagamentos inválidos');
  for it in select value from jsonb_array_elements(items) loop
    v := pdv_priv.positive(it -> 'valor');
    m := case when jsonb_typeof(it -> 'metodo') = 'string' then it ->> 'metodo' end;
    perform pdv_priv.req(m = any (array['Dinheiro','PIX','Cartão de Crédito','Cartão de Débito','Transferência']), 'Método de pagamento inválido');
    perform pdv_priv.req(abs(v * 100 - pdv_priv.cents(v)) < 0.000001, 'Pagamento deve ter no máximo duas casas decimais');
    soma := soma + pdv_priv.cents(v); ms := ms || m;
    if m = 'Dinheiro' then r.cash := r.cash + v; else r.bank := r.bank + v; end if;
    if m in ('PIX', 'Transferência') then r.pix := r.pix + v; end if;
    if m = 'Cartão de Crédito' then r.credit := r.credit + v; end if;
    if m = 'Cartão de Débito' then r.debit := r.debit + v; end if;
  end loop;
  perform pdv_priv.req(soma = pdv_priv.cents(pdv_priv.num(total)), 'Os pagamentos devem totalizar o valor da operação');
  r.methods := coalesce((select string_agg(x, ' + ' order by x collate "C") from (select distinct unnest(ms) as x) t), '');
  return r;
end $$;

create function pdv_priv.open_cash(caixa text) returns void language plpgsql
as $$ begin
  perform pdv_priv.req((select status from pdv.controle_caixa where id = caixa) = 'aberto', 'É necessário um caixa aberto');
end $$;

create function pdv_priv.bank(delta double precision) returns void language plpgsql
as $$ begin
  update pdv.conta_bancaria set saldo = floor((coalesce(saldo, 0) + delta) * 100 + 0.5) / 100 where id = 1;
  if not found then raise exception 'Registro não encontrado: conta_bancaria'; end if;
end $$;

create function pdv_priv.movement(tbl text, rid text, delta double precision, d jsonb) returns void language plpgsql
as $$
declare q double precision; stock double precision;
begin
  perform pdv_priv.num(abs(delta));
  if tbl = 'insumos' then select quantidade_estoque into q from pdv.insumos where id = rid for update;
  else select quantidade_estoque into q from pdv.produtos where id = rid for update; end if;
  if not found then raise exception 'Registro não encontrado: %', tbl; end if;
  stock := coalesce(q, 0) + delta;
  perform pdv_priv.req(stock >= -1e-9, 'Estoque insuficiente');
  if tbl = 'insumos' then update pdv.insumos set quantidade_estoque = greatest(0, stock) where id = rid;
  else update pdv.produtos set quantidade_estoque = greatest(0, stock) where id = rid; end if;
  insert into pdv.movimentacoes_estoque (insumo_id, produto_id, quantidade, venda_id, tipo_movimento, motivo, atendente)
  values (case when tbl = 'insumos' then rid end, case when tbl <> 'insumos' then rid end, delta,
          d ->> 'venda_id', d ->> 'tipo_movimento', d ->> 'motivo', d ->> 'atendente');
end $$;

create function pdv_priv.consume(produto text, quantidade double precision, d jsonb) returns void language plpgsql
as $$
declare
  sh pdv.fichas_tecnicas; it pdv.ficha_ingredientes; base pdv.receitas_base; ing pdv.receitas_base_itens;
  qty double precision; n int := 0; nb int;
begin
  select * into sh from pdv.fichas_tecnicas where produto_venda_id = produto limit 1;
  perform pdv_priv.req(found and sh.rendimento_porcoes > 0, 'Produto sem ficha técnica ou rendimento válido');
  for it in select * from pdv.ficha_ingredientes where ficha_id = sh.id loop
    n := n + 1;
    qty := quantidade / pdv_priv.positive(sh.rendimento_porcoes) * pdv_priv.positive(it.quantidade_utilizada);
    if pdv_priv.texto(it.insumo_id) is not null then
      perform pdv_priv.movement('insumos', it.insumo_id, -qty, d);
    elsif pdv_priv.texto(it.produto_ingrediente_id) is not null then
      perform pdv_priv.movement('produtos', it.produto_ingrediente_id, -qty, d);
    elsif pdv_priv.texto(it.receita_base_id) is not null then
      select * into base from pdv.receitas_base where id = it.receita_base_id;
      if not found then raise exception 'Registro não encontrado: receitas_base'; end if;
      perform pdv_priv.positive(base.rendimento_peso);
      nb := 0;
      for ing in select * from pdv.receitas_base_itens where receita_base_id = base.id loop
        nb := nb + 1;
        perform pdv_priv.movement('insumos', ing.insumo_id, -qty / base.rendimento_peso * pdv_priv.positive(ing.qtd_usada), d);
      end loop;
      perform pdv_priv.req(nb > 0, 'Receita-base sem ingredientes');
    else
      raise exception 'Ingrediente sem origem';
    end if;
  end loop;
  perform pdv_priv.req(n > 0, 'A ficha técnica precisa ter ingredientes');
end $$;

create function pdv_priv.recalculate() returns void language plpgsql
as $$ begin
  perform pdv_priv.req(not exists (select 1 from pdv.receitas_base_itens i left join pdv.insumos x on x.id = i.insumo_id where x.id is null),
    'Registro não encontrado: insumos');
  update pdv.receitas_base_itens i set custo_calculado = i.qtd_usada * coalesce(x.custo_unitario, 0)
    from pdv.insumos x where x.id = i.insumo_id;

  update pdv.receitas_base b set custo_total = s.total,
         custo_por_unidade = case when b.rendimento_peso > 0 then s.total / b.rendimento_peso else 0 end
    from (select b2.id, coalesce(sum(coalesce(i.custo_calculado, 0)), 0) as total
            from pdv.receitas_base b2 left join pdv.receitas_base_itens i on i.receita_base_id = b2.id group by b2.id) s
   where s.id = b.id;

  perform pdv_priv.req(not exists (
      select 1 from pdv.ficha_ingredientes f
       where (pdv_priv.texto(f.insumo_id) is not null and not exists (select 1 from pdv.insumos x where x.id = f.insumo_id))
          or (pdv_priv.texto(f.insumo_id) is null and pdv_priv.texto(f.receita_base_id) is not null and not exists (select 1 from pdv.receitas_base x where x.id = f.receita_base_id))
          or (pdv_priv.texto(f.insumo_id) is null and pdv_priv.texto(f.receita_base_id) is null and not exists (select 1 from pdv.produtos x where x.id = f.produto_ingrediente_id))),
    'Registro não encontrado: ingrediente da ficha técnica');
  update pdv.ficha_ingredientes f set custo_calculado = f.quantidade_utilizada * coalesce(
      case when pdv_priv.texto(f.insumo_id) is not null then (select custo_unitario from pdv.insumos where id = f.insumo_id)
           when pdv_priv.texto(f.receita_base_id) is not null then (select custo_por_unidade from pdv.receitas_base where id = f.receita_base_id)
           else (select preco_custo from pdv.produtos where id = f.produto_ingrediente_id) end, 0)
   where true;

  update pdv.fichas_tecnicas t set custo_total = s.total
    from (select t2.id, coalesce(sum(coalesce(f.custo_calculado, 0)), 0) as total
            from pdv.fichas_tecnicas t2 left join pdv.ficha_ingredientes f on f.ficha_id = t2.id group by t2.id) s
   where s.id = t.id;
  update pdv.produtos p set preco_custo = case when t.rendimento_porcoes > 0 then t.custo_total / t.rendimento_porcoes else 0 end
    from pdv.fichas_tecnicas t where t.produto_venda_id = p.id;
end $$;

-- ============================================================
-- Vendas
-- ============================================================
create function pdv_priv.sale(p jsonb) returns text language plpgsql
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
    if prod.modo_estoque = 'producao_sob_demanda' then
      perform pdv_priv.consume(prod.id, (it ->> 'quantidade')::double precision, d || '{"tipo_movimento":"Saída - Produção"}');
    else
      perform pdv_priv.movement('produtos', prod.id, -(it ->> 'quantidade')::double precision, d);
    end if;
  end loop;
  perform pdv_priv.bank(pay.bank);
  if comanda is not null then update pdv.comandas set status = 'fechada' where id = comanda; end if;
  return v_venda;
end $$;

create function pdv_priv.cancel_sale(p jsonb) returns void language plpgsql
as $$
declare v pdv.vendas; mov pdv.movimentacoes_estoque; v_motivo text := coalesce(pdv_priv.texto(p ->> 'p_motivo'), 'Cancelamento de venda');
begin
  select * into v from pdv.vendas where id = p ->> 'p_venda_id';
  if not found then raise exception 'Registro não encontrado: vendas'; end if;
  perform pdv_priv.req(v.status <> 'Cancelada', 'Esta venda já foi cancelada');
  for mov in select * from pdv.movimentacoes_estoque where venda_id = v.id and quantidade < 0 order by created_at, id loop
    perform pdv_priv.movement(case when pdv_priv.texto(mov.insumo_id) is not null then 'insumos' else 'produtos' end,
      coalesce(pdv_priv.texto(mov.insumo_id), mov.produto_id), -mov.quantidade,
      jsonb_build_object('venda_id', v.id, 'tipo_movimento', 'Entrada - Estorno Venda', 'motivo', v_motivo, 'atendente', v.atendente));
  end loop;
  perform pdv_priv.bank(-(coalesce(v.valor_pix, 0) + coalesce(v.valor_cartao_credito, 0) + coalesce(v.valor_cartao_debito, 0)));
  update pdv.vendas set status = 'Cancelada', cancelada_em = pdv_priv.agora(), motivo_cancelamento = v_motivo where id = v.id;
end $$;

-- ============================================================
-- Financeiro e compras
-- ============================================================
create function pdv_priv.expense(pay pdv_priv.pagto, caixa text, v_desc text, reverse boolean default false) returns void language plpgsql
as $$ begin
  if pay.cash <> 0 then
    perform pdv_priv.open_cash(caixa);
    insert into pdv.movimentacoes_caixa (caixa_id, tipo, valor, descricao)
    values (caixa, case when reverse then 'suprimento' else 'despesa' end, pay.cash, v_desc);
  end if;
  perform pdv_priv.bank(case when reverse then pay.bank else -pay.bank end);
end $$;

create function pdv_priv.purchase_account(p jsonb, total double precision, immediate double precision, v_desc text) returns void language plpgsql
as $$
declare pay pdv_priv.pagto; deferred double precision;
begin
  if immediate > 0 then
    pay := pdv_priv.payments(p -> 'p_pagamentos_imediatos', immediate);
    perform pdv_priv.expense(pay, p ->> 'p_caixa_id', 'Pago: ' || v_desc);
    insert into pdv.contas_pagar (descricao, fornecedor_id, valor, valor_original, data_vencimento, data_pagamento, status, metodo_pagamento, pagamentos)
    values (v_desc || ' (Pag. Imediato)', p ->> 'p_fornecedor_id', immediate, immediate, pdv_priv.hoje(), pdv_priv.hoje(), 'Pago', pay.methods, p -> 'p_pagamentos_imediatos');
  end if;
  deferred := case when jsonb_typeof(p -> 'p_valor_prazo') = 'number' then (p ->> 'p_valor_prazo')::double precision else 0 end;
  if deferred > 0 then
    perform pdv_priv.req(jsonb_typeof(p -> 'p_data_vencimento') = 'string' and (p ->> 'p_data_vencimento') ~ '^\d{4}-\d{2}-\d{2}$', 'Informe a data de vencimento');
    insert into pdv.contas_pagar (descricao, fornecedor_id, valor, valor_original, data_vencimento, status)
    values (v_desc || ' (A Prazo)', p ->> 'p_fornecedor_id', deferred, deferred, p ->> 'p_data_vencimento', 'Pendente');
  end if;
  perform pdv_priv.req(pdv_priv.cents(immediate + deferred) = pdv_priv.cents(total), 'Total da compra inválido');
end $$;

-- ============================================================
-- Funções públicas (chamadas pelo front-end via supabase.schema('pdv').rpc)
-- Cada uma trava um lock global para executar em série, como o BEGIN IMMEDIATE do SQLite.
-- ============================================================
create function pdv_priv.lock() returns void language plpgsql
as $$ begin
  perform pdv_priv.req(pdv.acesso_permitido(), 'Acesso não permitido');
  perform pg_advisory_xact_lock(hashtext('pdv-cafe-garagem'));
end $$;

create function pdv.registrar_venda(p_caixa_id jsonb default null, p_comanda_id jsonb default null, p_identificacao_pedido jsonb default null,
  p_total jsonb default null, p_desconto jsonb default null, p_pagamentos jsonb default null, p_atendente jsonb default null, p_itens jsonb default null)
returns text language plpgsql
as $$ begin
  perform pdv_priv.lock();
  return pdv_priv.sale(jsonb_build_object('p_caixa_id', p_caixa_id, 'p_comanda_id', p_comanda_id, 'p_identificacao_pedido', p_identificacao_pedido,
    'p_total', p_total, 'p_desconto', p_desconto, 'p_pagamentos', p_pagamentos, 'p_atendente', p_atendente, 'p_itens', p_itens));
end $$;

create function pdv.cancelar_venda(p_venda_id jsonb default null, p_motivo jsonb default null) returns void language plpgsql
as $$ begin
  perform pdv_priv.lock();
  perform pdv_priv.cancel_sale(jsonb_build_object('p_venda_id', p_venda_id, 'p_motivo', p_motivo));
end $$;

create function pdv.editar_venda(p_venda_id jsonb default null, p_identificacao_pedido jsonb default null, p_total jsonb default null,
  p_desconto jsonb default null, p_pagamentos jsonb default null, p_atendente jsonb default null, p_itens jsonb default null, p_comanda_id jsonb default null)
returns text language plpgsql
as $$
declare v pdv.vendas;
begin
  perform pdv_priv.lock();
  select * into v from pdv.vendas where id = p_venda_id #>> '{}';
  if not found then raise exception 'Registro não encontrado: vendas'; end if;
  perform pdv_priv.req(v.status = 'Concluída', 'Venda concluída não encontrada');
  perform pdv_priv.cancel_sale(jsonb_build_object('p_venda_id', v.id, 'p_motivo', 'Venda substituída por edição'));
  return pdv_priv.sale(jsonb_build_object('p_caixa_id', v.caixa_id, 'p_comanda_id', p_comanda_id, 'p_identificacao_pedido', p_identificacao_pedido,
    'p_total', p_total, 'p_desconto', p_desconto, 'p_pagamentos', p_pagamentos, 'p_atendente', p_atendente, 'p_itens', p_itens));
end $$;

create function pdv.registrar_producao(p_produto_id jsonb default null, p_quantidade jsonb default null, p_atendente jsonb default null, p_motivo jsonb default null)
returns void language plpgsql
as $$
declare q double precision; prod pdv.produtos; d jsonb;
begin
  perform pdv_priv.lock();
  q := pdv_priv.positive(p_quantidade);
  select * into prod from pdv.produtos where id = p_produto_id #>> '{}';
  if not found then raise exception 'Registro não encontrado: produtos'; end if;
  perform pdv_priv.req(coalesce(prod.ativo, false) and prod.tipo = 'venda' and prod.modo_estoque = 'producao_lote', 'Produto não configurado para produção em lote');
  d := jsonb_build_object('atendente', p_atendente #>> '{}', 'motivo', coalesce(pdv_priv.texto(p_motivo #>> '{}'), 'Produção em lote'), 'tipo_movimento', 'Saída - Produção');
  perform pdv_priv.consume(prod.id, q, d);
  perform pdv_priv.movement('produtos', prod.id, q, d || '{"tipo_movimento":"Entrada - Produção"}');
end $$;

create function pdv_priv.ajuste(tbl text, rid text, p_quantidade jsonb, p_tipo_movimento jsonb, p_motivo jsonb, p_atendente jsonb) returns void language plpgsql
as $$
declare q double precision; tipo text;
begin
  perform pdv_priv.lock();
  q := pdv_priv.positive(p_quantidade);
  tipo := case when jsonb_typeof(p_tipo_movimento) = 'string' then p_tipo_movimento #>> '{}' end;
  perform pdv_priv.req(btrim(tipo) <> '', 'Tipo de ajuste inválido');
  perform pdv_priv.movement(tbl, rid, (case when tipo ~ 'Saída|Negativa' then -1 else 1 end) * q,
    jsonb_build_object('tipo_movimento', tipo, 'motivo', coalesce(pdv_priv.texto(p_motivo #>> '{}'), 'Ajuste manual'), 'atendente', p_atendente #>> '{}'));
end $$;

create function pdv.registrar_ajuste_estoque(p_produto_id jsonb default null, p_quantidade jsonb default null, p_tipo_movimento jsonb default null,
  p_motivo jsonb default null, p_atendente jsonb default null) returns void language sql
as $$ select pdv_priv.ajuste('produtos', p_produto_id #>> '{}', p_quantidade, p_tipo_movimento, p_motivo, p_atendente) $$;

create function pdv.registrar_ajuste_insumo(p_insumo_id jsonb default null, p_quantidade jsonb default null, p_tipo_movimento jsonb default null,
  p_motivo jsonb default null, p_atendente jsonb default null) returns void language sql
as $$ select pdv_priv.ajuste('insumos', p_insumo_id #>> '{}', p_quantidade, p_tipo_movimento, p_motivo, p_atendente) $$;

create function pdv.recalcular_custos_cmv() returns void language plpgsql
as $$ begin perform pdv_priv.lock(); perform pdv_priv.recalculate(); end $$;

create function pdv.registrar_compra_insumo(p_insumo_id jsonb default null, p_fornecedor_id jsonb default null, p_quantidade_estoque jsonb default null,
  p_valor_total jsonb default null, p_custo_unitario jsonb default null, p_gerar_conta_pagar jsonb default null, p_data_vencimento jsonb default null,
  p_metodo_pagamento jsonb default null, p_caixa_id jsonb default null, p_atendente jsonb default null)
returns void language plpgsql
as $$
declare qtd double precision; total double precision; custo double precision; ing pdv.insumos; forn pdv.fornecedores; gerar boolean; p jsonb;
begin
  perform pdv_priv.lock();
  qtd := pdv_priv.positive(p_quantidade_estoque); total := pdv_priv.positive(p_valor_total); custo := pdv_priv.num(p_custo_unitario);
  select * into ing from pdv.insumos where id = p_insumo_id #>> '{}';
  if not found then raise exception 'Registro não encontrado: insumos'; end if;
  select * into forn from pdv.fornecedores where id = p_fornecedor_id #>> '{}';
  if not found then raise exception 'Registro não encontrado: fornecedores'; end if;
  perform pdv_priv.movement('insumos', ing.id, qtd,
    jsonb_build_object('tipo_movimento', 'Entrada - Compra', 'motivo', 'Nota Fornecedor: ' || forn.nome, 'atendente', p_atendente #>> '{}'));
  update pdv.insumos set custo_unitario = custo, preco_total_pago = total where id = ing.id;
  gerar := coalesce(p_gerar_conta_pagar = 'true'::jsonb, false);
  p := jsonb_build_object('p_fornecedor_id', p_fornecedor_id, 'p_caixa_id', p_caixa_id, 'p_data_vencimento', p_data_vencimento,
    'p_valor_prazo', case when gerar then total else 0 end,
    'p_pagamentos_imediatos', case when gerar then '[]'::jsonb else jsonb_build_array(jsonb_build_object('metodo', p_metodo_pagamento, 'valor', total)) end);
  perform pdv_priv.purchase_account(p, total, case when gerar then 0 else total end, 'Compra Insumo: ' || ing.nome);
  perform pdv_priv.recalculate();
end $$;

create function pdv.registrar_compra_lote_insumos(p_lote_id jsonb default null, p_fornecedor_id jsonb default null, p_itens jsonb default null,
  p_total jsonb default null, p_pagamentos_imediatos jsonb default null, p_valor_prazo jsonb default null, p_data_vencimento jsonb default null,
  p_caixa_id jsonb default null, p_atendente jsonb default null)
returns void language plpgsql
as $$
declare
  lote text; total double precision; v_motivo text; soma double precision := 0; it jsonb; tbl text; rid text;
  qtd double precision; custo double precision; linha double precision; prod pdv.produtos; imediato double precision := 0; pg jsonb;
begin
  perform pdv_priv.lock();
  lote := case when jsonb_typeof(p_lote_id) = 'string' then p_lote_id #>> '{}' end;
  perform pdv_priv.req(btrim(lote) <> '', 'Identificador de lote inválido');
  total := pdv_priv.positive(p_total);
  perform pdv_priv.num(p_valor_prazo);
  if pdv_priv.texto(p_fornecedor_id #>> '{}') is not null and not exists (select 1 from pdv.fornecedores where id = p_fornecedor_id #>> '{}') then
    raise exception 'Registro não encontrado: fornecedores';
  end if;
  perform pdv_priv.req(jsonb_typeof(p_itens) = 'array' and jsonb_array_length(p_itens) > 0, 'Lote sem itens');
  v_motivo := 'Abastecimento via Lote [LOTE-' || lote || ']';
  perform pdv_priv.req(not exists (select 1 from pdv.movimentacoes_estoque m where m.motivo = v_motivo), 'Este lote já foi registrado');
  for it in select value from jsonb_array_elements(p_itens) loop
    perform pdv_priv.req(it ->> 'tipo_item' in ('produto', 'insumo'), 'Tipo de item inválido');
    qtd := pdv_priv.positive(it -> 'quantidade_estoque'); custo := pdv_priv.num(it -> 'preco_custo'); linha := pdv_priv.positive(it -> 'valor_linha');
    soma := soma + linha;
    tbl := case when it ->> 'tipo_item' = 'insumo' then 'insumos' else 'produtos' end;
    rid := coalesce(pdv_priv.texto(it ->> 'insumo_id'), it ->> 'produto_id');
    if tbl = 'produtos' then
      select * into prod from pdv.produtos where id = rid;
      if not found then raise exception 'Registro não encontrado: produtos'; end if;
      perform pdv_priv.req(prod.tipo = 'venda' and prod.modo_estoque = 'revenda', 'Produto não é de revenda');
    elsif not exists (select 1 from pdv.insumos where id = rid) then
      raise exception 'Registro não encontrado: insumos';
    end if;
    perform pdv_priv.movement(tbl, rid, qtd, jsonb_build_object('tipo_movimento', 'Entrada - Compra Lote', 'motivo', v_motivo, 'atendente', p_atendente #>> '{}'));
    if tbl = 'insumos' then
      update pdv.insumos set custo_unitario = custo, preco_total_pago = linha where id = rid;
    else
      update pdv.produtos set preco_custo = custo, preco_venda = pdv_priv.num(pdv_priv.ou_zero(it -> 'preco_venda')) where id = rid;
    end if;
  end loop;
  perform pdv_priv.req(pdv_priv.cents(soma) = pdv_priv.cents(total), 'Os itens não totalizam o valor do lote');
  if jsonb_typeof(p_pagamentos_imediatos) = 'array' then
    for pg in select value from jsonb_array_elements(p_pagamentos_imediatos) loop
      imediato := imediato + pdv_priv.num(pg -> 'valor');
    end loop;
  end if;
  perform pdv_priv.purchase_account(jsonb_build_object('p_fornecedor_id', p_fornecedor_id, 'p_caixa_id', p_caixa_id, 'p_data_vencimento', p_data_vencimento,
      'p_valor_prazo', p_valor_prazo, 'p_pagamentos_imediatos', p_pagamentos_imediatos),
    total, imediato, 'Compra Lote [LOTE-' || lote || ']');
  perform pdv_priv.recalculate();
end $$;

create function pdv.baixar_conta_pagar(p_conta_id jsonb default null, p_valor jsonb default null, p_pagamentos jsonb default null, p_caixa_id jsonb default null)
returns void language plpgsql
as $$
declare c pdv.contas_pagar; v double precision; pay pdv_priv.pagto;
begin
  perform pdv_priv.lock();
  select * into c from pdv.contas_pagar where id = p_conta_id #>> '{}';
  if not found then raise exception 'Registro não encontrado: contas_pagar'; end if;
  perform pdv_priv.req(c.status = 'Pendente', 'A conta já foi baixada');
  v := pdv_priv.positive(p_valor);
  pay := pdv_priv.payments(p_pagamentos, v);
  perform pdv_priv.expense(pay, p_caixa_id #>> '{}', 'Pago: ' || c.descricao);
  update pdv.contas_pagar set status = 'Pago', valor = v, valor_original = coalesce(nullif(c.valor_original, 0), c.valor),
         data_pagamento = pdv_priv.hoje(), metodo_pagamento = pay.methods, pagamentos = p_pagamentos
   where id = c.id;
end $$;

create function pdv.cancelar_conta_pagar(p_conta_id jsonb default null, p_caixa_id jsonb default null, p_motivo jsonb default null)
returns void language plpgsql
as $$
declare c pdv.contas_pagar;
begin
  perform pdv_priv.lock();
  select * into c from pdv.contas_pagar where id = p_conta_id #>> '{}';
  if not found then raise exception 'Registro não encontrado: contas_pagar'; end if;
  perform pdv_priv.req(c.status is distinct from 'Cancelada', 'Esta conta já foi cancelada');
  if c.status = 'Pago' then
    perform pdv_priv.expense(pdv_priv.payments(c.pagamentos, c.valor), p_caixa_id #>> '{}', 'Estorno de despesa: ' || c.descricao, true);
  end if;
  update pdv.contas_pagar set status = 'Cancelada', cancelada_em = pdv_priv.agora(),
         motivo_cancelamento = coalesce(pdv_priv.texto(p_motivo #>> '{}'), 'Cancelamento pelo financeiro')
   where id = c.id;
end $$;

-- ============================================================
-- Índices e dados iniciais
-- ============================================================
create unique index uma_ficha_por_produto on pdv.fichas_tecnicas (produto_venda_id);
create unique index um_caixa_aberto on pdv.controle_caixa (status) where status = 'aberto';
create index vendas_data on pdv.vendas (data_venda);
create index movimentos_venda on pdv.movimentacoes_estoque (venda_id);
create index movimentos_motivo on pdv.movimentacoes_estoque (motivo);
create index itens_venda_venda on pdv.itens_venda (venda_id);
create index itens_comanda_comanda on pdv.itens_comanda (comanda_id);
create index ficha_ingredientes_ficha on pdv.ficha_ingredientes (ficha_id);
create index receitas_base_itens_base on pdv.receitas_base_itens (receita_base_id);
create index movimentacoes_caixa_caixa on pdv.movimentacoes_caixa (caixa_id);

insert into pdv.conta_bancaria (id, saldo) values (1, 0);
insert into pdv.parametros_precificacao (id, custos_fixos_pct, imposto_taxa_cartao_pct, margem_lucro_alvo_pct) values (1, 0, 0, 30);
insert into pdv.produtos (id,nome,categoria,preco_venda,tipo,ativo,modo_estoque,unidade_medida,quantidade_estoque,preco_custo)
select v.id,v.nome,v.categoria,v.preco_venda,'venda',true,'revenda','un',0,0 from (values
  ('cafe-garagem-001','Expresso simples','Cafés',8.9),
  ('cafe-garagem-002','Expresso duplo','Cafés',8.9),
  ('cafe-garagem-003','Expresso com leite','Cafés',12.9),
  ('cafe-garagem-004','Afogatto','Cafés',14.5),
  ('cafe-garagem-005','Café coado de garrafa','Cafés',4.5),
  ('cafe-garagem-006','Café coado de garrafa com leite','Cafés',7),
  ('cafe-garagem-007','Capuccino P','Especiais',10.5),
  ('cafe-garagem-008','Capuccino G','Especiais',13),
  ('cafe-garagem-009','Achocolatado quente','Especiais',15),
  ('cafe-garagem-010','Achocolatado gelado','Especiais',15),
  ('cafe-garagem-011','Chá','Especiais',6),
  ('cafe-garagem-012','Iced Nutella / caramelo / doce de leite','Especiais',18),
  ('cafe-garagem-013','Chantilly','Adicionais',2.9),
  ('cafe-garagem-014','Nutella','Adicionais',4),
  ('cafe-garagem-015','Requeijão','Adicionais',4),
  ('cafe-garagem-016','Misto quente','Lanches',19),
  ('cafe-garagem-017','Misto frio','Lanches',16.5),
  ('cafe-garagem-018','Queijo quente','Lanches',17.9),
  ('cafe-garagem-019','Pão com manteiga na chapa','Lanches',12.9),
  ('cafe-garagem-020','Pão com margarina','Lanches',8.5),
  ('cafe-garagem-021','Pão com ovo','Lanches',10.5),
  ('cafe-garagem-022','Omelete com presunto e queijo','Lanches',19.5),
  ('cafe-garagem-023','Salgados','Salgados',9.9),
  ('cafe-garagem-024','Pizza','Pizzas',12.5),
  ('cafe-garagem-025','Fatia de bolo simples','Sobremesas',5),
  ('cafe-garagem-026','Fatia de bolo com cobertura','Sobremesas',7),
  ('cafe-garagem-027','Bola de sorvete','Sobremesas',6),
  ('cafe-garagem-028','Refrigerante lata','Bebidas',7.5),
  ('cafe-garagem-029','Água','Bebidas',3),
  ('cafe-garagem-030','Água com gás','Bebidas',3.5)
) as v(id,nome,categoria,preco_venda);

-- ============================================================
-- Permissões e RLS
-- ============================================================
revoke all on schema pdv_priv from public;
grant usage on schema pdv, pdv_priv to anon, authenticated, service_role;
grant select, insert, update, delete on all tables in schema pdv to anon, authenticated, service_role;
revoke execute on all functions in schema pdv, pdv_priv from public;
grant execute on all functions in schema pdv, pdv_priv to anon, authenticated, service_role;
grant usage on type pdv_priv.pagto to anon, authenticated, service_role;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'pdv' loop
    execute format('alter table pdv.%I enable row level security', t);
    execute format('create policy acesso_pdv on pdv.%I for all to anon, authenticated using (pdv.acesso_permitido()) with check (pdv.acesso_permitido())', t);
  end loop;
end $$;

-- search_path fixo em todas as funções (todas as referências já são qualificadas pelo schema).
do $$
declare f regprocedure;
begin
  for f in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pdv', 'pdv_priv') loop
    execute format('alter function %s set search_path = %L', f, '');
  end loop;
end $$;
