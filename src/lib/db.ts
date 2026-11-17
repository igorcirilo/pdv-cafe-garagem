/* Cliente do banco na nuvem (Supabase). Todas as tabelas e operações ficam no schema "pdv". */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Falso quando o build foi feito sem as variáveis do Supabase. A interface mostra um aviso. */
export const bancoConfigurado = Boolean(url && key);

// Sem configuração, aponta para um endereço inválido: as chamadas falham com erro em vez de quebrar a página.
const supabase = createClient(url || 'https://configuracao-ausente.invalid', key || 'configuracao-ausente', {
  auth: { persistSession: false, autoRefreshToken: false },
});

export const db = supabase.schema('pdv');

/** Tabelas do PDV, na ordem usada pela exportação de backup. */
export const tabelasPdv = [
  'parametros_precificacao', 'conta_bancaria', 'fornecedores', 'insumos', 'produtos', 'receitas_base',
  'receitas_base_itens', 'fichas_tecnicas', 'ficha_ingredientes', 'fichas_produtos', 'fichas_produtos_itens',
  'controle_caixa', 'movimentacoes_caixa', 'comandas', 'itens_comanda', 'vendas', 'itens_venda',
  'movimentacoes_estoque', 'entradas', 'contas_pagar',
] as const;
