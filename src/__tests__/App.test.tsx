import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe,it,expect,vi,beforeEach } from 'vitest';
import App from '../App';
vi.mock('../components/PDVModulo',()=>({default:({atendente}:{atendente:string})=><div>Caixa pronto: {atendente}</div>}));
vi.mock('../components/ContasPagarModulo',()=>({default:()=><div>Módulo financeiro</div>}));
vi.mock('../components/DashboardRendimentos',()=>({default:()=><div>Módulo rendimentos</div>}));
vi.mock('../components/AlertasGlobaisProvider',()=>({default:()=>null}));
describe('acesso direto sem login',()=>{
  beforeEach(()=>{ try { localStorage.clear(); } catch { /* sem armazenamento */ } });
  it('abre direto na tela de venda, sem login',async()=>{
    render(<App/>);
    await waitFor(()=>expect(screen.getByText('Caixa pronto: Operador')).toBeInTheDocument());
    expect(document.querySelector('input[type=password]')).toBeNull();
    expect(screen.queryByRole('button',{name:/Entrar|Sair|Criar conta/i})).toBeNull();
  });
  it('backup fica no Financeiro e o menu Mais leva às outras telas',async()=>{
    const user=userEvent.setup();
    render(<App/>);
    await waitFor(()=>expect(screen.getByText('Caixa pronto: Operador')).toBeInTheDocument());
    expect(screen.queryByRole('button',{name:'Baixar backup agora',hidden:true})).toBeNull();
    await user.click(screen.getAllByRole('button',{name:'Financeiro'})[0]);
    await waitFor(()=>expect(screen.getByText('Módulo financeiro')).toBeInTheDocument());
    expect(screen.getByRole('button',{name:'Baixar backup agora',hidden:true})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/Mais/}));
    const menu=screen.getByRole('dialog',{name:'Mais opções'});
    await user.click(Array.from(menu.querySelectorAll('button')).find(b=>b.textContent?.includes('Rendimentos'))!);
    await waitFor(()=>expect(screen.getByText('Módulo rendimentos')).toBeInTheDocument());
    expect(screen.queryByRole('dialog',{name:'Mais opções'})).toBeNull();
  });
});
