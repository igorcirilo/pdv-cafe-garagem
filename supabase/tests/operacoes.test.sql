-- Testes das operações do PDV, portados de server/tests/local.test.mjs.
-- Rodam como o papel "anon" (o mesmo do site) e desfazem tudo no final (ROLLBACK).
-- Uso: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/operacoes.test.sql
\set QUIET on
begin;

create function pg_temp.eq(actual anyelement, expected anyelement, label text) returns void language plpgsql as $$
begin
  if actual is distinct from expected then raise exception 'FALHOU [%]: esperado %, obtido %', label, expected, actual; end if;
end $$;

create function pg_temp.throws(stmt text, pattern text, label text) returns void language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlerrm !~ pattern then raise exception 'FALHOU [%]: erro inesperado: %', label, sqlerrm; end if;
    return;
  end;
  raise exception 'FALHOU [%]: deveria ter falhado com /%/', label, pattern;
end $$;

grant execute on all functions in schema pg_temp to anon;
set local role anon;

-- Dados-base do teste
insert into pdv.controle_caixa (id, fundo_inicial) values ('cx', 100);
insert into pdv.produtos (id, nome, preco_venda, preco_custo, quantidade_estoque) values ('cafe', 'Café', 5, 2, 10);

-- 1. venda persiste, baixa estoque, credita banco e cancelamento estorna uma única vez
do $$
declare vid text;
begin
  vid := pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"Pedido teste"', p_total => '10', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_atendente => '"Teste"',
    p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5,"custo_unitario":2}]');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 8::float8, 'estoque após venda');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), 10::float8, 'banco após venda');
  perform pg_temp.eq((select pagamentos -> 0 ->> 'metodo' from pdv.vendas v where v.id = vid), 'PIX', 'pagamentos gravados');
  perform pg_temp.eq((select metodo_pagamento from pdv.vendas v where v.id = vid), 'PIX', 'método');
  perform pdv.cancelar_venda(to_jsonb(vid), '"Teste"');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 10::float8, 'estoque após cancelamento');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), 0::float8, 'banco após cancelamento');
  perform pg_temp.throws(format('select pdv.cancelar_venda(%L)', to_jsonb(vid)), 'já foi cancelada', 'cancelar duas vezes');
end $$;

-- 2. falha no segundo item desfaz tudo
do $$
declare n_vendas int := (select count(*) from pdv.vendas); n_mov int := (select count(*) from pdv.movimentacoes_estoque);
begin
  insert into pdv.produtos (id, nome, quantidade_estoque) values ('escasso', 'Sem estoque', 0);
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '15', p_desconto => '0',
    p_pagamentos => '[{"metodo":"Dinheiro","valor":15}]', p_atendente => '"T"',
    p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5},{"produto_id":"escasso","quantidade":1,"preco_unitario":5}]')$q$,
    'Estoque insuficiente', 'segundo item sem estoque');
  perform pg_temp.eq((select count(*)::int from pdv.vendas), n_vendas, 'nenhuma venda nova');
  perform pg_temp.eq((select count(*)::int from pdv.movimentacoes_estoque), n_mov, 'nenhum movimento novo');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 10::float8, 'estoque intacto');
end $$;

-- 3. valida pagamentos, total, caixa fechado e preserva venda se edição falhar
do $$
declare vid text; editada text;
  base text := $q$p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_desconto => '0', p_atendente => '"T"'$q$;
begin
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":9}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]')$q$, 'pagamentos', 'pagamento menor');
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '11', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":11}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]')$q$, 'Total incompatível', 'total errado');
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0',
    p_pagamentos => '[{"metodo":"Cheque","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]')$q$, 'Método de pagamento inválido', 'método inválido');
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":9.999},{"metodo":"PIX","valor":0.001}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]')$q$, 'duas casas', 'centavos');
  vid := pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0', p_atendente => '"T"',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]');
  perform pg_temp.throws(format($q$select pdv.editar_venda(p_venda_id => %L, p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":200,"preco_unitario":0.05}]')$q$, to_jsonb(vid)),
    'Estoque insuficiente', 'edição sem estoque');
  perform pg_temp.eq((select status from pdv.vendas v where v.id = vid), 'Concluída', 'venda preservada');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), 10::float8, 'banco preservado');
  editada := pdv.editar_venda(p_venda_id => to_jsonb(vid), p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0', p_atendente => '"T"',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]');
  perform pg_temp.eq(editada <> vid, true, 'edição gera nova venda');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 8::float8, 'estoque após edição');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), 10::float8, 'banco após edição');
  -- desfaz para os próximos cenários
  perform pdv.cancelar_venda(to_jsonb(editada));
  update pdv.controle_caixa set status = 'fechado' where id = 'cx';
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]')$q$, 'caixa aberto', 'caixa fechado');
  update pdv.controle_caixa set status = 'aberto' where id = 'cx';
end $$;

-- 4. produção sob demanda e em lote consomem insumos proporcionalmente e CMV recalcula
do $$
declare vid text;
begin
  insert into pdv.insumos (id, nome, unidade_medida, quantidade_estoque, custo_unitario) values ('grao', 'Grão', 'g', 100, 0.1);
  insert into pdv.receitas_base (id, nome, unidade_medida, rendimento_peso) values ('base', 'Base', 'g', 10);
  insert into pdv.receitas_base_itens (receita_base_id, insumo_id, qtd_usada) values ('base', 'grao', 20);
  insert into pdv.fichas_tecnicas (id, produto_venda_id, rendimento_porcoes) values ('ficha', 'cafe', 2);
  insert into pdv.ficha_ingredientes (ficha_id, receita_base_id, quantidade_utilizada) values ('ficha', 'base', 10);
  update pdv.produtos set modo_estoque = 'producao_sob_demanda', quantidade_estoque = 0 where id = 'cafe';
  perform pdv.recalcular_custos_cmv();
  perform pg_temp.eq((select preco_custo from pdv.produtos where id = 'cafe'), 1::float8, 'CMV');
  vid := pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0', p_atendente => '"T"',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'grao'), 80::float8, 'insumo consumido');
  perform pdv.cancelar_venda(to_jsonb(vid));
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'grao'), 100::float8, 'insumo estornado');
  update pdv.produtos set modo_estoque = 'producao_lote' where id = 'cafe';
  perform pdv.registrar_producao(p_produto_id => '"cafe"', p_quantidade => '4', p_atendente => '"T"');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 4::float8, 'produção em lote');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'grao'), 60::float8, 'insumo da produção');
  perform pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"P"', p_total => '10', p_desconto => '0', p_atendente => '"T"',
    p_pagamentos => '[{"metodo":"PIX","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 2::float8, 'venda de lote');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'grao'), 60::float8, 'venda de lote não consome insumo');
  -- volta ao estado de revenda com 10 unidades e banco zerado
  delete from pdv.ficha_ingredientes where ficha_id = 'ficha';
  delete from pdv.fichas_tecnicas where id = 'ficha';
  update pdv.produtos set modo_estoque = 'revenda', quantidade_estoque = 10 where id = 'cafe';
  update pdv.conta_bancaria set saldo = 0 where id = 1;
end $$;

-- 5. compra de insumo, lote misto, prazo, baixa e estorno financeiro
do $$
declare conta text; lote text; antes int;
begin
  insert into pdv.fornecedores (id, nome) values ('forn', 'Fornecedor');
  insert into pdv.insumos (id, nome, unidade_medida) values ('leite', 'Leite', 'l');
  perform pdv.registrar_compra_insumo(p_insumo_id => '"leite"', p_fornecedor_id => '"forn"', p_quantidade_estoque => '5', p_valor_total => '20',
    p_custo_unitario => '4', p_gerar_conta_pagar => 'true', p_data_vencimento => '"2026-12-01"', p_atendente => '"T"');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'leite'), 5::float8, 'compra de insumo');
  select id into conta from pdv.contas_pagar where descricao = 'Compra Insumo: Leite (A Prazo)';
  perform pg_temp.eq(conta is not null, true, 'conta a prazo criada');
  perform pdv.baixar_conta_pagar(p_conta_id => to_jsonb(conta), p_valor => '20',
    p_pagamentos => '[{"metodo":"PIX","valor":15},{"metodo":"Dinheiro","valor":5}]', p_caixa_id => '"cx"');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), -15::float8, 'banco após baixa');
  perform pg_temp.eq((select metodo_pagamento from pdv.contas_pagar where id = conta), 'Dinheiro + PIX', 'métodos ordenados');
  perform pg_temp.eq((select count(*)::int from pdv.movimentacoes_caixa where tipo = 'despesa' and valor = 5), 1, 'despesa em dinheiro no caixa');
  perform pdv.cancelar_conta_pagar(p_conta_id => to_jsonb(conta), p_caixa_id => '"cx"');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), 0::float8, 'banco após estorno');
  perform pg_temp.eq((select count(*)::int from pdv.movimentacoes_caixa where tipo = 'suprimento' and valor = 5), 1, 'estorno em dinheiro no caixa');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'leite'), 5::float8, 'estoque não muda no estorno');
  lote := $q$p_fornecedor_id => '"forn"', p_itens => '[{"tipo_item":"produto","produto_id":"cafe","quantidade_estoque":2,"preco_custo":2,"preco_venda":5,"valor_linha":4},{"tipo_item":"insumo","insumo_id":"leite","quantidade_estoque":1,"preco_custo":4,"valor_linha":4}]', p_pagamentos_imediatos => '[{"metodo":"PIX","valor":3}]', p_valor_prazo => '5', p_data_vencimento => '"2026-12-01"', p_caixa_id => '"cx"', p_atendente => '"T"'$q$;
  execute format('select pdv.registrar_compra_lote_insumos(p_lote_id => %L, p_total => %L, %s)', '"123"', '8', lote);
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 12::float8, 'lote: produto');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'leite'), 6::float8, 'lote: insumo');
  perform pg_temp.eq((select saldo from pdv.conta_bancaria), -3::float8, 'lote: banco');
  perform pg_temp.throws(format('select pdv.registrar_compra_lote_insumos(p_lote_id => %L, p_total => %L, %s)', '"123"', '8', lote), 'já foi registrado', 'lote repetido');
  antes := (select count(*) from pdv.contas_pagar);
  perform pg_temp.throws(format('select pdv.registrar_compra_lote_insumos(p_lote_id => %L, p_total => %L, %s)', '"bad"', '99', lote), 'totalizam', 'lote com total errado');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 12::float8, 'lote errado não altera estoque');
  perform pg_temp.eq((select count(*)::int from pdv.contas_pagar), antes, 'lote errado não cria contas');
  update pdv.produtos set quantidade_estoque = 10 where id = 'cafe';
end $$;

-- 6. ajustes não deixam estoque negativo e fechamento de comanda é atômico
do $$
begin
  perform pg_temp.throws($q$select pdv.registrar_ajuste_estoque(p_produto_id => '"cafe"', p_quantidade => '11', p_tipo_movimento => '"Saída - Perda"')$q$,
    'Estoque insuficiente', 'ajuste negativo');
  perform pdv.registrar_ajuste_estoque(p_produto_id => '"cafe"', p_quantidade => '1', p_tipo_movimento => '"Entrada - Reposição"');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'cafe'), 11::float8, 'ajuste positivo');
  perform pdv.registrar_ajuste_insumo(p_insumo_id => '"leite"', p_quantidade => '2', p_tipo_movimento => '"Saída - Perda"', p_motivo => '"Vencido"');
  perform pg_temp.eq((select quantidade_estoque from pdv.insumos where id = 'leite'), 4::float8, 'ajuste de insumo');
  insert into pdv.comandas (id, identificacao) values ('mesa1', 'Mesa 1');
  insert into pdv.itens_comanda (comanda_id, produto_id, quantidade, preco_unitario) values ('mesa1', 'cafe', 2, 5);
  perform pdv.registrar_venda(p_caixa_id => '"cx"', p_comanda_id => '"mesa1"', p_identificacao_pedido => '"Comanda: Mesa 1"', p_total => '10',
    p_desconto => '0', p_pagamentos => '[{"metodo":"Dinheiro","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]');
  perform pg_temp.eq((select status from pdv.comandas where id = 'mesa1'), 'fechada', 'comanda fechada');
  perform pg_temp.throws($q$select pdv.registrar_venda(p_caixa_id => '"cx"', p_comanda_id => '"mesa1"', p_identificacao_pedido => '"C"', p_total => '10',
    p_desconto => '0', p_pagamentos => '[{"metodo":"Dinheiro","valor":10}]', p_itens => '[{"produto_id":"cafe","quantidade":2,"preco_unitario":5}]')$q$,
    'já fechada', 'comanda já fechada');
end $$;

-- 7. restrições do banco: um caixa aberto por vez, estoque não negativo
do $$
begin
  perform pg_temp.throws($q$insert into pdv.controle_caixa (fundo_inicial) values (0)$q$, 'um_caixa_aberto', 'segundo caixa aberto');
  perform pg_temp.throws($q$update pdv.produtos set quantidade_estoque = -1 where id = 'cafe'$q$, 'check', 'estoque negativo');
end $$;

-- 8. filtro por dia respeita o fuso de Brasília (venda às 23h30 locais = 02h30 UTC do dia seguinte)
do $$
begin
  insert into pdv.vendas (id, identificacao_pedido, total, data_venda) values ('noite', 'Noite', 1, '2026-11-17T02:30:00Z');
  perform pg_temp.eq((select count(*)::int from pdv.vendas where id = 'noite'
    and data_venda >= '2026-11-16T00:00:00-03:00' and data_venda <= '2026-11-16T23:59:59.999-03:00'), 1, 'venda das 23h30 fica no próprio dia');
  perform pg_temp.eq((select count(*)::int from pdv.vendas where id = 'noite'
    and data_venda >= '2026-11-17T00:00:00-03:00' and data_venda <= '2026-11-17T23:59:59.999-03:00'), 0, 'e não no dia seguinte');
end $$;

-- 9. produto sem controle de estoque vende com estoque zero e não gera movimentação
do $$
declare vid text; n_mov int;
begin
  insert into pdv.produtos (id, nome, preco_venda, quantidade_estoque, modo_estoque) values ('expresso-livre', 'Expresso', 8.9, 0, 'sem_controle');
  n_mov := (select count(*) from pdv.movimentacoes_estoque);
  vid := pdv.registrar_venda(p_caixa_id => '"cx"', p_identificacao_pedido => '"Balcão"', p_total => '17.8', p_desconto => '0',
    p_pagamentos => '[{"metodo":"PIX","valor":17.8}]', p_itens => '[{"produto_id":"expresso-livre","quantidade":2,"preco_unitario":8.9}]');
  perform pg_temp.eq((select quantidade_estoque from pdv.produtos where id = 'expresso-livre'), 0::float8, 'estoque segue zero');
  perform pg_temp.eq((select count(*)::int from pdv.movimentacoes_estoque), n_mov, 'sem movimentação de estoque');
  perform pdv.cancelar_venda(to_jsonb(vid));
  perform pg_temp.eq((select status from pdv.vendas v where v.id = vid), 'Cancelada', 'cancela sem estoque');
  perform pg_temp.throws($q$update pdv.produtos set modo_estoque = 'qualquer' where id = 'expresso-livre'$q$, 'check', 'modo inválido recusado');
end $$;

reset role;
select 'OK: todos os cenários passaram' as resultado;
rollback;
