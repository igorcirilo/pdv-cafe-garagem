import { useState } from 'react';
import { db, tabelasPdv } from '../lib/db';

const PAGINA = 1000;

/** Baixa todas as linhas de uma tabela, de 1000 em 1000 (limite por requisição da API do Supabase). */
async function lerTabela(tabela: string) {
  const linhas: unknown[] = [];
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data, error } = await db.from(tabela).select('*').order('id').range(inicio, inicio + PAGINA - 1);
    if (error) throw Error(`${tabela}: ${error.message}`);
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return linhas;
  }
}

export default function BackupDados() {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  async function backup() {
    setBusy(true); setMessage('');
    try {
      const tabelas: Record<string, unknown[]> = {};
      for (const tabela of tabelasPdv) tabelas[tabela] = await lerTabela(tabela);
      const conteudo = JSON.stringify({ aplicacao: 'cafe-garagem-pdv', exportado_em: new Date().toISOString(), tabelas }, null, 2);
      const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' })), link = document.createElement('a');
      link.href = url; link.download = `pdv-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Backup baixado. Guarde uma cópia em local seguro.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Falha no backup'); } finally { setBusy(false); }
  }
  return <details className="bg-white border rounded-xl p-3 mb-4 text-sm">
    <summary className="font-bold cursor-pointer">Backup dos dados</summary>
    <p className="my-2">Os dados ficam na nuvem (Supabase). Este botão baixa uma cópia completa em JSON para guardar no computador.</p>
    <div className="flex flex-wrap gap-3 items-center">
      <button disabled={busy} onClick={backup} className="bg-cafe-primary text-white rounded px-4 py-2">{busy ? 'Aguarde...' : 'Baixar backup agora'}</button>
    </div>
    {message && <p role="status" className="mt-2">{message}</p>}
  </details>;
}
