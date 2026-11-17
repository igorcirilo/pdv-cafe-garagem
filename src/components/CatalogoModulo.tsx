import { useEffect,useState } from 'react';
import { db } from '../lib/db';
type Produto = {id:string;nome:string;categoria:string|null;preco_venda:number;ativo:boolean};
const grupos=['Cafés','Especiais','Adicionais','Lanches','Salgados','Pizzas','Sobremesas','Bebidas'];
const moeda=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
export default function CatalogoModulo() {
  const [produtos,setProdutos]=useState<Produto[]>([]),[busca,setBusca]=useState(''),[grupo,setGrupo]=useState('Todos');
  const [edicao,setEdicao]=useState<Produto|null>(null),[preco,setPreco]=useState(''),[mensagem,setMensagem]=useState(''),[salvando,setSalvando]=useState(false);
  async function carregar(){const {data,error}=await db.from('produtos').select('*').eq('tipo','venda').eq('ativo',true).order('nome');if(error)setMensagem(error.message);else setProdutos(data as Produto[]);}
  useEffect(()=>{void carregar();},[]);
  async function salvar(e:React.FormEvent) {
    e.preventDefault();if(!edicao)return;
    const valor=Number(preco.replace(',','.'));
    if(!edicao.nome.trim()||!Number.isFinite(valor)||valor<0){setMensagem('Informe nome e preço válidos.');return;}
    setSalvando(true);
    const {error}=await db.from('produtos').update({nome:edicao.nome.trim(),categoria:edicao.categoria,preco_venda:Math.round(valor*100)/100}).eq('id',edicao.id);
    setSalvando(false);if(error){setMensagem(error.message);return;}
    setEdicao(null);setMensagem('Produto atualizado no catálogo e no PDV.');await carregar();
  }
  const visiveis=produtos.filter(p=>(grupo==='Todos'||(p.categoria||'Outros')===grupo)&&p.nome.toLocaleLowerCase('pt-BR').includes(busca.toLocaleLowerCase('pt-BR')));
  const categorias=[...grupos,...new Set(produtos.map(p=>p.categoria||'Outros').filter(c=>!grupos.includes(c)))];
  return <section className="space-y-5">
    <div className="bg-cafe-dark text-cafe-secondary rounded-2xl p-5 flex items-center gap-5"><img src="/marca/logo.png" alt="Logo Café Garagem" className="w-32 md:w-48 rounded-xl"/><div><p className="text-xs uppercase tracking-widest">Mais que café, é estilo de vida!</p><h2 className="text-3xl font-black my-2">Catálogo Café Garagem</h2><p>{produtos.length} produtos · valores em reais</p></div></div>
    <p className="text-sm bg-amber-50 border border-amber-200 p-3 rounded-xl">Produtos cadastrados a partir do cardápio. O estoque inicial e o custo estão zerados: registre o estoque real em Revenda ou configure as fichas técnicas antes de vender. Os adicionais são itens separados no pedido.</p>
    {mensagem&&<p role="status" className="border rounded p-3">{mensagem}</p>}
    <div className="flex flex-wrap gap-2"><input aria-label="Buscar no catálogo" placeholder="Buscar produto…" value={busca} onChange={e=>setBusca(e.target.value)} className="border rounded-xl p-3 flex-1 min-w-48"/>{['Todos',...categorias].map(c=><button key={c} onClick={()=>setGrupo(c)} className={`rounded-xl px-3 py-2 ${grupo===c?'bg-cafe-primary text-white':'bg-white border'}`}>{c}</button>)}</div>
    {categorias.map(c=>{const items=visiveis.filter(p=>(p.categoria||'Outros')===c);return items.length?<div key={c}><h3 className="text-xl font-black text-cafe-primary mb-3">{c}</h3><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">{items.map(p=><article key={p.id} className="bg-white border rounded-xl p-4"><h4 className="font-bold">{p.nome}</h4><div className="flex justify-between items-center mt-3"><strong className="text-cafe-primary text-lg">{moeda(p.preco_venda)}</strong><button aria-label={`Editar ${p.nome}`} className="border rounded-lg px-3 py-1" onClick={()=>{setEdicao({...p});setPreco(String(p.preco_venda));setMensagem('');}}>Editar</button></div></article>)}</div></div>:null;})}
    {!visiveis.length&&<p>Nenhum produto encontrado.</p>}
    {edicao&&<div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4"><form onSubmit={salvar} className="bg-white rounded-2xl p-6 space-y-4 w-full max-w-md"><h3 className="text-xl font-black">Editar produto</h3><label className="block">Nome<input required value={edicao.nome} onChange={e=>setEdicao({...edicao,nome:e.target.value})} className="block border rounded p-2 w-full"/></label><label className="block">Categoria<select value={edicao.categoria||'Outros'} onChange={e=>setEdicao({...edicao,categoria:e.target.value})} className="block border rounded p-2 w-full">{[...new Set([...categorias,'Outros'])].map(c=><option key={c}>{c}</option>)}</select></label><label className="block">Preço (R$)<input required inputMode="decimal" value={preco} onChange={e=>setPreco(e.target.value)} className="block border rounded p-2 w-full"/></label><div className="flex gap-3"><button disabled={salvando} className="bg-cafe-primary text-white px-4 py-2 rounded">{salvando?'Salvando…':'Salvar'}</button><button type="button" disabled={salvando} onClick={()=>setEdicao(null)}>Cancelar</button></div></form></div>}
  </section>;
}
