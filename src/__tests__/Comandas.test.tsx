import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GestaoComandas from '../components/GestaoComandas';
import { db } from '../lib/db';

vi.mock('../lib/db', () => ({ db: { from: vi.fn(), rpc: vi.fn() } }));

const comanda = {
  id: 'c1', identificacao: 'Mesa 4', nome_cliente: 'Ana', status: 'aberta', atendente: 'Operador', created_at: '2026-11-17T19:50:00Z',
  itens_comanda: [
    { id: 'i1', produto_id: 'p1', quantidade: 2, preco_unitario: 8.9, produtos: { nome: 'Expresso' } },
    { id: 'i2', produto_id: 'p2', quantidade: 1, preco_unitario: 7.7, produtos: { nome: 'Pão na chapa' } },
  ],
};

function consulta(resultado: { data: unknown; error: null }) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'neq', 'order', 'limit', 'maybeSingle', 'single', 'insert', 'update', 'delete']) q[m] = vi.fn(() => q);
  q.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, erro);
  return q;
}

describe('Comandas ficam abertas até o pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => consulta({
      data: tabela === 'controle_caixa' ? { id: 'cx1' } : tabela === 'comandas' ? [comanda] : [],
      error: null,
    }));
    (db.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'v1', error: null });
  });

  it('"Salvar e voltar às mesas" mantém a comanda aberta, sem registrar venda', async () => {
    const user = userEvent.setup();
    render(<GestaoComandas atendente="Operador" />);
    await user.click(await screen.findByText('Mesa 4'));
    await user.click(screen.getByRole('button', { name: /Salvar e voltar às mesas/ }));
    expect(db.rpc).not.toHaveBeenCalled();
    expect(await screen.findByText(/Comanda Mesa 4 salva e aberta/)).toBeInTheDocument();
    expect(screen.getByText('Mesa 4')).toBeInTheDocument();
  });

  it('fechar conta exige escolher a forma de pagamento antes de registrar', async () => {
    const user = userEvent.setup();
    render(<GestaoComandas atendente="Operador" />);
    await user.click(await screen.findByText('Mesa 4'));
    await user.click(screen.getByRole('button', { name: 'Fechar conta' }));

    const confirmar = screen.getByRole('button', { name: 'Escolha a forma de pagamento' });
    expect(confirmar).toBeDisabled();
    expect(within(screen.getByRole('radiogroup')).getAllByRole('radio').every(r => r.getAttribute('aria-checked') === 'false')).toBe(true);

    await user.click(screen.getByRole('radio', { name: /Débito/ }));
    await user.click(screen.getByRole('button', { name: /Receber R\$\s*25,50 e fechar comanda/ }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
    expect((db.rpc as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({
      p_comanda_id: 'c1', p_total: 25.5, p_pagamentos: [{ metodo: 'Cartão de Débito', valor: 25.5 }],
    });
  });

  it('voltar do pagamento não fecha a comanda', async () => {
    const user = userEvent.setup();
    render(<GestaoComandas atendente="Operador" />);
    await user.click(await screen.findByText('Mesa 4'));
    await user.click(screen.getByRole('button', { name: 'Fechar conta' }));
    await user.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(db.rpc).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /Salvar e voltar às mesas/ })).toBeInTheDocument();
  });

  it('celular: abre na lista da comanda e alterna para adicionar produtos', async () => {
    const user = userEvent.setup();
    render(<GestaoComandas atendente="Operador" />);
    await user.click(await screen.findByText('Mesa 4'));
    const abaItens = screen.getByRole('tab', { name: /Comanda/ });
    expect(abaItens).toHaveAttribute('aria-selected', 'true');
    expect(abaItens).toHaveTextContent('3');
    await user.click(screen.getByRole('tab', { name: /Adicionar/ }));
    expect(screen.getByRole('tab', { name: /Adicionar/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('region', { name: 'Adicionar produtos' })).not.toHaveClass('hidden');
    expect(screen.getByRole('region', { name: 'Itens lançados' })).toHaveClass('hidden');
  });

  it('toques rápidos no "+" somam a partir da quantidade mais recente', async () => {
    let qtd = 2;
    const updates: number[] = [];
    (db.from as ReturnType<typeof vi.fn>).mockImplementation((tabela: string) => {
      const q = consulta({
        data: tabela === 'controle_caixa' ? { id: 'cx1' } : tabela === 'comandas'
          ? [{ ...comanda, itens_comanda: [{ ...comanda.itens_comanda[0], quantidade: qtd }, comanda.itens_comanda[1]] }] : [],
        error: null,
      });
      if (tabela === 'comandas') q.single = vi.fn(() => consulta({ data: { ...comanda, itens_comanda: [{ ...comanda.itens_comanda[0], quantidade: qtd }, comanda.itens_comanda[1]] }, error: null }));
      if (tabela === 'itens_comanda') q.update = vi.fn((v: { quantidade: number }) => { updates.push(v.quantidade); qtd = v.quantidade; return q; });
      return q;
    });
    const user = userEvent.setup();
    render(<GestaoComandas atendente="Operador" />);
    await user.click(await screen.findByText('Mesa 4'));
    const mais = screen.getByRole('button', { name: 'Aumentar Expresso' });
    await user.click(mais); await user.click(mais); await user.click(mais);
    await waitFor(() => expect(updates).toEqual([3, 4, 5]));
  });
});
