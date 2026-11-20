import { useState, useEffect, useMemo, useRef } from 'react';
import { db } from '../lib/db';
import { controlaEstoqueNaVenda } from '../lib/estoque';
import { apurarPagamentos, type MetodoPagamento, type Pagamento } from '../lib/money';

type Produto = { id: string; nome: string; categoria?: string | null; preco_venda: number; preco_custo: number; tipo: string; is_receita?: boolean; quantidade_estoque: number };
type ItemComanda = { id: string; produto_id: string; quantidade: number; preco_unitario: number; produtos: { nome: string } };
type Comanda = { id: string; identificacao: string; nome_cliente: string; status: string; atendente: string; created_at: string; itens_comanda: ItemComanda[] };
type PagamentoMisto = { metodo: string; valor: number | '' };

const TODAS = 'Todas';

interface GestaoComandasProps {
    atendente: string;
}

export default function GestaoComandas({ atendente }: GestaoComandasProps) {
    const [caixaAberto, setCaixaAberto] = useState<boolean | null>(null);
    const [caixaId, setCaixaId] = useState<string | null>(null);
    const [comandas, setComandas] = useState<Comanda[]>([]);
    const [produtos, setProdutos] = useState<Produto[]>([]);
    const [carregando, setCarregando] = useState(true);
    const [feedback, setFeedback] = useState<{ msg: string, tipo: 'sucesso' | 'erro' | 'aviso' | null }>({ msg: '', tipo: null });

    const [modalNova, setModalNova] = useState(false);
    const [novaIdentificacao, setNovaIdentificacao] = useState('');
    const [novoCliente, setNovoCliente] = useState('');

    const [comandaAberta, setComandaAberta] = useState<Comanda | null>(null);
    const [quantidadeAdd] = useState<number | ''>(1);

    const [modalCheckout, setModalCheckout] = useState(false);
    const [modoPagamento, setModoPagamento] = useState<'unico' | 'misto'>('unico');
    // Sem forma pré-selecionada: o fechamento exige escolha explícita do pagamento.
    const [metodoUnico, setMetodoUnico] = useState<MetodoPagamento | ''>('');
    const [valorRecebidoDinheiro, setValorRecebidoDinheiro] = useState<number | ''>('');
    const [desconto, setDesconto] = useState<number | ''>('');

    const [pagamentosMistos, setPagamentosMistos] = useState<PagamentoMisto[]>([
        { metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }
    ]);
    const [confirmacao, setConfirmacao] = useState<{ visivel: boolean; titulo: string; msg: string; onConfirm: () => void } | null>(null);
    const [finalizando, setFinalizando] = useState(false);

    const [buscaProduto, setBuscaProduto] = useState('');
    const [categoria, setCategoria] = useState(TODAS);
    // Celular: uma lista por vez (adicionar produtos ou ver a comanda). Tablet/computador mostra as duas lado a lado.
    const [abaComanda, setAbaComanda] = useState<'adicionar' | 'itens'>('adicionar');
    // Toques rápidos em "+" são enfileirados para não perder quantidade.
    const filaItens = useRef<Promise<unknown>>(Promise.resolve());
    const comandaAtual = useRef<Comanda | null>(null);
    useEffect(() => { comandaAtual.current = comandaAberta; }, [comandaAberta]);

    const categorias = useMemo(() => {
        const lista = [...new Set(produtos.map(p => p.categoria).filter((c): c is string => Boolean(c)))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        return lista.length > 1 ? [TODAS, ...lista] : [];
    }, [produtos]);

    const produtosFiltrados = useMemo(() => {
        const termo = buscaProduto.trim().toLowerCase();
        return produtos.filter(produto =>
            produto.nome.toLowerCase().includes(termo) && (termo !== '' || categoria === TODAS || produto.categoria === categoria)
        );
    }, [produtos, buscaProduto, categoria]);

    const qtdNaComanda = useMemo(() => {
        const m = new Map<string, number>();
        comandaAberta?.itens_comanda.forEach(i => m.set(i.produto_id, (m.get(i.produto_id) || 0) + i.quantidade));
        return m;
    }, [comandaAberta]);
    const totalItensAberta = comandaAberta?.itens_comanda.reduce((acc, i) => acc + i.quantidade, 0) || 0;

    const abrirComanda = (comanda: Comanda) => {
        comandaAtual.current = comanda;
        setComandaAberta(comanda);
        setBuscaProduto('');
        setCategoria(TODAS);
        setAbaComanda(comanda.itens_comanda.length > 0 ? 'itens' : 'adicionar');
    };

    const mostrarMensagem = (msg: string, tipo: 'sucesso' | 'erro' | 'aviso') => {
        setFeedback({ msg, tipo });
        setTimeout(() => setFeedback({ msg: '', tipo: null }), 4000);
    };

    const carregarDados = async (silencioso = false) => {
        if (!silencioso) setCarregando(true);

        const { data: caixaData } = await db.from('controle_caixa').select('id').eq('status', 'aberto').limit(1).maybeSingle();
        if (!caixaData) {
            setCaixaAberto(false);
            if (!silencioso) setCarregando(false);
            return;
        }
        setCaixaAberto(true);
        setCaixaId(caixaData.id);

        const { data: comandasData } = await db
            .from('comandas')
            .select('*, itens_comanda(*, produtos(nome))')
            .eq('status', 'aberta')
            .order('created_at', { ascending: true });

        if (comandasData) setComandas(comandasData as unknown as Comanda[]);

        const { data: prodData } = await db.from('produtos').select('*').eq('tipo', 'venda').eq('ativo', true).order('nome');
        const { data: fichas } = await db.from('fichas_tecnicas').select('produto_venda_id');
        const fichasIds = new Set(fichas?.map(f => f.produto_venda_id) || []);

        if (prodData) {
            setProdutos(prodData.map(p => ({ ...p, is_receita: !controlaEstoqueNaVenda(p.modo_estoque, fichasIds.has(p.id)) })));
        }

        if (!silencioso) setCarregando(false);
    };

    useEffect(() => { carregarDados(); }, []);

    const criarComanda = async () => {
        if (!novaIdentificacao) return mostrarMensagem('Informe a identificação (ex: Mesa 1).', 'aviso');
        try {
            const { error } = await db.from('comandas').insert([{
                identificacao: novaIdentificacao, nome_cliente: novoCliente || 'Não informado', atendente
            }]);
            if (error) throw error;
            mostrarMensagem('Comanda aberta com sucesso!', 'sucesso');
            setModalNova(false); setNovaIdentificacao(''); setNovoCliente('');
            carregarDados(true);
        } catch (err) { console.error(err); mostrarMensagem('Erro ao abrir comanda.', 'erro'); }
    };

    const adicionarItem = (produto: Produto) => enfileirar(() => adicionarItemAgora(produto));

    const adicionarItemAgora = async (produto: Produto) => {
        const comandaAberta = comandaAtual.current;
        if (!comandaAberta) return;
        if (!caixaId) return mostrarMensagem('Nenhum caixa aberto foi identificado. Recarregue a tela.', 'erro');
        const qtdAdicionar = Number(quantidadeAdd) || 1;

        const itemExistente = comandaAberta.itens_comanda.find(item => item.produto_id === produto.id);
        const qtdJaNaComanda = itemExistente ? itemExistente.quantidade : 0;
        const novaQtdTotal = qtdJaNaComanda + qtdAdicionar;

        if (!produto.is_receita && produto.quantidade_estoque < novaQtdTotal) {
            return mostrarMensagem(`Estoque insuficiente. (${produto.quantidade_estoque} un)`, 'aviso');
        }

        try {
            if (itemExistente) {
                const { error } = await db.from('itens_comanda').update({ quantidade: novaQtdTotal }).eq('id', itemExistente.id);
                if (error) throw error;
            } else {
                const { error } = await db.from('itens_comanda').insert([{
                    comanda_id: comandaAberta.id, produto_id: produto.id,
                    quantidade: qtdAdicionar, preco_unitario: produto.preco_venda
                }]);
                if (error) throw error;
            }

            await recarregarComanda(comandaAberta.id);
        } catch (err) { console.error(err); mostrarMensagem('Erro ao adicionar item.', 'erro'); }
    };

    const enfileirar = (tarefa: () => Promise<void>) => {
        const proxima = filaItens.current.then(tarefa);
        filaItens.current = proxima.catch(() => undefined);
        return proxima;
    };

    const recarregarComanda = async (id: string) => {
        const { data } = await db.from('comandas').select('*, itens_comanda(*, produtos(nome))').eq('id', id).single();
        if (data) { comandaAtual.current = data as unknown as Comanda; setComandaAberta(comandaAtual.current); }
        carregarDados(true);
    };

    // Lê a quantidade mais recente (não a do momento do toque) para que toques rápidos somem certo.
    const alterarQuantidadeItem = (itemId: string, delta: number | 'remover') => enfileirar(async () => {
        const comanda = comandaAtual.current;
        const item = comanda?.itens_comanda.find(i => i.id === itemId);
        if (!comanda || !item) return;
        const novaQuantidade = delta === 'remover' ? 0 : item.quantidade + delta;
        try {
            const { error } = novaQuantidade <= 0
                ? await db.from('itens_comanda').delete().eq('id', itemId)
                : await db.from('itens_comanda').update({ quantidade: novaQuantidade }).eq('id', itemId);
            if (error) throw error;
            await recarregarComanda(comanda.id);
        } catch (err) {
            console.error(err);
            mostrarMensagem('Erro ao alterar quantidade.', 'erro');
        }
    });

    const formatarMoeda = (valor: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

    const subtotalComandaAberta = useMemo(() => {
        return comandaAberta?.itens_comanda.reduce((acc, item) => acc + (item.preco_unitario * item.quantidade), 0) || 0;
    }, [comandaAberta]);

    const valorDesconto = Number(desconto) || 0;
    const totalComDesconto = Math.max(0, subtotalComandaAberta - valorDesconto);

    const totalPagoMisto = pagamentosMistos.reduce((acc, p) => acc + (Number(p.valor) || 0), 0);
    const faltaPagarMisto = modoPagamento === 'misto' && totalPagoMisto < totalComDesconto ? totalComDesconto - totalPagoMisto : 0;
    const trocoMisto = modoPagamento === 'misto' && totalPagoMisto > totalComDesconto ? totalPagoMisto - totalComDesconto : 0;
    // Dinheiro sem valor informado conta como valor exato.
    const recebidoDinheiro = valorRecebidoDinheiro === '' ? totalComDesconto : Number(valorRecebidoDinheiro);
    const trocoUnico = modoPagamento === 'unico' && metodoUnico === 'Dinheiro' && recebidoDinheiro > totalComDesconto ? recebidoDinheiro - totalComDesconto : 0;
    const pagamentoEscolhido = modoPagamento === 'misto' || metodoUnico !== '';

    const confirmarExclusao = () => {
        setConfirmacao({
            visivel: true,
            titulo: 'Excluir Comanda?',
            msg: 'Esta ação não pode ser desfeita. Tem certeza que deseja apagar esta mesa?',
            onConfirm: async () => {
                try {
                    const { error } = await db.from('comandas').delete().eq('id', comandaAberta?.id);
                    if (error) throw error;
                    mostrarMensagem('Comanda excluída!', 'sucesso');
                    setComandaAberta(null);
                    setConfirmacao(null);
                    carregarDados(true);
                } catch (err) { console.error(err); mostrarMensagem('Erro ao excluir.', 'erro'); }
            }
        });
    };

    const abrirCheckout = () => {
        if (!comandaAberta || comandaAberta.itens_comanda.length === 0) return mostrarMensagem('A comanda está vazia.', 'aviso');
        setModoPagamento('unico');
        setMetodoUnico('');
        setValorRecebidoDinheiro('');
        setDesconto('');
        setPagamentosMistos([{ metodo: 'PIX', valor: '' }, { metodo: 'Dinheiro', valor: '' }]);
        setModalCheckout(true);
    };

    const finalizarVenda = async () => {
        if (!comandaAberta) return;
        if (valorDesconto < 0 || valorDesconto > subtotalComandaAberta) return mostrarMensagem('O desconto deve estar entre zero e o subtotal.', 'aviso');
        if (modoPagamento === 'unico' && !metodoUnico) return mostrarMensagem('Escolha a forma de pagamento.', 'aviso');
        const pagamentos: Pagamento[] = modoPagamento === 'unico'
            ? [{
                metodo: metodoUnico as MetodoPagamento,
                valor: metodoUnico === 'Dinheiro' ? recebidoDinheiro : totalComDesconto,
            }]
            : pagamentosMistos.map(p => ({ metodo: p.metodo as MetodoPagamento, valor: Number(p.valor) || 0 }));
        const pagamento = apurarPagamentos(totalComDesconto, pagamentos);
        if (!pagamento.aprovado) return mostrarMensagem(pagamento.erro || 'Pagamento inválido.', 'erro');
        setFinalizando(true);

        try {
            const pagamentosRegistrados = [
                ['PIX', pagamento.pix],
                ['Dinheiro', pagamento.dinheiro],
                ['Cartão de Crédito', pagamento.credito],
                ['Cartão de Débito', pagamento.debito],
                ['Transferência', pagamento.transferencia],
            ].filter(([, valor]) => Number(valor) > 0).map(([metodo, valor]) => ({ metodo, valor }));
            const itensParaInserir = comandaAberta.itens_comanda.map(item => ({
                produto_id: item.produto_id,
                quantidade: item.quantidade,
                preco_unitario: item.preco_unitario,
                custo_unitario: produtos.find(produto => produto.id === item.produto_id)?.preco_custo || 0,
            }));
            const { error: erroVenda } = await db.rpc('registrar_venda', {
                p_caixa_id: caixaId,
                p_comanda_id: comandaAberta.id,
                p_identificacao_pedido: `Comanda: ${comandaAberta.identificacao}`,
                p_total: totalComDesconto,
                p_desconto: valorDesconto,
                p_pagamentos: pagamentosRegistrados,
                p_atendente: atendente,
                p_itens: itensParaInserir,
            });
            if (erroVenda) throw erroVenda;



            mostrarMensagem(`Comanda ${comandaAberta.identificacao} paga e fechada.${pagamento.troco > 0 ? ` Troco: ${formatarMoeda(pagamento.troco)}` : ''}`, 'sucesso');
            setModalCheckout(false); setComandaAberta(null);
            carregarDados(true);

        } catch (error) { console.error(error); const detalhe = error && typeof error === 'object' && 'message' in error ? `: ${String((error as { message: unknown }).message)}` : ''; mostrarMensagem(`Erro ao fechar a comanda${detalhe}. Ela continua aberta.`, 'erro'); }
        finally { setFinalizando(false); }
    };


    if (carregando) return <div className="text-center py-10 font-bold text-cafe-primary animate-pulse">A carregar comandas...</div>;
    if (caixaAberto === false) return (<div className="max-w-md mx-auto bg-white rounded-lg shadow-lg border border-red-200 text-center my-20 p-8"><div className="text-6xl mb-6">🔒</div><h2 className="text-2xl font-bold text-red-600">Caixa Fechado</h2><p className="text-gray-500 mt-2">Abra o caixa na aba Caixa para gerir comandas.</p></div>);

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-6 bg-cafe-card rounded-lg shadow-md border border-cafe-secondary/20 my-4 md:my-8 relative">
            {feedback.tipo && (<div className={`fixed top-4 right-4 z-[100] px-4 py-3 rounded shadow-lg ${feedback.tipo === 'sucesso' ? 'bg-green-100 text-green-800' : feedback.tipo === 'erro' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'}`}><span className="font-semibold">{feedback.msg}</span></div>)}

            {modalNova && (
                <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-xl font-bold text-cafe-dark mb-4 border-b pb-2">Abrir Nova Comanda</h3>
                        <div className="space-y-4 mb-6">
                            <div><label className="block text-sm font-semibold mb-1">Identificação (Mesa/Cartão)</label><input type="text" placeholder="Ex: Mesa 04" className="w-full p-3 md:p-2 border rounded outline-none text-base" value={novaIdentificacao} onChange={e => setNovaIdentificacao(e.target.value)} autoFocus /></div>
                            <div><label className="block text-sm font-semibold mb-1">Nome do Cliente (Opcional)</label><input type="text" placeholder="Ex: João Silva" className="w-full p-3 md:p-2 border rounded outline-none text-base" value={novoCliente} onChange={e => setNovoCliente(e.target.value)} /></div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setModalNova(false)} className="flex-1 bg-gray-100 py-3 md:py-2 rounded font-semibold transition hover:bg-gray-200">Cancelar</button>
                            <button onClick={criarComanda} className="flex-1 bg-cafe-primary text-white py-3 md:py-2 rounded font-semibold transition shadow hover:bg-cafe-dark">Abrir Comanda</button>
                        </div>
                    </div>
                </div>
            )}

            {comandaAberta && !modalCheckout && (
                // Celular: tela cheia, uma lista por vez (abas). Tablet/computador: janela com as duas colunas lado a lado.
                <div className="fixed inset-0 z-50 bg-white md:bg-black/70 md:flex md:items-center md:justify-center md:p-4" role="dialog" aria-modal="true" aria-label={`Comanda ${comandaAberta.identificacao}`}>
                    <div className="bg-white w-full h-full md:h-[90dvh] md:max-w-5xl md:rounded-xl md:shadow-2xl flex flex-col overflow-hidden"
                        style={{ paddingTop: 'env(safe-area-inset-top)' }}>
                        <header className="flex items-center gap-2 px-3 md:px-5 py-2 border-b shrink-0">
                            <button onClick={() => setComandaAberta(null)} className="text-cafe-primary font-bold px-2 py-2 -ml-1 rounded-lg hover:bg-cafe-secondary/20 shrink-0" aria-label="Voltar às mesas">← Mesas</button>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-xl font-black text-cafe-primary leading-tight truncate">{comandaAberta.identificacao}</h3>
                                <p className="text-xs text-gray-500 font-semibold truncate">{comandaAberta.nome_cliente} · <span className="text-green-700">aberta</span></p>
                            </div>
                            <button onClick={confirmarExclusao} className="text-red-500 text-sm font-semibold px-2 py-2 rounded-lg hover:bg-red-50 shrink-0">Excluir</button>
                        </header>

                        <div className="md:hidden grid grid-cols-2 gap-1 p-1 mx-3 mt-2 bg-gray-100 rounded-xl shrink-0" role="tablist" aria-label="Seções da comanda">
                            <button role="tab" aria-selected={abaComanda === 'adicionar'} onClick={() => setAbaComanda('adicionar')}
                                className={`py-2.5 rounded-lg text-sm font-bold transition ${abaComanda === 'adicionar' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500'}`}>
                                + Adicionar
                            </button>
                            <button role="tab" aria-selected={abaComanda === 'itens'} onClick={() => setAbaComanda('itens')}
                                className={`py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-1.5 ${abaComanda === 'itens' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500'}`}>
                                Comanda
                                <span className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-full text-xs ${totalItensAberta > 0 ? 'bg-cafe-primary text-white' : 'bg-gray-300 text-gray-600'}`}>{totalItensAberta}</span>
                            </button>
                        </div>

                        <div className="flex-1 min-h-0 md:grid md:grid-cols-[3fr_2fr] md:divide-x">
                            {/* Adicionar produtos */}
                            <section className={`${abaComanda === 'adicionar' ? 'flex' : 'hidden'} md:flex flex-col h-full min-h-0`} aria-label="Adicionar produtos">
                                <div className="px-3 md:px-4 pt-2 pb-2 space-y-2 shrink-0 border-b md:border-b-0">
                                    <div className="relative">
                                        <input type="search" placeholder="🔍 Buscar produto..." aria-label="Buscar produto" value={buscaProduto}
                                            onChange={(e) => setBuscaProduto(e.target.value)}
                                            className="w-full p-3 pr-10 border rounded-xl outline-none focus:ring-2 focus:ring-cafe-primary text-base bg-gray-50" />
                                        {buscaProduto && (
                                            <button onClick={() => setBuscaProduto('')} aria-label="Limpar busca" className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full text-gray-500 hover:bg-gray-200">✕</button>
                                        )}
                                    </div>
                                    {categorias.length > 0 && buscaProduto.trim() === '' && (
                                        <div className="flex gap-2 overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Categorias">
                                            {categorias.map(c => (
                                                <button key={c} role="tab" aria-selected={categoria === c} onClick={() => setCategoria(c)}
                                                    className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-bold border transition ${categoria === c ? 'bg-cafe-primary text-white border-cafe-primary' : 'bg-white text-gray-700 border-gray-300'}`}>
                                                    {c}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 md:px-4 py-2">
                                    {produtosFiltrados.length === 0 ? (
                                        <p className="text-center text-gray-400 italic mt-8">Nenhum produto encontrado.</p>
                                    ) : (
                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                                            {produtosFiltrados.map(produto => {
                                                const semEstoque = !produto.is_receita && produto.quantidade_estoque <= 0;
                                                const estoqueBaixo = !produto.is_receita && produto.quantidade_estoque > 0 && produto.quantidade_estoque <= 5;
                                                const naComanda = qtdNaComanda.get(produto.id) || 0;
                                                return (
                                                    <button key={produto.id} onClick={() => adicionarItem(produto)} disabled={semEstoque} aria-label={`Adicionar ${produto.nome}`}
                                                        className={`relative text-left rounded-xl border-2 p-2.5 min-h-[76px] flex flex-col justify-between transition active:scale-[0.97] ${semEstoque ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' : naComanda > 0 ? 'bg-cafe-secondary/10 border-cafe-primary' : 'bg-white border-gray-200 hover:border-cafe-primary'}`}>
                                                        <span className="font-semibold text-sm leading-snug line-clamp-2 pr-6">{produto.nome}</span>
                                                        <span className="flex items-center justify-between gap-1 mt-1">
                                                            <span className="font-bold text-cafe-primary text-sm">{formatarMoeda(produto.preco_venda)}</span>
                                                            {semEstoque && <span className="text-[11px] text-red-600 font-bold">Sem estoque</span>}
                                                            {estoqueBaixo && <span className="text-[11px] text-yellow-700 font-bold">{produto.quantidade_estoque} un</span>}
                                                        </span>
                                                        {naComanda > 0 && (
                                                            <span className="absolute top-1.5 right-1.5 min-w-[1.5rem] h-6 px-1.5 rounded-full bg-cafe-primary text-white text-xs font-black flex items-center justify-center" aria-hidden>{naComanda}</span>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </section>

                            {/* Itens lançados */}
                            <section className={`${abaComanda === 'itens' ? 'flex' : 'hidden'} md:flex flex-col h-full min-h-0 bg-gray-50`} aria-label="Itens lançados">
                                <h4 className="hidden md:block text-sm font-bold text-gray-500 uppercase tracking-wide px-4 pt-3 pb-1 shrink-0">Itens lançados</h4>
                                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 md:px-4 py-2">
                                    {comandaAberta.itens_comanda.length === 0 ? (
                                        <div className="text-center mt-10">
                                            <p className="text-gray-400 italic">Nenhum item lançado ainda.</p>
                                            <button onClick={() => setAbaComanda('adicionar')} className="md:hidden mt-3 text-cafe-primary font-bold underline">Adicionar produtos</button>
                                        </div>
                                    ) : (
                                        <ul className="divide-y bg-white border rounded-xl">
                                            {comandaAberta.itens_comanda.map(item => (
                                                <li key={item.id} className="flex items-center gap-2 p-2.5">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="font-semibold text-sm leading-snug truncate">{item.produtos?.nome}</div>
                                                        <div className="text-xs text-gray-500">{formatarMoeda(item.preco_unitario)} · <strong className="text-cafe-dark">{formatarMoeda(item.quantidade * item.preco_unitario)}</strong></div>
                                                    </div>
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <button onClick={() => alterarQuantidadeItem(item.id, -1)} aria-label={item.quantidade === 1 ? `Remover ${item.produtos?.nome}` : `Diminuir ${item.produtos?.nome}`}
                                                            className={`w-10 h-10 rounded-lg border font-bold active:scale-95 ${item.quantidade === 1 ? 'text-red-600 border-red-200 bg-red-50' : 'bg-white'}`}>
                                                            {item.quantidade === 1 ? '🗑' : '−'}
                                                        </button>
                                                        <span className="w-7 text-center font-black">{item.quantidade}</span>
                                                        <button onClick={() => alterarQuantidadeItem(item.id, 1)} aria-label={`Aumentar ${item.produtos?.nome}`}
                                                            className="w-10 h-10 rounded-lg bg-cafe-primary text-white font-bold active:scale-95">+</button>
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </section>
                        </div>

                        <footer className="border-t bg-white px-3 md:px-5 pt-2.5 shrink-0 flex items-center gap-2" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
                            <div className="min-w-0 mr-auto">
                                <span className="block text-[11px] text-gray-500 font-semibold leading-none">Total parcial</span>
                                <span className="text-xl md:text-2xl font-black text-cafe-primary whitespace-nowrap">{formatarMoeda(subtotalComandaAberta)}</span>
                            </div>
                            <button onClick={abrirCheckout} className="bg-white text-blue-700 border-2 border-blue-600 text-sm md:text-base font-bold px-3 md:px-5 py-3 rounded-xl hover:bg-blue-50 active:scale-95 transition whitespace-nowrap">
                                Fechar conta
                            </button>
                            <button onClick={() => { setComandaAberta(null); mostrarMensagem(`Comanda ${comandaAberta.identificacao} salva e aberta.`, 'sucesso'); }} aria-label="Salvar e voltar às mesas"
                                className="bg-cafe-primary text-white text-sm md:text-base font-bold px-4 md:px-6 py-3 rounded-xl shadow hover:bg-cafe-dark active:scale-95 transition whitespace-nowrap">
                                ✓ Salvar
                            </button>
                        </footer>
                    </div>
                </div>
            )}

            {modalCheckout && (
                <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-4 md:p-6 w-full max-w-md border-t-8 border-blue-600 max-h-[95vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-4 border-b pb-2">
                            <h3 className="text-xl font-bold text-cafe-dark">Fechar conta: {comandaAberta?.identificacao}</h3>
                            <button onClick={() => setModalCheckout(false)} className="text-cafe-primary font-bold px-3 py-2 rounded-lg hover:bg-cafe-secondary/20">Voltar</button>
                        </div>

                        <div className="mb-4 space-y-2">
                            <div className="flex justify-between items-center text-sm font-semibold text-gray-600">
                                <span>Subtotal da Comanda:</span>
                                <span>{formatarMoeda(subtotalComandaAberta)}</span>
                            </div>

                            <div className="flex justify-between items-center bg-red-50 p-3 md:p-2 rounded border border-red-100">
                                <span className="text-sm font-bold text-red-700">Desconto:</span>
                                <input
                                    type="number"
                                    placeholder="R$ 0,00"
                                    className="w-28 p-2 border border-red-200 rounded text-right font-bold text-red-700 outline-none focus:ring-2 focus:ring-red-400 bg-white text-base"
                                    value={desconto}
                                    onChange={(e) => setDesconto(Number(e.target.value) >= 0 ? Number(e.target.value) : '')}
                                />
                            </div>
                        </div>

                        <div className="bg-blue-50 text-blue-900 p-4 rounded-lg text-center mb-6 border border-blue-200">
                            <span className="text-sm font-semibold uppercase tracking-wider block mb-1">Total a Pagar</span>
                            <span className="text-4xl font-black">{formatarMoeda(totalComDesconto)}</span>
                        </div>

                        <div className="flex bg-gray-100 p-1 rounded-lg mb-4">
                            <button onClick={() => setModoPagamento('unico')} className={`flex-1 text-sm py-3 md:py-2 font-bold rounded transition ${modoPagamento === 'unico' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Pagamento Único</button>
                            <button onClick={() => setModoPagamento('misto')} className={`flex-1 text-sm py-3 md:py-2 font-bold rounded transition ${modoPagamento === 'misto' ? 'bg-white shadow text-cafe-primary' : 'text-gray-500 hover:text-gray-700'}`}>Combinar Formas</button>
                        </div>

                        {modoPagamento === 'unico' && (
                            <div className="space-y-3 mb-6">
                                <p className="text-sm font-bold text-gray-700">Como o cliente pagou?</p>
                                <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Forma de pagamento">
                                    {([['PIX', 'PIX', '⚡'], ['Dinheiro', 'Dinheiro', '💵'], ['Cartão de Crédito', 'Crédito', '💳'], ['Cartão de Débito', 'Débito', '🏧']] as const).map(([valor, rotulo, icone]) => (
                                        <button key={valor} role="radio" aria-checked={metodoUnico === valor} onClick={() => setMetodoUnico(valor)}
                                            className={`flex flex-col items-center justify-center gap-0.5 min-h-[60px] rounded-xl border-2 text-xs font-bold transition ${metodoUnico === valor ? 'border-blue-600 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600'}`}>
                                            <span className="text-xl leading-none" aria-hidden>{icone}</span>{rotulo}
                                        </button>
                                    ))}
                                </div>
                                {metodoUnico === 'Dinheiro' && (
                                    <div className="flex gap-2 items-center bg-gray-50 p-3 rounded border">
                                        <span className="text-sm font-bold text-gray-700">Valor recebido:</span>
                                        <input type="number" inputMode="decimal" placeholder={formatarMoeda(totalComDesconto)} className="flex-1 p-2 border rounded font-bold text-base outline-none focus:ring-2 focus:ring-blue-300" value={valorRecebidoDinheiro} onChange={(e) => setValorRecebidoDinheiro(e.target.value === '' ? '' : Number(e.target.value))} />
                                    </div>
                                )}
                                {trocoUnico > 0 && <div className="text-center font-black text-blue-600 text-xl py-3 bg-blue-50 rounded border border-blue-100">Troco: {formatarMoeda(trocoUnico)}</div>}
                            </div>
                        )}

                        {modoPagamento === 'misto' && (
                            <div className="space-y-3 mb-6 border p-3 rounded-lg bg-gray-50">
                                {pagamentosMistos.map((pm, index) => (
                                    <div key={index} className="flex gap-2">
                                        <select className="flex-1 p-3 md:p-2 border rounded font-semibold text-sm bg-white outline-none focus:ring-2 focus:ring-blue-300" value={pm.metodo} onChange={(e) => { const n = [...pagamentosMistos]; n[index].metodo = e.target.value; setPagamentosMistos(n); }}>
                                            <option value="PIX">PIX</option><option value="Dinheiro">Dinheiro</option><option value="Cartão de Crédito">Crédito</option><option value="Cartão de Débito">Débito</option>
                                        </select>
                                        <input type="number" placeholder="R$" className="w-24 p-3 md:p-2 border rounded font-bold text-base outline-none focus:ring-2 focus:ring-blue-300" value={pm.valor} onChange={(e) => { const n = [...pagamentosMistos]; n[index].valor = Number(e.target.value); setPagamentosMistos(n); }} />
                                        {index > 0 && <button onClick={() => setPagamentosMistos(pagamentosMistos.filter((_, i) => i !== index))} className="w-12 flex items-center justify-center text-red-500 font-black hover:bg-red-100 rounded border bg-white shadow-sm">X</button>}
                                    </div>
                                ))}
                                <button onClick={() => setPagamentosMistos([...pagamentosMistos, { metodo: 'Cartão de Crédito', valor: '' }])} className="w-full text-sm font-bold text-blue-600 hover:text-blue-800 py-3 bg-white border border-dashed rounded">+ Adicionar Forma</button>

                                <div className="flex justify-between font-black mt-3 pt-3 border-t border-gray-200">
                                    <span className={faltaPagarMisto > 0 ? 'text-red-500' : 'text-gray-500'}>Falta: {formatarMoeda(faltaPagarMisto)}</span>
                                    <span className={trocoMisto > 0 ? 'text-blue-600' : 'text-gray-500'}>Troco: {formatarMoeda(trocoMisto)}</span>
                                </div>
                            </div>
                        )}

                        <button onClick={finalizarVenda} disabled={finalizando || !pagamentoEscolhido} className="w-full bg-green-600 text-white font-black text-lg py-4 rounded-lg shadow-lg hover:bg-green-700 active:scale-95 transition disabled:cursor-not-allowed disabled:opacity-50">{finalizando ? 'FECHANDO...' : pagamentoEscolhido ? `Receber ${formatarMoeda(totalComDesconto)} e fechar comanda` : 'Escolha a forma de pagamento'}</button>
                    </div>
                </div>
            )}

            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-cafe-secondary/30 pb-4 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-cafe-primary">Mesas e Comandas</h2>
                    <p className="text-sm text-gray-500 font-semibold mt-1">Gira os pedidos em aberto antes do pagamento</p>
                </div>
                <button onClick={() => setModalNova(true)} className="w-full md:w-auto bg-cafe-secondary text-cafe-dark px-6 py-4 md:py-3 rounded font-black shadow hover:bg-opacity-90 active:scale-95 transition text-lg md:text-base">
                    + ABRIR COMANDA
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 min-h-[400px]">
                {comandas.map(comanda => {
                    const totalItens = comanda.itens_comanda.reduce((acc, i) => acc + i.quantidade, 0);
                    const totalValor = comanda.itens_comanda.reduce((acc, i) => acc + (i.quantidade * i.preco_unitario), 0);
                    return (
                        <div key={comanda.id} onClick={() => abrirComanda(comanda)} className="bg-white border-2 border-cafe-secondary/30 hover:border-cafe-primary rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition group relative overflow-hidden flex flex-col justify-between min-h-[140px]">
                            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-400"></div>
                            <div>
                                <h3 className="text-xl font-black text-cafe-dark group-hover:text-cafe-primary transition">{comanda.identificacao}</h3>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{comanda.nome_cliente}</p>
                            </div>
                            <div className="mt-4 flex justify-between items-end">
                                <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">{totalItens} itens</span>
                                <span className="text-lg font-black text-green-700">{formatarMoeda(totalValor)}</span>
                            </div>
                        </div>
                    )
                })}
                {comandas.length === 0 && (
                    <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50">
                        <span className="text-4xl mb-3 opacity-50">🍽️</span>
                        <p className="text-gray-500 font-bold text-lg">Nenhuma comanda aberta</p>
                        <p className="text-sm text-gray-400 text-center">O salão está vazio no momento.</p>
                    </div>
                )}
            </div>

            {confirmacao?.visivel && (
                <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70] p-4 animate-fade-in">
                    <div className="bg-white rounded-lg shadow-2xl p-6 w-full max-w-sm text-center">
                        <div className="text-red-500 text-4xl mb-3">⚠️</div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">{confirmacao.titulo}</h3>
                        <p className="text-gray-600 mb-6 text-sm">{confirmacao.msg}</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirmacao(null)} className="flex-1 bg-gray-100 py-3 md:py-2 rounded font-bold hover:bg-gray-200">Cancelar</button>
                            <button onClick={confirmacao.onConfirm} className="flex-1 bg-red-600 text-white py-3 md:py-2 rounded font-bold hover:bg-red-700">Sim, Excluir</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
