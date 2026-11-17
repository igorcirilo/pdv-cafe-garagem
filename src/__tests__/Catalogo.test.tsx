import { render,screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe,it,expect,vi } from 'vitest';
import CatalogoModulo from '../components/CatalogoModulo';
import { db } from '../lib/db';
vi.mock('../lib/db',()=>({db:{from:vi.fn()}}));
describe('catálogo Café Garagem',()=>{
 it('mostra os produtos, filtra e salva o preço no SQLite pelo cliente local',async()=>{
   let rows=[{id:'p1',nome:'Expresso simples',categoria:'Cafés',preco_venda:8.9,ativo:true},{id:'p2',nome:'Água',categoria:'Bebidas',preco_venda:3,ativo:true}];let payload:Record<string,unknown>|null=null;
   const query={select:()=>query,eq:()=>query,order:()=>query,update:(values:Record<string,unknown>)=>{payload=values;return query;},then:(resolve:(v:unknown)=>unknown)=>{if(payload){rows=rows.map(r=>r.id==='p1'?{...r,...payload}:r);}return Promise.resolve({data:rows,error:null}).then(resolve);}};
   vi.mocked(db.from).mockReturnValue(query as unknown as ReturnType<typeof db.from>);
   const user=userEvent.setup();render(<CatalogoModulo/>);
   await waitFor(()=>expect(screen.getByText('Expresso simples')).toBeInTheDocument());
   await user.click(screen.getByRole('button',{name:'Bebidas'}));expect(screen.queryByText('Expresso simples')).toBeNull();expect(screen.getByText('Água')).toBeInTheDocument();
   await user.click(screen.getByRole('button',{name:'Todos'}));await user.click(screen.getByRole('button',{name:'Editar Expresso simples'}));
   const price=screen.getByLabelText('Preço (R$)');await user.clear(price);await user.type(price,'9,50');await user.click(screen.getByRole('button',{name:'Salvar'}));
   await waitFor(()=>expect(screen.getByText('Produto atualizado no catálogo e no PDV.')).toBeInTheDocument());expect(payload).toEqual({nome:'Expresso simples',categoria:'Cafés',preco_venda:9.5});
 });
});
