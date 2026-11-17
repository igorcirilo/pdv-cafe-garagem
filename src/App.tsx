import { useState, lazy, Suspense } from 'react';

const logo = '/marca/logo.png';
const CatalogoModulo = lazy(() => import('./components/CatalogoModulo'));
import AlertasGlobaisProvider from './components/AlertasGlobaisProvider';
import BackupDados from './components/BackupDados';
import { bancoConfigurado } from './lib/db';

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

function App() {
  const [abaAtiva, setAbaAtiva] = useState<Aba>('pdv');
  const atendenteNome = 'Operador';

  return (
    <div className="min-h-screen bg-cafe-bg text-cafe-dark font-sans flex flex-col">
      <AlertasGlobaisProvider />

      {/* HEADER REDESENHADO PARA MOBILE E DESKTOP */}
      <header className="bg-cafe-primary text-white shadow-md z-50 sticky top-0">
        <div className="max-w-7xl mx-auto px-4 py-3">

          {/* Linha 1: Logo e Controle de Usuário */}
          <div className="flex items-center justify-between mb-3 md:mb-4">
            <div className="flex items-center gap-3">
              <img src={logo} alt="Logo Café Garagem" className="h-12 md:h-16 w-auto rounded object-contain" />
              <h1 className="text-lg md:text-xl font-black tracking-widest uppercase hidden sm:block">Café Garagem</h1>
            </div>

            <div className="flex items-center gap-3 md:gap-4 bg-cafe-dark/30 py-1.5 px-3 md:px-4 rounded-xl border border-cafe-dark/50">
              <span className="text-[10px] md:text-xs font-bold text-cafe-secondary uppercase tracking-wider hidden sm:block">
                Operador: <strong className="text-white ml-1">{atendenteNome}</strong>
              </span>
              <span className="text-[10px] font-bold text-white uppercase tracking-wider sm:hidden">
                {atendenteNome.split(' ')[0]}
              </span>
              <div className="w-[1px] h-4 bg-cafe-secondary/30"></div>

            </div>
          </div>

          {/* Linha 2: Navegação com Scroll Horizontal Fio (Esconde a barra de rolagem nativa) */}
          <nav className="flex items-center gap-2 overflow-x-auto w-full pb-1 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <button onClick={() => setAbaAtiva('catalogo')} className={`px-4 py-2.5 text-xs font-black rounded-xl whitespace-nowrap uppercase ${abaAtiva === 'catalogo' ? 'bg-cafe-secondary text-cafe-dark' : 'bg-cafe-dark/40 text-gray-300'}`}>Catálogo</button>
            <button
              onClick={() => setAbaAtiva('pdv')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'pdv' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              PDV Caixa
            </button>
            <button
              onClick={() => setAbaAtiva('comandas')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'comandas' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Comandas
            </button>
            <button
              onClick={() => setAbaAtiva('dashboard')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'dashboard' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setAbaAtiva('precificacao')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'precificacao' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Fichas
            </button>
            <button
              onClick={() => setAbaAtiva('revenda')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'revenda' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Revenda
            </button>
            <button
              onClick={() => setAbaAtiva('entradas')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'entradas' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Estoque
            </button>
            <button
              onClick={() => setAbaAtiva('financeiro')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'financeiro' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Financeiro
            </button>
            <button
              onClick={() => setAbaAtiva('rendimentos')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'rendimentos' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Rendimentos
            </button>
            <button
              onClick={() => setAbaAtiva('relatorio-vendas')}
              className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all whitespace-nowrap uppercase tracking-wider ${abaAtiva === 'relatorio-vendas' ? 'bg-cafe-secondary text-cafe-dark shadow-md scale-105' : 'bg-cafe-dark/40 text-gray-300 hover:bg-cafe-dark/60 hover:text-white'}`}
            >
              Vendas
            </button>
          </nav>
        </div>
      </header>

      {/* ÁREA PRINCIPAL DO SISTEMA */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-2 md:px-4 py-4 md:py-6 overflow-x-hidden">
        {!bancoConfigurado && (
          <div role="alert" className="bg-red-50 border border-red-300 text-red-800 rounded-xl p-3 mb-4 text-sm font-bold">
            Banco de dados não configurado: defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY e gere o build novamente.
          </div>
        )}
        <BackupDados />
        <Suspense fallback={<div className="p-6 text-center">Carregando módulo...</div>}>
          {abaAtiva === 'catalogo' && <CatalogoModulo />}
          {abaAtiva === 'pdv' && <PDVModulo atendente={atendenteNome} />}
          {abaAtiva === 'dashboard' && <DashboardModulo />}
          {abaAtiva === 'precificacao' && <PrecificacaoModulo />}
          {abaAtiva === 'revenda' && <CadastroRevenda atendente={atendenteNome} />}
          {abaAtiva === 'entradas' && <EntradasCompras atendente={atendenteNome} />}
          {abaAtiva === 'financeiro' && <ContasPagarModulo />}
          {abaAtiva === 'comandas' && <GestaoComandas atendente={atendenteNome} />}
          {abaAtiva === 'rendimentos' && <DashboardRendimentos />}
          {abaAtiva === 'relatorio-vendas' && <RelatorioVendasModulo />}
        </Suspense>
      </main>
    </div>
  );
}

export default App;