export type CompraEmbalada = {
  quantidadeEmbalagens: number;
  quantidadePorEmbalagem: number;
  valorTotalPago: number;
  fatorCorrecao?: number;
};

export function calcularCompraEmbalada(compra: CompraEmbalada) {
  const quantidadeEmbalagens = Number(compra.quantidadeEmbalagens);
  const quantidadePorEmbalagem = Number(compra.quantidadePorEmbalagem) || 1;
  const valorTotalPago = Number(compra.valorTotalPago);
  const fatorCorrecao = Number(compra.fatorCorrecao) || 1;

  if (quantidadeEmbalagens <= 0 || quantidadePorEmbalagem <= 0 || valorTotalPago < 0) {
    throw new Error('Dados inválidos para compra em embalagem.');
  }

  const quantidadeEstoque = quantidadeEmbalagens * quantidadePorEmbalagem;
  return {
    quantidadeEstoque,
    custoUnitario: (valorTotalPago / quantidadeEstoque) * fatorCorrecao,
  };
}

export function calcularConsumoReceita(quantidadeVendida: number, rendimentoPorcoes: number, quantidadePorReceita: number): number {
  if (quantidadeVendida < 0 || rendimentoPorcoes <= 0 || quantidadePorReceita < 0) {
    throw new Error('Dados inválidos para consumo de receita.');
  }
  return (quantidadeVendida / rendimentoPorcoes) * quantidadePorReceita;
}

type UnidadeConversivel = 'kg' | 'g' | 'l' | 'ml' | 'un';

const unidadesPorGrupo: Record<UnidadeConversivel, UnidadeConversivel[]> = {
  kg: ['kg', 'g'],
  g: ['kg', 'g'],
  l: ['l', 'ml'],
  ml: ['l', 'ml'],
  un: ['un'],
};

const fatorParaBase: Record<UnidadeConversivel, number> = {
  kg: 1,
  g: 0.001,
  l: 1,
  ml: 0.001,
  un: 1,
};

function validarUnidade(unidade: string): asserts unidade is UnidadeConversivel {
  if (!(unidade in unidadesPorGrupo)) throw new Error('Unidade de medida não suportada.');
}

/** Unidades que podem ser usadas na entrada sem mudar a unidade de controle do insumo. */
export function unidadesCompativeis(unidadeEstoque: string): UnidadeConversivel[] {
  validarUnidade(unidadeEstoque);
  return unidadesPorGrupo[unidadeEstoque];
}

/** Converte a quantidade recebida para a unidade em que o estoque é controlado. */
export function converterQuantidadeParaEstoque(quantidade: number, unidadeInformada: string, unidadeEstoque: string): number {
  const valor = Number(quantidade);
  validarUnidade(unidadeInformada);
  validarUnidade(unidadeEstoque);
  if (valor <= 0) throw new Error('A quantidade recebida deve ser maior que zero.');
  if (!unidadesPorGrupo[unidadeEstoque].includes(unidadeInformada)) {
    throw new Error('A unidade informada não é compatível com a unidade de estoque.');
  }
  return (valor * fatorParaBase[unidadeInformada]) / fatorParaBase[unidadeEstoque];
}

export type ModoEstoque = 'revenda' | 'sem_controle' | 'producao_sob_demanda' | 'producao_lote';

/**
 * Indica se a venda do produto é limitada pelo estoque do próprio produto.
 * Não controla: itens "sem controle" (preparados na hora) e itens com ficha técnica
 * produzidos sob demanda (a baixa é nos insumos). Produção em lote e revenda controlam.
 */
export function controlaEstoqueNaVenda(modo: string | null | undefined, temFichaTecnica: boolean): boolean {
  if (modo === 'sem_controle') return false;
  if (temFichaTecnica && modo !== 'producao_lote') return false;
  return true;
}
