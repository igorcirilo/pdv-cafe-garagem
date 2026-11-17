/* Cliente HTTP do servidor SQLite local. Nenhum serviço externo é utilizado. */
export async function request(path: string, body?: unknown): Promise<any> {
  try {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok && !result.error) result.error = { message: 'Falha na operação local' };
    return result;
  } catch { return { data: null, error: { message: 'Servidor local indisponível. Abra INICIAR.bat e tente novamente.' } }; }
}
type Result<T> = { data: T; error: any; count: number };
class Query<T = any[]> {
  private spec: any;
  constructor(table: string) { this.spec = { table, action: 'select', filters: [], orders: [] }; }
  select(columns = '*', options?: any) { this.spec.columns = columns; this.spec.count = options?.count; return this; }
  insert(values: any) { this.spec.action = 'insert'; this.spec.values = values; return this; }
  update(values: any) { this.spec.action = 'update'; this.spec.values = values; return this; }
  delete() { this.spec.action = 'delete'; return this; }
  eq(field: string, value: any) { return this.filter(field, 'eq', value); }
  neq(field: string, value: any) { return this.filter(field, 'neq', value); }
  gte(field: string, value: any) { return this.filter(field, 'gte', value); }
  lte(field: string, value: any) { return this.filter(field, 'lte', value); }
  is(field: string, value: any) { return this.filter(field, 'is', value); }
  not(field: string, operator: string, value: any) { return this.filter(field, `not.${operator}`, value); }
  private filter(field: string, op: string, value: any) { this.spec.filters.push({ field, op, value }); return this; }
  order(field: string, options?: any) { this.spec.orders.push({ field, ascending: options?.ascending !== false }); return this; }
  limit(value: number) { this.spec.limit = value; return this; }
  range(from: number, to: number) { this.spec.offset = from; this.spec.limit = to - from + 1; return this; }
  single() { this.spec.single = 'required'; return this as unknown as Query<any>; }
  maybeSingle() { this.spec.single = 'maybe'; return this as unknown as Query<any>; }
  then(resolve: (value: Result<T>) => any, reject?: (reason: any) => any) { return request('query', this.spec).then(resolve, reject); }
}
export const localDB = {
  from: (table: string) => new Query(table),
  rpc: (name: string, args: unknown = {}) => request('rpc', { name, args }),
};
