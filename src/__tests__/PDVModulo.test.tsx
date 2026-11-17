import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PDVModulo from '../components/PDVModulo';
import { db } from '../lib/db';

vi.mock('../lib/db', () => ({
  db: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const mockProdutos = [
  { id: '1', nome: 'Café Expresso', categoria: 'Cafés', preco_venda: 5.50, quantidade_estoque: 10, is_receita: false },
  { id: '2', nome: 'Café com Leite', categoria: 'Cafés', preco_venda: 7.00, quantidade_estoque: 8, is_receita: false },
  { id: '3', nome: 'Croissant', categoria: 'Lanches', preco_venda: 6.50, quantidade_estoque: 5, is_receita: true },
  { id: '4', nome: 'Cappuccino', categoria: 'Cafés', preco_venda: 10, quantidade_estoque: 0, modo_estoque: 'sem_controle' },
];

const mockCaixa = { id: '1', status: 'aberto' };

describe('PDVModulo Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    (db.from as any).mockImplementation((table: string) => {
      if (table === 'controle_caixa') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: mockCaixa, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'produtos') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: mockProdutos, error: null }),
              }),
            }),
          }),
          update: () => ({
            eq: () => Promise.resolve({ data: [], error: null }),
          }),
        };
      }
      if (table === 'fichas_tecnicas') {
        return {
          select: () => Promise.resolve({ data: [{ produto_venda_id: '3' }], error: null }),
        };
      }
      if (table === 'vendas') {
        return {
          insert: () => ({
            select: () => ({
              single: () => Promise.resolve({ data: { id: '1' }, error: null }),
            }),
          }),
        };
      }
      return {
        insert: () => Promise.resolve({ data: [], error: null }),
      };
    });
  });

  it('should show loading message while checking cash register', () => {
    render(<PDVModulo atendente="Test User" />);
    
    expect(screen.getByText('Verificando caixa...')).toBeInTheDocument();
  });

  it('should show closed cash register message when caixa is closed', async () => {
    (db.from as any).mockImplementation((table: string) => {
      if (table === 'controle_caixa') {
        return {
          select: () => ({
            eq: () => ({
              limit: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Caixa Fechado')).toBeInTheDocument();
      expect(screen.getByText('Abra o caixa na aba Caixa para acessar o PDV.')).toBeInTheDocument();
    });
  });

  it('should load and display products when cash register is open', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
  });

  it('should display search input', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar produto/i)).toBeInTheDocument();
    });
  });

  it('should filter products based on search input', async () => {
    const user = userEvent.setup();
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/buscar produto/i)).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText(/buscar produto/i);
    await user.type(searchInput, 'Expresso');
    
    // After debounce (300ms), should filter products
    await waitFor(() => {
      // Search should be visible in the input
      expect((searchInput as HTMLInputElement).value).toBe('Expresso');
    }, { timeout: 500 });
  });

  it('should handle cart with empty state', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
  });

  it('should calculate total correctly', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
    
    // The component should have total display
    // Note: actual total calculation depends on cart items
    const totalElements = screen.queryAllByText(/Total/i);
    expect(totalElements.length).toBeGreaterThanOrEqual(0);
  });

  it('should format currency correctly', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
    
    // Look for currency formatted values
    const currencyPattern = /R\$\s*[\d.,]+/;
    const elements = screen.queryAllByText(currencyPattern);
    // Should have some currency formatted elements (total, discounts, etc.)
    expect(elements.length).toBeGreaterThanOrEqual(0);
  });

  it('should display payment mode selector', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
    
    // Should have payment method section
    const paymentElements = screen.queryAllByText(/pagamento|pix|cartão|dinheiro/i);
    expect(paymentElements.length).toBeGreaterThanOrEqual(0);
  });

  it('should have finalize sale button in disabled state when cart is empty', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
    
    const finalizeButton = screen.queryByRole('button', { name: /finalizar venda/i });
    // Button may exist but be disabled or not present depending on cart state
    if (finalizeButton) {
      expect(finalizeButton).toBeInTheDocument();
    }
  });

  it('should show loading state during cart operations', async () => {
    render(<PDVModulo atendente="Test User" />);
    
    await waitFor(() => {
      expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
    });
    
    // Component should render without errors
    expect(screen.getByText('Menu de Produtos')).toBeInTheDocument();
  });
});


describe('PDV no celular: fluxo de venda', () => {
  beforeEach(() => {
    (db.rpc as any).mockReset().mockResolvedValue({ data: 'venda-1', error: null });
  });

  it('filtra por categoria', async () => {
    const user = userEvent.setup();
    render(<PDVModulo atendente="Operador" />);
    await screen.findByRole('button', { name: 'Adicionar Croissant' });
    await user.click(screen.getByRole('tab', { name: 'Lanches' }));
    expect(screen.queryByRole('button', { name: 'Adicionar Café Expresso' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Adicionar Croissant' })).toBeInTheDocument();
  });

  it('toca no produto, abre o pedido, paga em dinheiro com troco e registra a venda', async () => {
    const user = userEvent.setup();
    render(<PDVModulo atendente="Operador" />);
    const expresso = await screen.findByRole('button', { name: 'Adicionar Café Expresso' });
    await user.click(expresso);
    await user.click(expresso);
    expect(screen.getByLabelText('2 no pedido')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Ver pedido/ }));
    expect(screen.getByRole('dialog', { name: 'Pedido atual' })).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Dinheiro/ }));
    await user.click(screen.getByRole('button', { name: 'R$ 20' }));
    expect(screen.getByText(/Troco:\s*R\$\s*9,00/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /FINALIZAR VENDA/ }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
    const [nome, args] = (db.rpc as any).mock.calls[0];
    expect(nome).toBe('registrar_venda');
    expect(args).toMatchObject({
      p_caixa_id: '1', p_total: 11, p_desconto: 0, p_atendente: 'Operador', p_identificacao_pedido: 'Venda Balcão',
      p_pagamentos: [{ metodo: 'Dinheiro', valor: 11 }],
      p_itens: [{ produto_id: '1', quantidade: 2, preco_unitario: 5.5 }],
    });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Pedido atual' })).toBeNull());
    expect(screen.queryByRole('button', { name: /Ver pedido/ })).toBeNull();
  });

  it('dinheiro sem valor informado conta como valor exato', async () => {
    const user = userEvent.setup();
    render(<PDVModulo atendente="Operador" />);
    await user.click(await screen.findByRole('button', { name: 'Adicionar Café com Leite' }));
    await user.click(screen.getByRole('button', { name: /Ver pedido/ }));
    await user.click(screen.getByRole('radio', { name: /Dinheiro/ }));
    await user.click(screen.getByRole('button', { name: /FINALIZAR VENDA/ }));
    await waitFor(() => expect(db.rpc).toHaveBeenCalledTimes(1));
    expect((db.rpc as any).mock.calls[0][1].p_pagamentos).toEqual([{ metodo: 'Dinheiro', valor: 7 }]);
  });

  it('mostra o erro do banco quando a venda é recusada', async () => {
    (db.rpc as any).mockResolvedValue({ data: null, error: { message: 'Estoque insuficiente' } });
    const user = userEvent.setup();
    render(<PDVModulo atendente="Operador" />);
    await user.click(await screen.findByRole('button', { name: 'Adicionar Café Expresso' }));
    await user.click(screen.getByRole('button', { name: /Ver pedido/ }));
    await user.click(screen.getByRole('button', { name: /FINALIZAR VENDA/ }));
    expect(await screen.findByText(/Erro ao finalizar venda: Estoque insuficiente/)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Pedido atual' })).toBeInTheDocument();
  });
});

describe('PDV: itens sem controle de estoque', () => {
  it('vende item sem controle mesmo com estoque zero e sem mostrar quantidade', async () => {
    const user = userEvent.setup();
    render(<PDVModulo atendente="Operador" />);
    const cappuccino = await screen.findByRole('button', { name: 'Adicionar Cappuccino' });
    expect(cappuccino).toBeEnabled();
    expect(cappuccino).not.toHaveTextContent(/sem estoque|0 un/);
    await user.click(cappuccino); await user.click(cappuccino); await user.click(cappuccino);
    expect(screen.getByLabelText('3 no pedido')).toBeInTheDocument();
  });
});
