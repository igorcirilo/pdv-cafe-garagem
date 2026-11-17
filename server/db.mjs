import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url)));
export const relations = {
  contas_pagar: { fornecedores: ['fornecedor_id', 'id'] },
  entradas: { fornecedores: ['fornecedor_id', 'id'] },
  itens_venda: { produtos: ['produto_id', 'id'], vendas: ['venda_id', 'id'] },
  itens_comanda: { produtos: ['produto_id', 'id'], comandas: ['comanda_id', 'id'] },
  comandas: { itens_comanda: ['id', 'comanda_id', true] },
  vendas: { itens_venda: ['id', 'venda_id', true] },
  fichas_tecnicas: { produtos: ['produto_venda_id', 'id'] },
  ficha_ingredientes: { insumos: ['insumo_id', 'id'], produtos: ['produto_ingrediente_id', 'id'], receitas_base: ['receita_base_id', 'id'], fichas_tecnicas: ['ficha_id', 'id'] },
  receitas_base_itens: { insumos: ['insumo_id', 'id'], receitas_base: ['receita_base_id', 'id'] },
  movimentacoes_estoque: { produtos: ['produto_id', 'id'], insumos: ['insumo_id', 'id'], vendas: ['venda_id', 'id'] },
  movimentacoes_caixa: { controle_caixa: ['caixa_id', 'id'] },
};
const defaults = { ativo: 1, modo_estoque: 'revenda', tipo: 'venda', unidade_medida: 'un', fator_correcao: 1, rendimento_porcoes: 1, rendimento_peso: 1, qtd_embalagem: 1 };
const statuses = { vendas: 'Concluída', contas_pagar: 'Pendente', comandas: 'aberta', controle_caixa: 'aberto' };
export const now = () => new Date().toISOString();
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
export function openDatabase(file) {
  mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  for (const [table, fields] of Object.entries(schema)) {
    const columns = Object.entries(fields).map(([key, type]) => {
      if (key === 'id') return `id ${type === 'number' ? 'INTEGER' : 'TEXT'} PRIMARY KEY NOT NULL`;
      let def = defaults[key] ?? (type.includes('number') ? 0 : undefined);
      if (key === 'status') def = statuses[table];
      if (key === 'pagamentos') def = '[]';
      const required = !type.includes('null') && key !== 'id';
      const stamp = ['created_at', 'data_abertura', 'data_entrada', 'data_venda', 'data_movimento'].includes(key);
      return `"${key}" ${type.includes('number') ? 'REAL' : type.includes('boolean') ? 'INTEGER' : 'TEXT'}${required ? ' NOT NULL' : ''}${stamp ? " DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))" : def !== undefined ? ` DEFAULT ${typeof def === 'number' ? def : `'${def}'`}` : ''}`;
    });
    for (const [target, [from, to, many]] of Object.entries(relations[table] || {})) {
      if (!many) columns.push(`FOREIGN KEY("${from}") REFERENCES "${target}"("${to}") ON DELETE ${table === 'itens_comanda' && target === 'comandas' ? 'CASCADE' : 'RESTRICT'}`);
    }
    if (table === 'produtos' || table === 'insumos') columns.push('CHECK(quantidade_estoque >= -0.000000001)');
    if (table === 'produtos') columns.push("CHECK(modo_estoque IN ('revenda','producao_sob_demanda','producao_lote'))");
    if (table === 'itens_venda' || table === 'itens_comanda') columns.push('CHECK(quantidade > 0 AND preco_unitario >= 0)');
    db.exec(`CREATE TABLE IF NOT EXISTS "${table}" (${columns.join(',')})`);
  }
  if (!db.prepare('PRAGMA table_info(produtos)').all().some(c => c.name === 'categoria')) db.exec('ALTER TABLE produtos ADD COLUMN categoria TEXT');
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS uma_ficha_por_produto ON fichas_tecnicas(produto_venda_id);
    CREATE UNIQUE INDEX IF NOT EXISTS um_caixa_aberto ON controle_caixa(status) WHERE status='aberto';
    CREATE INDEX IF NOT EXISTS vendas_data ON vendas(data_venda);
    CREATE INDEX IF NOT EXISTS movimentos_venda ON movimentacoes_estoque(venda_id);
    CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO _meta VALUES ('schema_version','1'),('application','village-cafe-local');
    INSERT OR IGNORE INTO conta_bancaria(id,saldo) VALUES(1,0);
    INSERT OR IGNORE INTO parametros_precificacao(id,custos_fixos_pct,imposto_taxa_cartao_pct,margem_lucro_alvo_pct) VALUES(1,0,0,30);
    PRAGMA user_version=1;`);
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (err) { db.exec('ROLLBACK'); throw err; }
}
export function checkTable(table) { if (!Object.hasOwn(schema, table)) throw Error('Tabela inválida'); return table; }
export function checkField(table, field) { checkTable(table); if (!Object.hasOwn(schema[table], field)) throw Error('Campo inválido'); return field; }
const encode = value => value === undefined ? null : typeof value === 'boolean' ? Number(value) : value !== null && typeof value === 'object' ? JSON.stringify(value) : value;
export function decode(row) {
  if (!row) return row;
  const result = { ...row };
  if ('ativo' in result) result.ativo = Boolean(result.ativo);
  if (typeof result.pagamentos === 'string') result.pagamentos = JSON.parse(result.pagamentos);
  return result;
}
export const all = (db, table) => db.prepare(`SELECT * FROM "${checkTable(table)}"`).all().map(decode);
export const get = (db, table, id) => decode(db.prepare(`SELECT * FROM "${checkTable(table)}" WHERE id=?`).get(id)) || null;
export function insert(db, table, values) {
  checkTable(table);
  const row = { id: schema[table].id === 'number' ? 1 : randomUUID(), ...values };
  const keys = Object.keys(row); keys.forEach(k => checkField(table, k));
  db.prepare(`INSERT INTO "${table}" (${keys.map(k => `"${k}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(k => encode(row[k])));
  return get(db, table, row.id);
}
export function update(db, table, id, values) {
  const keys = Object.keys(values); keys.forEach(k => checkField(table, k));
  if (!keys.length) return get(db, table, id);
  if (keys.includes('id')) throw Error('Não é permitido alterar o identificador');
  db.prepare(`UPDATE "${table}" SET ${keys.map(k => `"${k}"=?`).join(',')} WHERE id=?`).run(...keys.map(k => encode(values[k])), id);
  return get(db, table, id);
}
// Projeções e relacionamentos usados pela interface original, sem SQL recebido do navegador.
function split(text) { let depth = 0, start = 0; const parts = []; for (let i=0;i<text.length;i++) { if(text[i]==='(') depth++; if(text[i]===')') depth--; if(text[i]===',' && depth===0) {parts.push(text.slice(start,i).trim());start=i+1;} } parts.push(text.slice(start).trim()); return parts; }
function project(db, table, row, columns, depth=0) {
  if (depth > 4) throw Error('Relacionamento muito profundo');
  let out = {};
  for (const token of split(columns || '*')) {
    if (token === '*') { out = { ...out, ...row }; continue; }
    const match = token.match(/^(\w+)(!inner)?\s*\((.*)\)$/s);
    if (!match) { checkField(table, token); out[token] = row[token]; continue; }
    const [,target,inner,fields] = match;
    const relation = relations[table]?.[target]; if (!relation) throw Error('Relacionamento inválido');
    const [from,to,many] = relation;
    const found = all(db, target).filter(r => row[from] !== null && r[to] === row[from]).map(r => project(db,target,r,fields,depth+1)).filter(Boolean);
    if (inner && !found.length) return null;
    out[target] = many ? found : found[0] || null;
  }
  return out;
}
export function query(db, spec) {
  const { table, action = 'select', filters = [], orders = [], columns = '*', single } = spec;
  checkTable(table);
  if (!['select','insert','update','delete'].includes(action)) throw Error('Operação inválida');
  function matches(row) { return filters.every(({field,op,value}) => {
    const parts = field.split('.'); let actual;
    if(parts.length===2) { const [target,key]=parts;const rel=relations[table]?.[target];if(!rel || rel[2])throw Error('Filtro inválido');checkField(target,key); actual=all(db,target).find(r=>r[rel[1]]===row[rel[0]])?.[key]; }
    else { checkField(table,field);actual=row[field]; }
    switch(op) { case 'eq': return actual===value; case 'neq': return actual!==null && actual!==value;case 'gte': return actual!==null && actual>=value;case 'lte': return actual!==null && actual<=value;case 'is':return actual===value;case 'not.is':return actual!==value;default:throw Error('Filtro inválido'); }
  }); }
  const execute = () => {
    let rows = all(db,table).filter(matches);
    if(action==='insert') rows=(Array.isArray(spec.values)?spec.values:[spec.values]).map(v=>insert(db,table,v));
    if(action==='update' || action==='delete') {
      if (!filters.length) throw Error('Filtro obrigatório para alterar ou excluir');
      rows=rows.map(row=>action==='update'?update(db,table,row.id,spec.values):(db.prepare(`DELETE FROM "${table}" WHERE id=?`).run(row.id),row));
    }
    // Ordenação e filtros acontecem antes da projeção, inclusive colunas não selecionadas.
    for(const {field} of orders) checkField(table,field);
    rows.sort((a,b)=>{for(const {field,ascending} of orders){const c=a[field]===b[field]?0:a[field]==null?-1:b[field]==null?1:a[field]<b[field]?-1:1;if(c)return ascending?c:-c;}return 0;});
    rows=rows.map(r=>project(db,table,r,columns)).filter(Boolean);
    const count=rows.length;
    const offset=spec.offset??0,limit=spec.limit??rows.length;
    if(!Number.isInteger(offset)||!Number.isInteger(limit)||offset<0||limit<0)throw Error('Paginação inválida');
    rows=rows.slice(offset,offset+limit);
    if(single && (rows.length>1 || (single==='required' && rows.length!==1)))throw Error('Registro não encontrado ou resultado não único');
    return { data: single ? rows[0] || null : rows, error:null, count };
  };
  return action==='select'?execute():transaction(db,execute);
}
