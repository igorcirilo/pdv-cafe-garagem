-- Zera o movimento de vendas e caixa para recomeçar (ex.: depois de testes).
-- Apaga: vendas e itens, comandas e itens, caixas e movimentações de caixa, movimentações de estoque; zera o saldo bancário.
-- Mantém: produtos (com o estoque atual), insumos, fornecedores, fichas técnicas, receitas, contas a pagar e parâmetros.
-- Exige a palavra 'ZERAR' como confirmação, e tudo acontece numa transação só.
create function pdv.zerar_vendas(p_confirmacao text default null) returns jsonb language plpgsql set search_path = ''
as $$
declare r jsonb;
begin
  perform pdv_priv.lock();
  perform pdv_priv.req(p_confirmacao = 'ZERAR', 'Confirmação inválida: digite ZERAR');
  r := jsonb_build_object(
    'vendas', (select count(*) from pdv.vendas),
    'comandas', (select count(*) from pdv.comandas),
    'caixas', (select count(*) from pdv.controle_caixa),
    'movimentacoes_estoque', (select count(*) from pdv.movimentacoes_estoque));
  delete from pdv.movimentacoes_estoque where true;
  delete from pdv.itens_venda where true;
  delete from pdv.vendas where true;
  delete from pdv.itens_comanda where true;
  delete from pdv.comandas where true;
  delete from pdv.movimentacoes_caixa where true;
  delete from pdv.controle_caixa where true;
  update pdv.conta_bancaria set saldo = 0 where id = 1;
  return r;
end $$;

revoke execute on function pdv.zerar_vendas(text) from public;
grant execute on function pdv.zerar_vendas(text) to anon, authenticated, service_role;
