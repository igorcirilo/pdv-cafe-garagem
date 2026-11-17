import { useState, lazy, Suspense, useEffect, useRef } from 'react';
import AlertasGlobaisProvider from './components/AlertasGlobaisProvider';
import BackupDados from './components/BackupDados';
import { bancoConfigurado } from './lib/db';

const logo = '/marca/logo.png';
const CatalogoModulo = lazy(() => import('./components/CatalogoModulo'));
const PrecificacaoModulo = lazy(() => import('./components/PrecificacaoModulo'));
const EntradasCompras = lazy(() => import('./components/EntradasCompras'));
const CadastroRevenda = lazy(() => import('./components/CadastroRevenda'));
const PDVModulo = lazy(() => import('./components/PDVModulo'));
const DashboardModulo = lazy(() => import('./components/DashboardModulo'));
const ContasPagarModulo = lazy(() => import('./components/ContasPagarModulo'));
const GestaoComandas = lazy(() => import('./components/GestaoComandas'));
const DashboardRendimentos = lazy(() => import('./components/DashboardRendimentos'));
const RelatorioVendasModulo = lazy(() => import('./components/RelatorioVendasModulo'));

type Aba = 'catalogo' | 'dashboard' | 'pdv' | 'precificacao' | 'revenda' | 'entradas' | 'financeiro' | 'comandas' | 'rendimentos' | 'relatorio-vendas';
type Grupo = 'Vender' | 'Gestão' | 'Relatórios';

const ABAS: { id: Aba; rotulo: string; icone: string; grupo: Grupo }[] = [
  { id: 'pdv', rotulo: 'Vender', icone: '🛒', grupo: 'Vender' },
  { id: 'comandas', rotulo: 'Comandas', icone: '📝', grupo: 'Vender' },
  { id: 'dashboard', rotulo: 'Caixa', icone: '💰', grupo: 'Vender' },
  { id: 'catalogo', rotulo: 'Catálogo', icone: '📋', grupo: 'Gestão' },
  { id: 'revenda', rotulo: 'Produtos', icone: '📦', grupo: 'Gestão' },
  { id: 'entradas', rotulo: 'Insumos', icone: '🧂', grupo: 'Gestão' },
  { id: 'precificacao', rotulo: 'Fichas', icone: '🧾', grupo: 'Gestão' },
  { id: 'financeiro', rotulo: 'Financeiro', icone: '🏦', grupo: 'Gestão' },
  { id: 'rendimentos', rotulo: 'Rendimentos', icone: '📈', grupo: 'Relatórios' },
  { id: 'relatorio-vendas', rotulo: 'Vendas', icone: '📊', grupo: 'Relatórios' },
];
const GRUPOS: Grupo[] = ['Vender', 'Gestão', 'Relatórios'];
/** Telas fixas no menu inferior do celular; as demais ficam em "Mais". */
const ABAS_RODAPE: Aba[] = ['pdv', 'comandas', 'dashboard'];
const CHAVE_ABA = 'pdv.abaAtiva';

function abaSalva(): Aba {
  try {
    const salva = localStorage.getItem(CHAVE_ABA);
    if (salva && ABAS.some(a => a.id === salva)) return salva as Aba;
  } catch { /* armazenamento indisponível */ }
  return 'pdv';
}

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>(abaSalva);
  const [menuMaisAberto, setMenuMaisAberto] = useState(false);
  const atendenteNome = 'Operador';
  const abaInfo = ABAS.find(a => a.id === abaAtiva)!;
  const refCabecalho = useRef<HTMLElement>(null);

  // Publica a altura real do cabeçalho em --altura-cabecalho (usada por painéis fixos, como o pedido do PDV).
  useEffect(() => {
    const el = refCabecalho.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => document.documentElement.style.setProperty('--altura-cabecalho', `${el.offsetHeight}px`));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CHAVE_ABA, abaAtiva); } catch { /* armazenamento indisponível */ }
  }, [abaAtiva]);

  const irPara = (aba: Aba) => { setAbaAtiva(aba); setMenuMaisAberto(false); window.scrollTo({ top: 0 }); };

  return (
    <div className="min-h-[100dvh] bg-cafe-bg text-cafe-dark font-sans flex flex-col">
      <AlertasGlobaisProvider />

      <header ref={refCabecalho} className="bg-cafe-primary text-white shadow-md z-40 sticky top-0" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="max-w-7xl mx-auto px-3 md:px-4 py-2 flex items-center gap-3">
          <img src={logo} alt="Logo Café Garagem" className="h-10 w-auto rounded object-contain shrink-0" />
          <div className="min-w-0 md:hidden">
            <h1 className="text-xs font-black tracking-widest uppercase text-cafe-secondary leading-none">Café Garagem</h1>
            <p className="text-lg font-bold leading-tight truncate">{abaInfo.rotulo}</p>
          </div>

          {/* Tablet/computador: abas numa linha, agrupadas por divisórias */}
          <nav className="hidden md:flex items-center gap-1 flex-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Navegação principal">
            {GRUPOS.map((grupo, i) => (
              <div key={grupo} className="flex items-center gap-1 shrink-0" role="group" aria-label={grupo}>
                {i > 0 && <span className="w-px h-6 bg-white/25 mx-1.5" aria-hidden />}
                {ABAS.filter(a => a.grupo === grupo).map(a => (
                  <button key={a.id} onClick={() => irPara(a.id)} aria-current={abaAtiva === a.id ? 'page' : undefined}
                    className={`px-2.5 lg:px-3 py-2 min-h-[44px] text-sm font-bold rounded-lg whitespace-nowrap transition ${abaAtiva === a.id ? 'bg-cafe-secondary text-cafe-dark shadow' : 'text-white/90 hover:bg-white/10'}`}>
                    {a.rotulo}
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-3 md:px-4 py-3 md:py-5 overflow-x-hidden pb-[calc(var(--altura-nav-inferior,0px)+1rem)] md:pb-6">
        {!bancoConfigurado && (
          <div role="alert" className="bg-red-50 border border-red-300 text-red-800 rounded-xl p-3 mb-4 text-sm font-bold">
            Banco de dados não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY e gere o build novamente.
          </div>
        )}
        <Suspense fallback={<div className="p-6 text-center text-cafe-primary font-bold animate-pulse">Carregando...</div>}>
          {abaAtiva === 'catalogo' && <CatalogoModulo />}
          {abaAtiva === 'pdv' && <PDVModulo atendente={atendenteNome} />}
          {abaAtiva === 'dashboard' && <DashboardModulo />}
          {abaAtiva === 'precificacao' && <PrecificacaoModulo />}
          {abaAtiva === 'revenda' && <CadastroRevenda atendente={atendenteNome} />}
          {abaAtiva === 'entradas' && <EntradasCompras atendente={atendenteNome} />}
          {abaAtiva === 'financeiro' && <><ContasPagarModulo /><div className="mt-6"><BackupDados /></div></>}
          {abaAtiva === 'comandas' && <GestaoComandas atendente={atendenteNome} />}
          {abaAtiva === 'rendimentos' && <DashboardRendimentos />}
          {abaAtiva === 'relatorio-vendas' && <RelatorioVendasModulo />}
        </Suspense>
      </main>

      {/* Celular: menu inferior fixo */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-gray-200 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} aria-label="Navegação principal">
        <div className="grid grid-cols-4 h-16">
          {ABAS_RODAPE.map(id => {
            const a = ABAS.find(x => x.id === id)!;
            const ativo = abaAtiva === id && !menuMaisAberto;
            return (
              <button key={id} onClick={() => irPara(id)} aria-current={ativo ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-0.5 text-xs font-bold ${ativo ? 'text-cafe-primary' : 'text-gray-500'}`}>
                <span className={`text-xl leading-none px-4 py-0.5 rounded-full ${ativo ? 'bg-cafe-secondary/40' : ''}`} aria-hidden>{a.icone}</span>{a.rotulo}
              </button>
            );
          })}
          {(() => {
            const ativo = menuMaisAberto || !ABAS_RODAPE.includes(abaAtiva);
            return (
              <button onClick={() => setMenuMaisAberto(v => !v)} aria-expanded={menuMaisAberto}
                className={`flex flex-col items-center justify-center gap-0.5 text-xs font-bold ${ativo ? 'text-cafe-primary' : 'text-gray-500'}`}>
                <span className={`text-xl leading-none px-4 py-0.5 rounded-full ${ativo ? 'bg-cafe-secondary/40' : ''}`} aria-hidden>☰</span>Mais
              </button>
            );
          })()}
        </div>
      </nav>

      {menuMaisAberto && (
        <div className="md:hidden fixed inset-0 z-[45] bg-black/40" onClick={() => setMenuMaisAberto(false)}>
          <div className="absolute inset-x-0 bg-white rounded-t-3xl p-4 pb-5 shadow-2xl max-h-[80dvh] overflow-y-auto"
            style={{ bottom: 'var(--altura-nav-inferior, 0px)' }} onClick={e => e.stopPropagation()} role="dialog" aria-label="Mais opções">
            {GRUPOS.filter(g => g !== 'Vender').map(grupo => (
              <div key={grupo} className="mb-4">
                <h2 className="text-xs font-black uppercase tracking-widest text-gray-400 mb-2">{grupo}</h2>
                <div className="grid grid-cols-3 gap-2">
                  {ABAS.filter(a => a.grupo === grupo).map(a => (
                    <button key={a.id} onClick={() => irPara(a.id)}
                      className={`flex flex-col items-center justify-center gap-1 min-h-[76px] rounded-2xl border-2 text-sm font-bold ${abaAtiva === a.id ? 'border-cafe-primary bg-cafe-secondary/20 text-cafe-dark' : 'border-gray-200 text-gray-700'}`}>
                      <span className="text-2xl leading-none" aria-hidden>{a.icone}</span>{a.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <p className="text-xs text-gray-400 text-center">O backup dos dados fica em Financeiro.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
