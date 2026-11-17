-- Datas e horas passam de texto para timestamptz.
-- Antes, os filtros do front-end (ex.: '2026-11-17T00:00:00-03:00') eram comparados como TEXTO com valores
-- gravados em UTC ('...Z'), o que deslocava o dia em 3 horas: vendas após as 21h caíam no dia seguinte.
-- Com timestamptz a comparação respeita o fuso. Datas sem hora (data_vencimento, data_pagamento) continuam texto 'AAAA-MM-DD'.

do $$
declare c record;
begin
  for c in
    select table_name, column_name from information_schema.columns
     where table_schema = 'pdv'
       and column_name in ('created_at', 'cancelada_em', 'data_abertura', 'data_fechamento', 'data_entrada', 'data_venda', 'data_movimento')
  loop
    execute format('alter table pdv.%I alter column %I drop default', c.table_name, c.column_name);
    execute format('alter table pdv.%I alter column %I type timestamptz using nullif(%I, '''')::timestamptz', c.table_name, c.column_name, c.column_name);
    if c.column_name in ('created_at', 'data_abertura', 'data_entrada', 'data_venda', 'data_movimento') then
      execute format('alter table pdv.%I alter column %I set default now()', c.table_name, c.column_name);
    end if;
  end loop;
end $$;

-- agora() passa a devolver timestamptz (usada em cancelada_em pelas funções de cancelamento).
drop function pdv_priv.agora();
create function pdv_priv.agora() returns timestamptz language sql stable set search_path = '' as $$ select now() $$;
grant execute on function pdv_priv.agora() to anon, authenticated, service_role;
