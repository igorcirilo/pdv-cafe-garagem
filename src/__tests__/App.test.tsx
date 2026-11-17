import { render,screen,waitFor } from '@testing-library/react';
import { describe,it,expect,vi } from 'vitest';
import App from '../App';
vi.mock('../components/PDVModulo',()=>({default:({atendente}:{atendente:string})=><div>Caixa pronto: {atendente}</div>}));
vi.mock('../components/AlertasGlobaisProvider',()=>({default:()=>null}));
describe('acesso direto sem login',()=>{
  it('abre o caixa diretamente e disponibiliza backup',async()=>{
    render(<App/>);
    await waitFor(()=>expect(screen.getByText('Caixa pronto: Operador')).toBeInTheDocument());
    expect(document.querySelector('input[type=password]')).toBeNull();
    expect(screen.queryByRole('button',{name:/Entrar|Sair|Criar conta/i})).toBeNull();
    expect(screen.getByRole('button',{name:'Baixar backup agora',hidden:true})).toBeInTheDocument();
  });
});
