import { useState, useEffect, useMemo } from 'react';
import { db } from '../lib/db';
import { controlaEstoqueNaVenda } from '../lib/estoque';
import { apurarPagamentos, type MetodoPagamento, type Pagamento } from '../lib/money';
import { useMediaQuery, QUERY_TELA_LARGA } from '../lib/useMediaQuery';

type ProdutoVenda = { id: string; nome: string; categoria: string | null; preco_venda: number; preco_custo: number; quantidade_estoque: number; is_receita: boolean; };
type ItemCarrinho = { produto: ProdutoVenda; quantidade: number; };
type PagamentoMisto = { metodo: string; valor: number | '' };

interface PDVModuloProps {
  atendente: string;
}

const METODOS: { valor: MetodoPagamento; rotulo: string; icone: string }[] = [
  { valor: 'PIX', rotulo: 'PIX', icone: '⚡' },
  { valor: 'Dinheiro', rotulo: 'Dinheiro', icone: '💵' },
  { valor: 'Cartão de Crédito', rotulo: 'Crédito', icone: '💳' },
  { valor: 'Cartão de Débito', rotulo: 'Débito', icone: '🏧' },
];

const TODAS = 'Todos';
const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

/** Até 3 valores de cédula acima do total, para o troco com um toque. */
function sugestoesCedulas(total: number): number[] {
  if (total <= 0) return [];
  const candidatos = [Math.ceil(total / 5) * 5, Math.ceil(total / 10) * 10, 20, 50, 100, 200];
  return [...new Set(candidatos)].filter(v => v > total).sort((a, b) => a - b).slice(0, 3);
}

export default function PDVModulo({ atendente }: PDVModuloProps) {
  const telaLarga = useMediaQuery(QUERY_TELA_LARGA);
  const [produtos, setProdutos] = useState<ProdutoVenda[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [identificacaoPedido, setIdentificacaoPedido] = useState('');
  const [pedidoAberto, setPedidoAberto] = useState(false);

  const [desconto, setDesconto] = useState<number | ''>('');
  const [mostrarDesconto, setMostrarDesconto] = useState(false);

  const [modoPagamento, setModoPagamento] = useState<'unico' | 'misto'>('unico');
  const [metodoUnico, setMetodoUnico] = useState<MetodoPagamento>('PIX');
  const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<number | ''>('');

  const [pagamentosMistos, setPagamentosMistos] = useState<PagamentoMisto[]>([
    { metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }
  ]);

  const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null);
  const [caixaId, setCaixaId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });
  const [finalizando, setFinalizando] = useState(false);

  const [buscaProduto, setBuscaProduto] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState(buscaProduto);
  const [categoria, setCategoria] = useState(TODAS);

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(buscaProduto), 300);
    return () => clearTimeout(t);
  }, [buscaProduto]);

  const categorias = useMemo(() => {
    const lista = [...new Set(produtos.map(p => p.categoria).filter((c): c is string => Boolean(c)))];
    return lista.length > 1 ? [TODAS, ...lista] : [];
  }, [produtos]);

  const produtosFiltrados = useMemo(() => {
    const termo = buscaDebounced.trim().toLowerCase();
    return produtos.filter(p =>
      p.nome.toLowerCase().includes(termo) && (termo !== '' || categoria === TODAS || p.categoria === categoria)
    );
  }, [produtos, buscaDebounced, categoria]);

  const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
    setFeedback({ msg, tipo });
    setTimeout(() => setFeedback({ msg: '', tipo: null }), 3000);
  };

  const carregarProdutos = async () => {
    const { data: produtosData } = await db.from('produtos').select('*').eq('tipo', 'venda').eq('ativo', true).order('nome');
    const { data: fichasData } = await db.from('fichas_tecnicas').select('produto_venda_id');
    const fichasIds = new Set(fichasData?.map(f => f.produto_venda_id));

    if (produtosData) {
      setProdutos(produtosData.map(p => ({
        id: p.id, nome: p.nome, categoria: p.categoria ?? null, preco_venda: p.preco_venda, preco_custo: p.preco_custo || 0,
        quantidade_estoque: p.quantidade_estoque || 0,
        is_receita: !controlaEstoqueNaVenda(p.modo_estoque, fichasIds.has(p.id))
      })));
    }
  };

  useEffect(() => {
    const iniciarPDV = async () => {
      const { data: caixaData } = await db.from('controle_caixa').select('id').eq('status', 'aberto').limit(1).maybeSingle();
      if (!caixaData) return setCaixaAberto(false);
      setCaixaAberto(true);
      setCaixaId(caixaData.id);
      carregarProdutos();
    };
    iniciarPDV();
  }, []);

  const quantidadeNoCarrinho = (id: string) => carrinho.find(i => i.produto.id === id)?.quantidade ?? 0;

  const adicionarAoCarrinho = (produto: ProdutoVenda) => {
    if (!produto.is_receita && produto.quantidade_estoque <= 0) return mostrarMensagem('Sem estoque!', 'erro');
    const itemExistente = carrinho.find(item => item.produto.id === produto.id);

    if (itemExistente) {
      if (!produto.is_receita && itemExistente.quantidade >= produto.quantidade_estoque) return mostrarMensagem(`Estoque máximo (${produto.quantidade_estoque} un).`, 'aviso');
      setCarrinho(carrinho.map(item => item.produto.id === produto.id ? { ...item, quantidade: item.quantidade + 1 } : item));
    } else {
      setCarrinho([...carrinho, { produto, quantidade: 1 }]);
    }
  };

  const alterQuantidade = (id: string, delta: number) => {
    setCarrinho(carrinho.flatMap(item => {
      if (item.produto.id !== id) return [item];
      const novaQtd = item.quantidade + delta;
      if (delta > 0 && !item.produto.is_receita && novaQtd > item.produto.quantidade_estoque) {
        mostrarMensagem(`Estoque máximo (${item.produto.quantidade_estoque} un).`, 'aviso');
        return [item];
      }
      return novaQtd > 0 ? [{ ...item, quantidade: novaQtd }] : [];
    }));
  };

  const removerDoCarrinho = (id: string) => setCarrinho(carrinho.filter(item => item.produto.id !== id));

  const totalItens = carrinho.reduce((acc, i) => acc + i.quantidade, 0);
  const totalVenda = useMemo(() => carrinho.reduce((acc, item) => acc + (item.produto.preco_venda * item.quantidade), 0), [carrinho]);
  const valorDesconto = Number(desconto) || 0;
  const totalComDesconto = Math.max(0, totalVenda - valorDesconto);

  const totalPagoMisto = pagamentosMistos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
  const faltaPagarMisto = modoPagamento === 'misto' && totalPagoMisto < totalComDesconto ? totalComDesconto - totalPagoMisto : 0;
  const trocoMisto = modoPagamento === 'misto' && totalPagoMisto > totalComDesconto ? totalPagoMisto - totalComDesconto : 0;
  // Dinheiro sem valor informado conta como valor exato.
  const recebidoDinheiro = valorRecebidoDinheiro === '' ? totalComDesconto : Number(valorRecebidoDinheiro);
  const trocoUnico = modoPagamento === 'unico' && metodoUnico === 'Dinheiro' && recebidoDinheiro > totalComDesconto ? recebidoDinheiro - totalComDesconto : 0;

  const limparPedido = () => {
    setCarrinho([]); setIdentificacaoPedido(''); setValorRecebidoDinheiro(''); setDesconto(''); setMostrarDesconto(false);
    setModoPagamento('unico');
    setPagamentosMistos([{ metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }]);
  };

  const finalizarVenda = async () => {
    if (carrinho.length === 0) return mostrarMensagem('Adicione produtos ao carrinho.', 'aviso');
    if (!caixaId) return mostrarMensagem('Nenhum caixa aberto foi identificado. Recarregue a tela.', 'erro');
    if (valorDesconto < 0 || valorDesconto > totalVenda) return mostrarMensagem('O desconto deve estar entre zero e o total da venda.', 'aviso');
    const pagamentos: Pagamento[] = modoPagamento === 'unico'
      ? [{ metodo: metodoUnico, valor: metodoUnico === 'Dinheiro' ? recebidoDinheiro : totalComDesconto }]
      : pagamentosMistos.map(p => ({ metodo: p.metodo as MetodoPagamento, valor: Number(p.valor) || 0 }));
    const pagamento = apurarPagamentos(totalComDesconto, pagamentos);
    if (!pagamento.aprovado) return mostrarMensagem(pagamento.erro || 'Pagamento inválido.', 'erro');

    setFinalizando(true);

    try {
      const identificacaoFinal = identificacaoPedido.trim() || 'Venda Balcão';
      const pagamentosRegistrados = [
        ['PIX', pagamento.pix],
        ['Dinheiro', pagamento.dinheiro],
        ['Cartão de Crédito', pagamento.credito],
        ['Cartão de Débito', pagamento.debito],
        ['Transferência', pagamento.transferencia],
      ].filter(([, valor]) => Number(valor) > 0).map(([metodo, valor]) => ({ metodo, valor }));

      const itensParaInserir = carrinho.map(item => ({
        produto_id: item.produto.id, quantidade: item.quantidade, preco_unitario: item.produto.preco_venda, custo_unitario: item.produto.preco_custo
      }));
      const { error: erroVenda } = await db.rpc('registrar_venda', {
        p_caixa_id: caixaId,
        p_identificacao_pedido: identificacaoFinal,
        p_total: totalComDesconto,
        p_desconto: valorDesconto,
        p_pagamentos: pagamentosRegistrados,
        p_atendente: atendente,
        p_itens: itensParaInserir,
      });
      if (erroVenda) throw erroVenda;

      mostrarMensagem(pagamento.troco > 0 ? `Venda finalizada! Troco: ${formatarMoeda(pagamento.troco)}` : 'Venda finalizada!', 'sucesso');
      limparPedido();
      setPedidoAberto(false);
      carregarProdutos();
    } catch (error) {
      console.error(error);
      const detalhe = error && typeof error === 'object' && 'message' in error ? `: ${String((error as { message: unknown }).message)}` : '';
      mostrarMensagem(`Erro ao finalizar venda${detalhe}`, 'erro');
    } finally {
      setFinalizando(false);
    }
  };

  if (caixaAberto === null) return <div className="text-center mt-20 animate-pulse font-bold text-cafe-primary">Verificando caixa...</div>;
  if (caixaAberto === false) return (<div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border border-red-200 text-center my-20 p-8"><div className="text-6xl mb-6">🔒</div><h2 className="text-2xl font-bold text-red-600">Caixa Fechado</h2><p className="text-gray-500 mt-2">Abra o caixa na aba Caixa para acessar o PDV.</p></div>);

  const painelPedido = (
    <div className="bg-white rounded-2xl shadow-md border border-cafe-secondary/30 flex flex-col overflow-hidden h-full">
      <div className="px-4 py-3 bg-cafe-primary text-white flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">Pedido Atual</h2>
        <div className="flex items-center gap-2">
          <span className="bg-white/20 px-2 py-0.5 rounded text-sm font-bold">{totalItens} {totalItens === 1 ? 'item' : 'itens'}</span>
          {carrinho.length > 0 && (
            <button onClick={limparPedido} className="text-xs font-bold underline underline-offset-2 px-1 py-2">Limpar</button>
          )}
          {!telaLarga && (
            <button onClick={() => setPedidoAberto(false)} aria-label="Voltar aos produtos" className="w-10 h-10 -mr-2 rounded-full text-2xl leading-none hover:bg-white/10">×</button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="p-3 bg-gray-50">
          {carrinho.length === 0 ? (
            <p className="text-center text-gray-400 font-semibold py-6">Toque nos produtos para adicionar.</p>
          ) : (
            <ul className="space-y-2">
              {carrinho.map(item => (
                <li key={item.produto.id} className="bg-white p-2.5 rounded-xl border border-gray-100 flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm leading-tight line-clamp-2">{item.produto.nome}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatarMoeda(item.produto.preco_venda)} un · <strong className="text-cafe-primary">{formatarMoeda(item.produto.preco_venda * item.quantidade)}</strong></p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => item.quantidade === 1 ? removerDoCarrinho(item.produto.id) : alterQuantidade(item.produto.id, -1)} aria-label={item.quantidade === 1 ? `Remover ${item.produto.nome}` : `Diminuir ${item.produto.nome}`}
                      className="w-11 h-11 bg-white border rounded-lg font-bold text-lg active:bg-gray-100">{item.quantidade === 1 ? '🗑️' : '−'}</button>
                    <span className="text-base font-black w-7 text-center">{item.quantidade}</span>
                    <button onClick={() => alterQuantidade(item.produto.id, 1)} aria-label={`Aumentar ${item.produto.nome}`}
                      className="w-11 h-11 bg-cafe-primary text-white rounded-lg font-bold text-lg active:bg-cafe-dark">+</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 space-y-4 border-t border-gray-200">
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
              <span>Subtotal</span><span>{formatarMoeda(totalVenda)}</span>
            </div>
            {mostrarDesconto || valorDesconto > 0 ? (
              <label className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-600">Desconto</span>
                <input type="number" inputMode="decimal" min={0} placeholder="R$ 0,00" autoFocus={mostrarDesconto && desconto === ''}
                  className="flex-1 p-2 border border-gray-300 rounded-lg text-right font-bold outline-none focus:ring-2 focus:ring-cafe-primary text-base"
                  value={desconto} onChange={(e) => setDesconto(e.target.value === '' ? '' : Math.max(0, Number(e.target.value)))} />
              </label>
            ) : (
              <button onClick={() => setMostrarDesconto(true)} className="text-sm font-bold text-cafe-primary py-1">+ Adicionar desconto</button>
            )}
          </div>

          <div className="flex justify-between items-end border-b border-gray-200 pb-3">
            <span className="text-gray-800 text-lg font-bold">Total</span>
            <span className="text-green-600 text-3xl font-black">{formatarMoeda(totalComDesconto)}</span>
          </div>

          <input type="text" placeholder="Cliente ou mesa (opcional)" aria-label="Identificação do pedido"
            className="w-full p-3 border border-gray-300 rounded-lg font-semibold outline-none focus:ring-2 focus:ring-cafe-primary text-base"
            value={identificacaoPedido} onChange={(e) => setIdentificacaoPedido(e.target.value)} />

          {modoPagamento === 'unico' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Forma de pagamento">
                {METODOS.map(m => (
                  <button key={m.valor} role="radio" aria-checked={metodoUnico === m.valor} onClick={() => setMetodoUnico(m.valor)}
                    className={`flex flex-col items-center justify-center gap-0.5 min-h-[60px] rounded-xl border-2 text-xs font-bold transition ${metodoUnico === m.valor ? 'border-cafe-primary bg-cafe-secondary/30 text-cafe-dark' : 'border-gray-200 bg-white text-gray-600'}`}>
                    <span className="text-xl leading-none" aria-hidden>{m.icone}</span>{m.rotulo}
                  </button>
                ))}
              </div>
              {metodoUnico === 'Dinheiro' && (
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200 space-y-2">
                  <label className="flex gap-2 items-center">
                    <span className="text-sm font-semibold whitespace-nowrap">Recebido</span>
                    <input type="number" inputMode="decimal" placeholder={formatarMoeda(totalComDesconto)}
                      className="w-full p-2 border rounded-lg font-bold text-base outline-none focus:ring-2 focus:ring-cafe-primary"
                      value={valorRecebidoDinheiro} onChange={(e) => setValorRecebidoDinheiro(e.target.value === '' ? '' : Number(e.target.value))} />
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setValorRecebidoDinheiro('')} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${valorRecebidoDinheiro === '' ? 'bg-cafe-secondary/30 border-cafe-primary' : 'bg-white'}`}>Exato</button>
                    {sugestoesCedulas(totalComDesconto).map(v => (
                      <button key={v} onClick={() => setValorRecebidoDinheiro(v)} className={`flex-1 py-2 rounded-lg border text-sm font-bold ${valorRecebidoDinheiro === v ? 'bg-cafe-secondary/30 border-cafe-primary' : 'bg-white'}`}>R$ {v}</button>
                    ))}
                  </div>
                  {trocoUnico > 0 && <div className="text-center font-black text-blue-700 text-lg">Troco: {formatarMoeda(trocoUnico)}</div>}
                </div>
              )}
              <button onClick={() => setModoPagamento('misto')} className="text-sm font-bold text-cafe-primary py-1">Dividir em mais de uma forma</button>
            </div>
          ) : (
            <div className="space-y-3 border p-3 rounded-xl bg-gray-50">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700">Pagamento dividido</span>
                <button onClick={() => setModoPagamento('unico')} className="text-sm font-bold text-cafe-primary">Voltar a uma forma</button>
              </div>
              {pagamentosMistos.map((pm, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <select aria-label={`Forma ${index + 1}`} className="flex-1 p-2.5 border rounded-lg text-base font-semibold bg-white outline-none" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistos]; n[index] = { ...n[index], metodo: e.target.value }; setPagamentosMistos(n); }}>
                    {METODOS.map(m => <option key={m.valor} value={m.valor}>{m.rotulo}</option>)}
                  </select>
                  <input type="number" inputMode="decimal" placeholder="Valor" aria-label={`Valor ${index + 1}`} className="w-28 p-2.5 border rounded-lg font-bold text-base outline-none"
                    value={pm.valor} onFocus={() => { if (pm.valor === '' && faltaPagarMisto > 0) { const n = [...pagamentosMistos]; n[index] = { ...n[index], valor: Math.round(faltaPagarMisto * 100) / 100 }; setPagamentosMistos(n); } }}
                    onChange={(e) => { const n = [...pagamentosMistos]; n[index] = { ...n[index], valor: e.target.value === '' ? '' : Number(e.target.value) }; setPagamentosMistos(n); }} />
                  {index > 0 && <button aria-label="Remover forma" onClick={() => setPagamentosMistos(pagamentosMistos.filter((_, i) => i !== index))} className="w-10 h-10 shrink-0 flex items-center justify-center text-red-500 font-bold bg-white border rounded-lg">×</button>}
                </div>
              ))}
              <button onClick={() => setPagamentosMistos([...pagamentosMistos, { metodo: 'Cartão de Crédito', valor: '' }])} className="w-full text-sm font-bold text-cafe-primary bg-white py-2.5 border border-dashed rounded-lg">+ Adicionar forma</button>
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-gray-200">
                <span className={faltaPagarMisto > 0 ? 'text-red-600' : 'text-gray-500'}>Falta: {formatarMoeda(faltaPagarMisto)}</span>
                <span className={trocoMisto > 0 ? 'text-blue-700' : 'text-gray-500'}>Troco: {formatarMoeda(trocoMisto)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="p-4 pt-3 border-t border-gray-200 bg-white" style={telaLarga ? undefined : { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
        <button onClick={finalizarVenda} disabled={finalizando || carrinho.length === 0}
          className="w-full bg-green-600 text-white font-black text-lg py-4 rounded-xl shadow-lg hover:bg-green-700 active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed">
          {finalizando ? 'PROCESSANDO...' : `FINALIZAR VENDA${carrinho.length ? ` · ${formatarMoeda(totalComDesconto)}` : ''}`}
        </button>
      </div>
    </div>
  );

  return (
    <div className={`w-full md:flex md:gap-4 md:items-start ${carrinho.length > 0 && !telaLarga ? 'pb-24' : ''}`}>
      {feedback.tipo && (
        <div role="status" className={`fixed top-3 left-1/2 -translate-x-1/2 z-[100] w-[calc(100%-2rem)] max-w-md px-4 py-3 rounded-xl shadow-lg text-center ${feedback.tipo === 'sucesso' ? 'bg-green-600 text-white' : feedback.tipo === 'erro' ? 'bg-red-600 text-white' : 'bg-yellow-100 text-yellow-900'}`}
          style={{ marginTop: 'env(safe-area-inset-top)' }}>
          <p className="text-sm font-bold">{feedback.msg}</p>
        </div>
      )}

      {/* Produtos */}
      <section className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-bold text-cafe-primary">Menu de Produtos</h2>
        </div>

        <input
          type="search"
          placeholder="🔍 Buscar produto..."
          value={buscaProduto}
          onChange={(e) => setBuscaProduto(e.target.value)}
          className="w-full p-3 mb-3 border border-gray-300 rounded-xl bg-white shadow-sm focus:ring-2 focus:ring-cafe-primary outline-none text-base"
        />

        {categorias.length > 0 && buscaDebounced.trim() === '' && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Categorias">
            {categorias.map(c => (
              <button key={c} role="tab" aria-selected={categoria === c} onClick={() => setCategoria(c)}
                className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition ${categoria === c ? 'bg-cafe-primary text-white border-cafe-primary' : 'bg-white text-gray-700 border-gray-300'}`}>
                {c}
              </button>
            ))}
          </div>
        )}

        {produtosFiltrados.length === 0 ? (
          <p className="text-center text-gray-500 py-10">Nenhum produto encontrado.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {produtosFiltrados.map(produto => {
              const semEstoque = !produto.is_receita && produto.quantidade_estoque <= 0;
              const estoqueBaixo = !produto.is_receita && produto.quantidade_estoque > 0 && produto.quantidade_estoque <= 5;
              const noPedido = quantidadeNoCarrinho(produto.id);
              return (
                <button
                  key={produto.id}
                  onClick={() => adicionarAoCarrinho(produto)}
                  disabled={semEstoque}
                  aria-label={`Adicionar ${produto.nome}`}
                  className={`relative text-left min-h-[96px] p-3 rounded-xl border-2 flex flex-col justify-between transition select-none ${semEstoque ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed' : noPedido ? 'bg-cafe-secondary/20 border-cafe-primary active:scale-[0.97]' : 'bg-white border-gray-200 hover:border-cafe-primary active:scale-[0.97]'}`}
                >
                  {noPedido > 0 && (
                    <span className="absolute -top-2 -right-2 min-w-[28px] h-7 px-1.5 rounded-full bg-cafe-primary text-white text-sm font-black flex items-center justify-center shadow" aria-label={`${noPedido} no pedido`}>{noPedido}</span>
                  )}
                  <span className="font-semibold text-sm md:text-base leading-tight line-clamp-2 pr-3">{produto.nome}</span>
                  <span className="flex items-end justify-between gap-1 mt-2">
                    <span className={`font-black ${semEstoque ? '' : 'text-cafe-primary'}`}>{formatarMoeda(produto.preco_venda)}</span>
                    {!produto.is_receita && (
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-bold whitespace-nowrap ${semEstoque ? 'bg-red-100 text-red-700' : estoqueBaixo ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-700'}`}>
                        {semEstoque ? 'sem estoque' : `${produto.quantidade_estoque} un`}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Pedido: ao lado em tablet/computador; folha em tela cheia no celular */}
      {telaLarga ? (
        <aside className="w-[340px] lg:w-[400px] shrink-0 sticky top-[calc(var(--altura-cabecalho,4rem)+0.75rem)] h-[calc(100dvh-var(--altura-cabecalho,4rem)-1.5rem)] min-h-[420px]">{painelPedido}</aside>
      ) : (
        <>
          {carrinho.length > 0 && !pedidoAberto && (
            <div className="fixed inset-x-0 z-40 px-3 pb-2" style={{ bottom: 'var(--altura-nav-inferior, 0px)' }}>
              <button onClick={() => setPedidoAberto(true)} className="w-full flex items-center justify-between gap-3 bg-green-600 text-white rounded-2xl px-4 py-3.5 shadow-xl active:scale-[0.98] transition">
                <span className="bg-white/25 rounded-lg px-2 py-0.5 text-sm font-black">{totalItens}</span>
                <span className="font-black text-lg">Ver pedido</span>
                <span className="font-black text-lg">{formatarMoeda(totalComDesconto)}</span>
              </button>
            </div>
          )}
          {pedidoAberto && (
            <div className="fixed inset-0 z-50 bg-black/40 flex flex-col" onClick={() => setPedidoAberto(false)}>
              <div className="mt-auto h-[92dvh]" style={{ paddingTop: 'env(safe-area-inset-top)' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Pedido atual">
                {painelPedido}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
